// Derives a navigable (bookKey, chapterKey) pair from a bare RecordKey,
// e.g. "BG-2-13" -> { bookKey: "BG", chapterKey: "BG::2" } or
// "SB-1.1-10" -> { bookKey: "SB", chapterKey: "SB::1.1" }.
//
// This is a direct mirror of corpus.rs's TOC-building pipeline
// (`strip_book_prefix` -> `book_specific_group_override` /
// `parse_chapter_and_verse`) — verified against the real corpus database's
// RecordKey data for every case below, including by diffing against the
// actual `get_book_toc` output, not an independent guess:
//
//  - DI (Śrī Caitanya-caritāmṛta — Ādi-līlā) stores its verse RecordKeys
//    under the diacritic prefix "ĀDI-", not the ASCII book key "DI-" every
//    other book uses — mirrors `record_key_prefix`. Its front-matter keys
//    ("DI-FOREWORD" etc.) don't start with "ĀDI-" either, so corpus.rs's
//    own prefix-strip falls through unstripped for them too, and the
//    chapter path ends up being the *whole* original key (e.g.
//    "DI::DI-FOREWORD", confirmed live) — reproduced here deliberately,
//    not a typo.
//  - NOI/ISO/MM have hand-written chapter-grouping overrides in
//    `book_specific_group_override` that the generic parser can't
//    reconstruct on its own: `NOI-(NONE)-VERSE-N` -> "NOI::TEXT-N",
//    `NOI-(NONE)-PREFACE` -> "NOI::PREFACE", `ISO-(NONE)-MANTRA-N` ->
//    "ISO::MANTRA-N", `ISO-(NONE)-INTRODUCTION` -> "ISO::INTRO",
//    `ISO-(NONE)-INVOCATION` -> "ISO::INVOCATION", and `MM-(NONE)-N` (or a
//    combined "N-M" key) -> "MM::VERSE-{last digit segment}". Any other
//    MM/ISO/NOI record (front matter, excluded alternate editions) falls
//    through to the generic path below, matching corpus.rs exactly.
//  - Every other book's suffix is split at its *first* dash, and the part
//    after it is only treated as a verse number (stripped off the chapter
//    path) when it actually looks like one (`^\d+(-\d+)?[A-Za-z]?$`,
//    mirroring `verse_suffix_pattern`) — otherwise the whole suffix is kept
//    as the chapter path, exactly like `parse_chapter_and_verse`.

const VERSE_SUFFIX_RE = /^\d+(-\d+)?[A-Za-z]?$/
const ADI_PREFIX = 'ĀDI-'

export function deriveNavigationTarget(recordKey: string): { bookKey: string; chapterKey: string } | null {
  let bookKey: string
  let suffix: string

  if (recordKey.startsWith(ADI_PREFIX)) {
    bookKey = 'DI'
    suffix = recordKey.slice(ADI_PREFIX.length)
  } else {
    const dashIdx = recordKey.indexOf('-')
    if (dashIdx === -1) return null
    bookKey = recordKey.slice(0, dashIdx)
    // DI's own front-matter keys never match the "ĀDI-" prefix above, so
    // corpus.rs's prefix strip fails for them too — it falls back to
    // parsing the chapter path out of the *full* original key.
    suffix = bookKey === 'DI' ? recordKey : recordKey.slice(dashIdx + 1)
  }

  if (bookKey === 'NOI') {
    const verseMatch = suffix.match(/^\(NONE\)-VERSE-(\d+)$/)
    if (verseMatch) return { bookKey, chapterKey: `NOI::TEXT-${verseMatch[1]}` }
    if (suffix === '(NONE)-PREFACE') return { bookKey, chapterKey: 'NOI::PREFACE' }
  }
  if (bookKey === 'ISO') {
    const mantraMatch = suffix.match(/^\(NONE\)-MANTRA-(\d+)$/)
    if (mantraMatch) return { bookKey, chapterKey: `ISO::MANTRA-${mantraMatch[1]}` }
    if (suffix === '(NONE)-INTRODUCTION') return { bookKey, chapterKey: 'ISO::INTRO' }
    if (suffix === '(NONE)-INVOCATION') return { bookKey, chapterKey: 'ISO::INVOCATION' }
  }
  if (bookKey === 'MM') {
    const lastSegment = suffix.slice(suffix.lastIndexOf('-') + 1)
    if (/^\d+$/.test(lastSegment)) return { bookKey, chapterKey: `MM::VERSE-${lastSegment}` }
  }

  const dashIdx2 = suffix.indexOf('-')
  if (dashIdx2 !== -1) {
    const left = suffix.slice(0, dashIdx2)
    const right = suffix.slice(dashIdx2 + 1)
    if (VERSE_SUFFIX_RE.test(right)) {
      return { bookKey, chapterKey: `${bookKey}::${left}` }
    }
  }
  return { bookKey, chapterKey: `${bookKey}::${suffix}` }
}
