use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db;
use crate::db::user_store::{self, BackupData, ImportMode};
use crate::state::AppState;

fn timestamp_for_filename() -> String {
    // Filesystem-safe (no colons) — e.g. 2026-09-29T14-03-11.
    let conn = rusqlite::Connection::open_in_memory().expect("in-memory sqlite must open");
    conn.query_row("SELECT strftime('%Y-%m-%dT%H-%M-%S', 'now')", [], |r| r.get::<_, String>(0))
        .expect("strftime must succeed")
}

#[tauri::command]
pub fn export_backup(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let data = {
        let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
        user_store::export_all(&conn).map_err(|e| e.to_string())?
    };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    let dir = db::resolve_backup_dir(&app)?;
    let path = dir.join(format!("prabhupada-connect-backup-{}.json", timestamp_for_filename()));
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileInfo {
    pub filename: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupFileInfo>, String> {
    let dir = db::resolve_backup_dir(&app)?;
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified: chrono_lite::SystemTimeIso = metadata.modified().map_err(|e| e.to_string())?.into();
        files.push(BackupFileInfo {
            filename: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            modified_at: modified.0,
            size_bytes: metadata.len(),
        });
    }
    files.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(files)
}

#[tauri::command]
pub fn get_backups_dir(app: AppHandle) -> Result<String, String> {
    let dir = db::resolve_backup_dir(&app)?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn get_exports_dir(app: AppHandle) -> Result<String, String> {
    let dir = db::resolve_export_dir(&app)?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn import_backup(app: AppHandle, state: State<AppState>, filename: String, mode: String) -> Result<String, String> {
    let path = if filename.contains('/') || filename.contains('\\') {
        std::path::PathBuf::from(&filename)
    } else {
        if filename.contains("..") {
            return Err("invalid backup filename".to_string());
        }
        let dir = db::resolve_backup_dir(&app)?;
        dir.join(&filename)
    };

    if !path.exists() {
        return Err(format!("Backup file not found: {}", path.display()));
    }

    let json = std::fs::read_to_string(&path).map_err(|e| format!("Could not read backup file: {e}"))?;
    let data: BackupData = serde_json::from_str(&json).map_err(|e| format!("Invalid backup file format: {e}"))?;

    let import_mode = match mode.as_str() {
        "replace" => ImportMode::Replace,
        _ => ImportMode::Merge,
    };

    let mut conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    user_store::import_all(&mut conn, &data, import_mode).map_err(|e| e.to_string())?;

    Ok(format!(
        "Restored {} highlights, {} notes, {} bookmarks, {} history entries, {} folders",
        data.highlights.len(),
        data.notes.len(),
        data.bookmarks.len(),
        data.history.len(),
        data.folders.len()
    ))
}

/// Reads a v2 (`VedaBaseModern2`) personal-data backup from an arbitrary
/// path outside this app's own managed `backups/` directory — unlike
/// `import_backup`, this is for a file the USER brings from v2, so it takes
/// a full path rather than a filename to look up in our own folder.
///
/// v2's export is a ZIP container (`.vdbbackup`) with `manifest.json` +
/// `data.json` (see `ResearchDataBackupService.cs`), but a plain `.json`
/// (this app's own export format) is accepted too — this command sniffs the
/// leading bytes rather than trusting the extension. Only `data.json` is
/// read; `manifest.json`'s checksum/version metadata isn't verified here
/// since it's advisory in v2 too (a warning, not a hard gate).
///
/// This deliberately returns the parsed JSON payload as-is rather than
/// mapping it into local tables here: v2's field names (PascalCase),
/// enum-as-integer colors, and per-field-relative offsets need the same
/// verse-lookup, color-palette, and offset-realignment logic the Supabase
/// pull path already has in `supabaseSync.ts` — reusing it beats
/// reimplementing it in Rust a second time.
#[tauri::command]
pub fn read_v2_backup_file(path: String) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("couldn't read {path}: {e}"))?;
    // ZIP local-file-header magic ("PK\x03\x04", or "PK\x05\x06" for an
    // empty archive) — checking just the "PK" prefix covers both.
    let is_zip = bytes.len() >= 2 && &bytes[0..2] == b"PK";
    let text = if is_zip {
        let reader = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("not a valid zip archive: {e}"))?;
        let mut entry = archive
            .by_name("data.json")
            .map_err(|_| "archive is missing data.json — not a v2 .vdbbackup file".to_string())?;
        let mut contents = String::new();
        std::io::Read::read_to_string(&mut entry, &mut contents).map_err(|e| e.to_string())?;
        contents
    } else {
        String::from_utf8(bytes).map_err(|e| format!("file isn't valid UTF-8 text or a zip archive: {e}"))?
    };
    serde_json::from_str(&text).map_err(|e| format!("couldn't parse data.json: {e}"))
}

