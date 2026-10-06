//! Native Rust port of the v2 auto-healing typography engine
//! (`healBrokenSanskritAndSplits` in
//! `VedaBaseModern2.UI/Assets/Reader/reader.js`).
//!
//! The 1990s Folio-era source text carries systematic OCR/wrap-break
//! artifacts: words split across a 72-column wrap ("yauvana\nm" instead of
//! "yauvanam"), stray whitespace before punctuation, split contractions, and
//! a long tail of specific Sanskrit/IAST terms that habitually got broken.
//! This module ports every one of those rules verbatim, in the same order,
//! rather than approximating them.
//!
//! Only `translation`, `synonyms`, and `purports` are healed (matching v2's
//! own behavior) — `devanagari` and `transliteration` are left untouched.
//!
//! Almost none of these rules actually need lookaround — only the handful
//! that embed a trailing `(?=...)`/`(?!...)` do. `fancy_regex`'s backtracking
//! VM is ~1000x slower than the plain `regex` crate's linear-time engine even
//! on these short, simple patterns (measured: ~2ms/rule vs. sub-microsecond),
//! and healing runs on every record of every freshly-opened chapter, so
//! routing everything through `fancy_regex` made opening an unvisited chapter
//! visibly freeze the whole app. Each rule is compiled against whichever
//! engine it actually needs, picked automatically from the pattern text.

use std::sync::LazyLock;

enum CompiledPattern {
    Fast(regex::Regex),
    Fancy(fancy_regex::Regex),
}

struct Rule {
    pattern: &'static str,
    replacement: &'static str,
    case_insensitive: bool,
}

fn needs_fancy_engine(pattern: &str) -> bool {
    pattern.contains("(?=") || pattern.contains("(?!") || pattern.contains("(?<")
}

fn compile_pattern(pattern: &str, case_insensitive: bool) -> CompiledPattern {
    let pattern = if case_insensitive { format!("(?i){pattern}") } else { pattern.to_string() };
    if needs_fancy_engine(&pattern) {
        CompiledPattern::Fancy(
            fancy_regex::Regex::new(&pattern).unwrap_or_else(|e| panic!("invalid healer regex {pattern:?}: {e}")),
        )
    } else {
        CompiledPattern::Fast(
            regex::Regex::new(&pattern).unwrap_or_else(|e| panic!("invalid healer regex {pattern:?}: {e}")),
        )
    }
}

fn compile(rule: &Rule) -> CompiledPattern {
    compile_pattern(rule.pattern, rule.case_insensitive)
}

// ---------------------------------------------------------------------------
// 1. Hyphenated word-wrap join: "transcen-\ndental" -> "transcendental"
// ---------------------------------------------------------------------------
static HYPHEN_WRAP: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile(&Rule {
        pattern: r"([a-zA-Z\u{00C0}-\u{024F}\u{1E00}-\u{1EFF}]+)-\r?\n\s*([a-zA-Z\u{00C0}-\u{024F}\u{1E00}-\u{1EFF}]+)",
        replacement: "$1$2",
        case_insensitive: false,
    })
});

