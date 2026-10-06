use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

use super::canonical_titles;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use regex::Regex;
use rusqlite::OpenFlags;
use serde::{Deserialize, Serialize};

pub type CorpusPool = Pool<SqliteConnectionManager>;

/// Builds a small connection pool against the read-only bundled corpus
/// database. The corpus ships in plain "delete" journal mode and is never
/// written to at runtime, so WAL is neither required (SQLite already allows
/// unlimited concurrent readers without an active writer) nor even possible
/// once the file is installed read-only under Program Files.
pub fn build_pool(db_path: &Path) -> Result<CorpusPool, String> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_flags(OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .with_init(|conn| conn.execute_batch("PRAGMA query_only = ON;"));
    Pool::builder()
        .max_size(4)
        .build(manager)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Models — 1:1 field mapping onto the Books / Records schema.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub book_key: String,
    pub abbreviation: String,
    pub edition: Option<String>,
    pub title: Option<String>,
    pub category: Option<String>,
    pub corpus_id: Option<String>,
    pub author: Option<String>,
    pub canonical_order: i64,
    pub total_records: i64,
    pub is_pdf: bool,
    pub pdf_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseRecord {
    pub record_key: String,
    pub book_key: String,
    pub sequence: i64,
    pub parent_key: Option<String>,
    pub record_type: String,
    pub reference: Option<String>,
    pub reference_status: String,
    pub title: Option<String>,
    pub devanagari: Option<String>,
    pub transliteration: Option<String>,
    pub synonyms: Option<String>,
    pub translation: Option<String>,
    pub purports: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseSummary {
    pub record_key: String,
    pub sequence: i64,
    pub record_type: String,
    pub reference: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocChapter {
    /// Stable identifier to pass back into `get_chapter_verses` /
    /// `get_chapter_records`. Either the RecordKey of an explicit Chapter
    /// header row, or a synthesized `{book_key}::{chapter_path}` key when the
    /// book has no explicit chapter rows (most verse scriptures).
    pub chapter_key: String,
    pub label: String,
    pub canto_number: Option<String>,
    pub chapter_number: Option<String>,
    pub first_record_key: String,
    pub last_record_key: String,
    pub record_count: i64,
    pub verse_start: Option<String>,
    pub verse_end: Option<String>,
}

fn verse_suffix_pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\d+(-\d+)?[A-Za-z]?$").unwrap())
}

/// One known corpus quirk: `DI`'s (Śrī Caitanya-caritāmṛta Ādi-līlā) verse
/// RecordKeys are stamped with the diacritic form `ĀDI-...`, not the
/// ASCII `BookKey` `DI-...` every other book uses consistently (confirmed
/// against the actual data — `MADHYA`/`ANTYA` do use their literal BookKey
/// as the RecordKey prefix). Left unhandled, `strip_book_prefix` silently
/// fails to strip anything for DI, so every one of its verses collapses
/// into one garbled synthesized chapter instead of being grouped correctly.
fn record_key_prefix(book_key: &str) -> &str {
    match book_key {
        "DI" => "ĀDI",
        other => other,
    }
}

/// Strips the RecordKey prefix a book's records actually use (see
/// `record_key_prefix`), if present.
fn strip_book_prefix<'a>(book_key: &str, record_key: &'a str) -> &'a str {
    record_key
        .strip_prefix(record_key_prefix(book_key))
        .and_then(|s| s.strip_prefix('-'))
        .unwrap_or(record_key)
}

/// Splits a RecordKey suffix (with the book prefix already removed) into a
/// chapter path and, if present, a verse suffix. The verse suffix is only
/// recognized when it looks numeric (optionally a combined range like
/// `5-6`, optionally a trailing letter like `16A`) — this reliably tells
/// apart `SB-4.8-1` (chapter path "4.8", verse "1") from front-matter keys
/// like `BG-SETTING-THE-SCENE` (kept whole, no verse).
fn parse_chapter_and_verse(suffix: &str) -> (String, Option<String>) {
    if let Some(dash_idx) = suffix.find('-') {
        let left = &suffix[..dash_idx];
        let right = &suffix[dash_idx + 1..];
        if verse_suffix_pattern().is_match(right) {
            return (left.to_string(), Some(right.to_string()));
        }
    }
    (suffix.to_string(), None)
}

/// Splits a chapter path like "1.10" into (canto = "1", chapter = "10"), or
/// returns (None, "1") when there is no canto level.
fn split_canto_chapter(chapter_path: &str) -> (Option<String>, String) {
    match chapter_path.split_once('.') {
        Some((canto, chapter)) => (Some(canto.to_string()), chapter.to_string()),
        None => (None, chapter_path.to_string()),
    }
}

/// Books whose `Title` column is already the complete display label for a
/// numbered entry — no synthesized "Chapter N:" prefix should be added on
/// top of it. Verified against the real corpus data:
///  - GG: Title is already "Chapter N".
///  - SPL/BTG: Title is already "Volume X: ... — Chapter/Entry N: ...".
///  - TMG: a songbook — each numbered entry is a song, not a chapter.
///  - LOB: Title is already "Verse N".
///  - SVA: a section/item songbook (see `book_uses_flat_sections`).
fn book_uses_title_as_is(book_key: &str) -> bool {
    matches!(book_key, "GG" | "SPL" | "BTG" | "TMG" | "LOB" | "SVA")
}

/// SVA's RecordKeys are "section.item" (e.g. "1.4"), where the leading
/// digit (1..4) identifies the canonical Vaiṣṇava Ācārya songbook section
/// (1: Standard Prayers, 2: Bhaktivinoda Ṭhākura, 3: Narottama dāsa Ṭhākura,
/// 4: Other Vaiṣṇava Ācāryas). Preserving that section number in `canto_number`
/// lets the TOC and Reader Header group the 269 songs by section.
fn book_uses_flat_sections(_book_key: &str) -> bool {
    false
}

