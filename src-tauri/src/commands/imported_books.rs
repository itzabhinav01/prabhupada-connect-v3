use tauri::{AppHandle, State};

use crate::db;
use crate::db::corpus::{TocChapter, VerseRecord};
use crate::db::user_books::{self, ImportRecord, ImportResult, ImportedBook};
use crate::state::AppState;

fn lock_err<T>(_: T) -> String {
    "user books database is unavailable (lock poisoned)".to_string()
}

/// Parses a user-supplied JSON file (the schema the Help tab's AI
/// conversion prompt asks for) and imports every record under its shared
/// `BookKey`. Re-importing the same `BookKey` replaces the previous import
/// rather than duplicating or erroring.
#[tauri::command]
pub fn import_book_json(state: State<AppState>, path: String) -> Result<ImportResult, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| format!("could not read {path}: {e}"))?;
    let records: Vec<ImportRecord> = serde_json::from_str(&json).map_err(|e| format!("invalid JSON: {e}"))?;
    if records.is_empty() {
        return Err("the JSON array is empty — nothing to import".to_string());
    }
    let mut conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::import_records(&mut conn, records)
}

#[tauri::command]
pub fn list_imported_books(state: State<AppState>) -> Result<Vec<ImportedBook>, String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::list_imported_books(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_imported_book(state: State<AppState>, book_key: String) -> Result<(), String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    let pdf_path = user_books::remove_imported_book(&conn, &book_key).map_err(|e| e.to_string())?;
    if let Some(path) = pdf_path {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// Copies a user-picked PDF into `$APPDATA/imported_pdfs/` (so it survives
/// the original file moving or being deleted) and records it as a
/// single-entry imported book. See `PdfTab.tsx` for how it's then opened.
#[tauri::command]
pub fn import_book_pdf(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    title: String,
    author: Option<String>,
) -> Result<ImportResult, String> {
    let src = std::path::Path::new(&path);
    if !src.is_file() {
        return Err(format!("PDF file not found: {path}"));
    }
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err("Book title is required".to_string());
    }
    let slug: String = clean_title.chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect::<String>().to_uppercase();
    let book_key = if slug.is_empty() { "PDF_BOOK".to_string() } else { format!("PDF_{slug}") };

    let pdf_dir = db::resolve_imported_pdf_dir(&app)?;
    let dest = pdf_dir.join(format!("{book_key}.pdf"));
    std::fs::copy(src, &dest).map_err(|e| format!("failed to copy PDF: {e}"))?;

    let author = author.as_deref().map(str::trim).filter(|a| !a.is_empty());
    let mut conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::import_pdf_book(&mut conn, &book_key, clean_title, author, &dest.display().to_string())
}

#[tauri::command]
pub fn get_imported_book_toc(state: State<AppState>, book_key: String) -> Result<Vec<TocChapter>, String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::get_book_toc(&conn, &book_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_imported_chapter_records(state: State<AppState>, chapter_key: String) -> Result<Vec<VerseRecord>, String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::get_chapter_records(&conn, &chapter_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_imported_verse_record(state: State<AppState>, record_key: String) -> Result<Option<VerseRecord>, String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::get_verse_record(&conn, &record_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_imported_books(state: State<AppState>, query: String) -> Result<Vec<crate::db::corpus::SearchHit>, String> {
    let conn = state.user_books_db.lock().map_err(lock_err)?;
    user_books::search_imported_books(&conn, &query, 100).map_err(|e| e.to_string())
}
