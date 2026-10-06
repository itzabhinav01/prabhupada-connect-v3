const COMBINING_MARKS_RE = /[̀-ͯ]/g

/**
 * Common Anglicized spellings for IAST diacritics — not a literal
 * diacritic-strip. A strip alone (ṛ→r, ṣ→s) turns "Kṛṣṇa" into "krsna",
 * which is NOT what people actually type; the popular English spelling
 * is "Krishna" (ṛ→"ri", ṣ→"sh"), so that's the target these expand to.
 * Multi-character targets mean normalized text is no longer the same
 * length as the input — see `normalizeIastWithOffsets` for how callers
 * that need to highlight the original text account for that.
 */
const EXPANSION_MAP: Record<string, string> = {
  ś: 'sh',
  ṣ: 'sh',
  ṛ: 'ri',
  ṝ: 'ri',
  ñ: 'n',
  ṅ: 'n',
  ṇ: 'n',
  ṁ: 'm',
  ṃ: 'm',
  ḥ: 'h',
  ṭ: 't',
  ḍ: 'd',
}

/** Strips a single character's own combining diacritics (e.g. "ā" → "a"),
 * for the vowels/letters not in `EXPANSION_MAP` above. */
function stripDiacritic(ch: string): string {
  const stripped = ch.normalize('NFD').replace(COMBINING_MARKS_RE, '')
  return stripped || ch
}

/**
 * Normalizes IAST-transliterated Sanskrit (and plain text) to lowercase
 * ASCII for diacritic-insensitive matching, so typing "krishna" matches
 * "Kṛṣṇa", "caitanya" matches "Caitanya", "bhagavan" matches "Bhagavān".
 * Text-only — use `normalizeIastWithOffsets` instead when the caller needs
 * to map a match back onto the original (un-normalized) string, e.g. to
 * set a DOM `Range`.
 */
export function normalizeIast(text: string): string {
  const lower = text.toLowerCase()
  let result = ''
  for (const ch of lower) {
    result += EXPANSION_MAP[ch] ?? stripDiacritic(ch)
  }
  return result
}

/**
 * Same normalization as `normalizeIast`, but also returns `offsetMap`:
 * `offsetMap[i]` is the index in the original string that normalized
 * character `i` came from (with one trailing sentinel entry equal to the
 * original string's length, for computing a match's end boundary). Needed
 * because expansions like ṛ→"ri" make the normalized string longer than
 * the original, so match offsets found in the normalized text can't be
 * used directly as offsets into the original — this map translates them.
 */
export function normalizeIastWithOffsets(text: string): { text: string; offsetMap: number[] } {
  const lower = text.toLowerCase()
  let result = ''
  const offsetMap: number[] = []
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]
    const expanded = EXPANSION_MAP[ch] ?? stripDiacritic(ch)
    for (const outCh of expanded) {
      result += outCh
      offsetMap.push(i)
    }
  }
  offsetMap.push(lower.length)
  return { text: result, offsetMap }
}
