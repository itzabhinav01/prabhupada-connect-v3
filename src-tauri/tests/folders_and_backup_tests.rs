//! Milestone 4: custom book folders and backup export/import/restore.

use prabhupadaconnectv3_lib::db::user_store::{self, ImportMode, NewBookmark, NewHighlight, NewNote};

fn open_temp_user_db(name: &str) -> (rusqlite::Connection, std::path::PathBuf) {
    let path = std::env::temp_dir().join(format!("prabhupada_{name}_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    let conn = user_store::open_and_migrate(&path).expect("schema migration should succeed");
    (conn, path)
}

#[test]
fn book_folders_crud_and_membership() {
    let (conn, path) = open_temp_user_db("folders");

    let folder = user_store::create_book_folder(&conn, "Japa Books").expect("create should succeed");
    assert_eq!(folder.name, "Japa Books");
    assert_eq!(folder.book_keys.len(), 0);

    user_store::add_book_to_folder(&conn, folder.id, "NOI").expect("add should succeed");
    user_store::add_book_to_folder(&conn, folder.id, "BS").expect("add should succeed");

    let folders = user_store::get_book_folders(&conn).expect("list should succeed");
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0].book_keys, vec!["NOI".to_string(), "BS".to_string()]);

    // Reordering within the folder.
    user_store::reorder_books_in_folder(&conn, folder.id, &["BS".to_string(), "NOI".to_string()])
        .expect("reorder should succeed");
    let folders = user_store::get_book_folders(&conn).expect("list should succeed");
    assert_eq!(folders[0].book_keys, vec!["BS".to_string(), "NOI".to_string()]);

    user_store::remove_book_from_folder(&conn, folder.id, "BS").expect("remove should succeed");
    let folders = user_store::get_book_folders(&conn).expect("list should succeed");
    assert_eq!(folders[0].book_keys, vec!["NOI".to_string()]);

    let second = user_store::create_book_folder(&conn, "Daily Reading").expect("create should succeed");
    assert_eq!(second.sort_order, 1);
    user_store::reorder_book_folders(&conn, &[second.id, folder.id]).expect("reorder should succeed");
    let folders = user_store::get_book_folders(&conn).expect("list should succeed");
    assert_eq!(folders[0].name, "Daily Reading");
    assert_eq!(folders[1].name, "Japa Books");

    // Deleting a folder cascades its membership rows (FK ON DELETE CASCADE).
    user_store::delete_book_folder(&conn, folder.id).expect("delete should succeed");
    let folders = user_store::get_book_folders(&conn).expect("list should succeed");
    assert_eq!(folders.len(), 1);

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn backup_export_then_replace_import_round_trips() {
    let (conn, path) = open_temp_user_db("backup_src");

    user_store::save_highlight(
        &conn,
        NewHighlight {
            verse_id: "BG-2-20".to_string(),
            color: "#fef08a".to_string(),
            text_range_start: 0,
            text_range_end: 5,
            selected_text: "hello".to_string(),
            field: None,
        },
    )
    .unwrap();
    user_store::create_note(
        &conn,
        NewNote {
            verse_id: Some("BG-2-20".to_string()),
            title: None,
            content_json: "{}".to_string(),
            content_text: "a realization".to_string(),
        },
    )
    .unwrap();
    user_store::add_bookmark(
        &conn,
        NewBookmark {
            verse_id: "BG-2-20".to_string(),
            book_title: "Bhagavad-gītā As It Is".to_string(),
            verse_ref: "Bg 2.20".to_string(),
            tag: None,
        },
    )
    .unwrap();
    user_store::save_setting(&conn, "theme", "\"dark\"").unwrap();
    let folder = user_store::create_book_folder(&conn, "Japa Books").unwrap();
    user_store::add_book_to_folder(&conn, folder.id, "NOI").unwrap();

    let backup = user_store::export_all(&conn).expect("export should succeed");
    assert_eq!(backup.highlights.len(), 1);
    assert_eq!(backup.notes.len(), 1);
    assert_eq!(backup.bookmarks.len(), 1);
    assert_eq!(backup.folders.len(), 1);

    // Round-trips through JSON exactly like the real export/import commands do.
    let json = serde_json::to_string(&backup).unwrap();
    let deserialized: user_store::BackupData = serde_json::from_str(&json).unwrap();

    let (mut dest_conn, dest_path) = open_temp_user_db("backup_dest");
    // Seed the destination with unrelated data that Replace mode must wipe.
    user_store::create_note(
        &dest_conn,
        NewNote { verse_id: Some("SB-1-1-1".to_string()), title: None, content_json: "{}".to_string(), content_text: "stale".to_string() },
    )
    .unwrap();

    user_store::import_all(&mut dest_conn, &deserialized, ImportMode::Replace).expect("import should succeed");

    let notes = user_store::get_all_notes(&dest_conn).unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].verse_id.as_deref(), Some("BG-2-20"));
    let highlights = user_store::get_all_highlights(&dest_conn).unwrap();
    assert_eq!(highlights.len(), 1);
    let bookmarks = user_store::get_bookmarks(&dest_conn).unwrap();
    assert_eq!(bookmarks.len(), 1);
    let folders = user_store::get_book_folders(&dest_conn).unwrap();
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0].book_keys, vec!["NOI".to_string()]);

    drop(conn);
    drop(dest_conn);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(&dest_path);
}

