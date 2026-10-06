use tauri::State;

use crate::direct_reference::{self, DirectRefResult, ReferenceSuggestion};
use crate::state::AppState;

#[tauri::command]
pub fn resolve_direct_reference(state: State<AppState>, query: String) -> Result<Option<DirectRefResult>, String> {
    let conn = state.corpus_conn()?;
    direct_reference::resolve_exact(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_direct_reference_suggestions(
    state: State<AppState>,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<ReferenceSuggestion>, String> {
    let conn = state.corpus_conn()?;
    direct_reference::get_suggestions(&conn, &query, max_results.unwrap_or(20)).map_err(|e| e.to_string())
}
