// Sanskrit/Bengali prosody (chandas) analyzer: syllabifies an IAST
// transliteration line and tags each syllable laghu (light) or guru (heavy)
// per the standard simplified rules:
//   Laghu: a short vowel (a i u ṛ ḷ) followed by at most one consonant
//          before the next vowel (or end of line).
//   Guru:  a long vowel (ā ī ū ṝ e ai o au), OR a vowel immediately followed
//          by anusvāra (ṁ/ṃ) or visarga (ḥ), OR a short vowel followed by
//          two or more consonants before the next vowel (a closed/conjunct
//          syllable).
// Sanskrit meter counts across the whole prosodic line, not per word, so
// spaces/hyphens/avagraha are stripped before analysis — sandhi already
// joins words phonetically in the source text.

export type SyllableWeight = 'laghu' | 'guru'

export interface Syllable {
  text: string
  weight: SyllableWeight
}

export interface PadaAnalysis {
  raw: string
  syllables: Syllable[]
}

export interface MeterAnalysis {
  meterName: string
  isRegular: boolean
  padas: PadaAnalysis[]
  totalSyllables: number
}

const LONG_VOWELS = ['ā', 'ī', 'ū', 'ṝ', 'ai', 'au', 'e', 'o']
const SHORT_VOWELS = ['a', 'i', 'u', 'ṛ', 'ḷ']
// Longest-match-first so digraph vowels (ai/au) aren't split into a+i etc.
const ALL_VOWELS = [...LONG_VOWELS, ...SHORT_VOWELS].sort((a, b) => b.length - a.length)
const ASPIRATED_DIGRAPHS = ['kh', 'gh', 'ch', 'jh', 'ṭh', 'ḍh', 'th', 'dh', 'ph', 'bh']
const ANUSVARA = ['ṁ', 'ṃ']
const VISARGA = 'ḥ'

interface Token {
  text: string
  kind: 'vowel' | 'consonant' | 'mark'
  isLongVowel?: boolean
}

function tokenize(phoneticStream: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const lower = phoneticStream.toLowerCase()

  while (i < phoneticStream.length) {
    let matchedVowel: string | null = null
    for (const v of ALL_VOWELS) {
      if (lower.slice(i, i + v.length) === v) {
        matchedVowel = v
        break
      }
    }
    if (matchedVowel) {
      tokens.push({
        text: phoneticStream.slice(i, i + matchedVowel.length),
        kind: 'vowel',
        isLongVowel: LONG_VOWELS.includes(matchedVowel),
      })
      i += matchedVowel.length
      continue
    }

    if (ANUSVARA.includes(phoneticStream[i]) || phoneticStream[i] === VISARGA) {
      tokens.push({ text: phoneticStream[i], kind: 'mark' })
      i += 1
      continue
    }

    let matchedDigraph: string | null = null
    for (const d of ASPIRATED_DIGRAPHS) {
      if (lower.slice(i, i + 2) === d) {
        matchedDigraph = d
        break
      }
    }
    if (matchedDigraph) {
      tokens.push({ text: phoneticStream.slice(i, i + 2), kind: 'consonant' })
      i += 2
      continue
    }

    tokens.push({ text: phoneticStream[i], kind: 'consonant' })
    i += 1
  }
  return tokens
}

/** Strips whatever isn't part of the phonetic stream for meter purposes:
 * spaces, hyphens (compound joiners), and avagraha marks (elision). */
