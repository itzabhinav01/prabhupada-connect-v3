import { useCallback, useEffect, useMemo } from 'react'

import { useInPageFindStore } from '../../stores/useInPageFindStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { normalizeIast } from '../../utils/iast'
import type { VerseRecord } from '../../types/scripture'
import { findAllOccurrences } from './findMatchUtils'

import { parseSongPayload } from '../study/highlightable'

export interface FindMatch {
  recordKey: string
  /** Which occurrence within that verse's combined text this is (0-based) —
   * lets "Match X of Y" count real occurrences, not just matching verses. */
  occurrenceIndex: number
}

/** The exact text fields a match can come from — translation, synonyms,
 * purport, and (for completeness) the original Devanagari/transliteration,
 * matching what's actually rendered in `VerseView`. Matching is IAST
 * diacritic-insensitive (see `normalizeIast`): typing "krishna" matches
 * "Kṛṣṇa". */
function searchableText(record: VerseRecord): string {
  const song = parseSongPayload(record.purports)
  if (song) {
    const parts: string[] = []
    if (song.intro) parts.push(song.intro)
    if (song.stanzas) {
      for (const st of song.stanzas) {
        if (st.lines) parts.push(...st.lines)
        if (st.synonyms) parts.push(st.synonyms)
        if (st.translation) parts.push(st.translation)
      }
    }
    if (song.notes) parts.push(song.notes)
    if (song.purport) parts.push(song.purport)
    return parts.join(' \u0000 ')
  }
  return [record.translation, record.synonyms, record.purports, record.devanagari, record.transliteration]
    .filter(Boolean)
    .join(' \u0000 ')
}

export function useInPageFind(records: VerseRecord[]) {
  const isOpen = useInPageFindStore((s) => s.isOpen)
  const query = useInPageFindStore((s) => s.query)
  const currentIndex = useInPageFindStore((s) => s.currentIndex)
  const matchCase = useInPageFindStore((s) => s.matchCase)
  const wholeWord = useInPageFindStore((s) => s.wholeWord)
  const open = useInPageFindStore((s) => s.open)
  const close = useInPageFindStore((s) => s.close)
  const setQuery = useInPageFindStore((s) => s.setQuery)
  const setCurrentIndex = useInPageFindStore((s) => s.setCurrentIndex)
  const toggleMatchCase = useInPageFindStore((s) => s.toggleMatchCase)
  const toggleWholeWord = useInPageFindStore((s) => s.toggleWholeWord)
  const setActiveVerse = useNavigationStore((s) => s.setActiveVerse)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)

  const matches = useMemo<FindMatch[]>(() => {
    // Match Case bypasses IAST folding entirely (see `useInPageFindStore`) —
    // otherwise every occurrence goes through the same diacritic-insensitive
    // normalization as before.
    const needle = matchCase ? query.trim() : normalizeIast(query.trim())
    if (!needle) return []
    const result: FindMatch[] = []
    for (const record of records) {
      const raw = searchableText(record)
      const haystack = matchCase ? raw : normalizeIast(raw)
      const occurrences = findAllOccurrences(haystack, needle, wholeWord)
      occurrences.forEach((_, i) => result.push({ recordKey: record.recordKey, occurrenceIndex: i }))
    }
    return result
  }, [records, query, matchCase, wholeWord])

  useEffect(() => {
    if (matches.length === 0) return
    const clamped = Math.min(currentIndex, matches.length - 1)
    if (clamped !== currentIndex) {
      setCurrentIndex(clamped)
      return
    }
    const targetVerseKey = matches[clamped].recordKey
    if (targetVerseKey !== activeVerseId) {
      setActiveVerse(targetVerseKey)
    }
  }, [matches, currentIndex, activeVerseId, setActiveVerse, setCurrentIndex])

  const next = useCallback(() => {
    if (matches.length === 0) return
    setCurrentIndex((currentIndex + 1) % matches.length)
  }, [matches.length, currentIndex, setCurrentIndex])

  const prev = useCallback(() => {
    if (matches.length === 0) return
    setCurrentIndex((currentIndex - 1 + matches.length) % matches.length)
  }, [matches.length, currentIndex, setCurrentIndex])

  return {
    isOpen,
    open,
    close,
    query,
    setQuery,
    matchCase,
    toggleMatchCase,
    wholeWord,
    toggleWholeWord,
    matches,
    currentIndex,
    currentMatch: matches[currentIndex] ?? null,
    next,
    prev,
  }
}