#[test]
fn backup_merge_import_is_additive_and_idempotent() {
    let (mut conn, path) = open_temp_user_db("backup_merge");

    user_store::add_bookmark(
        &conn,
        NewBookmark {
            verse_id: "BG-2-20".to_string(),
            book_title: "Bhagavad-gītā As It Is".to_string(),
            verse_ref: "Bg 2.20".to_string(),
            tag: None,
        },
    )
    .unwrap();
    let backup = user_store::export_all(&conn).unwrap();

    // Add a second bookmark locally, then merge-import the earlier backup —
    // the second bookmark must survive (merge is additive, not destructive).
    user_store::add_bookmark(
        &conn,
        NewBookmark {
            verse_id: "SB-1-1-1".to_string(),
            book_title: "Śrīmad-Bhāgavatam".to_string(),
            verse_ref: "SB 1.1.1".to_string(),
            tag: None,
        },
    )
    .unwrap();

    user_store::import_all(&mut conn, &backup, ImportMode::Merge).expect("merge import should succeed");
    let bookmarks = user_store::get_bookmarks(&conn).unwrap();
    assert_eq!(bookmarks.len(), 2);

    // Importing the exact same backup again must not duplicate anything.
    user_store::import_all(&mut conn, &backup, ImportMode::Merge).expect("second merge import should succeed");
    let bookmarks = user_store::get_bookmarks(&conn).unwrap();
    assert_eq!(bookmarks.len(), 2);

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn html_export_escapes_content_and_labels_standalone_notes() {
    let (conn, path) = open_temp_user_db("html_export");
    user_store::create_note(
        &conn,
        NewNote {
            verse_id: Some("BG-2-20".to_string()),
            title: Some("<script>alert('x')</script>".to_string()),
            content_json: "{}".to_string(),
            content_text: "Body with <b>tags</b> & \"quotes\"".to_string(),
        },
    )
    .unwrap();
    user_store::create_note(
        &conn,
        NewNote { verse_id: None, title: None, content_json: "{}".to_string(), content_text: "General research".to_string() },
    )
    .unwrap();

    let notes = user_store::get_all_notes(&conn).unwrap();
    let html = user_store::build_html_export(&notes);

    // The export itself now injects one legitimate `<script>` (the
    // auto-print trigger), so this must check for the specific malicious
    // payload rather than assert zero `<script>` tags exist anywhere.
    assert!(!html.contains("<script>alert('x')</script>"), "note title must be HTML-escaped, not injected raw: {html}");
    assert!(html.contains("&lt;script&gt;"));
    assert!(html.contains("window.print()"), "the export must auto-trigger the print dialog");
    assert!(html.contains("Body with &lt;b&gt;tags&lt;/b&gt; &amp; &quot;quotes&quot;"));
    assert!(html.contains("BG-2-20"), "the verse-anchored note must show its verse");
    assert!(html.contains("Standalone"), "the standalone note must show a Standalone label, not a missing/blank verse");
    assert!(html.contains("Untitled Note"), "a note with no title must fall back to a label, not an empty <h2>");

    drop(conn);
    let _ = std::fs::remove_file(&path);
}
