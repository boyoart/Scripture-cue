#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const BIBLE_DB_RESOURCE: &str = "resources/bibles/bible.db";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationRecord {
    code: String,
    name: String,
    language: String,
    is_default: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VerseRecord {
    id: String,
    reference: String,
    translation_code: String,
    text: String,
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = app
        .path_resolver()
        .resolve_resource(BIBLE_DB_RESOURCE)
        .ok_or_else(|| format!("Unable to resolve bundled DB resource: {BIBLE_DB_RESOURCE}"))?;

    Connection::open(db_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_translations(app: AppHandle) -> Result<Vec<TranslationRecord>, String> {
    let conn = open_db(&app)?;

    let mut statement = conn
        .prepare(
            r#"
            SELECT code, name, language, is_default
            FROM translations
            ORDER BY is_default DESC, code ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(TranslationRecord {
                code: row.get(0)?,
                name: row.get(1)?,
                language: row.get(2)?,
                is_default: row.get::<usize, i64>(3)? == 1,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn search_verses(
    app: AppHandle,
    query: String,
    translation_code: String,
    max_results: Option<usize>,
) -> Result<Vec<VerseRecord>, String> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(vec![]);
    }

    let conn = open_db(&app)?;
    let limit = max_results.unwrap_or(30).clamp(1, 100);

    let normalized = trimmed_query.to_lowercase().replace(' ', "");

    let reference_regex = regex_lite::Regex::new(r"(?i)^([1-3]?\\s?[a-z]+)\\s+(\\d+):(\\d+)(?:-(\\d+))?$")
        .map_err(|error| error.to_string())?;

    if let Some(caps) = reference_regex.captures(trimmed_query) {
        let alias = caps
            .get(1)
            .map(|capture| capture.as_str().to_lowercase().replace(' ', ""))
            .unwrap_or_default();
        let chapter: i64 = caps
            .get(2)
            .ok_or_else(|| "Missing chapter in reference".to_string())?
            .as_str()
            .parse()
            .map_err(|_| "Invalid chapter number".to_string())?;
        let verse_start: i64 = caps
            .get(3)
            .ok_or_else(|| "Missing verse in reference".to_string())?
            .as_str()
            .parse()
            .map_err(|_| "Invalid verse number".to_string())?;
        let verse_end: i64 = caps
            .get(4)
            .map(|capture| capture.as_str().parse::<i64>())
            .transpose()
            .map_err(|_| "Invalid verse range".to_string())?
            .unwrap_or(verse_start);

        let mut statement = conn
            .prepare(
                r#"
                SELECT b.name, v.chapter, v.verse, t.code, v.text
                FROM verses v
                JOIN books b ON b.id = v.book_id
                JOIN translations t ON t.id = v.translation_id
                JOIN book_aliases ba ON ba.book_id = b.id
                WHERE t.code = ?1
                  AND ba.normalized_alias = ?2
                  AND v.chapter = ?3
                  AND v.verse BETWEEN ?4 AND ?5
                ORDER BY v.verse ASC
                LIMIT ?6
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(
                params![translation_code, alias, chapter, verse_start, verse_end, limit],
                |row| {
                    let book_name: String = row.get(0)?;
                    let chapter: i64 = row.get(1)?;
                    let verse: i64 = row.get(2)?;
                    let translation_code: String = row.get(3)?;
                    let text: String = row.get(4)?;

                    Ok(VerseRecord {
                        id: format!("{}-{}-{}-{}", translation_code, book_name, chapter, verse),
                        reference: format!("{} {}:{}", book_name, chapter, verse),
                        translation_code,
                        text,
                    })
                },
            )
            .map_err(|error| error.to_string())?;

        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string());
    }

    let mut statement = conn
        .prepare(
            r#"
            SELECT b.name, v.chapter, v.verse, t.code, v.text
            FROM verses v
            JOIN books b ON b.id = v.book_id
            JOIN translations t ON t.id = v.translation_id
            WHERE t.code = ?1
              AND lower(v.text) LIKE '%' || ?2 || '%'
            ORDER BY b.canonical_order ASC, v.chapter ASC, v.verse ASC
            LIMIT ?3
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![translation_code, normalized, limit], |row| {
            let book_name: String = row.get(0)?;
            let chapter: i64 = row.get(1)?;
            let verse: i64 = row.get(2)?;
            let translation_code: String = row.get(3)?;
            let text: String = row.get(4)?;

            Ok(VerseRecord {
                id: format!("{}-{}-{}-{}", translation_code, book_name, chapter, verse),
                reference: format!("{} {}:{}", book_name, chapter, verse),
                translation_code,
                text,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_translations, search_verses])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
