pub mod canonical_titles;
pub mod corpus;
pub mod user_books;
pub mod user_store;

use std::path::{Path, PathBuf};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const CORPUS_DB_RESOURCE_PATH: &str = "database/prabhupada_corpus.db";
const USER_DB_FILE_NAME: &str = "user_data.db";
const USER_BOOKS_DB_FILE_NAME: &str = "user_books.db";

/// Resolves the bundled read-only corpus database path.
///
/// In `cargo tauri dev`, resources are not yet installed into a bundle, so we
/// fall back to the workspace-relative `../database/` directory next to
/// `src-tauri`. In a production install, the file is resolved through
/// Tauri's resource directory.
pub fn resolve_corpus_db_path(app: &AppHandle) -> Result<PathBuf, tauri::Error> {
    if cfg!(debug_assertions) {
        let dev_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../database/prabhupada_corpus.db");
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    app.path().resolve(CORPUS_DB_RESOURCE_PATH, BaseDirectory::Resource)
}

/// Resolves the read-write user data database path inside the OS app data
/// directory, creating the directory if it does not yet exist.
pub fn resolve_user_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(USER_DB_FILE_NAME))
}

/// Resolves the read-write extension database path for user-imported books
/// (Settings → Corpus & Books), inside the same app data directory as
/// `user_data.db` but a separate file — imports are a distinct concern
/// from personal study data and are never included in its export/backup.
pub fn resolve_user_books_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(USER_BOOKS_DB_FILE_NAME))
}

/// Resolves (and creates) the directory JSON backup exports/imports live in.
pub fn resolve_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolves (and creates) the directory raw `user_data.db` file-copy
/// snapshots live in.
pub fn resolve_snapshot_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("snapshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolves (and creates) the directory Notes exports (Obsidian vault .zip /
/// single Markdown file) are written to.
pub fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resolves (and creates) the directory user-imported PDF books are copied
/// into, so they survive the original source file being moved or deleted
/// and sit inside a predictable `$APPDATA/imported_pdfs/*` scope that
/// `opener:allow-open-path` can be granted against (see `capabilities/default.json`).
pub fn resolve_imported_pdf_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("imported_pdfs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Copies `user_data.db` into `snapshots/` on every launch (prefixed
/// `auto-` to distinguish from a user's own manually-triggered
/// `create_snapshot` files, which this never prunes), keeping only the
/// last 7 automatic copies. Best-effort: a failure here (disk full,
/// permissions) is logged, never fatal to startup.
pub fn auto_backup_on_startup(app: &AppHandle) {
    let user_db_path = match resolve_user_db_path(app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[auto_backup_on_startup] could not resolve user_data.db path: {e}");
            return;
        }
    };
    if !user_db_path.exists() {
        return;
    }
    let snapshot_dir = match resolve_snapshot_dir(app) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[auto_backup_on_startup] could not resolve snapshots dir: {e}");
            return;
        }
    };

    let conn = rusqlite::Connection::open_in_memory().expect("in-memory sqlite must open");
    let timestamp: String = conn
        .query_row("SELECT strftime('%Y%m%dT%H%M%S', 'now')", [], |r| r.get(0))
        .unwrap_or_else(|_| "unknown".to_string());
    let dest = snapshot_dir.join(format!("auto-{timestamp}.db"));
    if let Err(e) = std::fs::copy(&user_db_path, &dest) {
        eprintln!("[auto_backup_on_startup] copy failed: {e}");
        return;
    }
    println!("[auto_backup_on_startup] wrote {}", dest.display());

    let mut autos: Vec<_> = match std::fs::read_dir(&snapshot_dir) {
        Ok(entries) => entries
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("auto-"))
            .collect(),
        Err(_) => return,
    };
    autos.sort_by_key(|e| e.file_name());
    let excess = autos.len().saturating_sub(7);
    for old in autos.into_iter().take(excess) {
        let _ = std::fs::remove_file(old.path());
    }
}
