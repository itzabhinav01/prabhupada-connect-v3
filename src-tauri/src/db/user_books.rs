//! User-imported books: a separate, writable extension database
//! (`user_books.db`) for books added via Settings → Corpus & Books, kept
//! entirely apart from the bundled read-only corpus. Deliberately NOT
//! merged into `corpus.rs`'s own queries via `ATTACH DATABASE` — that would
//! mean touching the SQL of every already-tested corpus command
//! (list_books, get_book_toc, search_corpus, ...) to UNION in a second
//! source, for a feature most installs will never use. Instead this has
//! its own small set of parallel functions returning the exact same
//! `corpus::{Book, TocChapter, VerseRecord, SearchHit}` shapes, and the
//! frontend merges the two sources' results (see `useNavigationStore`).
//!
//! Each imported book is intentionally flat: one JSON record IS one
//! "chapter" (matching how a prose corpus book with no verse suffix
//! already works), since a general-purpose importer can't know a new
//! book's real chapter/verse structure the way the curated corpus does.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::corpus::{Book, SearchHit, TocChapter, VerseRecord};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS Books (
    BookKey TEXT PRIMARY KEY,
    Title TEXT NOT NULL,
    RecordCount INTEGER NOT NULL,
    ImportedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS Records (
    RecordKey TEXT PRIMARY KEY,
    BookKey TEXT NOT NULL REFERENCES Books(BookKey) ON DELETE CASCADE,
    Sequence INTEGER NOT NULL,
    Reference TEXT,
    Title TEXT,
    Synonyms TEXT,
    Translation TEXT,
    Purports TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_records_book ON Records(BookKey, Sequence);
";

/// True if `table` already has a column named `column` — see
/// `user_store.rs`'s identical helper for why this check is needed before
/// an additive `ALTER TABLE ... ADD COLUMN`.
fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|name| name == column);
    Ok(exists)
}

pub fn open_and_migrate(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(SCHEMA)?;

    // Added for PDF-book import: a PDF has no JSON records to parse, so it
    // persists only as one `Books` row (plus one placeholder `Records` row
    // for searchability) with its author and the path of its copied PDF.
    if !column_exists(&conn, "Books", "Author")? {
        conn.execute_batch("ALTER TABLE Books ADD COLUMN Author TEXT")?;
    }
    if !column_exists(&conn, "Books", "IsPdf")? {
        conn.execute_batch("ALTER TABLE Books ADD COLUMN IsPdf INTEGER NOT NULL DEFAULT 0")?;
    }
    if !column_exists(&conn, "Books", "PdfPath")? {
        conn.execute_batch("ALTER TABLE Books ADD COLUMN PdfPath TEXT")?;
    }

    Ok(conn)
}

