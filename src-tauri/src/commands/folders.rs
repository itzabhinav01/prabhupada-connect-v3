use tauri::State;

use crate::db::user_store::{self, BookFolder};
use crate::state::AppState;

#[tauri::command]
pub fn get_book_folders(state: State<AppState>) -> Result<Vec<BookFolder>, String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::get_book_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_book_folder(state: State<AppState>, name: String) -> Result<BookFolder, String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::create_book_folder(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_book_folder(state: State<AppState>, id: i64, name: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::rename_book_folder(&conn, id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_book_folder(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::delete_book_folder(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_book_folders(state: State<AppState>, ordered_ids: Vec<i64>) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::reorder_book_folders(&conn, &ordered_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_book_to_folder(state: State<AppState>, folder_id: i64, book_key: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::add_book_to_folder(&conn, folder_id, &book_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_book_from_folder(state: State<AppState>, folder_id: i64, book_key: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::remove_book_from_folder(&conn, folder_id, &book_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_books_in_folder(state: State<AppState>, folder_id: i64, ordered_book_keys: Vec<String>) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::reorder_books_in_folder(&conn, folder_id, &ordered_book_keys).map_err(|e| e.to_string())
}
