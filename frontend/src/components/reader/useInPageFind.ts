import { useCallback, useEffect, useMemo } from 'react'

import { useInPageFindStore } from '../../stores/useInPageFindStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { normalizeIast } from '../../utils/iast'
import type { VerseRecord } from '../../types/scripture'
import { findAllOccurrences } from './findMatchUtils'

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
  return [record.translation, record.synonyms, record.purports, record.devanagari, record.transliteration]
    .filter(Boolean)
    .join(' \u0000 ')
}


/**
 * In-page find within the currently open chapter. The reader virtualizes
 * long chapters (`ContinuousReader` only mounts ~8 verses' worth of DOM at
 * a time), so matches are computed over the chapter's actual verse data —
 * not a DOM scan — and navigating a match reuses the existing
 * `jumpToVerse` scroll-restoration path so the target verse mounts before
 * `InPageFindBar` tries to highlight it.
 *
 * `isOpen`/`query`/`currentIndex` live in `useInPageFindStore` (not local
 * state) so the global `Ctrl+F`/`Escape` shortcuts in `AppLayout.tsx` can
 * open and close the bar without needing this hook's `records`.
 */
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
  const jumpToVerse = useNavigationStore((s) => s.jumpToVerse)

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
    jumpToVerse(matches[clamped].recordKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, currentIndex])

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
