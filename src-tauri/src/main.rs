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
        "song of songs" | "song of solomon" => "Song of Solomon".to_string(),
        "revelations" | "revelation" => "Revelation".to_string(),

        "first samuel" | "one samuel" | "1 samuel" => "1 Samuel".to_string(),
        "second samuel" | "two samuel" | "2 samuel" => "2 Samuel".to_string(),

        "first kings" | "one kings" | "1 kings" => "1 Kings".to_string(),
        "second kings" | "two kings" | "2 kings" => "2 Kings".to_string(),

        "first chronicles" | "one chronicles" | "1 chronicles" => "1 Chronicles".to_string(),
        "second chronicles" | "two chronicles" | "2 chronicles" => "2 Chronicles".to_string(),

        "first corinthians" | "one corinthians" | "1 corinthians" => "1 Corinthians".to_string(),
        "second corinthians" | "two corinthians" | "2 corinthians" => "2 Corinthians".to_string(),

        "first thessalonians" | "one thessalonians" | "1 thessalonians" => "1 Thessalonians".to_string(),
        "second thessalonians" | "two thessalonians" | "2 thessalonians" => "2 Thessalonians".to_string(),

        "first timothy" | "one timothy" | "1 timothy" => "1 Timothy".to_string(),
        "second timothy" | "two timothy" | "2 timothy" => "2 Timothy".to_string(),

        "first peter" | "one peter" | "1 peter" => "1 Peter".to_string(),
        "second peter" | "two peter" | "2 peter" => "2 Peter".to_string(),

        "first john" | "one john" | "1 john" => "1 John".to_string(),
        "second john" | "two john" | "2 john" => "2 John".to_string(),
        "third john" | "three john" | "3 john" => "3 John".to_string(),

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

fn map_book_to_db_name(book: &str) -> String {
    match book.trim() {
        "1 Samuel" => "I Samuel".to_string(),
        "2 Samuel" => "II Samuel".to_string(),
        "1 Kings" => "I Kings".to_string(),
        "2 Kings" => "II Kings".to_string(),
        "1 Chronicles" => "I Chronicles".to_string(),
        "2 Chronicles" => "II Chronicles".to_string(),
        "1 Corinthians" => "I Corinthians".to_string(),
        "2 Corinthians" => "II Corinthians".to_string(),
        "1 Thessalonians" => "I Thessalonians".to_string(),
        "2 Thessalonians" => "II Thessalonians".to_string(),
        "1 Timothy" => "I Timothy".to_string(),
        "2 Timothy" => "II Timothy".to_string(),
        "1 Peter" => "I Peter".to_string(),
        "2 Peter" => "II Peter".to_string(),
        "1 John" => "I John".to_string(),
        "2 John" => "II John".to_string(),
        "3 John" => "III John".to_string(),
        "Revelation" => "The Revelation of St. John the Divine".to_string(),
        other => other.to_string(),
    }
}

fn parse_reference(input: &str) -> Option<ParsedReference> {
    let trimmed = input.trim().replace('/', ":");
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

fn resolve_book_row(conn: &Connection, canonical_book: &str) -> Option<(i64, String)> {
    let mapped = map_book_to_db_name(canonical_book);
    println!("canonical book => {}", canonical_book);
    println!("mapped db book => {}", mapped);

    let mut candidates: Vec<String> = vec![mapped.clone()];

    match canonical_book {
        "Psalms" => {
            candidates.push("Psalm".to_string());
            candidates.push("Psalms".to_string());
        }
        "Song of Solomon" => {
            candidates.push("Song of Songs".to_string());
            candidates.push("Song of Solomon".to_string());
        }
        "Revelation" => {
            candidates.push("Revelation".to_string());
            candidates.push("Revelations".to_string());
            candidates.push("The Revelation".to_string());
            candidates.push("The Revelation of St. John the Divine".to_string());
            candidates.push("The Revelation of John".to_string());
            candidates.push("Apocalypse".to_string());
        }
        _ => {}
    }

    candidates.sort();
    candidates.dedup();

    for candidate in &candidates {
        println!("trying book candidate => {}", candidate);

        let attempt: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, name FROM KJV_books WHERE LOWER(name) = LOWER(?1) LIMIT 1",
                params![candidate],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some(row) = attempt {
            println!("exact candidate match => {} -> {}", candidate, row.1);
            return Some(row);
        }
    }

    for candidate in &candidates {
        let like_pattern = format!("%{}%", candidate);
        println!("trying LIKE candidate => {}", like_pattern);

        let attempt: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, name FROM KJV_books WHERE LOWER(name) LIKE LOWER(?1) LIMIT 1",
                params![like_pattern],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some(row) = attempt {
            println!("LIKE candidate match => {} -> {}", candidate, row.1);
            return Some(row);
        }
    }

    println!("no DB book match found for {}", canonical_book);
    None
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

    let book_row = resolve_book_row(&conn, &parsed.book);

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