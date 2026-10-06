use prabhupadaconnectv3_lib::utils::typography::heal;

#[test]
fn heals_hyphenated_word_wrap() {
    assert_eq!(heal("This is transcen-\ndental knowledge."), "This is transcendental knowledge.");
}

#[test]
fn heals_dictionary_sanskrit_splits() {
    assert_eq!(heal("Lord Kṛṣ ṇa spoke to Arjuna."), "Lord Kṛṣṇa spoke to Arjuna.");
    assert_eq!(heal("the Bhaga vān said"), "the Bhagavān said");
    assert_eq!(heal("Lord Nārāya ṇa is the source."), "Lord Nārāyaṇa is the source.");
    assert_eq!(heal("The Pāṇ ḍavas were victorious."), "The Pāṇḍavas were victorious.");
    assert_eq!(heal("They are called Vaiṣṇ avas."), "They are called Vaiṣṇavas.");
}

#[test]
fn heals_persona_lity_split() {
    // Spotted live in a Phase 4 verification pass; approved in Phase 5 as an
    // extension beyond the literal v2 dictionary.
    assert_eq!(
        heal("kṛṣṇaḥ — the Persona lity of Godhead"),
        "kṛṣṇaḥ — the Personality of Godhead"
    );
    assert_eq!(heal("his own persona lity was hidden"), "his own personality was hidden");
}

#[test]
fn heals_trailing_m_split_algorithmically() {
    // Spotted live twice (BG 2.13's "yauvana m", BG 2.1's "ikṣaṇa m") — a
    // systemic pattern, so this is a general rule rather than more one-off
    // dictionary entries.
    assert_eq!(heal("kaumāram — boyhood; yauvana m — youth"), "kaumāram — boyhood; yauvanam — youth");
    assert_eq!(heal("ikṣaṇa m — eyes; viṣīdantam — lamenting"), "ikṣaṇam — eyes; viṣīdantam — lamenting");
}

#[test]
fn trailing_m_split_does_not_touch_unit_abbreviations() {
    // The fix must not eat legitimate "5 m" (five metres) style text — the
    // prefix character class is IAST-letters-only, so a digit can't match.
    assert_eq!(heal("the wall is 5 m high"), "the wall is 5 m high");
    assert_eq!(heal("a 10 m rope"), "a 10 m rope");
}

#[test]
fn dictionary_rule_is_case_insensitive_but_replacement_is_literal() {
    // Ported verbatim from v2: the match is case-insensitive (`/gi`) but the
    // replacement string is a fixed literal, so an all-caps source term
    // still comes out lowercase — this is a quirk of the original engine,
    // not something this port should "fix".
    assert_eq!(heal("He was NOTORI OUS for it."), "He was notorious for it.");
}

#[test]
fn heals_split_contractions_across_newline_and_space() {
    assert_eq!(heal("don\n't stop"), "don't stop");
    assert_eq!(heal("don 't stop"), "don't stop");
    assert_eq!(heal("it\n's here"), "it's here");
    assert_eq!(heal("we 'll go"), "we'll go");
}

#[test]
fn heals_linewrap_before_punctuation() {
    assert_eq!(heal("He went to India\r\n. He returned."), "He went to India. He returned.");
    assert_eq!(heal("Wait\n, then proceed"), "Wait, then proceed");
}

#[test]
fn heals_stray_whitespace_before_punctuation() {
    assert_eq!(heal("Goloka  , on the other hand"), "Goloka, on the other hand");
    assert_eq!(heal("Krishna   . Arjuna listened."), "Krishna. Arjuna listened.");
}

#[test]
fn does_not_mangle_ellipsis() {
    let healed = heal("He paused\r\n...and continued.");
    assert!(!healed.contains(". .."), "should not have split the ellipsis: {healed:?}");
}

#[test]
fn empty_and_plain_text_are_unaffected() {
    assert_eq!(heal(""), "");
    assert_eq!(heal("Nothing to heal here."), "Nothing to heal here.");
}

#[test]
fn heals_combination_in_realistic_purport_text() {
    let raw = "Since every living entity is an individual soul, each is changing his body every moment\r\n, manifesting sometimes as a child\r\n, sometimes as a youth\r\n, and sometimes as an old man\r\n. Yet the same spirit soul is there and does not undergo any change. This is confirmed by the Bhaga vān in many places, and the Vaiṣṇ avas accept this without doubt.";
    let healed = heal(raw);
    assert!(!healed.contains("\r\n"), "no stray line-wraps should remain: {healed:?}");
    assert!(healed.contains("Bhagavān"));
    assert!(healed.contains("Vaiṣṇavas"));
    assert!(healed.contains("child, sometimes"));
}

/// Regression test for a real production hang: BS-5-38's purport (a long
/// paragraph with an embedded `[SB 1.7.4]` cross-reference) used to take
/// ~2ms per dictionary rule under `fancy_regex`'s backtracking VM — fine in
/// isolation, but multiplied across every healed field of every record in a
/// freshly-opened chapter, it made the whole app appear to hang. Routing the
/// ~50 non-lookaround rules through the plain `regex` crate instead should
/// keep a single `heal()` call on text this size to low-single-digit
/// milliseconds, not hundreds.
#[test]
fn heals_a_long_real_purport_without_hanging() {
    let purport = "The Śyāmasundara form of Kṛṣṇa is His inconceivable simultaneous personal and impersonal self-contradictory form. True devotees see that form \r\nin their purified hearts under the influence of devotional trance. The form Śyāma is not the blue color visible in the mundane world but is the transcendental variegated color affording eternal bliss, and is not visible to the mortal eye. On a consideration of the trance of Vyāsadeva as in the śloka, bhakti-yogena manasi etc. [\r\nSB 1.7.4], it will be clear that the form of Śrī Kṛṣṇa is the full Personality of Godhead and can only be visible in the heart of a true devotee, which is the only true seat in the state of trance under the influence of devotion. When Kṛṣṇa manifested Himself in Vraja, both the devotees and nondevotees saw Him with this very eye; but only the devotees cherished Him, eternally present in Vraja, as the priceless jewel of their heart.";

    let _ = heal(purport); // force one-time regex compilation first; that cost is amortized in the real app

    let start = std::time::Instant::now();
    let healed = heal(purport);
    let elapsed = start.elapsed();

    assert!(healed.contains("SB 1.7.4"));
    assert!(
        elapsed.as_millis() < 50,
        "heal() took {elapsed:?} on a single realistic purport — regression toward the fancy_regex hang"
    );
}