#[tauri::command]
pub fn export_notes_markdown(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let notes = {
        let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
        user_store::get_all_notes(&conn).map_err(|e| e.to_string())?
    };
    let markdown = user_store::build_markdown_export(&notes);

    let dir = db::resolve_export_dir(&app)?;
    let path = dir.join(format!("prabhupada-connect-notes-{}.md", timestamp_for_filename()));
    std::fs::write(&path, markdown).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Generates a styled, self-contained HTML file of every note and opens it
/// in the system browser (see `exportNotesHtml` on the frontend) — Ctrl+P
/// there gives "Save as PDF" for free, with no PDF-rendering dependency.
#[tauri::command]
pub fn export_notes_html(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let notes = {
        let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
        user_store::get_all_notes(&conn).map_err(|e| e.to_string())?
    };
    let html = user_store::build_html_export(&notes);

    let dir = db::resolve_export_dir(&app)?;
    let path = dir.join(format!("prabhupada-connect-notes-{}.html", timestamp_for_filename()));
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn export_notes_obsidian(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let notes = {
        let conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
        user_store::get_all_notes(&conn).map_err(|e| e.to_string())?
    };
    let files = user_store::build_obsidian_notes(&notes);

    let dir = db::resolve_export_dir(&app)?;
    let path = dir.join(format!("prabhupada-connect-obsidian-vault-{}.zip", timestamp_for_filename()));
    let zip_file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut writer = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (filename, content) in &files {
        writer.start_file(filename, options).map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut writer, content.as_bytes()).map_err(|e| e.to_string())?;
    }
    writer.finish().map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn create_snapshot(app: AppHandle) -> Result<String, String> {
    let user_db_path = db::resolve_user_db_path(&app)?;
    let snapshot_dir = db::resolve_snapshot_dir(&app)?;
    let snapshot_path = snapshot_dir.join(format!("snapshot-{}.db", timestamp_for_filename()));
    std::fs::copy(&user_db_path, &snapshot_path).map_err(|e| e.to_string())?;
    Ok(snapshot_path.display().to_string())
}

/// Lists every raw `.db` snapshot (both the automatic `auto-*` ones from
/// `db::auto_backup_on_startup` and manual `snapshot-*` ones from
/// `create_snapshot`) — distinct from `list_backups`, which lists the
/// separate JSON export format in `backups/`, not `snapshots/`.
#[tauri::command]
pub fn list_snapshots(app: AppHandle) -> Result<Vec<BackupFileInfo>, String> {
    let dir = db::resolve_snapshot_dir(&app)?;
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let modified: chrono_lite::SystemTimeIso = metadata.modified().map_err(|e| e.to_string())?.into();
        files.push(BackupFileInfo {
            filename: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            modified_at: modified.0,
            size_bytes: metadata.len(),
        });
    }
    files.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(files)
}

/// Restores a raw `.db` snapshot over the live `user_data.db` and reopens
/// the connection `AppState` holds in place — no app restart needed. The
/// old WAL/SHM sidecar files are removed first so the freshly reopened
/// connection never tries to replay stale WAL frames against the
/// just-restored file.
#[tauri::command]
pub fn restore_snapshot(app: AppHandle, state: State<AppState>, filename: String) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("invalid snapshot filename".to_string());
    }
    let snapshot_dir = db::resolve_snapshot_dir(&app)?;
    let snapshot_path = snapshot_dir.join(&filename);
    if !snapshot_path.exists() {
        return Err("snapshot not found".to_string());
    }
    let user_db_path = db::resolve_user_db_path(&app)?;

    let mut conn = state.user_db.lock().map_err(|_| "user db lock poisoned".to_string())?;
    std::fs::copy(&snapshot_path, &user_db_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(user_db_path.with_extension("db-wal"));
    let _ = std::fs::remove_file(user_db_path.with_extension("db-shm"));
    *conn = user_store::open_and_migrate(&user_db_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// A tiny scoped shim so `list_backups` can format a `SystemTime` the same
/// way every other timestamp in this schema is formatted, without pulling
/// in a chrono dependency for one conversion.
mod chrono_lite {
    use std::time::SystemTime;

    pub struct SystemTimeIso(pub String);

    impl From<SystemTime> for SystemTimeIso {
        fn from(t: SystemTime) -> Self {
            let secs = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            let conn = rusqlite::Connection::open_in_memory().expect("in-memory sqlite must open");
            let iso: String = conn
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, 'unixepoch')", [secs], |r| r.get(0))
                .expect("strftime must succeed");
            SystemTimeIso(iso)
        }
    }
}
