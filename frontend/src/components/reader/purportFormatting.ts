// Classifies each purport paragraph so it can be rendered with the right
// structural treatment (quoted 4-line verse, dialogue turn, bold section
// subheading, or plain prose), and formats flattened Sanskrit verses into
// traditional 4-line śloka (pāda) layout matching vedabase.io.

const IAST_DIACRITICS = /[āīūṛṝḷḹēōñṅṇṃṁḥśṣṭḍ]/gi

const ENGLISH_PROSE_WORDS =
  /\b(the|and|that|this|with|from|which|because|however|therefore|when|where|what|there|their|they|have|has|had|will|would|should|could|about|into|only|also|very|much|every|other|some|such|must|cannot)\b/i

/** True when a paragraph is a quoted Sanskrit/Bengali śloka in Roman transliteration. */
export function isQuotedVerse(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > 550) return false
  if (ENGLISH_PROSE_WORDS.test(trimmed)) return false
  const alphaChars = trimmed.match(/[A-Za-zāīūṛṝḷḹēōñṅṇṃṁḥśṣṭḍ]/g) ?? []
  if (alphaChars.length < 12) return false
  const diacriticChars = trimmed.match(IAST_DIACRITICS) ?? []
  return diacriticChars.length / alphaChars.length > 0.11
}

/** Counts Sanskrit/Bengali vowel nuclei (syllables) in a transliterated word. */
function countSyllablesInWord(word: string): number {
  const matches = word.toLowerCase().match(/ai|au|[aāiīuūṛṝḷḹeēoō]/g)
  return matches ? matches.length : word.length > 0 ? 1 : 0
}

/** Splits an array of words into `numLines` balanced lines by Sanskrit syllable count. */
function splitWordsBySyllables(words: string[], numLines: number): string[] {
  if (words.length < numLines) return [words.join(' ')]
  const sylls = words.map(countSyllablesInWord)
  const total = sylls.reduce((a, b) => a + b, 0)
  if (total === 0) return [words.join(' ')]

  const lines: string[] = []
  let startIdx = 0
  let cumulative = 0

  for (let lineIdx = 1; lineIdx < numLines; lineIdx++) {
    const target = (total * lineIdx) / numLines
    let bestEnd = startIdx + 1
    let bestDist = Infinity

    // Leave at least (numLines - lineIdx) words for remaining lines
    const maxEnd = words.length - (numLines - lineIdx)
    let running = cumulative
    for (let i = startIdx; i < maxEnd; i++) {
      running += sylls[i]
      const dist = Math.abs(running - target)
      if (dist <= bestDist) {
        bestDist = dist
        bestEnd = i + 1
      } else {
        break
      }
    }

    lines.push(words.slice(startIdx, bestEnd).join(' '))
    cumulative += sylls.slice(startIdx, bestEnd).reduce((a, b) => a + b, 0)
    startIdx = bestEnd
  }

  lines.push(words.slice(startIdx).join(' '))
  return lines
}

/** Heals OCR/Folio word wraps inside a quoted Sanskrit verse and formats it
 * into 4 balanced śloka lines (pādas) when stored as 1 or 2 flat lines. */
export function formatQuotedVerse(raw: string): string {
  const healed = raw
    // Heal hyphenated line wraps like "bhakty-\nupahṛtam" -> "bhakty-upahṛtam"
    .replace(/-\s*\r?\n\s*/g, '-')
    // Heal stray single-char diacritic wraps like "yogina\nḥ" -> "yoginaḥ"
    .replace(/\r?\n\s*([ḥṁṃm])(?=\s|$)/gi, '$1')
    // Heal known split Sanskrit compounds in JSD/SSR/QFE
    .replace(/\bprayatātm\s+anaḥ\b/gi, 'prayatātmanaḥ')
    .replace(/\bmānā\s+pamānayoḥ\b/gi, 'mānāpamānayoḥ')
    .replace(/\bloṣṭrāśm\s+a-kāñcanaḥ\b/gi, 'loṣṭrāśma-kāñcanaḥ')
    .replace(/\bbhūta-mah\s+eśvaram\b/gi, 'bhūta-maheśvaram')
    .trim()

  const rawLines = healed
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  // Already 3 or 4+ verse lines
  if (rawLines.length >= 3) {
    return rawLines.join('\n')
  }

  // 2 half-verses (each containing 2 pādas): split each half-verse into 2 lines -> 4 lines
  if (rawLines.length === 2) {
    const w0 = rawLines[0].split(/\s+/)
    const w1 = rawLines[1].split(/\s+/)
    const s0 = w0.reduce((acc, w) => acc + countSyllablesInWord(w), 0)
    const s1 = w1.reduce((acc, w) => acc + countSyllablesInWord(w), 0)
    if (s0 >= 13 && s1 >= 13 && w0.length >= 3 && w1.length >= 3) {
      return [...splitWordsBySyllables(w0, 2), ...splitWordsBySyllables(w1, 2)].join('\n')
    }
    return rawLines.join('\n')
  }

  // Single flat line: split into 4 pādas (or 2 lines for a short half-śloka)
  const single = rawLines[0] ?? ''
  const words = single.split(/\s+/).filter(Boolean)
  const totalSyllables = words.reduce((acc, w) => acc + countSyllablesInWord(w), 0)

  if (words.length >= 6 && totalSyllables >= 24) {
    return splitWordsBySyllables(words, 4).join('\n')
  }
  if (words.length >= 4 && totalSyllables >= 12) {
    return splitWordsBySyllables(words, 2).join('\n')
  }
  return single
}

