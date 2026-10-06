use tauri::State;

use crate::db::user_store;
use crate::state::AppState;

fn lock_err<T>(_: T) -> String {
    "user database is unavailable (lock poisoned)".to_string()
}

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_setting(state: State<AppState>, key: String, value_json: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::save_setting(&conn, &key, &value_json).map_err(|e| e.to_string())
}
