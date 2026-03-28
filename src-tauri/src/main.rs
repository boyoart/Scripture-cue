#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params_from_iter, types::Value, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchKjvRequest {
    canonical_book: String,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
}

#[derive(Debug, Serialize)]
struct VerseRow {
    book: String,
    chapter: i64,
    verse: i64,
    text: String,
}

fn debug_log(message: impl AsRef<str>) {
    eprintln!("[search_kjv] {}", message.as_ref());
}

fn normalize_book_key(input: &str) -> String {
    input
        .to_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn numbered_book_variants(book: &str) -> Vec<String> {
    let mut variants = vec![book.to_string()];
    let prefixes = [
        ("1 ", ["1 ", "1st ", "first ", "i "]),
        ("2 ", ["2 ", "2nd ", "second ", "ii "]),
        ("3 ", ["3 ", "3rd ", "third ", "iii "]),
    ];

    let lower = book.to_lowercase();
    for (needle, replacements) in prefixes {
        if lower.starts_with(needle) {
            let suffix = book[needle.len()..].trim_start();
            for replacement in replacements {
                variants.push(format!("{replacement}{suffix}"));
            }
        }
    }

    variants
}

fn spoken_numbered_book_variants(book: &str) -> Vec<String> {
    let mut variants = vec![book.to_string()];
    let prefixes = [("first ", "1 "), ("second ", "2 "), ("third ", "3 ")];

    let lower = book.to_lowercase();
    for (needle, replacement) in prefixes {
        if lower.starts_with(needle) {
            let suffix = book[needle.len()..].trim_start();
            variants.push(format!("{replacement}{suffix}"));
        }
    }

    variants
}

fn book_variants(canonical_book: &str) -> Vec<String> {
    let mut variants = spoken_numbered_book_variants(canonical_book);
    variants = variants
        .into_iter()
        .flat_map(|variant| numbered_book_variants(&variant))
        .collect();

    match canonical_book {
        "Psalm" => variants.push("Psalms".to_string()),
        "Psalms" => variants.push("Psalm".to_string()),
        "Song of Songs" => variants.push("Song of Solomon".to_string()),
        "Song of Solomon" => {
            variants.push("Song of Songs".to_string());
            variants.push("Canticles".to_string());
        }
        _ => {}
    }

    variants.sort();
    variants.dedup();
    variants
}

fn build_query(
    table: &str,
    book_col: &str,
    chapter_col: &str,
    verse_col: &str,
    text_col: &str,
    in_count: usize,
) -> String {
    let placeholders = std::iter::repeat_n("?", in_count)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "SELECT {book_col} AS book, {chapter_col} AS chapter, {verse_col} AS verse, {text_col} AS text \
         FROM {table} \
         WHERE lower({book_col}) IN ({placeholders}) AND {chapter_col} = ? AND {verse_col} BETWEEN ? AND ? \
         ORDER BY {verse_col} ASC"
    )
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [table],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|error| format!("Failed to inspect table {table}: {error}"))
}

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut statement = conn
        .prepare(&pragma)
        .map_err(|error| format!("Failed to inspect columns for {table}: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Failed to read column metadata for {table}: {error}"))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn first_matching_column<'a>(columns: &'a [String], candidates: &[&'a str]) -> Option<&'a str> {
    candidates.iter().copied().find(|candidate| {
        columns
            .iter()
            .any(|column| column.eq_ignore_ascii_case(candidate))
    })
}

fn load_kjv_books(conn: &Connection) -> Result<Vec<(i64, String, String)>, String> {
    let mut statement = conn
        .prepare("SELECT id, name FROM KJV_books")
        .map_err(|error| format!("Failed to prepare KJV_books query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            let id = row.get::<_, i64>(0)?;
            let name = row.get::<_, String>(1)?;
            Ok((id, name.clone(), normalize_book_key(&name)))
        })
        .map_err(|error| format!("Failed to query KJV_books: {error}"))?;

    Ok(rows.filter_map(Result::ok).collect())
}

fn resolve_book_matches(
    books: &[(i64, String, String)],
    canonical_book: &str,
) -> Vec<(i64, String)> {
    let variants = book_variants(canonical_book);
    let keys: Vec<String> = variants
        .iter()
        .map(|variant| normalize_book_key(variant))
        .collect();

    let mut matches = Vec::new();
    for (book_id, book_name, normalized) in books {
        if keys.iter().any(|candidate| candidate == normalized) {
            matches.push((*book_id, book_name.clone()));
        }
    }

    matches
}

fn find_exact_book_matches(
    books: &[(i64, String, String)],
    canonical_book: &str,
) -> Vec<(i64, String)> {
    let variants = book_variants(canonical_book);
    let mut exact_matches = Vec::new();

    for variant in variants {
        for (book_id, book_name, _) in books {
            if book_name.eq_ignore_ascii_case(&variant) {
                exact_matches.push((*book_id, book_name.clone()));
            }
        }
    }

    exact_matches.sort_by(|a, b| a.0.cmp(&b.0));
    exact_matches.dedup_by(|a, b| a.0 == b.0);
    exact_matches
}

fn resolve_kjv_translation_id(
    conn: &Connection,
    translations_columns: &[String],
) -> Option<(String, i64)> {
    let id_col = first_matching_column(translations_columns, &["id"])?;
    let code_col = first_matching_column(
        translations_columns,
        &[
            "code",
            "abbr",
            "abbreviation",
            "name",
            "short_name",
            "translation",
        ],
    )?;

    let sql = format!("SELECT {id_col} FROM translations WHERE lower({code_col}) = 'kjv' LIMIT 1");
    let translation_id = conn
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .optional()
        .ok()
        .flatten();

    translation_id.map(|id| (sql, id))
}

fn build_kjv_schema_query(
    chapter_col: &str,
    verse_col: &str,
    text_col: &str,
    book_fk_col: &str,
    book_in_count: usize,
    translation_col: Option<&str>,
    include_translation_filter: bool,
) -> String {
    let book_placeholders = std::iter::repeat_n("?", book_in_count)
        .collect::<Vec<_>>()
        .join(",");

    let translation_clause = translation_col
        .filter(|_| include_translation_filter)
        .map(|column| format!(" AND v.{column} = ?"))
        .unwrap_or_default();

    format!(
        "SELECT b.name AS book, v.{chapter_col} AS chapter, v.{verse_col} AS verse, v.{text_col} AS text \
         FROM KJV_verses v \
         JOIN KJV_books b ON b.id = v.{book_fk_col} \
         WHERE v.{book_fk_col} IN ({book_placeholders}) AND v.{chapter_col} = ? AND v.{verse_col} BETWEEN ? AND ?{translation_clause} \
         ORDER BY v.{verse_col} ASC"
    )
}

fn try_kjv_schema_search(
    conn: &Connection,
    canonical_book: &str,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Option<Vec<VerseRow>>, String> {
    if !table_exists(conn, "KJV_books")? || !table_exists(conn, "KJV_verses")? {
        return Ok(None);
    }

    let verse_columns = table_columns(conn, "KJV_verses")?;
    let chapter_col = match first_matching_column(&verse_columns, &["chapter", "chapter_id"]) {
        Some(col) => col,
        None => return Ok(None),
    };
    let verse_col = match first_matching_column(&verse_columns, &["verse", "verse_id"]) {
        Some(col) => col,
        None => return Ok(None),
    };
    let text_col = match first_matching_column(
        &verse_columns,
        &["text", "scripture", "verse_text", "content"],
    ) {
        Some(col) => col,
        None => return Ok(None),
    };
    let book_fk_col = match first_matching_column(
        &verse_columns,
        &["book_id", "book", "book_fk", "kjv_book_id"],
    ) {
        Some(col) => col,
        None => return Ok(None),
    };

    let books = load_kjv_books(conn)?;
    let exact_book_matches = find_exact_book_matches(&books, canonical_book);
    let matched_books = if exact_book_matches.is_empty() {
        resolve_book_matches(&books, canonical_book)
    } else {
        exact_book_matches
    };

    let matched_book_names: Vec<String> =
        matched_books.iter().map(|(_, name)| name.clone()).collect();
    let matched_book_ids: Vec<i64> = matched_books.iter().map(|(id, _)| *id).collect();

    debug_log(format!(
        "mapped DB book name candidates for {canonical_book}: {:?}",
        book_variants(canonical_book)
    ));
    debug_log(format!("matched book row names: {:?}", matched_book_names));
    debug_log(format!("matched book row ids: {:?}", matched_book_ids));

    if matched_books.is_empty() {
        return Ok(None);
    }

    let translation_col = first_matching_column(
        &verse_columns,
        &["translation_id", "translation", "translation_fk"],
    );

    let translation_filter = if table_exists(conn, "translations")? {
        let translation_columns = table_columns(conn, "translations")?;
        resolve_kjv_translation_id(conn, &translation_columns)
    } else {
        None
    };
    let include_translation_filter = translation_col.is_some() && translation_filter.is_some();

    let sql = build_kjv_schema_query(
        chapter_col,
        verse_col,
        text_col,
        book_fk_col,
        matched_books.len(),
        translation_col,
        include_translation_filter,
    );
    debug_log(format!("sql path used: {sql}"));

    let mut bind_values: Vec<Value> = matched_books
        .iter()
        .map(|(book_id, _)| Value::Integer(*book_id))
        .collect();
    bind_values.push(Value::Integer(chapter));
    bind_values.push(Value::Integer(verse_start));
    bind_values.push(Value::Integer(verse_end));

    if let Some((translation_sql, translation_id)) = translation_filter {
        debug_log(format!(
            "translation filter found using query [{translation_sql}] with id={translation_id}"
        ));
        bind_values.push(Value::Integer(translation_id));
    } else if translation_col.is_some() {
        debug_log(
            "translation column exists but KJV translation id was not found; skipping filter",
        );
    }

    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("Failed to prepare KJV schema query: {error}"))?;
    let rows = statement
        .query_map(params_from_iter(bind_values), |row| {
            Ok(VerseRow {
                book: row.get::<_, String>(0)?,
                chapter: row.get::<_, i64>(1)?,
                verse: row.get::<_, i64>(2)?,
                text: row.get::<_, String>(3)?,
            })
        })
        .map_err(|error| format!("Failed to query KJV schema: {error}"))?;

    let parsed: Vec<VerseRow> = rows.filter_map(Result::ok).collect();
    debug_log(format!("verse row count returned: {}", parsed.len()));
    if parsed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(parsed))
    }
}

