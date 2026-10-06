//! Sync-parity remediation: verifies the soft-delete/tombstone/remote_id
//! machinery added to `user_store.rs` for notes, highlights, and bookmarks —
//! the local-database half of fixing the data-duplication and silent-data-
//! loss bugs identified in the v2<->v3 sync parity report (Root Causes 1-3).

use prabhupadaconnectv3_lib::db::user_store;

fn fresh_conn(label: &str) -> rusqlite::Connection {
    let tmp = std::env::temp_dir().join(format!("prabhupada_sync_test_{label}_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    user_store::open_and_migrate(&tmp).expect("schema migration should succeed")
}

/// Simulates a real pre-existing database from before the standalone-notes/
/// multi-note migration: builds the *old* `verse_id TEXT NOT NULL UNIQUE`
/// notes table by hand (bypassing `open_and_migrate`, which would migrate it
/// immediately), inserts a note the old way, then runs the real
/// `open_and_migrate` and checks the note survived the table rebuild with
/// every column intact.
#[test]
fn migrating_an_existing_database_preserves_old_notes() {
    let tmp = std::env::temp_dir().join(format!("prabhupada_migration_test_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    {
        let conn = rusqlite::Connection::open(&tmp).unwrap();
        conn.execute_batch(
            "CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                verse_id TEXT NOT NULL UNIQUE,
                title TEXT,
                content_json TEXT NOT NULL,
                content_text TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                remote_id TEXT,
                deleted_at TEXT
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (verse_id, title, content_json, content_text, remote_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["BG-2-20", "My Title", "{\"a\":1}", "pre-existing note", "remote-old-1"],
        )
        .unwrap();
    }

    let conn = user_store::open_and_migrate(&tmp).expect("migrating an existing database must succeed");
    let notes = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap();
    assert_eq!(notes.len(), 1, "the pre-existing note must survive the table rebuild");
    let n = &notes[0];
    assert_eq!(n.verse_id.as_deref(), Some("BG-2-20"));
    assert_eq!(n.title.as_deref(), Some("My Title"));
    assert_eq!(n.content_text, "pre-existing note");
    assert_eq!(n.remote_id.as_deref(), Some("remote-old-1"));

    // And the new capability (nullable verse_id, multiple notes per verse)
    // actually works post-migration, on the very same (now-migrated) table.
    user_store::create_note(&conn, user_store::NewNote { verse_id: None, title: None, content_json: "{}".to_string(), content_text: "new standalone".to_string() }).unwrap();
    user_store::create_note(&conn, user_store::NewNote { verse_id: Some("BG-2-20".to_string()), title: None, content_json: "{}".to_string(), content_text: "second note on same verse".to_string() }).unwrap();
    assert_eq!(user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap().len(), 2);

    drop(conn);
    let _ = std::fs::remove_file(&tmp);
}

fn new_note(verse_id: Option<&str>, text: &str) -> user_store::NewNote {
    user_store::NewNote {
        verse_id: verse_id.map(|s| s.to_string()),
        title: None,
        content_json: "{}".to_string(),
        content_text: text.to_string(),
    }
}

#[test]
fn deleting_a_note_soft_deletes_it_and_keeps_its_remote_id() {
    let conn = fresh_conn("note_soft_delete");
    let note = user_store::create_note(&conn, new_note(Some("BG-2-20"), "x")).unwrap();
    user_store::set_note_remote_id(&conn, note.id, "remote-note-1").unwrap();

    user_store::delete_note(&conn, note.id).unwrap();

    assert!(user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap().is_empty(), "soft-deleted note must not appear in a normal lookup");
    assert!(!user_store::get_all_notes(&conn).unwrap().iter().any(|n| n.id == note.id), "soft-deleted note must not appear in get_all_notes");

    let for_sync = user_store::get_all_notes_for_sync(&conn).unwrap();
    let tombstone = for_sync.iter().find(|n| n.id == note.id).expect("tombstoned note must still be present for sync");
    assert_eq!(tombstone.remote_id.as_deref(), Some("remote-note-1"), "remote_id must survive the soft-delete so the tombstone can be pushed under the right row");
    assert!(tombstone.deleted_at.is_some());
}

#[test]
fn a_verse_can_have_multiple_active_notes() {
    let conn = fresh_conn("multi_note_per_verse");
    let a = user_store::create_note(&conn, new_note(Some("BG-2-20"), "first realization")).unwrap();
    let b = user_store::create_note(&conn, new_note(Some("BG-2-20"), "second realization")).unwrap();

    let notes = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap();
    assert_eq!(notes.len(), 2, "both notes on the same verse must coexist");
    assert!(notes.iter().any(|n| n.id == a.id && n.content_text == "first realization"));
    assert!(notes.iter().any(|n| n.id == b.id && n.content_text == "second realization"));

    // Deleting one leaves the other untouched.
    user_store::delete_note(&conn, a.id).unwrap();
    let remaining = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, b.id);
}

#[test]
fn a_standalone_note_has_no_verse_id_and_still_appears_in_get_all_notes() {
    let conn = fresh_conn("standalone_note");
    let standalone = user_store::create_note(&conn, new_note(None, "general research note")).unwrap();
    assert_eq!(standalone.verse_id, None);

    let all = user_store::get_all_notes(&conn).unwrap();
    assert!(all.iter().any(|n| n.id == standalone.id), "a standalone note must still show up in get_all_notes");
}

#[test]
fn update_note_edits_in_place_by_id_without_affecting_other_notes() {
    let conn = fresh_conn("update_note");
    let a = user_store::create_note(&conn, new_note(Some("BG-2-20"), "draft")).unwrap();
    let b = user_store::create_note(&conn, new_note(Some("BG-2-20"), "untouched")).unwrap();

    let updated = user_store::update_note(&conn, a.id, Some("My Title"), "{\"edited\":true}", "final text").unwrap();
    assert_eq!(updated.title.as_deref(), Some("My Title"));
    assert_eq!(updated.content_text, "final text");

    let b_after = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap().into_iter().find(|n| n.id == b.id).unwrap();
    assert_eq!(b_after.content_text, "untouched");
}

#[test]
fn deleting_a_highlight_soft_deletes_it_and_keeps_its_remote_id() {
    let conn = fresh_conn("highlight_soft_delete");
    let h = user_store::save_highlight(
        &conn,
        user_store::NewHighlight {
            verse_id: "BG-2-13".to_string(),
            color: "#fef08a".to_string(),
            text_range_start: 0,
            text_range_end: 5,
            selected_text: "hello".to_string(),
            field: None,
        },
    )
    .unwrap();
    user_store::set_highlight_remote_id(&conn, h.id, "remote-hl-1").unwrap();

    user_store::delete_highlight(&conn, h.id).unwrap();

    assert!(user_store::get_highlights_for_verse(&conn, "BG-2-13").unwrap().is_empty());
    assert!(!user_store::get_all_highlights(&conn).unwrap().iter().any(|x| x.id == h.id));

    let for_sync = user_store::get_all_highlights_for_sync(&conn).unwrap();
    let tombstone = for_sync.iter().find(|x| x.id == h.id).expect("tombstoned highlight must still be present for sync");
    assert_eq!(tombstone.remote_id.as_deref(), Some("remote-hl-1"));
    assert!(tombstone.deleted_at.is_some());
}

#[test]
fn applying_a_remote_tombstone_soft_deletes_the_matching_local_row_only() {
    let conn = fresh_conn("apply_tombstones");
    let a = user_store::create_note(&conn, new_note(Some("BG-2-20"), "x")).unwrap();
    let b = user_store::create_note(&conn, new_note(Some("BG-2-21"), "y")).unwrap();
    user_store::set_note_remote_id(&conn, a.id, "remote-note-A").unwrap();
    user_store::set_note_remote_id(&conn, b.id, "remote-note-B").unwrap();

    // Another device deleted the note behind remote-note-A.
    user_store::apply_note_tombstone(&conn, "remote-note-A", "2026-01-01T00:00:00.000Z").unwrap();

    assert!(user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap().is_empty(), "the tombstoned note must now read as deleted locally");
    assert!(!user_store::get_notes_for_verse(&conn, "BG-2-21").unwrap().is_empty(), "an unrelated note must be untouched");

    // A tombstone for a remote_id this device has never seen is a no-op, not an error.
    user_store::apply_note_tombstone(&conn, "remote-note-never-seen", "2026-01-01T00:00:00.000Z").unwrap();
}

#[test]
fn applying_a_bookmark_tombstone_soft_deletes_it() {
    let conn = fresh_conn("bookmark_tombstone");
    user_store::add_bookmark(&conn, user_store::NewBookmark { verse_id: "BG-2-20".to_string(), book_title: "Bhagavad-gita".to_string(), verse_ref: "Bg 2.20".to_string(), tag: None }).unwrap();
    user_store::set_bookmark_remote_id(&conn, "BG-2-20", "remote-bm-1").unwrap();

    user_store::apply_bookmark_tombstone(&conn, "remote-bm-1", "2026-01-01T00:00:00.000Z").unwrap();

    assert!(!user_store::get_bookmarks(&conn).unwrap().iter().any(|b| b.verse_id == "BG-2-20"), "a bookmark deleted on another device must disappear locally once the tombstone is applied");
    let for_sync = user_store::get_bookmarks_for_sync(&conn).unwrap();
    assert!(for_sync.iter().find(|b| b.verse_id == "BG-2-20").unwrap().deleted_at.is_some());
}

#[test]
fn pull_upsert_revives_a_stale_local_tombstone_and_records_remote_id() {
    let conn = fresh_conn("revive_on_pull");
    let created = user_store::create_note(&conn, new_note(Some("BG-2-20"), "old")).unwrap();
    user_store::delete_note(&conn, created.id).unwrap();
    assert!(user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap().is_empty());

    // A pull finds this note still active remotely (another device edited
    // it after this device's offline delete) — last-pull-wins means it
    // comes back, carrying the real remote_id. It has no remote_id locally
    // yet, so upsert must insert a new row rather than matching the
    // unrelated soft-deleted one by coincidence.
    user_store::upsert_synced_note(&conn, Some("BG-2-20"), None, "revived", "{}", "remote-note-X", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z").unwrap();

    let notes = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap();
    assert_eq!(notes.len(), 1, "pull must produce exactly one active note, not revive the unrelated tombstoned row");
    assert_eq!(notes[0].content_text, "revived");
    assert_eq!(notes[0].remote_id.as_deref(), Some("remote-note-X"));
}

#[test]
fn pull_upsert_with_a_known_remote_id_updates_the_existing_note_not_a_new_one() {
    let conn = fresh_conn("pull_upsert_matches_remote_id");
    user_store::upsert_synced_note(&conn, Some("BG-2-20"), None, "v1", "{}", "remote-note-Y", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z").unwrap();
    user_store::upsert_synced_note(&conn, Some("BG-2-20"), None, "v2", "{}", "remote-note-Y", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z").unwrap();

    let notes = user_store::get_notes_for_verse(&conn, "BG-2-20").unwrap();
    assert_eq!(notes.len(), 1, "same remote_id across two pulls must update in place, not duplicate");
    assert_eq!(notes[0].content_text, "v2");
}

#[test]
fn pull_upsert_can_create_a_standalone_note() {
    let conn = fresh_conn("pull_upsert_standalone");
    user_store::upsert_synced_note(&conn, None, Some("Research"), "general notes", "{}", "remote-note-Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z").unwrap();

    let all = user_store::get_all_notes(&conn).unwrap();
    let pulled = all.iter().find(|n| n.remote_id.as_deref() == Some("remote-note-Z")).expect("standalone note must be pulled in");
    assert_eq!(pulled.verse_id, None);
    assert_eq!(pulled.title.as_deref(), Some("Research"));
}

#[test]
fn upsert_synced_highlight_matches_existing_row_by_remote_id_even_if_text_changed() {
    let conn = fresh_conn("highlight_remote_id_match");
    // First pull creates the row.
    user_store::upsert_synced_highlight(&conn, "BG-2-13", "#fef08a", 0, 5, "hello", None, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", Some("remote-hl-1")).unwrap();
    let first = user_store::get_highlights_for_verse(&conn, "BG-2-13").unwrap();
    assert_eq!(first.len(), 1);

    // Second pull for the SAME remote row with a different range (edited on
    // another device) must update the existing row, not insert a duplicate.
    user_store::upsert_synced_highlight(&conn, "BG-2-13", "#fef08a", 0, 10, "hello world", None, "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z", Some("remote-hl-1")).unwrap();
    let second = user_store::get_highlights_for_verse(&conn, "BG-2-13").unwrap();
    assert_eq!(second.len(), 1, "same remote_id must upsert in place, not duplicate");
    assert_eq!(second[0].selected_text, "hello world");
}

#[test]
fn upsert_synced_highlight_with_no_remote_id_does_not_clobber_an_existing_one() {
    let conn = fresh_conn("highlight_vdbbackup_no_clobber");
    // Simulates the `.vdbbackup` local-file importer, which has no Supabase
    // row to associate (passes `None`) — it must match by the local
    // verse+range+color composite and leave any already-synced remote_id
    // (set here to simulate a prior real sync) completely untouched.
    user_store::upsert_synced_highlight(&conn, "BG-2-13", "#fef08a", 0, 5, "hello", None, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", Some("remote-hl-real")).unwrap();
    user_store::upsert_synced_highlight(&conn, "BG-2-13", "#fef08a", 0, 5, "hello", None, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z", None).unwrap();

    let rows = user_store::get_highlights_for_verse(&conn, "BG-2-13").unwrap();
    assert_eq!(rows.len(), 1, "a None remote_id must still match the existing row by composite key, not insert a duplicate");
    assert_eq!(rows[0].remote_id.as_deref(), Some("remote-hl-real"), "a None remote_id must never overwrite an already-known one");
}

#[test]
fn set_bookmark_remote_collection_id_updates_every_bookmark_sharing_the_tag() {
    let conn = fresh_conn("collection_id_fanout");
    user_store::add_bookmark(&conn, user_store::NewBookmark { verse_id: "BG-2-20".to_string(), book_title: "x".to_string(), verse_ref: "Bg 2.20".to_string(), tag: Some("Daily Reading".to_string()) }).unwrap();
    user_store::add_bookmark(&conn, user_store::NewBookmark { verse_id: "BG-2-21".to_string(), book_title: "x".to_string(), verse_ref: "Bg 2.21".to_string(), tag: Some("Daily Reading".to_string()) }).unwrap();
    user_store::add_bookmark(&conn, user_store::NewBookmark { verse_id: "SB-1.1-1".to_string(), book_title: "x".to_string(), verse_ref: "SB 1.1.1".to_string(), tag: Some("Other".to_string()) }).unwrap();

    user_store::set_bookmark_remote_collection_id(&conn, "Daily Reading", "remote-coll-A").unwrap();

    let all = user_store::get_bookmarks_for_sync(&conn).unwrap();
    let a = all.iter().find(|b| b.verse_id == "BG-2-20").unwrap();
    let b = all.iter().find(|b| b.verse_id == "BG-2-21").unwrap();
    let other = all.iter().find(|b| b.verse_id == "SB-1.1-1").unwrap();
    assert_eq!(a.remote_collection_id.as_deref(), Some("remote-coll-A"));
    assert_eq!(b.remote_collection_id.as_deref(), Some("remote-coll-A"));
    assert_eq!(other.remote_collection_id, None, "a bookmark in a different collection must be unaffected");
}

/// Before this fix, `bookmarks` had no `updated_at` column at all — renaming
/// a collection (or any other mutation) left the row's timestamp frozen at
/// `created_at`, so the sync push sent an unchanged value and v2's
/// incremental pull (`updated_at > watermark`) never saw the edit.
#[test]
fn renaming_a_bookmark_collection_bumps_updated_at_past_created_at() {
    let conn = fresh_conn("bookmark_updated_at");
    let created = user_store::add_bookmark(
        &conn,
        user_store::NewBookmark {
            verse_id: "BG-2-20".to_string(),
            book_title: "x".to_string(),
            verse_ref: "Bg 2.20".to_string(),
            tag: Some("Daily Reading".to_string()),
        },
    )
    .unwrap();
    assert_eq!(created.updated_at, created.created_at, "a freshly-added bookmark has no edits yet");

    std::thread::sleep(std::time::Duration::from_millis(5));
    user_store::rename_bookmark_collection(&conn, "Daily Reading", "Morning Reading").unwrap();

    let renamed = user_store::get_bookmarks(&conn).unwrap().into_iter().find(|b| b.verse_id == "BG-2-20").unwrap();
    assert_eq!(renamed.tag.as_deref(), Some("Morning Reading"));
    assert!(
        renamed.updated_at > renamed.created_at,
        "a rename must bump updated_at past created_at so the next sync push carries it to v2"
    );
}