// Explicit code headings like "JSD 5.3: Making Friends with the Mind", "RTW 2.1: ...", "2.1 Everyone Can See God"
const CODE_HEADING_RE = /^(?:[A-ZĀĪŪŚṢṚḶ]{2,10}\s+)?\d+(?:\.\d+)+\s*:?\s+\S/u

// Numbered chapter headings like "5. Yoga and Meditation"
const NUMBERED_HEADING_RE = /^\d+\.\s+[A-ZŚĀĪŪṚḶ][^.!?]+$/u

const SIGN_OFF_WORDS =
  /\b(18\d\d|19\d\d|20\d\d|Publishers?|Editors?|Author|Swami|Goswami|Gosvāmī|Translated|January|February|March|April|May|June|July|August|September|October|November|December)\b/i

const MINOR_TITLE_WORDS = new Set([
  'of',
  'the',
  'in',
  'on',
  'to',
  'for',
  'and',
  'or',
  'a',
  'an',
  'with',
  'from',
  'by',
  'as',
  'at',
  'into',
  'vs',
  'vs.',
  'is',
  'are',
])

/** A dialogue turn: "Speaker Name: spoken text...". */
const DIALOGUE_RE = /^([A-ZŚĀĪŪṚḶṄÑṆṬḌṢ][\p{L}.'’-]*(?:\s+[A-ZŚĀĪŪṚḶṄÑṆṬḌṢ][\p{L}.'’-]*){0,3}):\s+(.+)$/su

export interface DialogueMatch {
  speakerEnd: number
}

function matchDialogue(text: string): DialogueMatch | null {
  if (CODE_HEADING_RE.test(text)) return null
  const m = DIALOGUE_RE.exec(text)
  if (!m) return null
  const speaker = m[1]
  if (speaker.length > 40 || /\d/.test(speaker)) return null
  return { speakerEnd: speaker.length + 1 }
}

/** Detects chapter/section subheadings embedded in prose across all books:
 *  1. Explicit numbered section headings (`JSD 5.3: Making Friends with the Mind`, `2.1 Everyone Can See God`)
 *  2. Predominantly uppercase headings
 *  3. Standalone Title-Case section headings (`Making Friends with the Mind`, `Understanding the Soul`) */
export function isSubheading(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > 85 || trimmed.includes('\n')) return false

  // 1. Explicit section code heading like "JSD 5.3: Making Friends with the Mind" or "2.1 Everyone Can See God"
  if (CODE_HEADING_RE.test(trimmed)) return true
  if (NUMBERED_HEADING_RE.test(trimmed) && trimmed.length <= 70) return true

  // Exclude lines ending with prose sentence punctuation or brackets/parens
  if (/[.!?;,:)\]"”']$/.test(trimmed)) return false
  if (/^[—–\-([[]/.test(trimmed)) return false
  if (SIGN_OFF_WORDS.test(trimmed)) return false
  if (isQuotedVerse(trimmed)) return false

  const letters = trimmed.match(/\p{L}/gu) ?? []
  if (letters.length < 3) return false
  const upper = trimmed.match(/\p{Lu}/gu) ?? []

  // 2. All-caps subheading
  if (upper.length / letters.length > 0.7) return true

  // 3. Title-Case standalone heading (2 to 10 words, starts with capital letter, >= 75% of major words capitalized)
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 10) return false
  if (!/^[A-ZŚĀĪŪṚḶ"“']/.test(words[0])) return false

  const majorWords = words.filter((w) => !MINOR_TITLE_WORDS.has(w.toLowerCase().replace(/^["“']+|["”']+$/g, '')))
  if (majorWords.length === 0) return false
  const capCount = majorWords.filter((w) => /^[A-ZŚĀĪŪṚḶṄÑṆṬḌṢ]/.test(w.replace(/^["“']+/g, ''))).length
  return capCount / majorWords.length >= 0.8
}

export type ParagraphKind =
  | { kind: 'verse' }
  | { kind: 'dialogue'; speakerEnd: number }
  | { kind: 'subheading' }
  | { kind: 'prose' }

export function classifyPurportParagraph(text: string): ParagraphKind {
  if (isSubheading(text)) return { kind: 'subheading' }
  const dialogue = matchDialogue(text)
  if (dialogue) return { kind: 'dialogue', speakerEnd: dialogue.speakerEnd }
  if (isQuotedVerse(text)) return { kind: 'verse' }
  return { kind: 'prose' }
}
