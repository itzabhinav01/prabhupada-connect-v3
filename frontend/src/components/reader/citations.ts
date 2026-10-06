// Detects scripture citations embedded in purport/translation prose (e.g.
// "Bg. 18.66", "Bhagavad-gītā [9.26]", "SB 10.9.1-2", "[Cc. Madhya 20.108]",
// "[Īśo Invocation]", "[Īśo mantra 1]") and resolves each to a navigable target.

export interface ResolvedCitation {
  raw: string
  bookKey: string
  chapterKey: string
  recordKey: string
  label: string
}

const BOOK_NAMES = [
  'CC\\.?\\s+(?:Ādi|Adi|Madhya|Antya)(?:-l[iī]l[aā])?,?',
  'CC\\.?,?',
  'Caitanya-carit[aā]m[rṛ]ta,?\\s*[([\\\\\\[]?\\s*(?:Ādi|Adi|Madhya|Antya)(?:-l[iī]l[aā])?,?',
  'Bhagavad-g[iī]t[aā](?:\\s+As\\s+It\\s+Is)?,?',
  'Bg\\.?,?',
  'Śrīmad\\s*-\\s*Bhāgavatam,?',
  'Srimad\\s*-\\s*Bhagavatam,?',
  'Bhāgavatam,?',
  'SB\\.?,?',
  'Śrī\\s+Īśopaniṣad,?',
  'Īśopaniṣad,?',
  'Isopanisad,?',
  'Īśo\\.?,?',
  'Iso\\.?,?',
  'The\\s+Nectar\\s+of\\s+Instruction,?',
  'Nectar\\s+of\\s+Instruction,?',
  'NOI\\.?,?',
  'The\\s+Nectar\\s+of\\s+Devotion,?',
  'Nectar\\s+of\\s+Devotion,?',
  'NOD\\.?,?',
  'Teachings\\s+of\\s+Lord\\s+Caitanya,?',
  'TLC\\.?,?',
  'Brahma-sa[mṁ]hit[aā],?',
  'Bs\\.?,?',
  'SPS\\.?,?',
  'Srila\\s+Prabhupada\\s+Slokas,?',
  'Śrīla\\s+Prabhupāda\\s+Ślokas,?',
].join('|')

