use tauri::State;

use crate::db::corpus::{self, Book, TocChapter, VerseSummary};
use crate::state::AppState;

#[tauri::command]
pub fn get_books(state: State<AppState>) -> Result<Vec<Book>, String> {
    let conn = state.corpus_conn()?;
    corpus::list_books(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_book_toc(state: State<AppState>, book_key: String) -> Result<Vec<TocChapter>, String> {
    let conn = state.corpus_conn()?;
    corpus::get_book_toc(&conn, &book_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter_verses(
    state: State<AppState>,
    book_key: String,
    chapter_key: String,
) -> Result<Vec<VerseSummary>, String> {
    let conn = state.corpus_conn()?;
    corpus::get_chapter_verses(&conn, &book_key, &chapter_key).map_err(|e| e.to_string())
}
