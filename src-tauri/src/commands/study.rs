use tauri::State;

use crate::db::user_store::{
    self, Bookmark, Highlight, HistoryEntry, Note, NoteBacklink, NewBookmark, NewHighlight, NewHistoryEntry, NewNote,
};
use crate::state::AppState;

fn lock_err<T>(_: T) -> String {
    "user database is unavailable (lock poisoned)".to_string()
}

// Highlights ------------------------------------------------------------

#[tauri::command]
pub fn save_highlight(state: State<AppState>, highlight: NewHighlight) -> Result<Highlight, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::save_highlight(&conn, highlight).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_highlight(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::delete_highlight(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_highlights_for_verse(state: State<AppState>, verse_id: String) -> Result<Vec<Highlight>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_highlights_for_verse(&conn, &verse_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_highlights(state: State<AppState>) -> Result<Vec<Highlight>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_all_highlights(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_highlights_for_sync(state: State<AppState>) -> Result<Vec<Highlight>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_all_highlights_for_sync(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_highlight_remote_id(state: State<AppState>, id: i64, remote_id: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::set_highlight_remote_id(&conn, id, &remote_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_highlight_tombstone(state: State<AppState>, remote_id: String, deleted_at: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::apply_highlight_tombstone(&conn, &remote_id, &deleted_at).map_err(|e| e.to_string())
}

/// Used by cloud sync's PULL — upserts a highlight fetched from Supabase
/// into the local database (idempotent across repeated pulls).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn upsert_synced_highlight(
    state: State<AppState>,
    verse_id: String,
    color: String,
    text_range_start: i64,
    text_range_end: i64,
    selected_text: String,
    field: Option<String>,
    created_at: String,
    updated_at: String,
    remote_id: Option<String>,
) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::upsert_synced_highlight(
        &conn,
        &verse_id,
        &color,
        text_range_start,
        text_range_end,
        &selected_text,
        field.as_deref(),
        &created_at,
        &updated_at,
        remote_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}

// Notes -------------------------------------------------------------------

#[tauri::command]
pub fn create_note(state: State<AppState>, note: NewNote) -> Result<Note, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::create_note(&conn, note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(
    state: State<AppState>,
    id: i64,
    title: Option<String>,
    content_json: String,
    content_text: String,
) -> Result<Note, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::update_note(&conn, id, title.as_deref(), &content_json, &content_text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::delete_note(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_notes_for_verse(state: State<AppState>, verse_id: String) -> Result<Vec<Note>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_notes_for_verse(&conn, &verse_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_backlinks_for_verse(
    state: State<AppState>,
    verse_id: String,
    reference: Option<String>,
) -> Result<Vec<NoteBacklink>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_backlinks_for_verse(&conn, &verse_id, reference.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_notes(state: State<AppState>) -> Result<Vec<Note>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_all_notes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_notes_for_sync(state: State<AppState>) -> Result<Vec<Note>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_all_notes_for_sync(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_note_remote_id(state: State<AppState>, id: i64, remote_id: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::set_note_remote_id(&conn, id, &remote_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_note_tombstone(state: State<AppState>, remote_id: String, deleted_at: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::apply_note_tombstone(&conn, &remote_id, &deleted_at).map_err(|e| e.to_string())
}

/// Used by cloud sync's PULL — upserts a note fetched from Supabase into the
/// local database (idempotent across repeated pulls).
#[tauri::command]
pub fn upsert_synced_note(
    state: State<AppState>,
    verse_id: Option<String>,
    title: Option<String>,
    content_text: String,
    content_json: String,
    remote_id: String,
    created_at: String,
    updated_at: String,
) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::upsert_synced_note(
        &conn,
        verse_id.as_deref(),
        title.as_deref(),
        &content_text,
        &content_json,
        &remote_id,
        &created_at,
        &updated_at,
    )
    .map_err(|e| e.to_string())
}

// Bookmarks -----------------------------------------------------------------

#[tauri::command]
pub fn add_bookmark(state: State<AppState>, bookmark: NewBookmark) -> Result<Bookmark, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::add_bookmark(&conn, bookmark).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_bookmark(state: State<AppState>, verse_id: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::remove_bookmark(&conn, &verse_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bookmarks(state: State<AppState>) -> Result<Vec<Bookmark>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_bookmarks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_bookmark_remote_id(state: State<AppState>, verse_id: String, remote_id: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::set_bookmark_remote_id(&conn, &verse_id, &remote_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bookmarks_for_sync(state: State<AppState>) -> Result<Vec<Bookmark>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_bookmarks_for_sync(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_bookmark_tombstone(state: State<AppState>, remote_id: String, deleted_at: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::apply_bookmark_tombstone(&conn, &remote_id, &deleted_at).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_bookmark_remote_collection_id(state: State<AppState>, tag: String, remote_collection_id: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::set_bookmark_remote_collection_id(&conn, &tag, &remote_collection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_bookmark_collection(state: State<AppState>, old_tag: String, new_tag: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::rename_bookmark_collection(&conn, &old_tag, &new_tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_bookmark_collection(state: State<AppState>, tag: String) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::clear_bookmark_collection(&conn, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_bookmark_to_collection(state: State<AppState>, verse_id: String, tag: Option<String>) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::move_bookmark_to_collection(&conn, &verse_id, tag.as_deref()).map_err(|e| e.to_string())
}

// Reading history -------------------------------------------------------------

#[tauri::command]
pub fn record_history(state: State<AppState>, entry: NewHistoryEntry) -> Result<HistoryEntry, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::record_history(&conn, entry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_history(state: State<AppState>, limit: Option<i64>) -> Result<Vec<HistoryEntry>, String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::get_history(&conn, limit.unwrap_or(100)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_history(state: State<AppState>) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::clear_history(&conn).map_err(|e| e.to_string())
}

/// Used by cloud sync's PULL — inserts a history entry fetched from
/// Supabase only if it isn't already present (idempotent across repeated
/// pulls, since the log is append-only with no unique column to upsert on).
#[tauri::command]
pub fn insert_history_if_absent(
    state: State<AppState>,
    verse_id: String,
    book_title: String,
    verse_ref: String,
    timestamp: String,
) -> Result<(), String> {
    let conn = state.user_db.lock().map_err(lock_err)?;
    user_store::insert_history_if_absent(&conn, &verse_id, &book_title, &verse_ref, &timestamp).map_err(|e| e.to_string())
}
