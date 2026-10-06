// Text highlighting needs a stable, deterministic "canonical text" per verse
// so that (a) a DOM selection can be turned into character offsets, and (b)
// those same offsets can be turned back into rendered <mark> spans on a
// later render — including after a fresh page load, from nothing but the
// stored (verseId, start, end) triple. There's no "field" column in the
// highlights table, so this treats a verse's translation + synonyms +
// purport paragraphs as one continuous text, in a fixed order, and both the
// capture side and the render side are built from these exact same
// functions so they can never drift apart.

import { normalizeProseWhitespace, parseSynonyms, splitPurportParagraphs } from '../reader/textUtils'
import { buildSynonymsFlat, type SynonymFlat } from '../reader/synonymsFormatting'
import type { VerseRecord } from '../../types/scripture'
import type { Highlight } from '../../types/study'

export interface SongStanza {
  label?: string
  lines?: string[]
  synonyms?: string
  translation?: string
}

export interface SongPayload {
  type: 'song'
  bannerTitle?: string
  subtitle?: string
  intro?: string
  stanzas?: SongStanza[]
  notes?: string
  purport?: string
}

export function parseSongPayload(purports: string | null | undefined): SongPayload | null {
  if (!purports || !purports.trimStart().startsWith('{')) return null
  try {
    const parsed = JSON.parse(purports)
    if (parsed && parsed.type === 'song') return parsed as SongPayload
  } catch {
    // ignore malformed JSON
  }
  return null
}

export function getTranslationDisplayText(record: VerseRecord): string | null {
  if (!record.translation) return null
  const t = normalizeProseWhitespace(record.translation)
  if (record.recordType !== 'Verse' && record.title && t.toLowerCase() === record.title.trim().toLowerCase()) {
    return null
  }
  const alreadyQuoted = /^["“'‘]/.test(t)
  return alreadyQuoted ? t : `“${t}”`
}

/** The flat synonyms string plus lemma/separator ranges within it, for
 * per-lemma styled rendering (see `synonymsFormatting.ts`). */
export function getSynonymsFlat(record: VerseRecord): SynonymFlat | null {
  if (!record.synonyms) return null
  const pairs = parseSynonyms(record.synonyms)
  if (pairs.length === 0) return null
  return buildSynonymsFlat(pairs)
}

export function getSynonymsFlatForText(synonymsText: string | null | undefined): SynonymFlat | null {
  if (!synonymsText) return null
  const pairs = parseSynonyms(synonymsText)
  if (pairs.length === 0) return null
  return buildSynonymsFlat(pairs)
}

export function getSynonymsDisplayText(record: VerseRecord): string | null {
  return getSynonymsFlat(record)?.text ?? null
}

export function getPurportParagraphs(record: VerseRecord): string[] {
  if (parseSongPayload(record.purports)) return []
  return record.purports ? splitPurportParagraphs(record.purports, record.title) : []
}

export interface TextSegment {
  key: string
  text: string
  start: number
  end: number
}

/** All highlightable segments for a verse, in fixed order, each carrying its
 * [start, end) offset range within the verse's single canonical text. */
export function buildHighlightSegments(record: VerseRecord): TextSegment[] {
  const raw: { key: string; text: string }[] = []
  const song = parseSongPayload(record.purports)

  if (song) {
    if (song.intro?.trim()) {
      raw.push({ key: 'song-intro', text: normalizeProseWhitespace(song.intro) })
    }
    ;(song.stanzas ?? []).forEach((st, i) => {
      if (st.lines && st.lines.length > 0) {
        raw.push({ key: `stanza-${i}-lines`, text: st.lines.join('\n') })
      }
      if (st.synonyms?.trim()) {
        const flat = getSynonymsFlatForText(st.synonyms)
        if (flat) raw.push({ key: `stanza-${i}-synonyms`, text: flat.text })
      }
      const transText =
        st.translation?.trim() ||
        ((!st.lines || st.lines.length === 0) && !st.synonyms?.trim() && st.label && st.label.length > 25
          ? st.label.trim()
          : '')
      if (transText) {
        raw.push({ key: `stanza-${i}-translation`, text: normalizeProseWhitespace(transText) })
      }
    })
    if (song.notes?.trim()) {
      raw.push({ key: 'song-notes', text: normalizeProseWhitespace(song.notes) })
    }
  } else {
    const translation = getTranslationDisplayText(record)
    if (translation) raw.push({ key: 'translation', text: translation })
    const synonyms = getSynonymsDisplayText(record)
    if (synonyms) raw.push({ key: 'synonyms', text: synonyms })
    getPurportParagraphs(record).forEach((p, i) => raw.push({ key: `purport-${i}`, text: p }))
  }

  let offset = 0
  return raw.map((s) => {
    const seg = { ...s, start: offset, end: offset + s.text.length }
    offset += s.text.length
    return seg
  })
}

interface LocalHighlight extends Highlight {
  localStart: number
  localEnd: number
}

/** Highlights (from the full verse-wide list) that overlap this segment,
 * with offsets translated to be local to the segment's own text. */
export function highlightsForSegment(highlights: Highlight[], segment: TextSegment): LocalHighlight[] {
  return highlights
    .map((h) => ({
      ...h,
      localStart: Math.max(0, h.textRangeStart - segment.start),
      localEnd: Math.min(segment.text.length, h.textRangeEnd - segment.start),
    }))
    .filter((h) => h.localStart < h.localEnd)
    .sort((a, b) => a.localStart - b.localStart)
}

/** Walks a highlight-root element's text nodes to turn the current DOM
 * selection into canonical-text character offsets. Returns null if there is
 * no selection, it's collapsed, or it falls outside `rootEl`. */
export function captureSelectionRange(
  rootEl: HTMLElement,
): { start: number; end: number; text: string } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!rootEl.contains(range.commonAncestorContainer)) return null

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
  let charIndex = 0
  let start = -1
  let end = -1
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0
    if (node === range.startContainer) start = charIndex + range.startOffset
    if (node === range.endContainer) end = charIndex + range.endOffset
    charIndex += len
  }
  if (start === -1 || end === -1) return null

  const text = selection.toString()
  if (!text.trim()) return null
  return { start: Math.min(start, end), end: Math.max(start, end), text }
}
