mod commands;
pub mod db;
pub mod direct_reference;
mod state;
pub mod utils;

use tauri::Manager;

use commands::backup::{
    create_snapshot, export_backup, export_notes_html, export_notes_markdown, export_notes_obsidian, get_backups_dir,
    get_exports_dir, import_backup, list_backups, list_snapshots, read_v2_backup_file, restore_snapshot,
};
use commands::concordance::get_concordance;
use commands::direct_reference::{get_direct_reference_suggestions, resolve_direct_reference};
use commands::folders::{
    add_book_to_folder, create_book_folder, delete_book_folder, get_book_folders, remove_book_from_folder,
    rename_book_folder, reorder_book_folders, reorder_books_in_folder,
};
use commands::imported_books::{
    get_imported_book_toc, get_imported_chapter_records, get_imported_verse_record, import_book_json,
    import_book_pdf, list_imported_books, remove_imported_book, search_imported_books,
};
use commands::navigation::{get_book_toc, get_books, get_chapter_verses};
use commands::reader::{get_chapter_records, get_verse_record};
use commands::search::{get_vocabulary_terms, search_corpus, unified_search};
use commands::settings::{get_setting, save_setting};
use commands::study::{
    add_bookmark, apply_bookmark_tombstone, apply_highlight_tombstone, apply_note_tombstone,
    clear_bookmark_collection, clear_history, create_note, delete_highlight, delete_note, get_all_highlights,
    get_all_highlights_for_sync, get_all_notes, get_all_notes_for_sync, get_bookmarks, get_highlights_for_verse,
    get_history, get_notes_for_verse, get_bookmarks_for_sync, insert_history_if_absent, move_bookmark_to_collection,
    record_history, remove_bookmark, rename_bookmark_collection, save_highlight, set_bookmark_remote_collection_id,
    set_bookmark_remote_id, set_highlight_remote_id, set_note_remote_id, update_note, upsert_synced_highlight,
    upsert_synced_note,
};
use state::AppState;

/// Exercises the full Phase 2 stack once at startup: corpus book listing,
/// an FTS5 search, and a round-trip write/read/cleanup against
/// `user_data.db`. Returns a human-readable diagnostic summary.
#[tauri::command]
fn app_health_check(state: tauri::State<AppState>) -> Result<String, String> {
    let corpus_conn = state.corpus_conn()?;
    let books = db::corpus::list_books(&corpus_conn).map_err(|e| e.to_string())?;

    let search = db::corpus::search_corpus(
        &corpus_conn,
        db::corpus::SearchParams { query: "kṛṣṇa".to_string(), limit: Some(5), offset: Some(0), ..Default::default() },
    )?;

    let user_conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    let saved = db::user_store::save_highlight(
        &user_conn,
        db::user_store::NewHighlight {
            verse_id: "__health_check__".to_string(),
            color: "yellow".to_string(),
            text_range_start: 0,
            text_range_end: 1,
            selected_text: "diagnostic".to_string(),
            field: None,
        },
    )
    .map_err(|e| e.to_string())?;
    let round_trip = db::user_store::get_highlights_for_verse(&user_conn, "__health_check__")
        .map_err(|e| e.to_string())?;
    db::user_store::delete_highlight(&user_conn, saved.id).map_err(|e| e.to_string())?;

    let summary = format!(
        "ok — {} books loaded; FTS5 search 'kṛṣṇa' returned {} of {} hits; user_data.db round-trip {}",
        books.len(),
        search.hits.len(),
        search.total,
        if round_trip.len() == 1 { "OK" } else { "FAILED" }
    );
    println!("[app_health_check] {summary}");
    Ok(summary)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_health_check,
            get_books,
            get_book_toc,
            get_chapter_verses,
            get_verse_record,
            get_chapter_records,
            search_corpus,
            unified_search,
            get_vocabulary_terms,
            save_highlight,
            delete_highlight,
            get_highlights_for_verse,
            get_all_highlights,
            get_all_highlights_for_sync,
            set_highlight_remote_id,
            apply_highlight_tombstone,
            create_note,
            update_note,
            delete_note,
            get_notes_for_verse,
            get_all_notes,
            get_all_notes_for_sync,
            set_note_remote_id,
            apply_note_tombstone,
            upsert_synced_note,
            add_bookmark,
            remove_bookmark,
            get_bookmarks,
            get_bookmarks_for_sync,
            set_bookmark_remote_id,
            apply_bookmark_tombstone,
            set_bookmark_remote_collection_id,
            rename_bookmark_collection,
            clear_bookmark_collection,
            move_bookmark_to_collection,
            record_history,
            get_history,
            clear_history,
            get_setting,
            save_setting,
            resolve_direct_reference,
            get_direct_reference_suggestions,
            get_book_folders,
            create_book_folder,
            rename_book_folder,
            delete_book_folder,
            reorder_book_folders,
            add_book_to_folder,
            remove_book_from_folder,
            reorder_books_in_folder,
            export_backup,
            get_backups_dir,
            get_exports_dir,
            list_backups,
            import_backup,
            read_v2_backup_file,
            create_snapshot,
            list_snapshots,
            restore_snapshot,
            export_notes_markdown,
            export_notes_obsidian,
            export_notes_html,
            get_concordance,
            import_book_json,
            import_book_pdf,
            list_imported_books,
            remove_imported_book,
            get_imported_book_toc,
            get_imported_chapter_records,
            get_imported_verse_record,
            search_imported_books,
            upsert_synced_highlight,
            insert_history_if_absent,
        ])
        .setup(|app| {
            let corpus_db_path = db::resolve_corpus_db_path(app.handle())?;
            println!("Corpus database resolved at: {}", corpus_db_path.display());
            let corpus_pool = db::corpus::build_pool(&corpus_db_path)?;

            let user_db_path = db::resolve_user_db_path(app.handle())?;
            println!("User database resolved at: {}", user_db_path.display());
            let user_conn = db::user_store::open_and_migrate(&user_db_path)?;

            // Checkpoint WAL into the main file first so the snapshot copy
            // below can't miss whatever the previous session wrote but
            // hadn't yet checkpointed.
            let _: rusqlite::Result<i64> =
                user_conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(0));
            db::auto_backup_on_startup(app.handle());

            let user_books_db_path = db::resolve_user_books_db_path(app.handle())?;
            let user_books_conn = db::user_books::open_and_migrate(&user_books_db_path)?;

            app.manage(AppState {
                corpus_pool,
                user_db: std::sync::Mutex::new(user_conn),
                user_books_db: std::sync::Mutex::new(user_books_conn),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.maximize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