/// A handful of books don't fit the generic canto.chapter-verse *grouping*
/// at all (as opposed to just needing a different label — see
/// `book_uses_title_as_is`) — their RecordKeys parse into a shared or
/// mismatched chapter path that would otherwise merge unrelated entries
/// together or split up entries that belong together. Returns
/// `Some((group_key, label))` to fully override grouping for this record,
/// or `None` to fall through to the generic logic. Verified against the
/// real corpus data:
///  - ISO: every `ISO-(NONE)-MANTRA-N` shares the literal chapter path
///    "(NONE)", so the generic parser already merges them into one group —
///    this only supplies the "Mantras" label (matching v2) instead of the
///    first mantra's own reference text.
///  - NOI: same shared-path situation for `NOI-(NONE)-VERSE-N`, labeled
///    "Texts 1–11" (matching v2) instead of a single verse's title.
///  - MM: the opposite problem — every `MM-(NONE)-N` shares the *same*
///    "(NONE)" chapter path (its verse number is the part after that), so
///    the generic parser wrongly merges all verses into one "Chapter (NONE)"
///    group. Give each verse its own key here instead.
fn book_specific_group_override(book_key: &str, record_key: &str) -> Option<(String, String)> {
    match book_key {
        // vedabase.io lists each ISO mantra as its own individually-navigable
        // entry (Introduction, Invocation, Mantra 1 .. Mantra 18) rather than
        // one "Mantras" blob — the 1969 alternate-edition duplicates (bare
        // numeric RecordKeys, no "-MANTRA-"/"-INTRODUCTION"/"-INVOCATION"
        // segment) are filtered out entirely before this runs, by
        // `is_excluded_alternate_edition` in `fetch_book_records`, so every
        // record reaching this arm is primary-edition content.
        "ISO" if record_key == "ISO-(NONE)-INTRODUCTION" => {
            Some((format!("{book_key}::INTRO"), "Introduction".to_string()))
        }
        "ISO" if record_key == "ISO-(NONE)-INVOCATION" => {
            Some((format!("{book_key}::INVOCATION"), "Invocation".to_string()))
        }
        "ISO" => record_key
            .strip_prefix("ISO-(NONE)-MANTRA-")
            .map(|n| (format!("{book_key}::MANTRA-{n}"), format!("Mantra {n}"))),
        // Same idea for NOI: each text its own entry, with the 1976
        // alternate edition ("#2" suffix) and the unrelated appendix record
        // already filtered out upstream.
        "NOI" if record_key == "NOI-(NONE)-PREFACE" => {
            Some((format!("{book_key}::PREFACE"), "Preface".to_string()))
        }
        "NOI" => record_key
            .strip_prefix("NOI-(NONE)-VERSE-")
            .map(|n| (format!("{book_key}::TEXT-{n}"), format!("Text {n}"))),
        "MM" => {
            let n = record_key.rsplit('-').next()?;
            n.chars()
                .all(|c| c.is_ascii_digit())
                .then(|| (format!("{book_key}::VERSE-{n}"), format!("Verse {n}")))
        }
        _ => None,
    }
}

/// Reprint/alternate-edition duplicates of content that already exists
/// under a primary-edition RecordKey — real in the bundled corpus (verified
/// directly via SQL, not assumed), and if left in would either collapse
/// into one confusing "(Alternate Edition)" TOC entry or (for `NOI`'s
/// `UNSPEC-...` appendix) surface as unlabeled noise. Excluded from TOC
/// navigation entirely; the rows themselves are untouched in the read-only
/// corpus db. Scoped per book-key, not a blanket RecordKey pattern — `BB`
/// also uses a `#2` suffix for an unrelated reason, so filtering `#` across
/// every book would wrongly hide real `BB` content.
fn is_excluded_alternate_edition(book_key: &str, record_key: &str) -> bool {
    match book_key {
        "ISO" => record_key
            .strip_prefix("ISO-(NONE)-")
            .is_some_and(|rest| rest != "INTRODUCTION" && rest != "INVOCATION" && !rest.starts_with("MANTRA-")),
        "NOI" => record_key.ends_with("#2") || record_key.contains("UNSPEC"),
        _ => false,
    }
}

struct RawRecord {
    record_key: String,
    sequence: i64,
    parent_key: Option<String>,
    record_type: String,
    reference: Option<String>,
    title: Option<String>,
}

fn fetch_book_records(
    conn: &rusqlite::Connection,
    book_key: &str,
) -> rusqlite::Result<Vec<RawRecord>> {
    let mut stmt = conn.prepare(
        "SELECT RecordKey, Sequence, ParentKey, RecordType, Reference, Title \
         FROM Records WHERE BookKey = ?1 ORDER BY Sequence",
    )?;
    let rows = stmt.query_map([book_key], |row| {
        Ok(RawRecord {
            record_key: row.get(0)?,
            sequence: row.get(1)?,
            parent_key: row.get(2)?,
            record_type: row.get(3)?,
            reference: row.get(4)?,
            title: row.get(5)?,
        })
    })?;
    let records = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records.into_iter().filter(|r| !is_excluded_alternate_edition(book_key, &r.record_key)).collect())
}

struct GroupAccumulator {
    label: String,
    canto_number: Option<String>,
    chapter_number: Option<String>,
    first_record_key: String,
    last_record_key: String,
    record_count: i64,
    verse_start: Option<String>,
    verse_end: Option<String>,
    order_hint: i64,
}