/// One record from an imported JSON book — mirrors the schema described to
/// users in the Help tab's "Universal AI Conversion Prompt".
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ImportRecord {
    pub book_key: String,
    pub record_key: String,
    pub reference: Option<String>,
    pub title: Option<String>,
    pub synonyms: Option<String>,
    pub translation: Option<String>,
    pub purport: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedBook {
    pub book_key: String,
    pub title: String,
    pub author: Option<String>,
    pub record_count: i64,
    pub is_pdf: bool,
    pub pdf_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub book_key: String,
    pub title: String,
    pub record_count: i64,
}

/// Inserts every record of a freshly-parsed JSON book, replacing any
/// existing import under the same `BookKey` (re-importing the same file
/// is idempotent rather than erroring or duplicating).
pub fn import_records(conn: &mut Connection, records: Vec<ImportRecord>) -> Result<ImportResult, String> {
    let book_key = records.first().ok_or("JSON array is empty — nothing to import")?.book_key.clone();
    if records.iter().any(|r| r.book_key != book_key) {
        return Err("every record must share the same BookKey".to_string());
    }
    let title = records
        .iter()
        .find_map(|r| r.title.clone())
        .unwrap_or_else(|| book_key.clone());
    let count = records.len() as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM Records WHERE BookKey = ?1", params![book_key]).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO Books (BookKey, Title, RecordCount) VALUES (?1, ?2, ?3) \
         ON CONFLICT(BookKey) DO UPDATE SET Title = excluded.Title, RecordCount = excluded.RecordCount",
        params![book_key, title, count],
    )
    .map_err(|e| e.to_string())?;
    for (i, r) in records.iter().enumerate() {
        tx.execute(
            "INSERT INTO Records (RecordKey, BookKey, Sequence, Reference, Title, Synonyms, Translation, Purports) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![r.record_key, r.book_key, i as i64, r.reference, r.title, r.synonyms, r.translation, r.purport],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult { book_key, title, record_count: count })
}

pub fn list_imported_books(conn: &Connection) -> rusqlite::Result<Vec<ImportedBook>> {
    let mut stmt = conn.prepare("SELECT BookKey, Title, Author, RecordCount, IsPdf, PdfPath FROM Books ORDER BY Title")?;
    let rows = stmt.query_map([], |row| {
        Ok(ImportedBook {
            book_key: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            record_count: row.get(3)?,
            is_pdf: row.get::<_, i64>(4)? != 0,
            pdf_path: row.get(5)?,
        })
    })?;
    rows.collect()
}

/// Same shape as `corpus::list_books` uses, so the frontend can merge the
/// two lists without special-casing imported entries beyond routing their
/// TOC/chapter/search calls to this module instead of `corpus.rs`.
pub fn list_imported_books_as_books(conn: &Connection) -> rusqlite::Result<Vec<Book>> {
    let mut stmt = conn.prepare("SELECT BookKey, Title, Author, RecordCount, IsPdf, PdfPath FROM Books ORDER BY Title")?;
    let rows = stmt.query_map([], |row| {
        let book_key: String = row.get(0)?;
        let title: String = row.get(1)?;
        let author: Option<String> = row.get(2)?;
        let total_records: i64 = row.get(3)?;
        let is_pdf: bool = row.get::<_, i64>(4)? != 0;
        let pdf_path: Option<String> = row.get(5)?;
        Ok(Book {
            book_key: book_key.clone(),
            abbreviation: if is_pdf { "PDF".to_string() } else { book_key },
            edition: if is_pdf { Some("PDF Document".to_string()) } else { None },
            title: Some(title),
            category: Some("Imported".to_string()),
            corpus_id: None,
            author,
            canonical_order: 100_000,
            total_records,
            is_pdf,
            pdf_path,
        })
    })?;
    rows.collect()
}

/// Inserts (or replaces) a PDF-based book: no JSON records to parse, so it
/// persists as one `Books` row plus one placeholder `Records` row — just
/// enough for it to show up in the Library/search like any other imported
/// book, carrying the path of its own copied PDF file for `PdfTab` to open.
pub fn import_pdf_book(
    conn: &mut Connection,
    book_key: &str,
    title: &str,
    author: Option<&str>,
    pdf_path: &str,
) -> Result<ImportResult, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM Records WHERE BookKey = ?1", params![book_key]).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO Books (BookKey, Title, Author, RecordCount, IsPdf, PdfPath) VALUES (?1, ?2, ?3, 1, 1, ?4) \
         ON CONFLICT(BookKey) DO UPDATE SET Title = excluded.Title, Author = excluded.Author, \
         RecordCount = excluded.RecordCount, IsPdf = excluded.IsPdf, PdfPath = excluded.PdfPath",
        params![book_key, title, author, pdf_path],
    )
    .map_err(|e| e.to_string())?;
    let translation = match author {
        Some(a) => format!("PDF Book by {a}"),
        None => "PDF Book".to_string(),
    };
    tx.execute(
        "INSERT INTO Records (RecordKey, BookKey, Sequence, Reference, Title, Translation, Purports) \
         VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6)",
        params![
            format!("{book_key}-1"),
            book_key,
            format!("{title} (PDF)"),
            title,
            translation,
            format!("[PDF Document] {title}"),
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult { book_key: book_key.to_string(), title: title.to_string(), record_count: 1 })
}

/// Deletes an imported book's rows and returns its `PdfPath` (if it had
/// one) so the command layer can also remove the copied file from disk —
/// `None` both when the book never had a PDF and when `book_key` doesn't
/// exist at all.
pub fn remove_imported_book(conn: &Connection, book_key: &str) -> rusqlite::Result<Option<String>> {
    let pdf_path: Option<String> = conn
        .query_row("SELECT PdfPath FROM Books WHERE BookKey = ?1", params![book_key], |row| {
            row.get::<_, Option<String>>(0)
        })
        .optional()?
        .flatten();
    conn.execute("DELETE FROM Records WHERE BookKey = ?1", params![book_key])?;
    conn.execute("DELETE FROM Books WHERE BookKey = ?1", params![book_key])?;
    Ok(pdf_path)
}

/// An imported book is flat (one record = one chapter), so its TOC is just
/// every record wrapped as its own single-entry "chapter" — the same shape
/// `corpus::get_book_toc` returns for a real flat prose book.
pub fn get_book_toc(conn: &Connection, book_key: &str) -> rusqlite::Result<Vec<TocChapter>> {
    let mut stmt = conn.prepare(
        "SELECT RecordKey, Sequence, Reference, Title FROM Records WHERE BookKey = ?1 ORDER BY Sequence",
    )?;
    let rows = stmt.query_map(params![book_key], |row| {
        let record_key: String = row.get(0)?;
        let sequence: i64 = row.get(1)?;
        let reference: Option<String> = row.get(2)?;
        let title: Option<String> = row.get(3)?;
        let label = title.or(reference).unwrap_or_else(|| record_key.clone());
        Ok(TocChapter {
            chapter_key: record_key.clone(),
            label,
            canto_number: None,
            chapter_number: Some((sequence + 1).to_string()),
            first_record_key: record_key.clone(),
            last_record_key: record_key,
            record_count: 1,
            verse_start: None,
            verse_end: None,
        })
    })?;
    rows.collect()
}

fn row_to_verse_record(row: &rusqlite::Row) -> rusqlite::Result<VerseRecord> {
    let record_key: String = row.get(0)?;
    let book_key: String = row.get(1)?;
    let sequence: i64 = row.get(2)?;
    Ok(VerseRecord {
        record_key,
        book_key,
        sequence,
        parent_key: None,
        record_type: "Narrative".to_string(),
        reference: row.get(3)?,
        reference_status: "imported".to_string(),
        title: row.get(4)?,
        devanagari: None,
        transliteration: None,
        synonyms: row.get(5)?,
        translation: row.get(6)?,
        purports: row.get(7)?,
    })
}

const RECORD_COLUMNS: &str = "RecordKey, BookKey, Sequence, Reference, Title, Synonyms, Translation, Purports";

/// A "chapter" here is a single record's own RecordKey (see module docs),
/// so this always returns exactly one record.
pub fn get_chapter_records(conn: &Connection, chapter_key: &str) -> rusqlite::Result<Vec<VerseRecord>> {
    let mut stmt = conn.prepare(&format!("SELECT {RECORD_COLUMNS} FROM Records WHERE RecordKey = ?1"))?;
    let rows = stmt.query_map(params![chapter_key], row_to_verse_record)?;
    rows.collect()
}

pub fn get_verse_record(conn: &Connection, record_key: &str) -> rusqlite::Result<Option<VerseRecord>> {
    conn.query_row(&format!("SELECT {RECORD_COLUMNS} FROM Records WHERE RecordKey = ?1"), params![record_key], row_to_verse_record)
        .optional()
}

/// A plain `LIKE` scan rather than a second FTS5 index — imported books
/// are expected to be a handful of personal additions, not corpus-scale,
/// so this trades index-build complexity for "good enough" search rather
/// than matching the bundled corpus's full diacritic-aware FTS5 exactly.
pub fn search_imported_books(conn: &Connection, query: &str, limit: i64) -> rusqlite::Result<Vec<SearchHit>> {
    let pattern = format!("%{query}%");
    let mut stmt = conn.prepare(
        "SELECT RecordKey, BookKey, Reference, Title, \
                COALESCE(Translation, Purports, Synonyms, '') \
         FROM Records \
         WHERE Synonyms LIKE ?1 OR Translation LIKE ?1 OR Purports LIKE ?1 OR Title LIKE ?1 \
         ORDER BY Sequence LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit], |row| {
        let text: String = row.get(4)?;
        let snippet: String = text.chars().take(160).collect();
        Ok(SearchHit {
            record_key: row.get(0)?,
            book_key: row.get(1)?,
            record_type: "Narrative".to_string(),
            reference: row.get(2)?,
            title: row.get(3)?,
            snippet,
        })
    })?;
    rows.collect()
}
