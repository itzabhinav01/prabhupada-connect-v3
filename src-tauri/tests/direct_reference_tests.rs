use prabhupadaconnectv3_lib::direct_reference::{get_suggestions, is_reference_query, resolve_exact};
use rusqlite::Connection;

/// Builds an in-memory connection with just enough of the real schema
/// (`Records.RecordKey/BookKey/Sequence/Reference`) for the direct-reference
/// index builder to run against, seeded with a handful of BG and SB rows
/// shaped like the real corpus's reference strings.
fn seed_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE Records (
            RecordKey TEXT PRIMARY KEY,
            BookKey TEXT NOT NULL,
            Sequence INTEGER NOT NULL,
            Reference TEXT
        );",
    )
    .unwrap();

    let rows: &[(&str, &str, i64, &str)] = &[
        ("BG-1-1", "BG", 1, "Bg 1.1"),
        ("BG-2-1", "BG", 2, "Bg 2.1"),
        ("BG-2-20", "BG", 3, "Bg 2.20"),
        ("SB-1.1-1", "SB", 1, "SB 1.1.1"),
        ("SB-1.4-6", "SB", 2, "SB 1.4.6"),
        ("SB-1.4-7", "SB", 3, "SB 1.4.7"),
        ("NOI-VERSE-4", "NOI", 1, "NoI: verse 4"),
    ];
    for (record_key, book_key, sequence, reference) in rows {
        conn.execute(
            "INSERT INTO Records (RecordKey, BookKey, Sequence, Reference) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![record_key, book_key, sequence, reference],
        )
        .unwrap();
    }
    conn
}

#[test]
fn recognizes_at_prefix() {
    assert!(is_reference_query("@BG 2.20"));
    assert!(is_reference_query("  @sb 1.1.1"));
    assert!(!is_reference_query("kṛṣṇa"));
}

#[test]
fn resolves_exact_two_level_reference_with_alias() {
    let conn = seed_db();
    let hit = resolve_exact(&conn, "@BG 2.20").unwrap().expect("should resolve");
    assert_eq!(hit.record_key, "BG-2-20");
    assert_eq!(hit.book_key, "BG");

    // Alias + no-space + no-dot-separator variants all resolve identically.
    let via_alias = resolve_exact(&conn, "@gita 2.20").unwrap().expect("alias should resolve");
    assert_eq!(via_alias.record_key, "BG-2-20");
}

#[test]
fn resolves_exact_three_level_reference() {
    let conn = seed_db();
    let hit = resolve_exact(&conn, "@SB 1.4.6").unwrap().expect("should resolve");
    assert_eq!(hit.record_key, "SB-1.4-6");
}

#[test]
fn resolves_single_level_reference() {
    let conn = seed_db();
    let hit = resolve_exact(&conn, "@NOI 4").unwrap().expect("should resolve");
    assert_eq!(hit.record_key, "NOI-VERSE-4");
}

#[test]
fn returns_none_for_nonexistent_verse() {
    let conn = seed_db();
    assert!(resolve_exact(&conn, "@BG 99.99").unwrap().is_none());
}

#[test]
fn bare_at_lists_work_suggestions() {
    let conn = seed_db();
    let suggestions = get_suggestions(&conn, "@", 50).unwrap();
    assert!(suggestions.iter().any(|s| s.sub_text == "BG"));
    assert!(suggestions.iter().any(|s| s.sub_text == "SB"));
    assert!(suggestions.iter().all(|s| s.is_work));
}

#[test]
fn partial_work_prefix_filters_suggestions() {
    let conn = seed_db();
    // "@BG" alone is a *complete* alias match (work resolves immediately,
    // dropping into the chapter-listing branch instead), so to exercise the
    // "no exact match yet — list matching works" branch the typed text must
    // NOT itself be a registered alias. "GI" isn't registered, but it's a
    // prefix of BG's "GITA" alias (and, incidentally, of GG's "GITARGANA"
    // alias too — both are valid matches here), while none of SB's book
    // key, aliases, or title contain it at all.
    let suggestions = get_suggestions(&conn, "@GI", 50).unwrap();
    assert!(suggestions.iter().any(|s| s.sub_text == "BG"));
    assert!(suggestions.iter().all(|s| s.sub_text != "SB"));
}

#[test]
fn partial_numeric_prefix_suggests_next_level() {
    let conn = seed_db();
    // "@SB 1" — one of three levels typed, so the next suggestion level is
    // intermediate (chapter), not yet a leaf verse.
    let suggestions = get_suggestions(&conn, "@SB 1", 50).unwrap();
    assert!(!suggestions.is_empty());
    assert!(suggestions.iter().all(|s| !s.is_work && s.record_key.is_none()));
}

#[test]
fn cc_shorthand_suggests_three_lilas() {
    let conn = seed_db();
    let suggestions = get_suggestions(&conn, "@CC", 50).unwrap();
    assert_eq!(suggestions.len(), 3);
    assert!(suggestions.iter().any(|s| s.sub_text == "ADI"));
    assert!(suggestions.iter().any(|s| s.sub_text == "MADHYA"));
    assert!(suggestions.iter().any(|s| s.sub_text == "ANTYA"));
}
