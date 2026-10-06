//! Verifies the prose-book chapter numbering fix in `group_into_chapters`:
//! every "one record = one chapter" book (NOD, TQK, KB, ...) must show real
//! "Chapter N: Title" labels, not a bare title with no number — plus the
//! handful of per-book overrides (GG/SPL/BTG/TMG/LOB/SVA/ISO/NOI/MM) that
//! don't fit the generic numbered-chapter rule.

use std::path::PathBuf;

use prabhupadaconnectv3_lib::db::corpus;
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

fn numbered_labels(toc: &[corpus::TocChapter]) -> Vec<&str> {
    toc.iter()
        .filter(|c| c.chapter_number.as_deref().is_some_and(|n| n.parse::<u32>().is_ok()))
        .map(|c| c.label.as_str())
        .collect()
}

#[test]
fn nod_chapters_are_numbered_one_through_fifty_one() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "NOD").expect("toc should build");
    let numbered = numbered_labels(&toc);
    assert_eq!(numbered.len(), 51, "NOD has 51 numbered chapters, got {numbered:?}");
    assert_eq!(numbered[0], "Chapter 1: Characteristics of Pure Devotional Service");
    assert!(toc.iter().any(|c| c.label == "Introduction"), "front matter must stay unprefixed");
}

#[test]
fn tqk_chapters_are_numbered_one_through_twenty_six() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "TQK").expect("toc should build");
    let numbered = numbered_labels(&toc);
    assert_eq!(numbered.len(), 26, "TQK has 26 numbered chapters, got {numbered:?}");
    assert_eq!(numbered[0], "Chapter 1: The Original Person");
}

#[test]
fn kb_chapters_are_numbered_one_through_ninety() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "KB").expect("toc should build");
    let numbered = numbered_labels(&toc);
    assert_eq!(numbered.len(), 90, "KB has 90 numbered chapters, got {numbered:?}");
    assert_eq!(numbered[0], "Chapter 1: The Advent of Lord Kṛṣṇa");
}

/// GG's own `Title` column is already "Chapter N" — the fix must not double
/// it into "Chapter N: Chapter N".
#[test]
fn gg_chapter_titles_are_not_doubled() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "GG").expect("toc should build");
    assert!(toc.iter().any(|c| c.label == "Chapter 1"), "got labels: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.contains("Chapter 1: Chapter")));
}

/// SPL/BTG's `Title` is already a full "Volume X: ... — Chapter/Entry N: ..."
/// description — must be used as-is, not re-wrapped in "Chapter N:".
#[test]
fn spl_and_btg_use_title_as_is() {
    let conn = open_corpus_readonly();

    let spl = corpus::get_book_toc(&conn, "SPL").expect("toc should build");
    let first_spl = spl.iter().find(|c| c.label.contains("Childhood")).expect("SPL chapter 1 should be present");
    assert!(first_spl.label.starts_with("Volume 1:"), "got: {}", first_spl.label);
    assert!(!first_spl.label.starts_with("Chapter 1: Volume"));

    let btg = corpus::get_book_toc(&conn, "BTG").expect("toc should build");
    let first_btg = btg.iter().find(|c| c.label.contains("Message of His Divine Grace")).expect("BTG entry 1 should be present");
    assert!(first_btg.label.starts_with("Volume 1"), "got: {}", first_btg.label);
}

/// LOB's `Title` is already "Verse N" — must not become "Chapter N: Verse N".
#[test]
fn lob_uses_verse_label_as_is() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "LOB").expect("toc should build");
    assert!(toc.iter().any(|c| c.label == "Verse 1"), "got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.starts_with("Chapter")));
}

/// TMG is a songbook — numbered entries are songs, not chapters.
#[test]
fn tmg_uses_song_title_as_is() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "TMG").expect("toc should build");
    assert!(toc.iter().any(|c| c.label == "Putting on Tilaka"), "got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.starts_with("Chapter")));
}