fn try_known_schema_search(
    conn: &Connection,
    table: &str,
    book_col: &str,
    chapter_col: &str,
    verse_col: &str,
    text_col: &str,
    book_names: &[String],
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Option<Vec<VerseRow>> {
    let sql = build_query(
        table,
        book_col,
        chapter_col,
        verse_col,
        text_col,
        book_names.len(),
    );
    let mut bind_values: Vec<Value> = book_names
        .iter()
        .map(|name| Value::Text(name.to_lowercase()))
        .collect();
    bind_values.push(Value::Integer(chapter));
    bind_values.push(Value::Integer(verse_start));
    bind_values.push(Value::Integer(verse_end));

    let mut statement = conn.prepare(&sql).ok()?;
    let rows = statement
        .query_map(params_from_iter(bind_values), |row| {
            Ok(VerseRow {
                book: row.get::<_, String>(0)?,
                chapter: row.get::<_, i64>(1)?,
                verse: row.get::<_, i64>(2)?,
                text: row.get::<_, String>(3)?,
            })
        })
        .ok()?;

    let parsed: Vec<VerseRow> = rows.filter_map(Result::ok).collect();
    if parsed.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

fn query_kjv_db(
    conn: &Connection,
    canonical_book: &str,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Vec<VerseRow>, String> {
    let book_names = book_variants(canonical_book);

    if let Some(rows) =
        try_kjv_schema_search(conn, canonical_book, chapter, verse_start, verse_end)?
    {
        return Ok(rows);
    }

    let strategies = [
        ("verses", "book", "chapter", "verse", "text"),
        ("verses", "book", "chapter", "verse", "scripture"),
        ("bible", "book", "chapter", "verse", "text"),
        ("bible", "book", "chapter", "verse", "scripture"),
        ("kjv", "book", "chapter", "verse", "text"),
        ("kjv", "book", "chapter", "verse", "scripture"),
        ("t_kjv", "book", "chapter", "verse", "text"),
        ("t_kjv", "book", "chapter", "verse", "scripture"),
        ("bible", "book_name", "chapter", "verse", "text"),
        ("verses", "book_name", "chapter", "verse", "text"),
    ];

    for (table, book_col, chapter_col, verse_col, text_col) in strategies {
        if let Some(rows) = try_known_schema_search(
            conn,
            table,
            book_col,
            chapter_col,
            verse_col,
            text_col,
            &book_names,
            chapter,
            verse_start,
            verse_end,
        ) {
            debug_log(format!("fallback sql path used: table={table}"));
            debug_log(format!("verse row count returned: {}", rows.len()));
            return Ok(rows);
        }
    }

    debug_log("No KJV DB rows returned from all query paths");
    Ok(Vec::new())
}

#[tauri::command]
fn search_kjv(
    app_handle: tauri::AppHandle,
    request: SearchKjvRequest,
) -> Result<Vec<VerseRow>, String> {
    debug_log(format!(
        "incoming search payload: canonical_book='{}', chapter={}, verse_start={}, verse_end={}",
        request.canonical_book, request.chapter, request.verse_start, request.verse_end
    ));

    let db_path = app_handle
        .path_resolver()
        .resolve_resource("bibles/KJV.db")
        .ok_or_else(|| "Could not resolve bundled KJV DB resource path".to_string())?;

    let conn =
        Connection::open(db_path).map_err(|error| format!("Failed to open KJV.db: {error}"))?;

    let rows = query_kjv_db(
        &conn,
        &request.canonical_book,
        request.chapter,
        request.verse_start,
        request.verse_end,
    )?;

    debug_log(format!("final UI result payload rows: {}", rows.len()));

    Ok(rows)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_kjv])
        .run(tauri::generate_context!())
        .expect("error while running Scripture Cue application");
}