// ---------------------------------------------------------------------------
// 2. Dictionary of specific broken English/Sanskrit terms, ported verbatim
//    and in order from reader.js's `healBrokenSanskritAndSplits`.
// ---------------------------------------------------------------------------
static DICTIONARY_RULES: &[Rule] = &[
    Rule { pattern: r"\bnotori\s+ous\b", replacement: "notorious", case_insensitive: true },
    Rule {
        pattern: r"(^|[\s—–\-\(\[])evānutt\s+amāṁ(?=[\s—–\-\.\,\;\:\?\!\)\]]|$)",
        replacement: "${1}evānuttamāṁ",
        case_insensitive: true,
    },
    Rule {
        pattern: r"(^|[\s—–\-\(\[])Bhaga\s+vān(?=[\s—–\-\.\,\;\:\?\!\)\]]|$)",
        replacement: "${1}Bhagavān",
        case_insensitive: false,
    },
    Rule {
        pattern: r"(^|[\s—–\-\(\[])bhaga\s+vān(?=[\s—–\-\.\,\;\:\?\!\)\]]|$)",
        replacement: "${1}bhagavān",
        case_insensitive: false,
    },
    Rule { pattern: r"\bKṛṣ\s+ṇa\b", replacement: "Kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bKṛṣṇ\s+a\b", replacement: "Kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bK\s+ṛṣṇa\b", replacement: "Kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bKṛ\s+ṣṇa\b", replacement: "Kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bkṛṣ\s+ṇa\b", replacement: "kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bkṛṣṇ\s+a\b", replacement: "kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bk\s+ṛṣṇa\b", replacement: "kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bkṛ\s+ṣṇa\b", replacement: "kṛṣṇa", case_insensitive: false },
    Rule { pattern: r"\bVaiṣṇ\s+avas\b", replacement: "Vaiṣṇavas", case_insensitive: false },
    Rule { pattern: r"\bVaiṣṇ\s+ava\b", replacement: "Vaiṣṇava", case_insensitive: false },
    Rule { pattern: r"\bVaiṣ\s+ṇavas\b", replacement: "Vaiṣṇavas", case_insensitive: false },
    Rule { pattern: r"\bVaiṣ\s+ṇava\b", replacement: "Vaiṣṇava", case_insensitive: false },
    Rule { pattern: r"\bVai\s+ṣṇavas\b", replacement: "Vaiṣṇavas", case_insensitive: false },
    Rule { pattern: r"\bVai\s+ṣṇava\b", replacement: "Vaiṣṇava", case_insensitive: false },
    Rule { pattern: r"\bbrāhma\s+ṇas\b", replacement: "brāhmaṇas", case_insensitive: false },
    Rule { pattern: r"\bbrāhma\s+ṇa\b", replacement: "brāhmaṇa", case_insensitive: false },
    Rule { pattern: r"\bbrāhmaṇ\s+as\b", replacement: "brāhmaṇas", case_insensitive: false },
    Rule { pattern: r"\bbrāhmaṇ\s+a\b", replacement: "brāhmaṇa", case_insensitive: false },
    Rule { pattern: r"\bViṣ\s+ṇu\b", replacement: "Viṣṇu", case_insensitive: false },
    Rule { pattern: r"\bViṣṇ\s+u\b", replacement: "Viṣṇu", case_insensitive: false },
    Rule { pattern: r"\bVi\s+ṣṇu\b", replacement: "Viṣṇu", case_insensitive: false },
    Rule { pattern: r"\bviṣ\s+ṇu\b", replacement: "viṣṇu", case_insensitive: false },
    Rule { pattern: r"\bV\s+ṛndāvana\b", replacement: "Vṛndāvana", case_insensitive: false },
    Rule { pattern: r"\bVṛ\s+ndāvana\b", replacement: "Vṛndāvana", case_insensitive: false },
    Rule { pattern: r"\bPurā\s+ṇas\b", replacement: "Purāṇas", case_insensitive: false },
    Rule { pattern: r"\bPurā\s+ṇa\b", replacement: "Purāṇa", case_insensitive: false },
    Rule { pattern: r"\bRādhārā\s+ṇī\b", replacement: "Rādhārāṇī", case_insensitive: false },
    Rule { pattern: r"\bRādhārāṇ\s+ī\b", replacement: "Rādhārāṇī", case_insensitive: false },
    Rule { pattern: r"\bYudhi\s+ṣṭhira\b", replacement: "Yudhiṣṭhira", case_insensitive: false },
    Rule { pattern: r"\bVaikuṇ\s+ṭha\b", replacement: "Vaikuṇṭha", case_insensitive: false },
    Rule { pattern: r"\bPāṇ\s+ḍavas\b", replacement: "Pāṇḍavas", case_insensitive: false },
    Rule { pattern: r"\bPaṇ\s+ḍita\b", replacement: "Paṇḍita", case_insensitive: false },
    Rule { pattern: r"\bpaṇ\s+ḍita\b", replacement: "paṇḍita", case_insensitive: false },
    Rule { pattern: r"\bDak\s+ṣa\b", replacement: "Dakṣa", case_insensitive: false },
    Rule { pattern: r"\bHira\s+ṇyakaśipu\b", replacement: "Hiraṇyakaśipu", case_insensitive: false },
    Rule { pattern: r"\bUpani\s+ṣad", replacement: "Upaniṣad", case_insensitive: false },
    Rule { pattern: r"\bsm\s+ṛti", replacement: "smṛti", case_insensitive: false },
    Rule { pattern: r"\bAm\s+ṛta\b", replacement: "Amṛta", case_insensitive: false },
    Rule { pattern: r"\bam\s+ṛta\b", replacement: "amṛta", case_insensitive: false },
    Rule { pattern: r"\bcaritāmṛ\s+ta\b", replacement: "caritāmṛta", case_insensitive: false },
    Rule { pattern: r"\bNṛsi\s*ṁha", replacement: "Nṛsiṁha", case_insensitive: false },
    Rule { pattern: r"\bP\s+ṛthu\b", replacement: "Pṛthu", case_insensitive: false },
    Rule { pattern: r"\bdṛ\s+ḍha\b", replacement: "dṛḍha", case_insensitive: false },
    Rule { pattern: r"\bkṣa\s+triya", replacement: "kṣatriya", case_insensitive: false },
    Rule { pattern: r"\bBhaṭṭ\s+ācārya\b", replacement: "Bhaṭṭācārya", case_insensitive: false },
    Rule { pattern: r"\bGuṇḍ\s+icā\b", replacement: "Guṇḍicā", case_insensitive: false },
    Rule { pattern: r"\bSaṅkarṣa\s+ṇa\b", replacement: "Saṅkarṣaṇa", case_insensitive: false },
    Rule { pattern: r"\bNārāya\s+ṇa\b", replacement: "Nārāyaṇa", case_insensitive: false },
    Rule { pattern: r"\bparāya\s+ṇa\b", replacement: "parāyaṇa", case_insensitive: false },
    Rule { pattern: r"\bṬhā\s+kura\b", replacement: "Ṭhākura", case_insensitive: false },
    Rule { pattern: r"\bParīk\s+ṣit\b", replacement: "Parīkṣit", case_insensitive: false },
    Rule { pattern: r"\brasām\s+ṛta\b", replacement: "rasāmṛta", case_insensitive: false },
    Rule { pattern: r"\bafflic\s+ted\b", replacement: "afflicted", case_insensitive: false },
    // Added in Phase 5, approved as an extension beyond the literal v2
    // dictionary after being spotted live in a synonyms gloss. (The sibling
    // "yauvana m" case from that same pass is now handled by the general
    // TRAILING_M_SPLIT rule below instead of a one-off entry here.)
    Rule { pattern: r"\bPersona\s+lity\b", replacement: "Personality", case_insensitive: false },
    Rule { pattern: r"\bpersona\s+lity\b", replacement: "personality", case_insensitive: false },
    Rule {
        pattern: r"\\?\*\s*Vṛndāvana is the transcendental",
        replacement: "*Vṛndāvana is the transcendental",
        case_insensitive: false,
    },
];