/// Groups a book's flat record stream into chapter-level entries. Handles
/// three shapes found in the corpus:
///  - Explicit `Chapter` header rows with children pointing back via
///    `ParentKey` (songbooks like SPS).
///  - Verse scriptures with `canto.chapter-verse` or `chapter-verse` keys
///    and no explicit chapter rows (BG, SB, CC līlās).
///  - Flat narrative/compiled-talk books where each record key has no verse
///    suffix at all — each record becomes its own single-entry chapter.
fn group_into_chapters(book_key: &str, records: Vec<RawRecord>) -> Vec<TocChapter> {
    let mut chapter_headers: HashMap<String, String> = HashMap::new();
    for r in &records {
        if r.record_type == "Chapter" {
            let label = r.title.clone().unwrap_or_else(|| r.record_key.clone());
            chapter_headers.insert(r.record_key.clone(), label);
        }
    }

    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, GroupAccumulator> = HashMap::new();

    for r in records {
        if r.record_type == "Chapter" {
            // Header rows define grouping; ensure the group exists even if
            // no children ever reference it (empty chapter).
            let label = chapter_headers
                .get(&r.record_key)
                .cloned()
                .unwrap_or_else(|| r.record_key.clone());
            groups.entry(r.record_key.clone()).or_insert_with(|| {
                order.push(r.record_key.clone());
                GroupAccumulator {
                    label,
                    canto_number: None,
                    chapter_number: None,
                    first_record_key: r.record_key.clone(),
                    last_record_key: r.record_key.clone(),
                    record_count: 0,
                    verse_start: None,
                    verse_end: None,
                    order_hint: r.sequence,
                }
            });
            continue;
        }

        let (group_key, canto_number, chapter_number, fallback_label, verse) =
            if let Some(parent) = r.parent_key.as_ref().filter(|p| chapter_headers.contains_key(*p))
            {
                (parent.clone(), None, None, chapter_headers[parent].clone(), None)
            } else if let Some((key, label)) = book_specific_group_override(book_key, &r.record_key) {
                (key, None, None, label, None)
            } else {
                let suffix = strip_book_prefix(book_key, &r.record_key);
                let (chapter_path, verse) = parse_chapter_and_verse(suffix);
                let (canto, chapter) = split_canto_chapter(&chapter_path);
                let canto = if book_uses_flat_sections(book_key) { None } else { canto };
                let key = format!("{book_key}::{chapter_path}");
                // A record with a parsed verse suffix is one of many verses
                // inside a real chapter — label the *chapter*, not this one
                // verse's own reference. A record with no verse suffix (a
                // standalone narrative/front-matter entry) *is* the whole
                // "chapter", so its own title/reference is the right label —
                // unless its own numeral IS a real chapter number (most
                // "one record = one chapter" prose books), in which case it
                // gets the same "Chapter N: Title" treatment as verse books,
                // built from the bare Title (not the Reference field, which
                // repeats the book abbreviation and number redundantly).
                let label = if verse.is_some() {
                    r.title.clone().unwrap_or_else(|| match canonical_titles::canonical_title(book_key, canto.as_deref(), &chapter) {
                        Some(title) => format!("Chapter {chapter}: {title}"),
                        None => format!("Chapter {chapter}"),
                    })
                } else if chapter.chars().all(|c| c.is_ascii_digit()) {
                    match &r.title {
                        Some(t) if !t.trim().is_empty() => {
                            if book_uses_title_as_is(book_key) {
                                t.clone()
                            } else {
                                format!("Chapter {chapter}: {t}")
                            }
                        }
                        _ => r.reference.clone().unwrap_or_else(|| format!("Chapter {chapter}")),
                    }
                } else {
                    // Front matter (Introduction, Preface, Dedication, ...) —
                    // `chapter` here is the record's own non-numeric RecordKey
                    // suffix, not a real chapter number.
                    r.title
                        .clone()
                        .or_else(|| r.reference.clone())
                        .unwrap_or_else(|| format!("Chapter {chapter}"))
                };
                (key, canto, Some(chapter), label, verse)
            };

        let entry = groups.entry(group_key.clone()).or_insert_with(|| {
            order.push(group_key.clone());
            GroupAccumulator {
                label: fallback_label,
                canto_number,
                chapter_number,
                first_record_key: r.record_key.clone(),
                last_record_key: r.record_key.clone(),
                record_count: 0,
                verse_start: verse.clone(),
                verse_end: verse.clone(),
                order_hint: r.sequence,
            }
        });

        entry.record_count += 1;
        entry.last_record_key = r.record_key.clone();
        if verse.is_some() {
            if entry.verse_start.is_none() {
                entry.verse_start = verse.clone();
            }
            entry.verse_end = verse;
        }
    }

    order.sort_by_key(|k| groups[k].order_hint);
    order
        .into_iter()
        .map(|key| {
            let g = groups.remove(&key).unwrap();
            TocChapter {
                chapter_key: key,
                label: g.label,
                canto_number: g.canto_number,
                chapter_number: g.chapter_number,
                first_record_key: g.first_record_key,
                last_record_key: g.last_record_key,
                record_count: g.record_count,
                verse_start: g.verse_start,
                verse_end: g.verse_end,
            }
        })
        .collect()
}

fn row_to_book(row: &rusqlite::Row) -> rusqlite::Result<Book> {
    Ok(Book {
        book_key: row.get(0)?,
        abbreviation: row.get(1)?,
        edition: row.get(2)?,
        title: row.get(3)?,
        category: row.get(4)?,
        corpus_id: row.get(5)?,
        author: row.get(6)?,
        canonical_order: row.get(7)?,
        total_records: row.get(8)?,
        is_pdf: row.get::<_, i64>(9)? != 0,
        pdf_path: row.get(10)?,
    })
}

