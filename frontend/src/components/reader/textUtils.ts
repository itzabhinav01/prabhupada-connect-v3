import { formatQuotedVerse, isQuotedVerse } from './purportFormatting'

export function normalizeProseWhitespace(text: string): string {
  return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** Strips leading section codes like `"SSR 3a: "`, `"TQE 2a: "`, `"JSD 5.3: "` or `"5. "` for duplicate-heading comparison. */
function bareHeadingTitle(text: string): string {
  return text
    .replace(/^(?:[A-Za-zĀĪŪŚṢṚḶāīūśṣṛḷ]{2,10}\s+)?\d+[a-z]?(?:\.\d+[a-z]?)*\s*[.:]\s*/iu, '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
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

  // Deduplicate consecutive repeated headings (e.g. "SSR 3a: The Immortal Nectar..."
  // followed immediately by "The Immortal Nectar...", "Eternal Perfection" repeated twice,
  // or "NBS 51" followed by "SŪTRA 51" followed by "SŪTRA")
  const cleanTitle = recordTitle ? bareHeadingTitle(recordTitle) : null
  const deduped: string[] = []

  for (let i = 0; i < formatted.length; i++) {
    const cur = formatted[i]
    const bareCur = bareHeadingTitle(cur)

    if (i === 0 && cleanTitle && cur.length <= 90 && !cur.includes('\n')) {
      if (bareCur === cleanTitle || cur.toLowerCase() === cleanTitle) {
        continue
      }
    }

    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1]
      const barePrev = bareHeadingTitle(prev)

      if (prev.length <= 90 && cur.length <= 90 && !prev.includes('\n') && !cur.includes('\n')) {
        // 1. Exact duplicate or bare title match
        if (
          prev.toLowerCase() === cur.toLowerCase() ||
          (barePrev.length > 3 && barePrev === cur.toLowerCase()) ||
          (bareCur.length > 3 && bareCur === prev.toLowerCase()) ||
          (barePrev.length > 3 && bareCur.length > 3 && barePrev === bareCur)
        ) {
          continue
        }

        // 2. NBS: "NBS 51" followed by "SŪTRA 51" or "SŪTRA 51" followed by "SŪTRA"
        if (/^NBS\s*\d+$/i.test(prev) && /^SŪTRA\s*\d+$/i.test(cur)) {
          deduped[deduped.length - 1] = cur // keep "SŪTRA 51"
          continue
        }
        if (/^SŪTRA\s*\d+$/i.test(prev) && /^SŪTRA$/i.test(cur)) {
          continue
        }
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
