#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params_from_iter, Connection, OptionalExtension, ToSql};
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

fn book_variants(canonical_book: &str) -> Vec<String> {
    let mut variants = vec![canonical_book.to_string()];
    match canonical_book {
        "Psalm" => variants.push("Psalms".to_string()),
        "Song of Solomon" => variants.push("Song of Songs".to_string()),
        _ => {}
    }

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
    let placeholders = std::iter::repeat("?")
        .take(in_count)
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

fn build_kjv_schema_query(
    chapter_col: &str,
    verse_col: &str,
    text_col: &str,
    book_fk_col: &str,
    in_count: usize,
) -> String {
    let placeholders = std::iter::repeat("?")
        .take(in_count)
        .collect::<Vec<_>>()
        .join(",");

    format!(
        "SELECT b.name AS book, v.{chapter_col} AS chapter, v.{verse_col} AS verse, v.{text_col} AS text \
         FROM KJV_verses v \
         JOIN KJV_books b ON b.id = v.{book_fk_col} \
         WHERE lower(b.name) IN ({placeholders}) AND v.{chapter_col} = ? AND v.{verse_col} BETWEEN ? AND ? \
         ORDER BY v.{verse_col} ASC"
    )
}

fn try_kjv_schema_search(
    conn: &Connection,
    book_names: &[String],
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Option<Vec<VerseRow>>, String> {
    if !table_exists(conn, "KJV_books")?
        || !table_exists(conn, "KJV_verses")?
        || !table_exists(conn, "translations")?
    {
        return Ok(None);
    }

    let verse_columns = table_columns(conn, "KJV_verses")?;
    let chapter_col = match first_matching_column(&verse_columns, &["chapter"]) {
        Some(col) => col,
        None => return Ok(None),
    };
    let verse_col = match first_matching_column(&verse_columns, &["verse"]) {
        Some(col) => col,
        None => return Ok(None),
    };
    let text_col = match first_matching_column(&verse_columns, &["text", "scripture", "verse_text"])
    {
        Some(col) => col,
        None => return Ok(None),
    };
    let book_fk_col = match first_matching_column(&verse_columns, &["book_id", "book"]) {
        Some(col) => col,
        None => return Ok(None),
    };

    let sql = build_kjv_schema_query(
        chapter_col,
        verse_col,
        text_col,
        book_fk_col,
        book_names.len(),
    );
    let mut bind_values: Vec<String> = book_names.iter().map(|name| name.to_lowercase()).collect();
    bind_values.push(chapter.to_string());
    bind_values.push(verse_start.to_string());
    bind_values.push(verse_end.to_string());
    let bind_refs: Vec<&dyn ToSql> = bind_values
        .iter()
        .map(|value| value as &dyn ToSql)
        .collect();

    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("Failed to prepare KJV schema query: {error}"))?;
    let rows = statement
        .query_map(params_from_iter(bind_refs), |row| {
            Ok(VerseRow {
                book: row.get::<_, String>(0)?,
                chapter: row.get::<_, i64>(1)?,
                verse: row.get::<_, i64>(2)?,
                text: row.get::<_, String>(3)?,
            })
        })
        .map_err(|error| format!("Failed to query KJV schema: {error}"))?;

    let parsed: Vec<VerseRow> = rows.filter_map(Result::ok).collect();
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
    let mut bind_values: Vec<String> = book_names.iter().map(|name| name.to_lowercase()).collect();
    bind_values.push(chapter.to_string());
    bind_values.push(verse_start.to_string());
    bind_values.push(verse_end.to_string());

    let bind_refs: Vec<&dyn ToSql> = bind_values
        .iter()
        .map(|value| value as &dyn ToSql)
        .collect();

    let mut statement = conn.prepare(&sql).ok()?;
    let rows = statement
        .query_map(params_from_iter(bind_refs), |row| {
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

    if let Some(rows) = try_kjv_schema_search(conn, &book_names, chapter, verse_start, verse_end)? {
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
            return Ok(rows);
        }
    }

    Ok(Vec::new())
}

#[tauri::command]
fn search_kjv(
    app_handle: tauri::AppHandle,
    request: SearchKjvRequest,
) -> Result<Vec<VerseRow>, String> {
    let db_path = app_handle
        .path_resolver()
        .resolve_resource("bibles/KJV.db")
        .ok_or_else(|| "Could not resolve bundled KJV DB resource path".to_string())?;

    let conn =
        Connection::open(db_path).map_err(|error| format!("Failed to open KJV.db: {error}"))?;

    query_kjv_db(
        &conn,
        &request.canonical_book,
        request.chapter,
        request.verse_start,
        request.verse_end,
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_kjv])
        .run(tauri::generate_context!())
        .expect("error while running Scripture Cue application");
}