pub fn list_books(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<Book>> {
    let mut stmt = conn.prepare(
        "SELECT BookKey, Abbreviation, Edition, Title, Category, CorpusId, Author, \
                CanonicalOrder, TotalRecords, IsPdf, PdfPath \
         FROM Books ORDER BY CanonicalOrder",
    )?;
    let rows = stmt.query_map([], |row| row_to_book(row))?;
    rows.collect()
}

pub fn get_book_toc(conn: &rusqlite::Connection, book_key: &str) -> rusqlite::Result<Vec<TocChapter>> {
    let records = fetch_book_records(conn, book_key)?;
    Ok(group_into_chapters(book_key, records))
}

// ---------------------------------------------------------------------------
// Word Wheel (Advanced Search's live vocabulary browser)
// ---------------------------------------------------------------------------
// Ports `SqliteCorpusRepository.GetVocabularyTermsAsync` exactly, including
// its connection strategy: `fts5vocab` requires its source table to live in
// the SAME schema the vocab virtual table itself is registered in (a real
// SQLite constraint verified empirically here — a `temp`-schema vocab table
// cannot see a `main`-schema source table, no matter how the source name is
// qualified). Registering the vocab table therefore needs a write-capable
// connection to the corpus db, same as v2's own `new SqliteConnection(...)`
// per call. This is a one-time (`IF NOT EXISTS`), metadata-only write to
// `sqlite_master` — it never touches a single row of scripture content, so
// it doesn't compromise the "read-only shipped asset" intent in practice.
// The command layer opens this connection fresh (see `commands/search.rs`),
// not through the app's read-only pool.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabTerm {
    pub term: String,
    pub document_count: i64,
    pub total_occurrences: i64,
}

fn ensure_vocab_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS RecordsFts_vocab USING fts5vocab('RecordsFts', 'row');")
}

fn row_to_vocab_term(row: &rusqlite::Row) -> rusqlite::Result<VocabTerm> {
    Ok(VocabTerm { term: row.get(0)?, document_count: row.get(1)?, total_occurrences: row.get(2)? })
}