static DICTIONARY_COMPILED: LazyLock<Vec<CompiledPattern>> =
    LazyLock::new(|| DICTIONARY_RULES.iter().map(compile).collect());

// ---------------------------------------------------------------------------
// 2b. Algorithmic (not dictionary) fix for the systemic Sanskrit
//     trailing-"m" split: "ikṣaṇa m" -> "ikṣaṇam", "yauvana m" -> "yauvanam",
//     and any other IAST word broken the same way — a single lowercase `m`
//     stranded after whitespace is essentially always a wrapped anusvāra/
//     final-m, never a standalone English word. The prefix character class
//     is IAST-letters-only (no digits), so this can't fire on a unit like
//     "5 m" — there's nothing in the class for "5" to match.
// ---------------------------------------------------------------------------
static TRAILING_M_SPLIT: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile(&Rule {
        pattern: r"\b([a-zA-Zāīūṛṝḷḹēōñṅṇṃṁḥśṣ]+)\s+m\b",
        replacement: "${1}m",
        case_insensitive: false,
    })
});

// ---------------------------------------------------------------------------
// 3. Split contractions across a newline or stray space: "don\n't" / "don 't"
//    -> "don't"
// ---------------------------------------------------------------------------
static CONTRACTION_NEWLINE: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile(&Rule {
        pattern: r"([a-zA-Z\u{00C0}-\u{024F}\u{1E00}-\u{1EFF}])[\t ]*\r?\n[\t ]*(['’])([sStTmMdDvVeErRlL]{1,2})\b",
        replacement: "$1$2$3",
        case_insensitive: false,
    })
});
static CONTRACTION_SPACE: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile(&Rule {
        pattern: r"([a-zA-Z\u{00C0}-\u{024F}\u{1E00}-\u{1EFF}])[ ]+(['’])([sStTmMdDvVeErRlL]{1,2})\b",
        replacement: "$1$2$3",
        case_insensitive: false,
    })
});

