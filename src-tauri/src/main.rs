#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug)]
struct ParsedReference {
    book: String,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
}

#[derive(Serialize)]
struct VerseRow {
    reference: String,
    verse: i64,
    text: String,
}

#[derive(Serialize)]
struct SearchResult {
    found: bool,
    translation: String,
    reference: String,
    theme: String,
    verses: Vec<VerseRow>,
    message: Option<String>,
}

fn normalize_book_name(book: &str) -> String {
    match book.trim().to_lowercase().as_str() {
        "psalm" | "psalms" => "Psalms".to_string(),
        "song of songs" => "Song of Solomon".to_string(),
        "first corinthians" | "1 corinthians" => "1 Corinthians".to_string(),
        "second corinthians" | "2 corinthians" => "2 Corinthians".to_string(),
        "first kings" | "1 kings" => "1 Kings".to_string(),
        "second kings" | "2 kings" => "2 Kings".to_string(),
        other => other
            .split_whitespace()
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn parse_reference(input: &str) -> Option<ParsedReference> {
    let trimmed = input.trim();
    let (book_part, cv_part) = trimmed.rsplit_once(' ')?;
    let book = normalize_book_name(book_part);

    let (chapter_str, verse_part) = cv_part.split_once(':')?;
    let chapter = chapter_str.trim().parse::<i64>().ok()?;

    let (verse_start, verse_end) = if let Some((start, end)) = verse_part.split_once('-') {
        (
            start.trim().parse::<i64>().ok()?,
            end.trim().parse::<i64>().ok()?,
        )
    } else {
        let v = verse_part.trim().parse::<i64>().ok()?;
        (v, v)
    };

    Some(ParsedReference {
        book,
        chapter,
        verse_start,
        verse_end,
    })
}

fn resolve_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dev_path = PathBuf::from("src-tauri")
        .join("resources")
        .join("bibles")
        .join("KJV.db");

    if dev_path.exists() {
        println!("using dev db path: {:?}", dev_path);
        return Ok(dev_path);
    }

    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        let bundled_path = resource_dir.join("bibles").join("KJV.db");
        if bundled_path.exists() {
            println!("using bundled db path: {:?}", bundled_path);
            return Ok(bundled_path);
        }

        let alt_bundled_path = resource_dir
            .join("resources")
            .join("bibles")
            .join("KJV.db");
        if alt_bundled_path.exists() {
            println!("using alt bundled db path: {:?}", alt_bundled_path);
            return Ok(alt_bundled_path);
        }

        return Err(format!(
            "KJV.db not found. Checked {:?} and {:?}",
            bundled_path, alt_bundled_path
        ));
    }

    Err("Could not resolve resource directory and dev DB path was not found".to_string())
}

#[tauri::command]
fn search_kjv_reference(app: tauri::AppHandle, reference: String) -> Result<SearchResult, String> {
    println!("incoming reference: {}", reference);

    let parsed =
        parse_reference(&reference).ok_or_else(|| format!("Invalid reference format: {}", reference))?;

    println!(
        "parsed => book={}, chapter={}, verse_start={}, verse_end={}",
        parsed.book, parsed.chapter, parsed.verse_start, parsed.verse_end
    );

    let db_path = resolve_db_path(&app)?;
    println!("using db path: {:?}", db_path);

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let book_row: Option<(i64, String)> = conn
        .query_row(
            "SELECT id, name FROM KJV_books WHERE name = ?1 LIMIT 1",
            params![parsed.book],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let (book_id, book_name) = match book_row {
        Some(v) => v,
        None => {
            return Ok(SearchResult {
                found: false,
                translation: "KJV".to_string(),
                reference: reference.clone(),
                theme: "Scripture Lookup".to_string(),
                verses: vec![],
                message: Some(format!("Book not found in KJV DB: {}", parsed.book)),
            });
        }
    };

    println!("matched book => id={}, name={}", book_id, book_name);

    let mut stmt = conn
        .prepare(
            "SELECT verse, text
             FROM KJV_verses
             WHERE book_id = ?1
               AND chapter = ?2
               AND verse BETWEEN ?3 AND ?4
             ORDER BY verse ASC",
        )
        .map_err(|e| e.to_string())?;

    let verse_iter = stmt
        .query_map(
            params![book_id, parsed.chapter, parsed.verse_start, parsed.verse_end],
            |row| {
                let verse: i64 = row.get(0)?;
                let text: String = row.get(1)?;
                Ok(VerseRow {
                    reference: format!("{} {}:{}", book_name, parsed.chapter, verse),
                    verse,
                    text,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let verses: Vec<VerseRow> = verse_iter
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    println!("verse row count: {}", verses.len());

    if verses.is_empty() {
        return Ok(SearchResult {
            found: false,
            translation: "KJV".to_string(),
            reference: reference.clone(),
            theme: "Scripture Lookup".to_string(),
            verses: vec![],
            message: Some("No result found in local KJV database. Try another reference.".to_string()),
        });
    }

    let result_reference = if parsed.verse_start == parsed.verse_end {
        format!("{} {}:{}", book_name, parsed.chapter, parsed.verse_start)
    } else {
        format!(
            "{} {}:{}-{}",
            book_name, parsed.chapter, parsed.verse_start, parsed.verse_end
        )
    };

    Ok(SearchResult {
        found: true,
        translation: "KJV".to_string(),
        reference: result_reference,
        theme: "Scripture Lookup".to_string(),
        verses,
        message: None,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_kjv_reference])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}