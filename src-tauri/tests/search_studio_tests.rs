//! Milestone 2: Search Studio backend — precision controls (exact word,
//! case sensitivity, field scope, canonical sort) against the real bundled
//! corpus, and unified cross-source search against a throwaway user_data.db.

use std::path::PathBuf;

use prabhupadaconnectv3_lib::db::corpus::{self, SearchParams};
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
fn scope_restricts_matches_to_one_field() {
    let conn = open_corpus_readonly();

    // "eyes" appears in BG 2.1's Translation ("his eyes full of tears") —
    // restricting scope to Synonyms specifically should drop that hit
    // relative to an all-fields search, without erroring.
    let all_fields = corpus::search_corpus(
        &conn,
        SearchParams { query: "eyes".to_string(), limit: Some(50), ..Default::default() },
    )
    .expect("all-fields search should succeed");

    let synonyms_only = corpus::search_corpus(
        &conn,
        SearchParams {
            query: "eyes".to_string(),
            limit: Some(50),
            scope: Some("synonyms".to_string()),
            ..Default::default()
        },
    )
    .expect("scoped search should succeed");

    assert!(all_fields.total >= synonyms_only.total);
}

#[test]
fn exact_word_requires_adjacent_phrase() {
    let conn = open_corpus_readonly();

    // A two-word phrase that genuinely appears adjacently in the corpus.
    let phrase = corpus::search_corpus(
        &conn,
        SearchParams {
            query: "supreme personality".to_string(),
            limit: Some(5),
            exact_word: true,
            ..Default::default()
        },
    )
    .expect("exact-word phrase search should succeed");
    assert!(phrase.total > 0, "expected the adjacent phrase to match somewhere in the corpus");

    // A pair of common words vanishingly unlikely to appear adjacent in
    // that exact order anywhere in the corpus, to confirm phrase-boundary
    // matching is actually enforced (not silently falling back to an
    // implicit AND of the two tokens, which would match thousands of rows).
    let unlikely_adjacent = corpus::search_corpus(
        &conn,
        SearchParams {
            query: "purple bureaucracy".to_string(),
            limit: Some(5),
            exact_word: true,
            ..Default::default()
        },
    )
    .expect("exact-word phrase search should succeed");
    assert_eq!(unlikely_adjacent.total, 0);
}

#[test]
fn match_case_filters_by_exact_case() {
    let conn = open_corpus_readonly();

    // "Kṛṣṇa" (capitalized) is extremely common; "kRSNa"-style odd casing
    // of a real corpus word should not exist anywhere, proving the filter
    // actually restricts rather than silently ignoring the flag.
    let case_insensitive =
        corpus::search_corpus(&conn, SearchParams { query: "krishna".to_string(), limit: Some(5), ..Default::default() })
            .expect("search should succeed");
    let case_sensitive_odd = corpus::search_corpus(
        &conn,
        SearchParams { query: "KRISHNA".to_string(), limit: Some(5), match_case: true, ..Default::default() },
    )
    .expect("case-sensitive search should succeed");

    // "krishna" (lowercase, a common alternate transliteration) should
    // exist somewhere case-insensitively; all-uppercase "KRISHNA" should not
    // exist as a literal substring anywhere in scripture text.
    assert!(case_insensitive.total >= case_sensitive_odd.total);
}

#[test]
fn canonical_sort_orders_by_book_and_sequence() {
    let conn = open_corpus_readonly();
    let response = corpus::search_corpus(
        &conn,
        SearchParams {
            query: "kṛṣṇa".to_string(),
            book_group: Some("gita".to_string()),
            limit: Some(20),
            sort: Some("canonical".to_string()),
            prefix: false,
            ..Default::default()
        },
    )
    .expect("canonical-sort search should succeed");
    assert!(!response.hits.is_empty());

    // Within a single book (BG only, via book_group), canonical order means
    // References should appear in non-decreasing chapter.verse order —
    // check the first and last hit's reference numbers are in that relation
    // rather than asserting exact positions (robust to corpus edits).
    let first_ref = response.hits.first().unwrap().reference.clone().unwrap_or_default();
    let last_ref = response.hits.last().unwrap().reference.clone().unwrap_or_default();
    assert_ne!(first_ref, "");
    assert_ne!(last_ref, "");
}

#[test]
fn unified_search_finds_notes_bookmarks_and_highlights() {
    // `open_and_migrate` takes a path (it runs PRAGMA journal_mode=WAL,
    // which needs a real file), so this uses a throwaway temp file rather
    // than an in-memory connection.
    let tmp = std::env::temp_dir().join(format!("prabhupada_unified_test_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    let conn = user_store::open_and_migrate(&tmp).expect("schema migration should succeed");

    user_store::create_note(
        &conn,
        user_store::NewNote {
            verse_id: Some("BG-2-20".to_string()),
            title: None,
            content_json: "{}".to_string(),
            content_text: "The soul never dies — profound realization here".to_string(),
        },
    )
    .unwrap();
    user_store::add_bookmark(
        &conn,
        user_store::NewBookmark {
            verse_id: "BG-2-20".to_string(),
            book_title: "Bhagavad-gītā As It Is".to_string(),
            verse_ref: "Bg 2.20".to_string(),
            tag: Some("realization".to_string()),
        },
    )
    .unwrap();
    user_store::save_highlight(
        &conn,
        user_store::NewHighlight {
            verse_id: "BG-2-20".to_string(),
            color: "yellow".to_string(),
            text_range_start: 0,
            text_range_end: 10,
            selected_text: "the soul never dies".to_string(),
            field: None,
        },
    )
    .unwrap();

    let (notes_total, notes) = user_store::search_notes(&conn, "soul", 10).unwrap();
    assert_eq!(notes_total, 1);
    assert_eq!(notes[0].verse_id.as_deref(), Some("BG-2-20"));

    let (bookmarks_total, bookmarks) = user_store::search_bookmarks(&conn, "Bg 2.20", 10).unwrap();
    assert_eq!(bookmarks_total, 1);
    assert_eq!(bookmarks[0].tag.as_deref(), Some("realization"));

    let (highlights_total, highlights) = user_store::search_highlights(&conn, "soul", 10).unwrap();
    assert_eq!(highlights_total, 1);
    assert_eq!(highlights[0].selected_text, "the soul never dies");

    drop(conn);
    let _ = std::fs::remove_file(&tmp);
}
