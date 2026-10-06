use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::corpus::{self, SearchParams, SearchResponse, VocabTerm};
use crate::db::user_store::{self, BookmarkHit, HighlightHit, NoteHit};
use crate::db::resolve_corpus_db_path;
use crate::state::AppState;

#[tauri::command]
pub fn search_corpus(state: State<AppState>, params: SearchParams) -> Result<SearchResponse, String> {
    let conn = state.corpus_conn()?;
    corpus::search_corpus(&conn, params)
}

/// The Word Wheel needs a write-capable connection to register the
/// `fts5vocab` virtual table (see the module note in `db/corpus.rs`), so —
/// unlike every other corpus query — this opens its own connection to the
/// corpus file directly rather than using the app's read-only pool.
#[tauri::command]
pub fn get_vocabulary_terms(
    app: AppHandle,
    prefix: String,
    limit: Option<i64>,
) -> Result<Vec<VocabTerm>, String> {
    let path = resolve_corpus_db_path(&app).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    corpus::get_vocabulary_terms(&conn, &prefix, limit.unwrap_or(60)).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedSearchResponse {
    pub scripture: SearchResponse,
    pub notes_total: i64,
    pub notes: Vec<NoteHit>,
    pub bookmarks_total: i64,
    pub bookmarks: Vec<BookmarkHit>,
    pub highlights_total: i64,
    pub highlights: Vec<HighlightHit>,
}

/// The Search Studio's "source" filter (All Results / Scripture / My Notes /
/// Bookmarks / My Highlights): searches the read-only corpus and the
/// read-write user_data.db in one round trip, only running the queries the
/// requested `source` actually needs.
#[tauri::command]
pub fn unified_search(
    state: State<AppState>,
    params: SearchParams,
    source: String,
) -> Result<UnifiedSearchResponse, String> {
    let want_scripture = source == "all" || source == "scripture";
    let want_notes = source == "all" || source == "notes";
    let want_bookmarks = source == "all" || source == "bookmarks";
    let want_highlights = source == "all" || source == "highlights";

    let scripture = if want_scripture {
        let conn = state.corpus_conn()?;
        corpus::search_corpus(&conn, params.clone())?
    } else {
        SearchResponse { hits: vec![], total: 0, limit: params.limit.unwrap_or(25), offset: params.offset.unwrap_or(0) }
    };

    let query = params.query.trim();
    let user_conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;

    let (notes_total, notes) = if want_notes && !query.is_empty() {
        user_store::search_notes(&user_conn, query, 25).map_err(|e| e.to_string())?
    } else {
        (0, Vec::new())
    };
    let (bookmarks_total, bookmarks) = if want_bookmarks && !query.is_empty() {
        user_store::search_bookmarks(&user_conn, query, 25).map_err(|e| e.to_string())?
    } else {
        (0, Vec::new())
    };
    let (highlights_total, highlights) = if want_highlights && !query.is_empty() {
        user_store::search_highlights(&user_conn, query, 25).map_err(|e| e.to_string())?
    } else {
        (0, Vec::new())
    };

    Ok(UnifiedSearchResponse {
        scripture,
        notes_total,
        notes,
        bookmarks_total,
        bookmarks,
        highlights_total,
        highlights,
    })
}
