//! Ports `VedaBaseModern2.Core.Services.DirectReferenceService` (v2's "@"
//! direct-reference grammar) onto this app's SQLite corpus. See that file
//! for the grammar's original design notes — the parsing/suggestion logic
//! here is a deliberate 1:1 behavioral port, adapted to query SQLite
//! per-book (cached after first use) instead of an in-memory hierarchy
//! built from a repository object.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde::Serialize;

pub struct WorkDef {
    pub book_key: &'static str,
    pub display_title: &'static str,
    pub aliases: &'static [&'static str],
    pub numeric_levels: usize,
    pub level_names: &'static [&'static str],
}

/// The corpus's 48 canonical works and their "@" aliases, ported verbatim
/// from v2's `Works` registry.
pub static WORKS: &[WorkDef] = &[
    WorkDef { book_key: "BG", display_title: "Bhagavad-gītā As It Is", aliases: &["BG", "BHAGAVADGITA", "GITA"], numeric_levels: 2, level_names: &["Chapter", "Verse"] },
    WorkDef { book_key: "SB", display_title: "Śrīmad-Bhāgavatam", aliases: &["SB", "BHAGAVATAM", "SRIMADBHAGAVATAM"], numeric_levels: 3, level_names: &["Canto", "Chapter", "Verse"] },
    WorkDef { book_key: "DI", display_title: "Śrī Caitanya-caritāmṛta — Ādi-līlā", aliases: &["ADI", "CCADI", "ADILILA"], numeric_levels: 2, level_names: &["Chapter", "Verse"] },
    WorkDef { book_key: "MADHYA", display_title: "Śrī Caitanya-caritāmṛta — Madhya-līlā", aliases: &["MADHYA", "CCMADHYA", "MADHYALILA"], numeric_levels: 2, level_names: &["Chapter", "Verse"] },
    WorkDef { book_key: "ANTYA", display_title: "Śrī Caitanya-caritāmṛta — Antya-līlā", aliases: &["ANTYA", "CCANTYA", "ANTYALILA"], numeric_levels: 2, level_names: &["Chapter", "Verse"] },
    WorkDef { book_key: "ISO", display_title: "Śrī Īśopaniṣad", aliases: &["ISO", "ISOPANISAD"], numeric_levels: 1, level_names: &["Mantra"] },
    WorkDef { book_key: "NOI", display_title: "The Nectar of Instruction", aliases: &["NOI", "NECTAROFINSTRUCTION"], numeric_levels: 1, level_names: &["Verse"] },
    WorkDef { book_key: "BS", display_title: "Śrī Brahma-saṁhitā", aliases: &["BS", "BRAHMASAMHITA"], numeric_levels: 2, level_names: &["Chapter", "Verse"] },
    WorkDef { book_key: "TLK", display_title: "Teachings of Lord Kapila", aliases: &["TLK"], numeric_levels: 1, level_names: &["Verse"] },
    WorkDef { book_key: "MM", display_title: "Mukunda-mālā-stotra", aliases: &["MM"], numeric_levels: 1, level_names: &["Verse"] },
    WorkDef { book_key: "NBS", display_title: "Nārada-bhakti-sūtra", aliases: &["NBS"], numeric_levels: 1, level_names: &["Sūtra"] },
    WorkDef { book_key: "SSR", display_title: "The Science of Self-Realization", aliases: &["SSR"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "EJ", display_title: "Easy Journey to Other Planets", aliases: &["EJ"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "SPS", display_title: "Śrīla Prabhupāda Ślokas", aliases: &["SPS", "SLOKAS", "SHLOKAS", "PRABHUPADASLOKAS"], numeric_levels: 2, level_names: &["Section", "Verse"] },
    WorkDef { book_key: "NOD", display_title: "The Nectar of Devotion", aliases: &["NOD", "NECTAROFDEVOTION"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "TLC", display_title: "Teachings of Lord Caitanya", aliases: &["TLC", "TEACHINGSOFLORDCAITANYA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "KB", display_title: "Kṛṣṇa, the Supreme Personality of Godhead", aliases: &["KB", "KRSNA", "KRISHNA", "KRSNABOOK"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "TQK", display_title: "Teachings of Queen Kuntī", aliases: &["TQK", "QUEENKUNTI", "TEACHINGSOFQUEENKUNTI"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "BB", display_title: "Bṛhad-bhāgavatāmṛta", aliases: &["BB", "BRHADBHAGAVATAMRTA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "DS", display_title: "Dialectical Spiritualism", aliases: &["DS", "DIALECTICALSPIRITUALISM"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "BBD", display_title: "Beyond Birth and Death", aliases: &["BBD", "BEYONDBIRTHANDDEATH"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "POY", display_title: "The Perfection of Yoga", aliases: &["POY", "PERFECTIONOFYOGA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "RV", display_title: "Rāja-Vidyā: The King of Knowledge", aliases: &["RV", "RAJAVIDYA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "EKC", display_title: "Elevation to Kṛṣṇa Consciousness", aliases: &["EKC", "ELEVATIONTOKRSNACONSCIOUSNESS"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "KCTYS", display_title: "Kṛṣṇa Consciousness: The Topmost Yoga System", aliases: &["KCTYS", "TOPMOSTYOGASYSTEM"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "MOG", display_title: "Message of Godhead", aliases: &["MOG", "MESSAGEOFGODHEAD"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "LOB", display_title: "Light of the Bhāgavata", aliases: &["LOB", "LIGHTOFTHEBHAGAVATA"], numeric_levels: 1, level_names: &["Verse"] },
    WorkDef { book_key: "PQPA", display_title: "Perfect Questions, Perfect Answers", aliases: &["PQPA", "PERFECTQUESTIONSPERFECTANSWERS"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "JSD", display_title: "The Journey of Self-Discovery", aliases: &["JSD", "JOURNEYOFSELFDISCOVERY"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "LCFL", display_title: "Life Comes From Life", aliases: &["LCFL", "LIFECOMESFROMLIFE"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "CB", display_title: "Coming Back: The Science of Reincarnation", aliases: &["CB", "COMINGBACK"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "CAT", display_title: "Civilization and Transcendence", aliases: &["CAT", "CIVILIZATIONANDTRANSCENDENCE"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "OWK", display_title: "On the Way to Kṛṣṇa", aliases: &["OWK", "ONTHEWAYTOKRSNA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "SFL", display_title: "The Search for Liberation", aliases: &["SFL", "SEARCHFORLIBERATION"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "TT", display_title: "Transcendental Teachings of Prahlāda Mahārāja", aliases: &["TT"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "SC", display_title: "A Second Chance", aliases: &["SC", "SECONDCHANCE"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "DWT", display_title: "Dharma: The Way of Transcendence", aliases: &["DWT", "DHARMA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "POP", display_title: "Path of Perfection", aliases: &["POP", "PATHOFPERFECTION"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "QFE", display_title: "Quest for Enlightenment", aliases: &["QFE", "QUESTFORENLIGHTENMENT"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "RTW", display_title: "Renunciation Through Wisdom", aliases: &["RTW", "RENUNCIATIONTHROUGHWISDOM"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "LON", display_title: "The Laws of Nature: An Infallible Justice", aliases: &["LON", "LAWSOFNATURE"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "MG", display_title: "Matchless Gift", aliases: &["MG", "MATCHLESSGIFT"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "ROP", display_title: "Reservoir of Pleasure", aliases: &["ROP", "RESERVOIROFPLEASURE"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "GG", display_title: "Gītār Gāna", aliases: &["GG", "GITARGANA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "SPL", display_title: "Śrīla Prabhupāda-līlāmṛta", aliases: &["SPL", "LILAMRITA", "LILAMRTA", "PRABHUPADALILAMRITA"], numeric_levels: 1, level_names: &["Chapter"] },
    WorkDef { book_key: "BTG", display_title: "Back to Godhead (1944–1960)", aliases: &["BTG", "BACKTOGODHEAD"], numeric_levels: 1, level_names: &["Article"] },
    WorkDef { book_key: "SVA", display_title: "Songs of the Vaiṣṇava Ācāryas", aliases: &["SVA", "SONGS", "VAISHNAVASONGS", "SONGSOFVAISHNAVAACARYAS"], numeric_levels: 2, level_names: &["Section", "Song"] },
    WorkDef { book_key: "TMG", display_title: "Temple Mantra Guide", aliases: &["TMG", "TEMPLEMANTRAS", "MANTRAGUIDE", "TEMPLEMANTRAGUIDE"], numeric_levels: 1, level_names: &["Mantra"] },
];

fn alias_lookup() -> &'static HashMap<String, &'static WorkDef> {
    static LOOKUP: OnceLock<HashMap<String, &'static WorkDef>> = OnceLock::new();
    LOOKUP.get_or_init(|| {
        let mut map = HashMap::new();
        for w in WORKS {
            map.insert(w.book_key.to_ascii_uppercase(), w);
            for a in w.aliases {
                map.insert(a.to_ascii_uppercase(), w);
            }
        }
        map
    })
}

/// Strips the common IAST diacritics (the same character set
/// `utils::typography` heals around) down to their ASCII base letter, so a
/// typed alias like "gītā" still matches the ASCII `[A-Za-z]+` work-name
/// pattern below instead of truncating at the first diacritic.
fn strip_diacritics(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'ā' | 'Ā' => 'a',
            'ī' | 'Ī' => 'i',
            'ū' | 'Ū' => 'u',
            'ṛ' | 'Ṛ' => 'r',
            'ṝ' | 'Ṝ' => 'r',
            'ḷ' | 'Ḷ' => 'l',
            'ḹ' | 'Ḹ' => 'l',
            'ṃ' | 'Ṃ' => 'm',
            'ṁ' | 'Ṁ' => 'm',
            'ḥ' | 'Ḥ' => 'h',
            'ś' | 'Ś' => 's',
            'ṣ' | 'Ṣ' => 's',
            'ṅ' | 'Ṅ' => 'n',
            'ñ' | 'Ñ' => 'n',
            'ṇ' | 'Ṇ' => 'n',
            'ṭ' | 'Ṭ' => 't',
            'ḍ' | 'Ḍ' => 'd',
            'ē' | 'Ē' => 'e',
            'ō' | 'Ō' => 'o',
            other => other,
        })
        .collect()
}

fn parse_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([A-Za-z\-]+(?:\s+[A-Za-z\-]+)*)\s*([\d][\d.\s]*)?$").unwrap())
}

fn letters_only_upper(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphabetic()).collect::<String>().to_ascii_uppercase()
}

/// True if the raw search-box text should be treated as direct-reference
/// mode (starts with `@`, ignoring leading whitespace).
pub fn is_reference_query(raw: &str) -> bool {
    raw.trim_start().starts_with('@')
}

/// Parses the text after `@` into (matched work, the raw work-name text
/// typed so far, numeric parts typed so far). Tolerant of case, optional
/// spaces, and missing separators — `"@bg 1.1"`, `"@BG1.1"`, `"@Bg 1.1"` all
/// parse identically.
fn parse(raw: &str) -> (Option<&'static WorkDef>, String, Vec<i64>) {
    let mut text = raw.trim_start();
    if let Some(rest) = text.strip_prefix('@') {
        text = rest;
    }
    let text = text.trim();
    if text.is_empty() {
        return (None, String::new(), Vec::new());
    }

    let clean = strip_diacritics(text);
    let Some(caps) = parse_re().captures(&clean) else {
        return (None, text.to_string(), Vec::new());
    };

    let work_text = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
    let numeric_text = caps.get(2).map(|m| m.as_str()).unwrap_or("");

    let mut work = alias_lookup().get(&letters_only_upper(&work_text)).copied();

    // If the full concatenation didn't match (e.g. "CC Adi" typed but only
    // "ADI" is registered), retry with just the last word — lets "@CC Adi
    // 1.1" and "@Adi 1.1" resolve identically.
    if work.is_none() {
        if let Some(last_word) = work_text.trim().split(' ').last() {
            if !last_word.is_empty() {
                work = alias_lookup().get(&letters_only_upper(last_word)).copied();
            }
        }
    }

    let parts: Vec<i64> = numeric_text
        .split(|c: char| c == '.' || c == ' ')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<i64>().ok())
        .collect();

    (work, work_text, parts)
}

#[derive(Clone)]
struct IndexEntry {
    parts: Vec<i64>,
    record_key: String,
    reference: String,
}

fn numeric_pattern(levels: usize) -> &'static Regex {
    static THREE: OnceLock<Regex> = OnceLock::new();
    static TWO: OnceLock<Regex> = OnceLock::new();
    static ONE: OnceLock<Regex> = OnceLock::new();
    match levels {
        3 => THREE.get_or_init(|| Regex::new(r"(\d+)\.(\d+)\.(\d+)").unwrap()),
        2 => TWO.get_or_init(|| Regex::new(r"(\d+)\.(\d+)").unwrap()),
        _ => ONE.get_or_init(|| Regex::new(r"(\d+)").unwrap()),
    }
}

/// Lazily-built, process-lifetime cache of each work's (numeric parts,
/// RecordKey, Reference) index — mirrors v2's `EnsureIndexAsync`, but reads
/// straight from SQLite per book instead of an injected repository, and
/// builds a book's entry on first use rather than all 48 up front.
fn index_cache() -> &'static Mutex<HashMap<&'static str, Vec<IndexEntry>>> {
    static CACHE: OnceLock<Mutex<HashMap<&'static str, Vec<IndexEntry>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_index(conn: &rusqlite::Connection, work: &'static WorkDef) -> rusqlite::Result<Vec<IndexEntry>> {
    if let Some(entries) = index_cache().lock().unwrap().get(work.book_key) {
        return Ok(entries.clone());
    }

    let pattern = numeric_pattern(work.numeric_levels);
    let mut stmt = conn.prepare(
        "SELECT RecordKey, Reference FROM Records WHERE BookKey = ?1 AND Reference IS NOT NULL ORDER BY Sequence",
    )?;
    let rows = stmt.query_map([work.book_key], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut entries = Vec::new();
    for row in rows {
        let (record_key, reference) = row?;
        if let Some(caps) = pattern.captures(&reference) {
            let mut parts = Vec::with_capacity(work.numeric_levels);
            let mut ok = true;
            for i in 1..=work.numeric_levels {
                match caps.get(i).and_then(|m| m.as_str().parse::<i64>().ok()) {
                    Some(v) => parts.push(v),
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok {
                entries.push(IndexEntry { parts, record_key, reference });
            }
        }
    }
    entries.sort_by(|a, b| a.parts.cmp(&b.parts));

    index_cache().lock().unwrap().insert(work.book_key, entries.clone());
    Ok(entries)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectRefResult {
    pub record_key: String,
    pub book_key: String,
    pub reference: String,
}

/// Resolves a fully-specified reference (one numeric part per
/// `numeric_levels` the work declares) to an exact RecordKey, or `None` if
/// no such verse exists in this corpus edition.
pub fn resolve_exact(conn: &rusqlite::Connection, raw: &str) -> rusqlite::Result<Option<DirectRefResult>> {
    let (work, _work_text, parts) = parse(raw);
    let Some(work) = work else { return Ok(None) };
    if parts.len() != work.numeric_levels {
        return Ok(None);
    }
    let entries = get_index(conn, work)?;
    Ok(entries.into_iter().find(|e| e.parts == parts).map(|e| DirectRefResult {
        record_key: e.record_key,
        book_key: work.book_key.to_string(),
        reference: e.reference,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceSuggestion {
    pub display_text: String,
    pub sub_text: String,
    pub record_key: Option<String>,
    pub query_to_complete: String,
    pub is_work: bool,
}

/// Progressive autocomplete suggestions for the current `"@..."` text.
pub fn get_suggestions(
    conn: &rusqlite::Connection,
    raw: &str,
    max_results: usize,
) -> rusqlite::Result<Vec<ReferenceSuggestion>> {
    let (work, work_text, parts) = parse(raw);

    let Some(work) = work else {
        let filter = letters_only_upper(&work_text);

        if filter == "CC" || filter.starts_with("CAITANYA") {
            return Ok(vec![
                ReferenceSuggestion {
                    display_text: "Śrī Caitanya-caritāmṛta — Ādi-līlā".to_string(),
                    sub_text: "ADI".to_string(),
                    record_key: None,
                    query_to_complete: "@CC Adi ".to_string(),
                    is_work: true,
                },
                ReferenceSuggestion {
                    display_text: "Śrī Caitanya-caritāmṛta — Madhya-līlā".to_string(),
                    sub_text: "MADHYA".to_string(),
                    record_key: None,
                    query_to_complete: "@CC Madhya ".to_string(),
                    is_work: true,
                },
                ReferenceSuggestion {
                    display_text: "Śrī Caitanya-caritāmṛta — Antya-līlā".to_string(),
                    sub_text: "ANTYA".to_string(),
                    record_key: None,
                    query_to_complete: "@CC Antya ".to_string(),
                    is_work: true,
                },
            ]);
        }

        let mut results = Vec::new();
        for w in WORKS {
            let title_upper = w.display_title.to_ascii_uppercase();
            let matches = filter.is_empty()
                || w.book_key.starts_with(&filter)
                || title_upper.contains(&filter)
                || w.aliases.iter().any(|a| a.starts_with(&filter));
            if matches {
                results.push(ReferenceSuggestion {
                    display_text: w.display_title.to_string(),
                    sub_text: w.book_key.to_string(),
                    record_key: None,
                    query_to_complete: format!("@{} ", w.book_key),
                    is_work: true,
                });
                if results.len() >= max_results {
                    break;
                }
            }
        }
        return Ok(results);
    };

    let entries = get_index(conn, work)?;
    if entries.is_empty() {
        return Ok(Vec::new());
    }

    if parts.len() >= work.numeric_levels {
        let target = &parts[..work.numeric_levels];
        if let Some(exact) = entries.iter().find(|e| e.parts[..work.numeric_levels] == *target) {
            return Ok(vec![ReferenceSuggestion {
                display_text: exact.reference.clone(),
                sub_text: work.display_title.to_string(),
                record_key: Some(exact.record_key.clone()),
                query_to_complete: format!(
                    "@{} {}",
                    work.book_key,
                    exact.parts.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(".")
                ),
                is_work: false,
            }]);
        }
        return Ok(Vec::new());
    }

    let matches: Vec<&IndexEntry> =
        entries.iter().filter(|e| parts.is_empty() || e.parts[..parts.len()] == parts[..]).collect();
    let next_level_depth = parts.len() + 1;

    if next_level_depth >= work.numeric_levels {
        return Ok(matches
            .into_iter()
            .take(max_results)
            .map(|e| ReferenceSuggestion {
                display_text: e.reference.clone(),
                sub_text: work.display_title.to_string(),
                record_key: Some(e.record_key.clone()),
                query_to_complete: format!(
                    "@{} {}",
                    work.book_key,
                    e.parts.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(".")
                ),
                is_work: false,
            })
            .collect());
    }

    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for e in matches {
        let prefix_parts = &e.parts[..next_level_depth];
        let key_str = prefix_parts.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(".");
        if !seen.insert(key_str.clone()) {
            continue;
        }
        results.push(ReferenceSuggestion {
            display_text: format!(
                "{} {} — {} {}",
                work.book_key,
                key_str,
                work.level_names[next_level_depth - 1],
                prefix_parts[prefix_parts.len() - 1]
            ),
            sub_text: work.display_title.to_string(),
            record_key: None,
            query_to_complete: format!("@{} {}.", work.book_key, key_str),
            is_work: false,
        });
        if results.len() >= max_results {
            break;
        }
    }
    Ok(results)
}
