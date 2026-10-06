//! Task 9: user-imported books (a separate extension database, not the
//! bundled corpus) — import, list, TOC/chapter/verse retrieval, remove,
//! and search all round-trip correctly.

use prabhupadaconnectv3_lib::db::user_books::{self, ImportRecord};

fn open_temp_books_db(name: &str) -> (rusqlite::Connection, std::path::PathBuf) {
    let path = std::env::temp_dir().join(format!("pcv3_test_user_books_{name}_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    let conn = user_books::open_and_migrate(&path).expect("schema migration should succeed");
    (conn, path)
}

fn sample_records() -> Vec<ImportRecord> {
    vec![
        ImportRecord {
            book_key: "TQK".to_string(),
            record_key: "TQK-1".to_string(),
            reference: Some("TQK 1: The Original Person".to_string()),
            title: Some("The Original Person".to_string()),
            synonyms: None,
            translation: None,
            purport: Some("Full text of chapter one about Kṛṣṇa.".to_string()),
        },
        ImportRecord {
            book_key: "TQK".to_string(),
            record_key: "TQK-2".to_string(),
            reference: Some("TQK 2: Beyond the Senses".to_string()),
            title: Some("Beyond the Senses".to_string()),
            synonyms: None,
            translation: None,
            purport: Some("Full text of chapter two.".to_string()),
        },
    ]
}

#[test]
fn import_list_toc_and_records_round_trip() {
    let (mut conn, path) = open_temp_books_db("roundtrip");

    let result = user_books::import_records(&mut conn, sample_records()).expect("import should succeed");
    assert_eq!(result.book_key, "TQK");
    assert_eq!(result.record_count, 2);

    let books = user_books::list_imported_books(&conn).expect("list should succeed");
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].book_key, "TQK");
    assert_eq!(books[0].record_count, 2);

    let toc = user_books::get_book_toc(&conn, "TQK").expect("toc should build");
    assert_eq!(toc.len(), 2);
    assert_eq!(toc[0].label, "The Original Person");
    assert_eq!(toc[0].record_count, 1);

    let records = user_books::get_chapter_records(&conn, &toc[0].chapter_key).expect("chapter records should load");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].record_key, "TQK-1");
    assert_eq!(records[0].purports.as_deref(), Some("Full text of chapter one about Kṛṣṇa."));

    let verse = user_books::get_verse_record(&conn, "TQK-2").expect("get should succeed");
    assert!(verse.is_some());
    assert_eq!(verse.unwrap().title.as_deref(), Some("Beyond the Senses"));

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn reimporting_the_same_book_key_replaces_not_duplicates() {
    let (mut conn, path) = open_temp_books_db("reimport");

    user_books::import_records(&mut conn, sample_records()).expect("first import should succeed");
    // Re-import with only one record under the same BookKey.
    let second = vec![sample_records().into_iter().next().unwrap()];
    let result = user_books::import_records(&mut conn, second).expect("second import should succeed");
    assert_eq!(result.record_count, 1);

    let toc = user_books::get_book_toc(&conn, "TQK").expect("toc should build");
    assert_eq!(toc.len(), 1, "re-importing must replace, not accumulate, records");

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn remove_imported_book_deletes_its_records() {
    let (mut conn, path) = open_temp_books_db("remove");

    user_books::import_records(&mut conn, sample_records()).expect("import should succeed");
    user_books::remove_imported_book(&conn, "TQK").expect("remove should succeed");

    assert!(user_books::list_imported_books(&conn).expect("list should succeed").is_empty());
    assert!(user_books::get_book_toc(&conn, "TQK").expect("toc should build").is_empty());

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn import_pdf_book_persists_as_single_entry_and_marks_is_pdf() {
    let (mut conn, path) = open_temp_books_db("pdf_import");

    let result = user_books::import_pdf_book(&mut conn, "PDF_TESTBOOK", "A Scanned Classic", Some("Śrīla Prabhupāda"), "C:\\fake\\PDF_TESTBOOK.pdf")
        .expect("pdf import should succeed");
    assert_eq!(result.book_key, "PDF_TESTBOOK");
    assert_eq!(result.record_count, 1);

    let books = user_books::list_imported_books(&conn).expect("list should succeed");
    assert_eq!(books.len(), 1);
    assert!(books[0].is_pdf);
    assert_eq!(books[0].pdf_path.as_deref(), Some("C:\\fake\\PDF_TESTBOOK.pdf"));
    assert_eq!(books[0].author.as_deref(), Some("Śrīla Prabhupāda"));

    let as_books = user_books::list_imported_books_as_books(&conn).expect("list-as-books should succeed");
    assert_eq!(as_books.len(), 1);
    assert!(as_books[0].is_pdf);
    assert_eq!(as_books[0].pdf_path.as_deref(), Some("C:\\fake\\PDF_TESTBOOK.pdf"));

    // Removing it must hand back the PdfPath so the command layer can
    // delete the copied file from disk.
    let returned_path = user_books::remove_imported_book(&conn, "PDF_TESTBOOK").expect("remove should succeed");
    assert_eq!(returned_path.as_deref(), Some("C:\\fake\\PDF_TESTBOOK.pdf"));
    assert!(user_books::list_imported_books(&conn).expect("list should succeed").is_empty());

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn remove_imported_book_returns_none_for_a_non_pdf_book() {
    let (mut conn, path) = open_temp_books_db("remove_non_pdf");
    user_books::import_records(&mut conn, sample_records()).expect("import should succeed");

    let returned_path = user_books::remove_imported_book(&conn, "TQK").expect("remove should succeed");
    assert_eq!(returned_path, None, "a non-PDF import has no file to clean up");

    drop(conn);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn search_finds_imported_book_text() {
    let (mut conn, path) = open_temp_books_db("search");

    user_books::import_records(&mut conn, sample_records()).expect("import should succeed");
    let hits = user_books::search_imported_books(&conn, "Kṛṣṇa", 10).expect("search should succeed");
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].record_key, "TQK-1");

    let no_hits = user_books::search_imported_books(&conn, "nonexistent_term_xyz", 10).expect("search should succeed");
    assert!(no_hits.is_empty());

    drop(conn);
    let _ = std::fs::remove_file(&path);
}
