//! Phase 2 verification: exercises the exact same functions the Tauri
//! commands call, against the real bundled corpus and a throwaway
//! user_data.db, with no GUI involved.

use std::path::PathBuf;

use prabhupadaconnectv3_lib::db::corpus;
use prabhupadaconnectv3_lib::db::user_store;
use rusqlite::{Connection, OpenFlags};

fn corpus_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../database/prabhupada_corpus.db")
}

fn open_corpus_readonly() -> Connection {
    Connection::open_with_flags(
        corpus_path(),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .expect("corpus db must open read-only")
}

#[test]
fn list_books_returns_all_canonical_books() {
    let conn = open_corpus_readonly();
    let books = corpus::list_books(&conn).expect("list_books should succeed");
    assert!(!books.is_empty(), "expected at least one book");
    println!("list_books: {} books loaded", books.len());
    assert!(books.iter().any(|b| b.book_key == "BG"));
    assert!(books.iter().any(|b| b.book_key == "SB"));
}

#[test]
fn book_toc_and_chapter_records_are_consistent_for_gita() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "BG").expect("toc should build");
    assert!(!toc.is_empty(), "Bhagavad-gita should have chapters");

    let first_chapter = &toc[0];
    let records = corpus::get_chapter_records(&conn, "BG", &first_chapter.chapter_key)
        .expect("chapter records should load");
    assert_eq!(
        records.len() as i64,
        first_chapter.record_count,
        "toc record_count must match get_chapter_records length"
    );
    println!(
        "BG chapter '{}' ({} records) verses {:?}..{:?}",
        first_chapter.label, first_chapter.record_count, first_chapter.verse_start, first_chapter.verse_end
    );
}

/// v2-parity fix: `DI` (Ādi-līlā) verse RecordKeys are stamped `ĀDI-...`,
/// not the ASCII BookKey `DI-...` every other book uses — unhandled, every
/// numbered verse collapsed into one garbled synthesized chapter labeled
/// something like "Chapter ĀDI" instead of being grouped into its 17 real
/// chapters. This guards the fix (`record_key_prefix` in corpus.rs).
#[test]
fn di_book_toc_groups_into_real_chapters_not_one_garbled_blob() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "DI").expect("toc should build");
    assert!(!toc.is_empty(), "Ādi-līlā should have chapters");

    // Front-matter entries (Dedication/Preface/...) also carry a
    // `chapter_number` (their own unstripped RecordKey, a leftover of the
    // "no verse suffix" fallback path) — a real numbered chapter's is
    // always purely numeric, so that's what distinguishes the two here.
    let numbered_chapters: Vec<_> =
        toc.iter().filter(|c| c.chapter_number.as_deref().is_some_and(|n| n.parse::<u32>().is_ok())).collect();
    assert_eq!(numbered_chapters.len(), 17, "Ādi-līlā has 17 chapters");
    assert!(
        numbered_chapters.iter().all(|c| !c.label.contains("ĀDI") && !c.label.contains("DI-")),
        "no chapter label should leak the raw ĀDI/DI RecordKey prefix: {:?}",
        numbered_chapters.iter().map(|c| &c.label).collect::<Vec<_>>()
    );

    let first = numbered_chapters[0];
    let records = corpus::get_chapter_records(&conn, "DI", &first.chapter_key).expect("chapter records should load");
    assert_eq!(records.len() as i64, first.record_count, "toc record_count must match get_chapter_records length");
    assert!(records.len() > 1, "Ādi-līlā chapter 1 has many verses, not a single collapsed record");
}

#[test]
fn fts5_search_returns_accurate_hits() {
    let conn = open_corpus_readonly();
    let response = corpus::search_corpus(
        &conn,
        corpus::SearchParams {
            query: "kṛṣṇa".to_string(),
            limit: Some(10),
            offset: Some(0),
            ..Default::default()
        },
    )
    .expect("search should succeed");
    assert!(response.total > 0, "expected FTS5 hits for 'kṛṣṇa'");
    assert!(!response.hits.is_empty());
    assert!(response.hits[0].snippet.contains("<mark>"));
    println!("fts5 search 'kṛṣṇa': {} total hits", response.total);

    // book-group scoping
    let gita_only = corpus::search_corpus(
        &conn,
        corpus::SearchParams {
            query: "arjuna".to_string(),
            book_group: Some("gita".to_string()),
            limit: Some(50),
            offset: Some(0),
            ..Default::default()
        },
    )
    .expect("scoped search should succeed");
    assert!(gita_only.hits.iter().all(|h| h.book_key == "BG"));

    // malformed query must not panic
    let malformed = corpus::search_corpus(
        &conn,
        corpus::SearchParams {
            query: "\"unterminated phrase".to_string(),
            limit: Some(5),
            offset: Some(0),
            ..Default::default()
        },
    );
    assert!(malformed.is_ok(), "malformed FTS5 input must be handled gracefully, got {malformed:?}");
}

