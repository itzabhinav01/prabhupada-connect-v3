//! v2-parity fix: the Folio Word Wheel, backed by SQLite's `fts5vocab`
//! virtual table exactly as `SqliteCorpusRepository.GetVocabularyTermsAsync`
//! does it — against the real bundled corpus.

use std::path::PathBuf;
use std::time::Duration;

use prabhupadaconnectv3_lib::db::corpus;
use rusqlite::Connection;

/// The word wheel needs a write-capable connection (see the module note in
/// `db/corpus.rs` on why `fts5vocab` can't be registered read-only) — a
/// plain `busy_timeout` keeps this test file's own parallel `#[test]`
/// threads from flaking on the one-time `CREATE VIRTUAL TABLE` write racing
/// itself, without needing any cross-test coordination.
fn open_corpus_writable() -> Connection {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../database/prabhupada_corpus.db");
    let conn = Connection::open(path).expect("corpus db must open");
    conn.busy_timeout(Duration::from_secs(5)).expect("busy_timeout should apply");
    conn
}

#[test]
fn empty_prefix_lists_terms_alphabetically() {
    let conn = open_corpus_writable();
    let terms = corpus::get_vocabulary_terms(&conn, "", 10).expect("vocab query should succeed");
    assert_eq!(terms.len(), 10);
    let sorted = {
        let mut t = terms.iter().map(|t| t.term.clone()).collect::<Vec<_>>();
        t.sort();
        t
    };
    assert_eq!(terms.iter().map(|t| t.term.clone()).collect::<Vec<_>>(), sorted);
}

#[test]
fn prefix_search_centers_on_the_typed_word() {
    let conn = open_corpus_writable();
    let terms = corpus::get_vocabulary_terms(&conn, "krishna", 20).expect("vocab query should succeed");
    assert!(!terms.is_empty());
    // Every term at/after the split point must be >= the prefix; the
    // "preceding" handful must be < the prefix — confirms both halves of
    // the word-wheel query ran and were combined in the right order.
    let split = terms.iter().position(|t| t.term.as_str() >= "krishna").unwrap_or(0);
    for t in &terms[..split] {
        assert!(t.term.as_str() < "krishna", "preceding term '{}' should sort before 'krishna'", t.term);
    }
    for t in &terms[split..] {
        assert!(t.term.as_str() >= "krishna", "following term '{}' should sort at/after 'krishna'", t.term);
    }
}

#[test]
fn vocab_terms_carry_real_document_and_occurrence_counts() {
    let conn = open_corpus_writable();
    let terms = corpus::get_vocabulary_terms(&conn, "krsna", 5).expect("vocab query should succeed");
    let hit = terms.iter().find(|t| t.term == "krsna");
    if let Some(t) = hit {
        assert!(t.document_count > 0);
        assert!(t.total_occurrences >= t.document_count);
    }
}