/// SVA's RecordKeys are "section.item" (e.g. "1.4") across 4 sections (269
/// entries total) — each item keeps its own song title without a "Chapter"
/// prefix and carries its section number ("1".."4") in `canto_number`.
#[test]
fn sva_is_grouped_into_four_sections_with_song_titles() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "SVA").expect("toc should build");
    assert_eq!(toc.len(), 269, "SVA should have all 269 songs/entries from repaired v2 DB");
    assert!(toc.iter().all(|c| matches!(c.canto_number.as_deref(), Some("1" | "2" | "3" | "4"))));
    assert!(toc.iter().any(|c| c.label.contains("Guru Praṇāma")), "got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.starts_with("Chapter")));
}

/// ISO: matching vedabase.io (not v2's own "one Mantras blob" layout), each
/// of the 18 primary-edition mantras is its own individually-navigable TOC
/// entry, alongside separate Introduction/Invocation rows. The corpus also
/// carries an alternate 1969-edition set of 18 under bare-numeric
/// RecordKeys — those must be excluded from the TOC entirely, not leak in
/// as a bogus "Chapter (NONE)" entry or a confusing second group.
#[test]
fn iso_mantras_are_individually_navigable() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "ISO").expect("toc should build");
    let mantras: Vec<_> = toc.iter().filter(|c| c.label.starts_with("Mantra ")).collect();
    assert_eq!(mantras.len(), 18, "expected 18 separate Mantra N entries, got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(mantras.iter().all(|c| c.record_count == 1), "each mantra must be its own single-record entry");
    assert!(toc.iter().any(|c| c.label == "Introduction"));
    assert!(toc.iter().any(|c| c.label == "Invocation"));
    assert!(!toc.iter().any(|c| c.label.contains("(NONE)")), "no group label should leak the raw (NONE) placeholder: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.contains("Alternate Edition")), "the 1969 alternate edition must not appear in the TOC at all: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());

    let mantra_5 = mantras.iter().find(|c| c.label == "Mantra 5").expect("Mantra 5 entry must exist");
    let records = corpus::get_chapter_records(&conn, "ISO", &mantra_5.chapter_key).expect("chapter records should load");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].record_key, "ISO-(NONE)-MANTRA-5");
}

/// NOI: same vedabase.io-matching change as ISO — each of the 11
/// primary-edition texts is its own entry, not one shared "Texts 1–11"
/// blob; Preface stays separate. The 1976 alternate edition ("#2" suffix)
/// and the unrelated appendix record must not appear in the TOC at all.
#[test]
fn noi_texts_are_individually_navigable() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "NOI").expect("toc should build");
    let texts: Vec<_> = toc.iter().filter(|c| c.label.starts_with("Text ")).collect();
    assert_eq!(texts.len(), 11, "expected 11 separate Text N entries, got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(texts.iter().all(|c| c.record_count == 1), "each text must be its own single-record entry");
    assert!(toc.iter().any(|c| c.label == "Preface"));
    assert!(!toc.iter().any(|c| c.label.contains("(NONE)")), "no group label should leak the raw (NONE) placeholder: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(!toc.iter().any(|c| c.label.contains("Alternate Edition") || c.label.contains("Appendix")), "the 1976 alternate edition and appendix must not appear in the TOC at all: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
}

/// MM: the opposite of ISO/NOI — every verse must stay its OWN entry
/// ("Verse N"), not merge into one shared group (the raw RecordKey pattern
/// otherwise makes them look like they share one chapter path).
#[test]
fn mm_verses_stay_as_separate_entries() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "MM").expect("toc should build");
    let verse_entries: Vec<_> = toc.iter().filter(|c| c.label.starts_with("Verse ")).collect();
    assert!(verse_entries.len() > 10, "expected many separate Verse N entries, got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
    assert!(verse_entries.iter().all(|c| c.record_count == 1), "each MM verse must be its own single-record entry");
    assert!(toc.iter().any(|c| c.label.contains("Introduction")));
}

/// Guards against the fix accidentally affecting real verse scriptures,
/// whose front matter must remain unprefixed (no BG/SB/CC record has a
/// purely-numeric chapter path with no verse suffix, so this should be a
/// no-op for them — this test locks that in).
#[test]
fn bg_front_matter_is_unaffected_by_the_prose_numbering_fix() {
    let conn = open_corpus_readonly();
    let toc = corpus::get_book_toc(&conn, "BG").expect("toc should build");
    assert!(toc.iter().any(|c| c.label == "Setting the Scene"), "got: {:?}", toc.iter().map(|c| &c.label).collect::<Vec<_>>());
}