/// The corpus's FTS5 index only folds Unicode combining diacritics
/// (verified directly: "kṛṣṇa" and "krsna" both hit the same row count) — it
/// does NOT know the popular English spelling convention (ṛ→"ri", ṣ→"sh"),
/// so a literal "krishna" search alone only found 197 rows.
/// `build_match_expression` now ORs in that anglicized-to-folded variant
/// per token — an additive, never-lose-a-match search, so "krishna" should
/// find *at least* every row "kṛṣṇa" does (and a few more: rows whose only
/// occurrence is the literal English spelling "Krishna" in commentary
/// prose, which a pure-diacritic search for "kṛṣṇa" wouldn't reach either).
#[test]
fn anglicized_spelling_finds_at_least_as_much_as_the_diacritic_form() {
    let conn = open_corpus_readonly();
    let anglicized = corpus::search_corpus(
        &conn,
        corpus::SearchParams { query: "krishna".to_string(), limit: Some(1), offset: Some(0), ..Default::default() },
    )
    .expect("search should succeed");
    let diacritic = corpus::search_corpus(
        &conn,
        corpus::SearchParams { query: "kṛṣṇa".to_string(), limit: Some(1), offset: Some(0), ..Default::default() },
    )
    .expect("search should succeed");
    println!("'krishna' -> {} hits, 'kṛṣṇa' -> {} hits", anglicized.total, diacritic.total);
    assert!(anglicized.total >= diacritic.total, "\"krishna\" must find at least every row \"kṛṣṇa\" does");
    assert!(anglicized.total > 10000, "expected the full ~10,000+ hit count, not the 197 a literal-only search finds");
}

#[test]
fn user_data_db_initializes_and_round_trips() {
    let path = std::env::temp_dir().join(format!(
        "pcv3_test_user_{}.db",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);

    let conn = user_store::open_and_migrate(&path).expect("migration should succeed");

    let note = user_store::create_note(
        &conn,
        user_store::NewNote {
            verse_id: Some("BG-1-1".to_string()),
            title: None,
            content_json: "{\"type\":\"doc\"}".to_string(),
            content_text: "test realization".to_string(),
        },
    )
    .expect("create_note should succeed");
    let fetched = user_store::get_notes_for_verse(&conn, "BG-1-1")
        .expect("get_notes_for_verse should succeed")
        .into_iter()
        .find(|n| n.id == note.id)
        .expect("note should exist");
    assert_eq!(fetched.id, note.id);
    assert_eq!(fetched.content_text, "test realization");

    let highlight = user_store::save_highlight(
        &conn,
        user_store::NewHighlight {
            verse_id: "BG-1-1".to_string(),
            color: "green".to_string(),
            text_range_start: 0,
            text_range_end: 5,
            selected_text: "dharma".to_string(),
            field: None,
        },
    )
    .expect("save_highlight should succeed");
    let highlights = user_store::get_highlights_for_verse(&conn, "BG-1-1")
        .expect("get_highlights_for_verse should succeed");
    assert_eq!(highlights.len(), 1);
    user_store::delete_highlight(&conn, highlight.id).expect("delete_highlight should succeed");
    assert!(user_store::get_highlights_for_verse(&conn, "BG-1-1").unwrap().is_empty());

    user_store::save_setting(&conn, "theme", "\"dark\"").expect("save_setting should succeed");
    assert_eq!(
        user_store::get_setting(&conn, "theme").unwrap().as_deref(),
        Some("\"dark\"")
    );

    drop(conn);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("db-wal"));
    let _ = std::fs::remove_file(path.with_extension("db-shm"));

    println!("user_data.db round-trip OK (note id {}, highlight id {})", note.id, highlight.id);
}
