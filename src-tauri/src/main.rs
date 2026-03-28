#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchKjvRequest {
    book: String,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    translation: String,
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

fn canonical_book_candidates(book: &str) -> Vec<String> {
    let trimmed = book.trim();
    let lower = trimmed.to_lowercase();

    let mut candidates = vec![trimmed.to_string()];

    let direct_mappings = [
        ("psalm", "Psalms"),
        ("psalms", "Psalms"),
        ("first corinthians", "1 Corinthians"),
        ("second corinthians", "2 Corinthians"),
        ("first kings", "1 Kings"),
        ("second kings", "2 Kings"),
        ("song of songs", "Song of Solomon"),
        ("canticles", "Song of Solomon"),
    ];

    for (alias, mapped) in direct_mappings {
        if lower == alias {
            candidates.push(mapped.to_string());
        }
    }

    let ordinal_numbered = [
        ("first ", "1 "),
        ("second ", "2 "),
        ("third ", "3 "),
        ("1st ", "1 "),
        ("2nd ", "2 "),
        ("3rd ", "3 "),
        ("one ", "1 "),
        ("two ", "2 "),
        ("three ", "3 "),
    ];

    for (prefix, replacement) in ordinal_numbered {
        if lower.starts_with(prefix) {
            let suffix = trimmed[prefix.len()..].trim_start();
            candidates.push(format!("{replacement}{suffix}"));
        }
    }

    candidates.sort();
    candidates.dedup();
    candidates
}

fn resolve_book(conn: &Connection, canonical_book: &str) -> Result<Option<(i64, String)>, String> {
    let candidates = canonical_book_candidates(canonical_book);
    debug_log(format!(
        "backend resolved book name candidates for '{}': {:?}",
        canonical_book, candidates
    ));

    for candidate in candidates {
        let found = conn
            .query_row(
                "SELECT id, name FROM KJV_books WHERE lower(name) = lower(?1) LIMIT 1",
                params![candidate],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| format!("Failed to resolve KJV_books row: {error}"))?;

        if let Some((book_id, book_name)) = found {
            debug_log(format!("backend resolved book name: {book_name}"));
            debug_log(format!("backend resolved book_id: {book_id}"));
            return Ok(Some((book_id, book_name)));
        }
    }

    debug_log("backend resolved book name: none");
    debug_log("backend resolved book_id: none");
    Ok(None)
}

fn query_kjv_schema(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Vec<VerseRow>, String> {
    let mut statement = conn
        .prepare(
            "SELECT b.name, v.chapter, v.verse, v.text
             FROM KJV_verses v
             JOIN KJV_books b ON b.id = v.book_id
             WHERE v.book_id = ?1 AND v.chapter = ?2 AND v.verse BETWEEN ?3 AND ?4
             ORDER BY v.verse ASC",
        )
        .map_err(|error| format!("Failed to prepare KJV schema query: {error}"))?;

    let rows = statement
        .query_map(params![book_id, chapter, verse_start, verse_end], |row| {
            Ok(VerseRow {
                book: row.get::<_, String>(0)?,
                chapter: row.get::<_, i64>(1)?,
                verse: row.get::<_, i64>(2)?,
                text: row.get::<_, String>(3)?,
            })
        })
        .map_err(|error| format!("Failed to query KJV_verses: {error}"))?;

    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
fn search_kjv(
    app_handle: tauri::AppHandle,
    request: SearchKjvRequest,
) -> Result<Vec<VerseRow>, String> {
    debug_log(format!(
        "incoming search payload: book='{}', chapter={}, verse_start={}, verse_end={}, translation='{}'",
        request.book, request.chapter, request.verse_start, request.verse_end, request.translation
    ));

    let db_path = app_handle
        .path_resolver()
        .resolve_resource("bibles/KJV.db")
        .ok_or_else(|| "Could not resolve bundled KJV DB resource path".to_string())?;

    let conn =
        Connection::open(db_path).map_err(|error| format!("Failed to open KJV.db: {error}"))?;

    let normalized_start = request.verse_start.max(1);
    let normalized_end = request.verse_end.max(normalized_start);

    let Some((book_id, _book_name)) = resolve_book(&conn, &request.book)? else {
        return Ok(Vec::new());
    };

    let rows = query_kjv_schema(
        &conn,
        book_id,
        request.chapter,
        normalized_start,
        normalized_end,
    )?;

    debug_log(format!("backend SQL row count: {}", rows.len()));

    Ok(rows)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_kjv])
        .run(tauri::generate_context!())
        .expect("error while running Scripture Cue application");
}