// ---------------------------------------------------------------------------
// 4 & 5. Stray line-wrap / whitespace before punctuation:
//    "India\r\n." -> "India. ", "Goloka  , on" -> "Goloka, on"
// ---------------------------------------------------------------------------
const WORD_CHAR_CLASS: &str = r#"[a-zA-Z0-9\u{00C0}-\u{024F}\u{1E00}-\u{1EFF}\]\)"”'’]"#;

static LINEWRAP_BEFORE_PUNCT: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile_pattern(&format!(r"({WORD_CHAR_CLASS})[\t ]*\r?\n[\t ]*([,;:?!])[ \t]*"), false)
});
static LINEWRAP_BEFORE_PERIOD: LazyLock<CompiledPattern> = LazyLock::new(|| {
    compile_pattern(&format!(r"({WORD_CHAR_CLASS})[\t ]*\r?\n[\t ]*\.(?!\.)[ \t]*"), false)
});
static STRAY_SPACE_BEFORE_PUNCT: LazyLock<CompiledPattern> =
    LazyLock::new(|| compile_pattern(&format!(r"({WORD_CHAR_CLASS})[ ]+([,;:?!])[ \t]*"), false));
static STRAY_SPACE_BEFORE_PERIOD: LazyLock<CompiledPattern> =
    LazyLock::new(|| compile_pattern(&format!(r"({WORD_CHAR_CLASS})[ ]+\.(?!\.)[ \t]*"), false));

fn replace_all(compiled: &CompiledPattern, text: &str, replacement: &str) -> String {
    match compiled {
        CompiledPattern::Fast(re) => re.replace_all(text, replacement).into_owned(),
        // `fancy_regex::Regex::replace_all` panics on a backtracking failure
        // (e.g. `RuntimeError::BacktrackLimitExceeded`), and that panic
        // crosses an `extern "C"` FFI boundary further up the call stack (the
        // WebView2 IPC callback), which aborts the whole process instead of
        // unwinding. So this must never panic: fall back to the untouched
        // text instead.
        CompiledPattern::Fancy(re) => match re.try_replacen(text, 0, replacement) {
            Ok(result) => result.into_owned(),
            Err(_) => text.to_string(),
        },
    }
}

/// Heals Folio-era wrap breaks, split words/contractions, and the dictionary
/// of known broken Sanskrit/IAST terms, in the same order as v2.
pub fn heal(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    if text.trim_start().starts_with('{') {
        return text.to_string();
    }

    let mut healed = replace_all(&HYPHEN_WRAP, text, "$1$2");

    for (rule, re) in DICTIONARY_RULES.iter().zip(DICTIONARY_COMPILED.iter()) {
        healed = replace_all(re, &healed, rule.replacement);
    }

    healed = replace_all(&TRAILING_M_SPLIT, &healed, "${1}m");

    healed = replace_all(&CONTRACTION_NEWLINE, &healed, "$1$2$3");
    healed = replace_all(&CONTRACTION_SPACE, &healed, "$1$2$3");

    healed = replace_all(&LINEWRAP_BEFORE_PUNCT, &healed, "$1$2 ");
    healed = replace_all(&LINEWRAP_BEFORE_PERIOD, &healed, "$1. ");

    healed = replace_all(&STRAY_SPACE_BEFORE_PUNCT, &healed, "$1$2 ");
    healed = replace_all(&STRAY_SPACE_BEFORE_PERIOD, &healed, "$1. ");

    healed
}

/// Convenience wrapper for `Option<String>` fields straight off a DB row.
pub fn heal_opt(text: Option<String>) -> Option<String> {
    text.map(|s| heal(&s))
}
