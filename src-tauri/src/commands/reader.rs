use tauri::State;

use crate::db::corpus::{self, VerseRecord};
use crate::state::AppState;

#[tauri::command]
pub fn get_verse_record(
    state: State<AppState>,
    record_key: String,
) -> Result<Option<VerseRecord>, String> {
    let conn = state.corpus_conn()?;
    corpus::get_verse_record(&conn, &record_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter_records(
    state: State<AppState>,
    book_key: String,
    chapter_key: String,
) -> Result<Vec<VerseRecord>, String> {
    let conn = state.corpus_conn()?;
    corpus::get_chapter_records(&conn, &book_key, &chapter_key).map_err(|e| e.to_string())
}