const CITATION_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:@)?(${BOOK_NAMES})\\s*[([\\\\\\[]?\\s*(?:(Invocation|Introduction)|(?:Chapter\\s+|Mantra\\s+|Text\\s+|Verse\\s+)?(\\d+)(?:\\s*[.:]\\s*(\\d+))?(?:\\s*[.:]\\s*(\\d+))?(?:\\s*[-–]\\s*(\\d+))?)\\s*[)\\\\\\]]?`,
  'giu',
)

// Matches standalone bracketed/parenthesized references like `[9.26]`, `[14.4]`, `[1.2.8]`, `(18.66)`
const BARE_BRACKET_REF_RE = /([([\[])\s*(\d+)\.(\d+)(?:\.(\d+))?(?:[-–](\d+))?\s*([)\]])/gu

function buildKey(bookKey: string, chapterPath: string, verseSuffix?: string): {
  chapterKey: string
  recordKey: string
} {
  const chapterKey = `${bookKey}::${chapterPath}`
  // DI's RecordKeys in prabhupada_corpus.db use the diacritic prefix `ĀDI-`
  const recordPrefix = bookKey === 'DI' ? 'ĀDI' : bookKey
  const recordKey = verseSuffix
    ? `${recordPrefix}-${chapterPath}-${verseSuffix}`
    : `${recordPrefix}-${chapterPath}`
  return { chapterKey, recordKey }
}

function resolveOne(
  bookToken: string,
  specialWord: string | undefined,
  n1: string | undefined,
  n2: string | undefined,
  n3: string | undefined,
  n4: string | undefined,
  raw: string,
): ResolvedCitation | null {
  const bt = bookToken.trim().toLowerCase()

  if (bt.startsWith('iso') || bt.startsWith('īśo') || bt.includes('isopanisad') || bt.includes('īśopaniṣad')) {
    if (specialWord) {
      const upper = specialWord.toUpperCase()
      const keyName = upper === 'INVOCATION' ? 'INVOCATION' : 'INTRO'
      return {
        raw,
        bookKey: 'ISO',
        chapterKey: `ISO::${keyName}`,
        recordKey: `ISO-(NONE)-${upper}`,
        label: raw,
      }
    }
    if (!n1) return null
    const chapterKey = `ISO::MANTRA-${n1}`
    const recordKey = `ISO-(NONE)-MANTRA-${n1}`
    return { raw, bookKey: 'ISO', chapterKey, recordKey, label: raw }
  }

  if (!n1) return null

  if (bt.startsWith('cc') || bt.includes('caitanya-carit')) {
    const bookKey = bt.includes('madhya')
      ? 'MADHYA'
      : bt.includes('antya')
        ? 'ANTYA'
        : bt.includes('adi') || bt.includes('ādi')
          ? 'DI'
          : 'MADHYA'
    if (!bookKey || !n2) return null
    const verseSuffix = n4 ? `${n2}-${n4}` : n2
    const { chapterKey, recordKey } = buildKey(bookKey, n1, verseSuffix)
    return { raw, bookKey, chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('bg') || bt.startsWith('bhagavad-g')) {
    if (!n2) return null
    const verseSuffix = n4 ? `${n2}-${n4}` : n2
    const { chapterKey, recordKey } = buildKey('BG', n1, verseSuffix)
    return { raw, bookKey: 'BG', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('sb') || bt.includes('bhagavatam') || bt.includes('bhāgavatam')) {
    if (!n2 || !n3) return null
    const chapterPath = `${n1}.${n2}`
    const verseSuffix = n4 ? `${n3}-${n4}` : n3
    const { chapterKey, recordKey } = buildKey('SB', chapterPath, verseSuffix)
    return { raw, bookKey: 'SB', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('brahma-sa') || bt.startsWith('bs')) {
    if (!n2) return null
    const verseSuffix = n4 ? `${n2}-${n4}` : n2
    const { chapterKey, recordKey } = buildKey('BS', n1, verseSuffix)
    return { raw, bookKey: 'BS', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('sps') || bt.includes('prabhupada slokas') || bt.includes('prabhupāda ślokas')) {
    if (!n2) return null
    const { chapterKey, recordKey } = buildKey('SPS', n1, n2)
    return { raw, bookKey: 'SPS', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('noi') || bt.includes('nectar of instruction')) {
    const chapterKey = `NOI::TEXT-${n1}`
    const recordKey = `NOI-(NONE)-VERSE-${n1}`
    return { raw, bookKey: 'NOI', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('nod') || bt.includes('nectar of devotion')) {
    const { chapterKey, recordKey } = buildKey('NOD', n1)
    return { raw, bookKey: 'NOD', chapterKey, recordKey, label: raw }
  }

  if (bt.startsWith('tlc') || bt.includes('teachings of lord caitanya')) {
    const { chapterKey, recordKey } = buildKey('TLC', n1)
    return { raw, bookKey: 'TLC', chapterKey, recordKey, label: raw }
  }

  return null
}

export interface CitationSegment {
  kind: 'text' | 'citation'
  text: string
  citation?: ResolvedCitation
}

/** Splits `text` into plain-text and citation segments, in order. */
export function segmentCitations(text: string): CitationSegment[] {
  const matchedRanges: { start: number; end: number; raw: string; citation: ResolvedCitation }[] = []

  for (const match of text.matchAll(CITATION_RE)) {
    const [raw, bookToken, specialWord, n1, n2, n3, n4] = match
    const index = match.index ?? 0
    const resolved = resolveOne(bookToken, specialWord, n1, n2, n3, n4, raw)
    if (!resolved) continue
    matchedRanges.push({ start: index, end: index + raw.length, raw, citation: resolved })
  }

  // Second pass: resolve bare bracketed references like `[1.2.8]` (SB) or `[14.4]` (BG when Gita is mentioned or valid BG chapter.verse)
  const hasGitaContext = /bhagavad-g[iī]t[aā]|\bg[iī]t[aā]\b|\bbg\b/iu.test(text)
  for (const match of text.matchAll(BARE_BRACKET_REF_RE)) {
    const [raw, _open, n1, n2, n3, n4] = match
    const index = match.index ?? 0
    const end = index + raw.length
    if (matchedRanges.some((r) => index < r.end && end > r.start)) continue

    const c1 = Number(n1)
    const c2 = Number(n2)
    if (n3) {
      // 3-level reference [Canto.Chapter.Verse] -> Śrīmad-Bhāgavatam if Canto is 1..12
      if (c1 >= 1 && c1 <= 12 && c2 >= 1 && c2 <= 90) {
        const chapterPath = `${n1}.${n2}`
        const verseSuffix = n4 ? `${n3}-${n4}` : n3
        const { chapterKey, recordKey } = buildKey('SB', chapterPath, verseSuffix)
        matchedRanges.push({
          start: index,
          end,
          raw,
          citation: { raw, bookKey: 'SB', chapterKey, recordKey, label: `SB ${n1}.${n2}.${verseSuffix}` },
        })
      }
    } else if (hasGitaContext && c1 >= 1 && c1 <= 18 && c2 >= 1 && c2 <= 78) {
      const verseSuffix = n4 ? `${n2}-${n4}` : n2
      const { chapterKey, recordKey } = buildKey('BG', n1, verseSuffix)
      matchedRanges.push({
        start: index,
        end,
        raw,
        citation: { raw, bookKey: 'BG', chapterKey, recordKey, label: `BG ${n1}.${verseSuffix}` },
      })
    }
  }

  matchedRanges.sort((a, b) => a.start - b.start)

  const segments: CitationSegment[] = []
  let lastIndex = 0
  for (const item of matchedRanges) {
    if (item.start < lastIndex) continue
    if (item.start > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, item.start) })
    }
    segments.push({ kind: 'citation', text: item.raw, citation: item.citation })
    lastIndex = item.end
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) })
  }

  return segments
}
