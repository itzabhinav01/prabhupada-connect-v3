import { formatQuotedVerse, isQuotedVerse } from './purportFormatting'

export function normalizeProseWhitespace(text: string): string {
  return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** Strips leading section codes like `"JSD 5.3: "` or `"5. "` for duplicate-heading comparison. */
function bareHeadingTitle(text: string): string {
  return text
    .replace(/^(?:[A-ZĀĪŪŚṢṚḶ]{2,10}\s+)?\d+(?:\.\d+)*\s*[.:]\s*/iu, '')
    .trim()
    .toLowerCase()
}

export function splitPurportParagraphs(text: string, recordTitle?: string | null): string[] {
  const rawBlocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  const formatted: string[] = []
  for (const block of rawBlocks) {
    if (isQuotedVerse(block)) {
      const verseText = formatQuotedVerse(block)
      // If the previous block was a 2-line half-verse and this block is also a 2-line half-verse,
      // merge them into a single 4-line śloka block!
      const prev = formatted[formatted.length - 1]
      if (
        prev &&
        isQuotedVerse(prev) &&
        prev.split('\n').length === 2 &&
        verseText.split('\n').length === 2
      ) {
        formatted[formatted.length - 1] = `${prev}\n${verseText}`
        continue
      }
      formatted.push(verseText)
    } else {
      formatted.push(normalizeProseWhitespace(block))
    }
  }

  // Deduplicate consecutive repeated headings (e.g. "JSD 5.3: Making Friends with the Mind"
  // followed immediately by "Making Friends with the Mind", or repeated chapter title at index 0)
  const cleanTitle = recordTitle?.trim().toLowerCase()
  const deduped: string[] = []

  for (let i = 0; i < formatted.length; i++) {
    const cur = formatted[i]
    if (i === 0 && cleanTitle && cur.length <= 90 && !cur.includes('\n')) {
      const bareCur = bareHeadingTitle(cur)
      if (bareCur === cleanTitle || cur.toLowerCase() === cleanTitle) {
        continue
      }
    }
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1]
      if (
        prev.length <= 90 &&
        cur.length <= 90 &&
        !prev.includes('\n') &&
        !cur.includes('\n') &&
        (prev.toLowerCase() === cur.toLowerCase() || bareHeadingTitle(prev) === cur.toLowerCase())
      ) {
        continue
      }
    }
    deduped.push(cur)
  }

  return deduped
}

export interface SynonymPair {
  lemma: string
  gloss: string
}

export function parseSynonyms(text: string): SynonymPair[] {
  const normalized = normalizeProseWhitespace(text)
  return normalized
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const match = pair.match(/^(.+?)\s*[—–-]\s*(.+)$/)
      if (match) return { lemma: match[1].trim(), gloss: match[2].trim() }
      return { lemma: pair, gloss: '' }
    })
}