function toPhoneticStream(line: string): string {
  return line.replace(/[\s\-'’]/g, '')
}

export function syllabifyPada(line: string): PadaAnalysis {
  const stream = toPhoneticStream(line)
  const tokens = tokenize(stream)

  const vowelIndices = tokens.reduce<number[]>((acc, t, i) => {
    if (t.kind === 'vowel') acc.push(i)
    return acc
  }, [])

  const syllables: Syllable[] = []
  let onsetStart = 0

  for (let v = 0; v < vowelIndices.length; v++) {
    const vowelIdx = vowelIndices[v]
    const nextVowelIdx = vowelIndices[v + 1] ?? tokens.length
    const between = tokens.slice(vowelIdx + 1, nextVowelIdx)

    const vowelToken = tokens[vowelIdx]
    let weight: SyllableWeight

    if (vowelToken.isLongVowel) {
      weight = 'guru'
    } else if (between.length > 0 && between[0].kind === 'mark') {
      weight = 'guru'
    } else {
      const consonantCount = between.filter((t) => t.kind === 'consonant').length
      weight = consonantCount >= 2 ? 'guru' : 'laghu'
    }

    // Anusvāra/visarga marks immediately after the vowel are this
    // syllable's coda, not the next syllable's onset — only the consonants
    // after them carry forward.
    let codaMarkCount = 0
    while (codaMarkCount < between.length && between[codaMarkCount].kind === 'mark') {
      codaMarkCount++
    }
    const syllableEnd = vowelIdx + 1 + codaMarkCount
    const syllableTokens = tokens.slice(onsetStart, syllableEnd)
    syllables.push({ text: syllableTokens.map((t) => t.text).join(''), weight })
    onsetStart = syllableEnd
  }

  // Trailing consonants after the last vowel (a closing consonant with no
  // following vowel) belong visually to the final syllable.
  if (onsetStart < tokens.length && syllables.length > 0) {
    const trailing = tokens.slice(onsetStart).map((t) => t.text).join('')
    syllables[syllables.length - 1].text += trailing
  }

  return { raw: line, syllables }
}

interface KnownMeter {
  name: string
  padaCount: number | null
  syllablesPerPada: number
  tolerance: number
}

const KNOWN_METERS: KnownMeter[] = [
  { name: 'Anuṣṭubh (Śloka)', padaCount: 4, syllablesPerPada: 8, tolerance: 0 },
  { name: 'Triṣṭubh', padaCount: 4, syllablesPerPada: 11, tolerance: 0 },
  { name: 'Jagatī', padaCount: 4, syllablesPerPada: 12, tolerance: 0 },
  { name: 'Payāra', padaCount: null, syllablesPerPada: 14, tolerance: 1 },
]

// A speaker-attribution line ("dhṛtarāṣṭra uvāca", "śrī bhagavān uvāca",
// "arjuna uvāca") is prose, not part of the four-pāda verse it introduces —
// v2's reference corpus keeps it on its own line, so a naive one-line-per-
// pāda split sees 5 lines instead of 4 and meter detection fails outright.
// Traditional prosody excludes these from the count entirely.
const SPEAKER_TAG_LINE_RE = /^\S+(\s+\S+){0,3}\s+(uvāca|abravīt|abravīn|provāca|prāha|āha|āsa)$/iu

export function analyzeMeter(transliteration: string): MeterAnalysis {
  const lines = transliteration
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !SPEAKER_TAG_LINE_RE.test(l))

  const padas = lines.map(syllabifyPada)
  const counts = padas.map((p) => p.syllables.length)
  const totalSyllables = counts.reduce((a, b) => a + b, 0)

  for (const meter of KNOWN_METERS) {
    if (meter.padaCount !== null && padas.length !== meter.padaCount) continue
    const matches = counts.every((c) => Math.abs(c - meter.syllablesPerPada) <= meter.tolerance)
    if (matches) {
      return { meterName: meter.name, isRegular: true, padas, totalSyllables }
    }
  }

  return { meterName: 'Unidentified meter', isRegular: false, padas, totalSyllables }
}

if (import.meta.env.DEV) {
  // Dev-only escape hatch for direct CDP/devtools verification of the
  // syllabifier and meter detector in isolation from app/store state.
  ;(window as unknown as { __meter: { syllabifyPada: typeof syllabifyPada; analyzeMeter: typeof analyzeMeter } }).__meter = {
    syllabifyPada,
    analyzeMeter,
  }
}