/// Mirrors the C# word-wheel behavior exactly: with no prefix, the first
/// `limit` terms alphabetically; with a prefix, up to 5 terms immediately
/// *before* it plus terms from the prefix onward — so the list always feels
/// like a scroll-wheel centered near what's being typed, not just a filter.
/// `conn` must be write-capable (see module note above) — the read-only
/// pooled corpus connections cannot be used here.
pub fn get_vocabulary_terms(
    conn: &rusqlite::Connection,
    prefix: &str,
    limit: i64,
) -> rusqlite::Result<Vec<VocabTerm>> {
    ensure_vocab_table(conn)?;
    let clean_prefix = prefix.trim().to_lowercase();

    if clean_prefix.is_empty() {
        let mut stmt = conn.prepare("SELECT term, doc, cnt FROM RecordsFts_vocab ORDER BY term LIMIT ?1")?;
        let rows = stmt.query_map([limit], row_to_vocab_term)?;
        return rows.collect();
    }

    let mut preceding = {
        let mut stmt =
            conn.prepare("SELECT term, doc, cnt FROM RecordsFts_vocab WHERE term < ?1 ORDER BY term DESC LIMIT 5")?;
        let rows = stmt.query_map([&clean_prefix], row_to_vocab_term)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    preceding.reverse();

    let following = {
        let post_limit = (limit - preceding.len() as i64).max(20);
        let mut stmt = conn.prepare(
            "SELECT term, doc, cnt FROM RecordsFts_vocab WHERE term >= ?1 ORDER BY term ASC LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![clean_prefix, post_limit], row_to_vocab_term)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    preceding.extend(following);
    Ok(preceding)
}

fn row_to_verse_record(row: &rusqlite::Row) -> rusqlite::Result<VerseRecord> {
    Ok(VerseRecord {
        record_key: row.get(0)?,
        book_key: row.get(1)?,
        sequence: row.get(2)?,
        parent_key: row.get(3)?,
        record_type: row.get(4)?,
        reference: row.get(5)?,
        reference_status: row.get(6)?,
        title: row.get(7)?,
        devanagari: row.get(8)?,
        transliteration: row.get(9)?,
        synonyms: crate::utils::typography::heal_opt(row.get(10)?),
        translation: crate::utils::typography::heal_opt(row.get(11)?),
        purports: crate::utils::typography::heal_opt(row.get(12)?),
    })
}

const VERSE_RECORD_COLUMNS: &str = "RecordKey, BookKey, Sequence, ParentKey, RecordType, \
     Reference, ReferenceStatus, Title, Devanagari, Transliteration, Synonyms, Translation, Purports";

pub fn get_verse_record(
    conn: &rusqlite::Connection,
    record_key: &str,
) -> rusqlite::Result<Option<VerseRecord>> {
    let sql = format!("SELECT {VERSE_RECORD_COLUMNS} FROM Records WHERE RecordKey = ?1");
    match conn.query_row(&sql, [record_key], |row| row_to_verse_record(row)) {
        Ok(rec) => return Ok(Some(rec)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {}
        Err(other) => return Err(other),
    }

    // Fallback: if `record_key` is a single verse like `BG-2-42` or `SB-1.9-18`
    // that lives inside a combined verse range row (`BG-2-42-43`, `SB-1.9-18-21`),
    // locate the range row in that chapter whose [start..=end] covers `target_v`.
    if let Some((chapter_prefix, verse_str)) = record_key.rsplit_once('-') {
        if let Ok(target_v) = verse_str.parse::<i64>() {
            let like_pattern = format!("{chapter_prefix}-%-%");
            let range_sql = format!(
                "SELECT {VERSE_RECORD_COLUMNS} FROM Records WHERE RecordKey LIKE ?1 ORDER BY Sequence"
            );
            let mut stmt = conn.prepare(&range_sql)?;
            let rows = stmt.query_map([like_pattern], |row| row_to_verse_record(row))?;
            for row in rows {
                let rec = row?;
                if let Some(suffix) = rec
                    .record_key
                    .strip_prefix(chapter_prefix)
                    .and_then(|s| s.strip_prefix('-'))
                {
                    if let Some((start_s, end_s)) = suffix.split_once('-') {
                        let start_clean = start_s.trim_end_matches(|c: char| c.is_ascii_alphabetic());
                        let end_clean = end_s.trim_end_matches(|c: char| c.is_ascii_alphabetic());
                        if let (Ok(start_v), Ok(end_v)) = (start_clean.parse::<i64>(), end_clean.parse::<i64>()) {
                            if target_v >= start_v && target_v <= end_v {
                                return Ok(Some(rec));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Returns the RecordKeys belonging to a chapter/section identified by
/// `chapter_key`, using the exact same grouping rules as [`get_book_toc`] so
/// the two always stay consistent.
fn resolve_chapter_record_keys(
    conn: &rusqlite::Connection,
    book_key: &str,
    chapter_key: &str,
) -> rusqlite::Result<Vec<String>> {
    let records = fetch_book_records(conn, book_key)?;

    let mut chapter_headers: HashMap<String, ()> = HashMap::new();
    for r in &records {
        if r.record_type == "Chapter" {
            chapter_headers.insert(r.record_key.clone(), ());
        }
    }
    let is_explicit_header = chapter_headers.contains_key(chapter_key);

    let mut keys = Vec::new();
    for r in &records {
        if r.record_type == "Chapter" {
            continue;
        }
        if is_explicit_header {
            if r.parent_key.as_deref() == Some(chapter_key) {
                keys.push(r.record_key.clone());
            }
            continue;
        }
        if let Some(parent) = r.parent_key.as_deref() {
            if chapter_headers.contains_key(parent) {
                continue; // belongs to a different, explicitly-headed chapter
            }
        }
        // Must mirror `group_into_chapters`'s own grouping exactly — a
        // record whose group_key came from `book_specific_group_override`
        // there (ISO/NOI/MM) will never match the generic
        // `{book_key}::{chapter_path}` computation below.
        if let Some((key, _label)) = book_specific_group_override(book_key, &r.record_key) {
            if key == chapter_key {
                keys.push(r.record_key.clone());
            }
            continue;
        }
        let suffix = strip_book_prefix(book_key, &r.record_key);
        let (chapter_path, _verse) = parse_chapter_and_verse(suffix);
        if format!("{book_key}::{chapter_path}") == chapter_key {
            keys.push(r.record_key.clone());
        }
    }

    Ok(keys)
}

pub fn get_chapter_verses(
    conn: &rusqlite::Connection,
    book_key: &str,
    chapter_key: &str,
) -> rusqlite::Result<Vec<VerseSummary>> {
    let keys = resolve_chapter_record_keys(conn, book_key, chapter_key)?;
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT RecordKey, Sequence, RecordType, Reference, Title FROM Records \
         WHERE RecordKey IN ({placeholders}) ORDER BY Sequence"
    );
    let mut stmt = conn.prepare(&sql)?;
    let params = rusqlite::params_from_iter(keys.iter());
    let rows = stmt.query_map(params, |row| {
        Ok(VerseSummary {
            record_key: row.get(0)?,
            sequence: row.get(1)?,
            record_type: row.get(2)?,
            reference: row.get(3)?,
            title: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn get_chapter_records(
    conn: &rusqlite::Connection,
    book_key: &str,
    chapter_key: &str,
) -> rusqlite::Result<Vec<VerseRecord>> {
    let keys = resolve_chapter_record_keys(conn, book_key, chapter_key)?;
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {VERSE_RECORD_COLUMNS} FROM Records WHERE RecordKey IN ({placeholders}) ORDER BY Sequence"
    );
    let mut stmt = conn.prepare(&sql)?;
    let params = rusqlite::params_from_iter(keys.iter());
    let rows = stmt.query_map(params, |row| row_to_verse_record(row))?;
    rows.collect()
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub record_key: String,
    pub book_key: String,
    pub record_type: String,
    pub reference: Option<String>,
    pub title: Option<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    #[serde(default)]
    pub book_codes: Option<Vec<String>>,
    #[serde(default)]
    pub book_group: Option<String>,
    #[serde(default)]
    pub prefix: bool,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    /// "Match Exact Word": the whole query becomes one adjacent FTS5 phrase
    /// instead of an implicit AND of separately-matchable tokens.
    #[serde(default)]
    pub exact_word: bool,
    /// Case-sensitive filter: FTS5's `unicode61` tokenizer folds case for
    /// matching, so this is enforced as a byte-exact `INSTR` substring check
    /// against the raw query, applied in SQL (before LIMIT/OFFSET, so
    /// pagination and `total` both stay correct) rather than as a
    /// downstream JS filter.
    #[serde(default)]
    pub match_case: bool,
    /// Restrict matching to one field instead of all of them. One of
    /// "devanagari" | "synonyms" | "translation" | "purport"; anything else
    /// (including `None`/"all") searches every indexed field.
    #[serde(default)]
    pub scope: Option<String>,
    /// "canonical" sorts by the book's canonical order then in-book
    /// sequence; anything else (including `None`) sorts by BM25 relevance.
    #[serde(default)]
    pub sort: Option<String>,
    /// When true, `query` is a hand-composed FTS5 boolean expression from
    /// the Advanced Query modal (`AND`/`OR`/`NOT`/`NEAR(a b, N)`) and is
    /// passed through to MATCH verbatim instead of being auto-quoted —
    /// still just a bound parameter value, so this carries no more SQL
    /// injection risk than any other query text; FTS5 itself rejects
    /// malformed syntax as a normal (non-panicking) query error.
    #[serde(default)]
    pub raw: bool,
}

fn scope_column(scope: &str) -> Option<&'static str> {
    match scope.to_ascii_lowercase().as_str() {
        "devanagari" => Some("Devanagari"),
        "synonyms" => Some("Synonyms"),
        "translation" => Some("Translation"),
        "purport" | "purports" => Some("Purports"),
        _ => None,
    }
}

fn resolve_book_group(group: &str) -> Option<&'static [&'static str]> {
    match group.to_ascii_lowercase().as_str() {
        "gita" => Some(&["BG"]),
        "bhagavatam" => Some(&["SB"]),
        "cc" | "caitanya-caritamrta" | "caitanya_caritamrta" => Some(&["DI", "MADHYA", "ANTYA"]),
        "all" => None,
        _ => None,
    }
}

/// Folds Sanskrit IAST and European diacritical marks into their ASCII equivalents.
pub fn strip_diacritics(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let mapped = match c {
            'ā' | 'à' | 'á' | 'â' | 'ã' | 'ä' => 'a',
            'Ā' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' => 'A',
            'ī' | 'ì' | 'í' | 'î' | 'ï' => 'i',
            'Ī' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'I',
            'ū' | 'ù' | 'ú' | 'û' | 'ü' => 'u',
            'Ū' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'U',
            'ṛ' | 'ṝ' => 'r',
            'Ṛ' | 'Ṝ' => 'R',
            'ḷ' | 'ḹ' => 'l',
            'Ḷ' | 'Ḹ' => 'L',
            'ṅ' | 'ñ' | 'ṇ' => 'n',
            'Ṅ' | 'Ñ' | 'Ṇ' => 'N',
            'ṭ' => 't',
            'Ṭ' => 'T',
            'ḍ' => 'd',
            'Ḍ' => 'D',
            'ś' | 'ṣ' => 's',
            'Ś' | 'Ṣ' => 'S',
            'ḥ' => 'h',
            'Ḥ' => 'H',
            'ṁ' | 'ṃ' => 'm',
            'Ṁ' | 'Ṃ' => 'M',
            '\u{0300}'..='\u{036F}' => continue, // strip combining accents
            other => other,
        };
        out.push(mapped);
    }
    out
}

/// Returns the diacritic-stripped form a popular-spelling `token` would
/// need to become to hit the real index, or `None` when the two are
/// already identical (nothing to add).
pub fn anglicized_fold_variant(token: &str) -> Option<String> {
    let lower = token.to_lowercase();
    let variant = lower.replace("sh", "s").replace("ri", "r");
    (variant != lower).then_some(variant)
}

/// Returns common phonetic / transliteration variants for key Vaishnava terms
/// so queries match regardless of popular English or Sanskrit spelling.
pub fn phonetic_variants(token: &str) -> Vec<String> {
    let lower = token.to_lowercase();
    let stripped = strip_diacritics(&lower);
    let mut variants = Vec::new();

    match stripped.as_str() {
        "krsna" | "krishna" => {
            variants.push("krsna".to_string());
            variants.push("krishna".to_string());
        }
        "caitanya" | "chaitanya" => {
            variants.push("caitanya".to_string());
            variants.push("chaitanya".to_string());
        }
        "siva" | "shiva" => {
            variants.push("siva".to_string());
            variants.push("shiva".to_string());
        }
        "visnu" | "vishnu" => {
            variants.push("visnu".to_string());
            variants.push("vishnu".to_string());
        }
        "vrndavana" | "vrindavana" | "vrindavan" => {
            variants.push("vrndavana".to_string());
            variants.push("vrindavana".to_string());
            variants.push("vrindavan".to_string());
        }
        "kuruksetra" | "kurukshetra" => {
            variants.push("kuruksetra".to_string());
            variants.push("kurukshetra".to_string());
        }
        "arjuna" | "arjun" => {
            variants.push("arjuna".to_string());
            variants.push("arjun".to_string());
        }
        "yasoda" | "yashoda" => {
            variants.push("yasoda".to_string());
            variants.push("yashoda".to_string());
        }
        "radha" | "radharani" => {
            variants.push("radha".to_string());
            variants.push("radharani".to_string());
        }
        "sankirtana" | "sankirtan" => {
            variants.push("sankirtana".to_string());
            variants.push("sankirtan".to_string());
        }
        "gaura" | "gauranga" => {
            variants.push("gaura".to_string());
            variants.push("gauranga".to_string());
        }
        _ => {
            variants.push(stripped.clone());
            if let Some(ang) = anglicized_fold_variant(&stripped) {
                variants.push(ang);
            }
        }
    }
    variants.sort();
    variants.dedup();
    variants
}

/// Preprocesses proximity shorthand like `"surrender" NEAR/10 "lotus feet"` or `surrender w/5 feet`
/// into FTS5 function syntax: `NEAR("surrender" "lotus feet", 10)`.
pub fn rewrite_proximity_expressions(query: &str) -> String {
    let re = regex::Regex::new(r#"(?i)("(?:\\.|[^"\\])*"|[^\s()]+)\s+(?:near|w)/(\d+)\s+("(?:\\.|[^"\\])*"|[^\s()]+)"#)
        .expect("valid proximity regex");

    let mut current = query.to_string();
    for _ in 0..5 {
        if !re.is_match(&current) {
            break;
        }
        current = re.replace_all(&current, |caps: &regex::Captures| {
            let op1 = caps.get(1).map_or("", |m| m.as_str()).trim();
            let dist = caps.get(2).map_or("10", |m| m.as_str());
            let op2 = caps.get(3).map_or("", |m| m.as_str()).trim();

            let clean_op = |op: &str| -> String {
                let trimmed = op.trim();
                if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
                    format!("\"{}\"", &trimmed[1..trimmed.len() - 1].replace('"', "\"\""))
                } else {
                    format!("\"{}\"", trimmed.replace('"', "\"\""))
                }
            };
            format!("NEAR({} {}, {})", clean_op(op1), clean_op(op2), dist)
        }).to_string();
    }
    current
}

/// Builds a safe, high-precision FTS5 MATCH expression from user search input.
/// Supports:
/// - Proximity operators (`NEAR/N`, `w/N`): `"surrender" NEAR/10 "lotus feet"` -> `NEAR("surrender" "lotus feet", 10)`
/// - Boolean operators (`AND`, `OR`, `NOT`) and grouping parentheses `(...)`
/// - Wildcards (`kṛṣṇa*`, `krishna*`, `devot*`) with diacritic-agnostic and phonetic folding
/// - Multi-word phrase search (`"lotus feet"`)
/// - Incremental prefix search on the final token when `prefix: true`
pub fn build_match_expression(raw_query: &str, prefix: bool, exact_word: bool) -> Option<String> {
    let trimmed = raw_query.trim();
    if trimmed.is_empty() {
        return None;
    }

    if exact_word {
        let phrase = trimmed.replace('"', "\"\"");
        return Some(format!("\"{phrase}\""));
    }

    // Rewrite proximity syntax first: `surrender NEAR/10 "lotus feet"` -> `NEAR("surrender" "lotus feet", 10)`
    let preprocessed = rewrite_proximity_expressions(trimmed);

    // If preprocessed query already contains NEAR(...) and nothing else, return it directly
    if preprocessed.trim().to_uppercase().starts_with("NEAR(") && preprocessed.trim().ends_with(')') {
        return Some(preprocessed.trim().to_string());
    }

    // Tokenize preserving quoted phrases, parentheses, NEAR(...) blocks, and words
    let token_re = regex::Regex::new(r#"(?i)NEAR\s*\([^)]+\)|"[^"]*"|\(|\)|[^\s()]+"#).expect("valid token regex");

    let raw_tokens: Vec<&str> = token_re.find_iter(&preprocessed).map(|m| m.as_str().trim()).filter(|s| !s.is_empty()).collect();
    if raw_tokens.is_empty() {
        return None;
    }

    let mut out_tokens: Vec<String> = Vec::new();
    let mut open_parens: usize = 0;

    let total = raw_tokens.len();
    for (i, &tok) in raw_tokens.iter().enumerate() {
        let is_last = i == total - 1;

        // Parentheses
        if tok == "(" {
            open_parens += 1;
            out_tokens.push("(".to_string());
            continue;
        }
        if tok == ")" {
            if open_parens > 0 {
                open_parens -= 1;
                out_tokens.push(")".to_string());
            }
            continue;
        }

        // NEAR block
        if tok.to_uppercase().starts_with("NEAR(") && tok.ends_with(')') {
            out_tokens.push(tok.to_string());
            continue;
        }

        // Quoted phrase
        if tok.starts_with('"') && tok.ends_with('"') && tok.len() >= 2 {
            let inner = &tok[1..tok.len() - 1].replace('"', "\"\"");
            out_tokens.push(format!("\"{inner}\""));
            continue;
        }

        let upper = tok.to_uppercase();
        // Explicit boolean operators: AND, OR, NOT
        if upper == "AND" || upper == "OR" || upper == "NOT" {
            // Avoid duplicate consecutive operators or leading operator
            if let Some(prev) = out_tokens.last() {
                let prev_u = prev.to_uppercase();
                if prev_u != "AND" && prev_u != "OR" && prev_u != "NOT" && prev != "(" {
                    out_tokens.push(upper);
                }
            }
            continue;
        }

        // Handle wildcards: e.g. kṛṣṇa* or devot*
        let has_wildcard = tok.ends_with('*');
        let clean_tok = tok.trim_end_matches('*');
        if clean_tok.is_empty() {
            continue;
        }

        let is_prefix_term = (has_wildcard || (prefix && is_last)) && !clean_tok.is_empty();
        let star = if is_prefix_term { "*" } else { "" };

        let variants = phonetic_variants(clean_tok);
        if variants.len() > 1 {
            let or_terms: Vec<String> = variants
                .iter()
                .map(|v| format!("\"{}\"{}", v.replace('"', "\"\""), star))
                .collect();
            out_tokens.push(format!("({})", or_terms.join(" OR ")));
        } else {
            let base = variants.first().map(|s| s.as_str()).unwrap_or(clean_tok);
            out_tokens.push(format!("\"{}\"{}", base.replace('"', "\"\""), star));
        }
    }

    // Disarm trailing operator (e.g. `term AND` -> `term`)
    while let Some(last) = out_tokens.last() {
        let last_u = last.to_uppercase();
        if last_u == "AND" || last_u == "OR" || last_u == "NOT" || last == "(" {
            if last == "(" {
                open_parens = open_parens.saturating_sub(1);
            }
            out_tokens.pop();
        } else {
            break;
        }
    }

    // Close any unclosed parentheses
    for _ in 0..open_parens {
        out_tokens.push(")".to_string());
    }

    if out_tokens.is_empty() {
        return None;
    }

    Some(out_tokens.join(" "))
}

pub fn build_safe_fallback_match_expression(raw_query: &str) -> Option<String> {
    let tokens: Vec<&str> = raw_query.split_whitespace().collect();
    if tokens.is_empty() {
        return None;
    }
    let terms: Vec<String> = tokens
        .into_iter()
        .map(|t| format!("\"{}\"", t.trim_matches('"').replace('"', "\"\"")))
        .filter(|t| t != "\"\"")
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

const CASE_SENSITIVE_FIELDS: &[&str] = &["Title", "Devanagari", "Synonyms", "Translation", "Purports"];

pub fn search_corpus(
    conn: &rusqlite::Connection,
    params: SearchParams,
) -> Result<SearchResponse, String> {
    let limit = params.limit.unwrap_or(25).clamp(1, 200);
    let offset = params.offset.unwrap_or(0).max(0);

    let raw_query = params.query.trim();
    let Some(mut match_expr) = (if params.raw {
        if raw_query.is_empty() { None } else { Some(rewrite_proximity_expressions(raw_query)) }
    } else {
        build_match_expression(&params.query, params.prefix, params.exact_word)
    }) else {
        return Ok(SearchResponse { hits: vec![], total: 0, limit, offset });
    };

    // A raw boolean expression may already scope itself to a column (or
    // combine several), so the scope filter only applies to the
    // auto-built expression path.
    let scope_col = params.scope.as_deref().and_then(scope_column);
    if let Some(col) = scope_col {
        if !params.raw {
            match_expr = format!("{col}: {match_expr}");
        }
    }

    let mut book_filter_keys: Vec<String> = Vec::new();
    if let Some(codes) = &params.book_codes {
        book_filter_keys.extend(codes.iter().cloned());
    }
    if let Some(group) = &params.book_group {
        if let Some(keys) = resolve_book_group(group) {
            book_filter_keys.extend(keys.iter().map(|s| s.to_string()));
        }
    }
    book_filter_keys.sort();
    book_filter_keys.dedup();

    let book_filter_sql = if book_filter_keys.is_empty() {
        String::new()
    } else {
        let placeholders = book_filter_keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        format!(" AND r.BookKey IN ({placeholders})")
    };

    // Case-sensitive filter: FTS5's tokenizer folds case when matching, so
    // this is enforced separately as a byte-exact INSTR() substring check —
    // scoped to the same field as `scope` when one is set, otherwise any of
    // the searchable text fields — applied in SQL so pagination/`total`
    // stay accurate rather than being filtered downstream after the fact.
    let case_fields: &[&str] = match scope_col {
        Some(col) => std::slice::from_ref(
            CASE_SENSITIVE_FIELDS.iter().find(|f| **f == col).unwrap_or(&"Translation"),
        ),
        None => CASE_SENSITIVE_FIELDS,
    };
    let case_filter_sql = if params.match_case {
        let clauses = case_fields.iter().map(|f| format!("INSTR(r.{f}, ?) > 0")).collect::<Vec<_>>().join(" OR ");
        format!(" AND ({clauses})")
    } else {
        String::new()
    };

    let canonical_sort = params.sort.as_deref() == Some("canonical");
    let (join_sql, order_sql) = if canonical_sort {
        (" JOIN Books b ON b.BookKey = r.BookKey", " ORDER BY b.CanonicalOrder, r.Sequence")
    } else {
        ("", " ORDER BY bm25(RecordsFts)")
    };

    let count_sql = format!(
        "SELECT COUNT(*) FROM RecordsFts f JOIN Records r ON r.rowid = f.rowid{join_sql} \
         WHERE f.RecordsFts MATCH ?{book_filter_sql}{case_filter_sql}"
    );
    let query_sql = format!(
        "SELECT r.RecordKey, r.BookKey, r.RecordType, r.Reference, r.Title, \
                snippet(RecordsFts, -1, '<mark>', '</mark>', '...', 32) as snip \
         FROM RecordsFts f JOIN Records r ON r.rowid = f.rowid{join_sql} \
         WHERE f.RecordsFts MATCH ?{book_filter_sql}{case_filter_sql}{order_sql} LIMIT ? OFFSET ?"
    );

    let mut active_expr = match_expr.clone();
    let execute_query = |expr: &str| -> rusqlite::Result<(i64, Vec<SearchHit>)> {
        let total: i64 = {
            let mut stmt = conn.prepare(&count_sql)?;
            let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&expr];
            for k in &book_filter_keys {
                params_vec.push(k);
            }
            for _ in case_fields.iter().filter(|_| params.match_case) {
                params_vec.push(&params.query);
            }
            stmt.query_row(params_vec.as_slice(), |row| row.get(0))?
        };

        let mut stmt = conn.prepare(&query_sql)?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&expr];
        for k in &book_filter_keys {
            params_vec.push(k);
        }
        for _ in case_fields.iter().filter(|_| params.match_case) {
            params_vec.push(&params.query);
        }
        params_vec.push(&limit);
        params_vec.push(&offset);
        let rows = stmt.query_map(params_vec.as_slice(), |row| {
            Ok(SearchHit {
                record_key: row.get(0)?,
                book_key: row.get(1)?,
                record_type: row.get(2)?,
                reference: row.get(3)?,
                title: row.get(4)?,
                snippet: row.get(5)?,
            })
        })?;
        let hits = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok((total, hits))
    };

    match execute_query(&active_expr) {
        Ok((total, hits)) => Ok(SearchResponse { hits, total, limit, offset }),
        Err(e) => {
            if let Some(fallback) = build_safe_fallback_match_expression(&params.query) {
                if fallback != active_expr {
                    active_expr = fallback;
                    if let Ok((total, hits)) = execute_query(&active_expr) {
                        return Ok(SearchResponse { hits, total, limit, offset });
                    }
                }
            }
            Err(format!("search query failed: {e}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_diacritics() {
        assert_eq!(strip_diacritics("kṛṣṇa"), "krsna");
        assert_eq!(strip_diacritics("Śrīla Prabhupāda"), "Srila Prabhupada");
        assert_eq!(strip_diacritics("Caitanya-caritāmṛta"), "Caitanya-caritamrta");
    }

    #[test]
    fn test_proximity_rewriting() {
        let q1 = rewrite_proximity_expressions(r#""surrender" NEAR/10 "lotus feet""#);
        assert_eq!(q1, r#"NEAR("surrender" "lotus feet", 10)"#);

        let q2 = rewrite_proximity_expressions(r#"surrender NEAR/5 lotus feet"#);
        assert_eq!(q2, r#"NEAR("surrender" "lotus", 5) feet"#);

        let q3 = rewrite_proximity_expressions(r#"surrender w/10 "lotus feet""#);
        assert_eq!(q3, r#"NEAR("surrender" "lotus feet", 10)"#);
    }

    #[test]
    fn test_wildcard_diacritic_and_phonetics() {
        let expr = build_match_expression("kṛṣṇa*", false, false).unwrap();
        assert!(expr.contains(r#""krsna"*"#));

        let expr_krishna = build_match_expression("krishna*", false, false).unwrap();
        assert!(expr_krishna.contains("OR") && expr_krishna.contains(r#""krsna"*"#));
    }

    #[test]
    fn test_boolean_and_parentheses() {
        let expr = build_match_expression(r#"surrender AND "lotus feet""#, false, false).unwrap();
        assert!(expr.contains(r#""surrender""#) && expr.contains("AND") && expr.contains(r#""lotus feet""#));

        let expr_group = build_match_expression(r#"(surrender OR service) AND "lotus feet""#, false, false).unwrap();
        assert!(expr_group.starts_with('(') && expr_group.contains("AND"));

        // Unclosed parenthesis and trailing operator should be disarmed gracefully
        let unclosed = build_match_expression(r#"(surrender AND"#, false, false).unwrap();
        assert!(unclosed.contains(r#""surrender""#));
    }

    #[test]
    fn test_exact_word() {
        let expr = build_match_expression("surrender unto me", false, true).unwrap();
        assert_eq!(expr, r#""surrender unto me""#);
    }
}

