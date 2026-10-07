import { useEffect, useRef } from 'react'

import { normalizeIast, normalizeIastWithOffsets } from '../../utils/iast'
import { findAllOccurrences } from './findMatchUtils'

// Registered once; every effect run below just replaces the Range sets.
const ALL_MATCHES_NAME = 'inpage-find'
const ACTIVE_MATCH_NAME = 'inpage-find-active'

/** True on any Chromium/Edge new enough to have the CSS Custom Highlight
 * API (WebView2 is Chromium-based, so this is expected to hold — but this
 * degrades to "navigation without visual highlighting" rather than
 * throwing if it's ever missing). */
function highlightApiAvailable(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

/**
 * Highlights every on-screen occurrence of `query` inside `containerSelector`
 * using `CSS.highlights` — Range objects referencing the *existing* text
 * nodes React already rendered, not DOM mutation, so this can never conflict
 * with React's own reconciliation of that subtree (unlike wrapping matches
 * in injected `<mark>` elements). Because the reader virtualizes long
 * chapters, only whatever verses are currently mounted get highlighted;
 * a `MutationObserver` re-scans whenever the mounted set changes (i.e. on
 * scroll), so the highlight set stays current as new verses mount.
 */
export interface FindMatchMeta {
  recordKey: string
  occurrenceIndex: number
}

interface RangeOccurrence {
  range: Range
  recordKey: string | null
  occurrenceIndex: number
}

function scrollRangeIntoView(range: Range, container: HTMLElement) {
  const rangeRect = range.getBoundingClientRect()
  if (rangeRect.height === 0 && rangeRect.width === 0) {
    (range.startContainer.parentElement as HTMLElement)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    return
  }

  const containerRect = container.getBoundingClientRect()
  const padding = 80
  const isFullyVisible =
    rangeRect.top >= containerRect.top + padding &&
    rangeRect.bottom <= containerRect.bottom - padding

  if (!isFullyVisible) {
    const offsetFromContainerTop = rangeRect.top - containerRect.top
    const targetScrollTop =
      container.scrollTop + offsetFromContainerTop - container.clientHeight / 2 + rangeRect.height / 2

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth',
    })
  }
}

/**
 * Highlights every on-screen occurrence of `query` inside `containerSelector`
 * using `CSS.highlights` — Range objects referencing the *existing* text
 * nodes React already rendered, not DOM mutation.
 *
 * Distinctly highlights the single active match (`inpage-find-active`),
 * and automatically scrolls the active match into view (centered), matching
 * standard browser Ctrl+F behavior.
 */
export function useHighlightFindMatches(
  containerSelector: string,
  query: string,
  currentIndex: number,
  matchCase = false,
  wholeWord = false,
  currentMatch: FindMatchMeta | null = null,
  targetVerseKey: string | null = null,
) {
  const lastScrollKeyRef = useRef<string>('')

  useEffect(() => {
    if (!highlightApiAvailable()) return
    const cleanedQuery = query.replace(/^["'“”]+|["'“”]+$/g, '').trim()
    if (!cleanedQuery) {
      CSS.highlights.delete(ALL_MATCHES_NAME)
      CSS.highlights.delete(ACTIVE_MATCH_NAME)
      return
    }

    const needle = matchCase ? cleanedQuery : normalizeIast(cleanedQuery)
    const terms = !matchCase && cleanedQuery.includes(' ')
      ? cleanedQuery
          .split(/\s+/)
          .map((w) => normalizeIast(w.trim()))
          .filter((w) => w.length > 1)
      : []

    let scrollTimer: number | null = null

    const scan = () => {
      const container = document.querySelector(containerSelector)
      if (!container) return

      const allRanges: Range[] = []
      const occurrences: RangeOccurrence[] = []
      const verseOccurrences = new Map<string, number>()

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const text = node.textContent
          if (!text || !text.trim()) return NodeFilter.FILTER_REJECT
          const parentTag = node.parentElement?.tagName
          if (parentTag === 'BUTTON' || parentTag === 'INPUT' || parentTag === 'TEXTAREA') {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        },
      })

      const textNodes: { node: Node; text: string; recordKey: string | null }[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? ''
        const verseEl = node.parentElement?.closest('[data-verse-key]')
        const recordKey = verseEl?.getAttribute('data-verse-key') ?? null
        textNodes.push({ node, text, recordKey })
      }

      const scanForNeedle = (targetNeedle: string) => {
        for (const item of textNodes) {
          if (matchCase) {
            for (const startOffset of findAllOccurrences(item.text, targetNeedle, wholeWord)) {
              const range = new Range()
              range.setStart(item.node, startOffset)
              range.setEnd(item.node, startOffset + targetNeedle.length)
              allRanges.push(range)

              const occKey = item.recordKey ?? '__global'
              const occIdx = verseOccurrences.get(occKey) ?? 0
              verseOccurrences.set(occKey, occIdx + 1)
              occurrences.push({ range, recordKey: item.recordKey, occurrenceIndex: occIdx })
            }
          } else {
            const { text: normalizedText, offsetMap } = normalizeIastWithOffsets(item.text)
            for (const idx of findAllOccurrences(normalizedText, targetNeedle, wholeWord)) {
              const startOffset = offsetMap[idx]
              const endOffset = offsetMap[idx + targetNeedle.length]
              if (startOffset !== endOffset) {
                const range = new Range()
                range.setStart(item.node, startOffset)
                range.setEnd(item.node, endOffset)
                allRanges.push(range)

                const occKey = item.recordKey ?? '__global'
                const occIdx = verseOccurrences.get(occKey) ?? 0
                verseOccurrences.set(occKey, occIdx + 1)
                occurrences.push({ range, recordKey: item.recordKey, occurrenceIndex: occIdx })
              }
            }
          }
        }
      }

      // First search for the full phrase
      scanForNeedle(needle)

      // If full phrase had 0 matches (e.g. multi-term search), search for individual terms
      if (allRanges.length === 0 && terms.length > 1) {
        for (const term of terms) {
          scanForNeedle(term)
        }
      }

      if (allRanges.length === 0) {
        CSS.highlights.delete(ALL_MATCHES_NAME)
        CSS.highlights.delete(ACTIVE_MATCH_NAME)
        return
      }

      // Identify active match range:
      // 1. If explicit match from in-page find, use that
      // 2. If navigated from search panel with a target verse, pick the first match in that verse!
      // 3. Fallback to currentIndex
      let activeRange: Range | null = null
      if (currentMatch) {
        const found = occurrences.find(
          (o) => o.recordKey === currentMatch.recordKey && o.occurrenceIndex === currentMatch.occurrenceIndex,
        )
        if (found) activeRange = found.range
      } else if (targetVerseKey) {
        const found = occurrences.find((o) => o.recordKey === targetVerseKey)
        if (found) activeRange = found.range
      }
      if (!activeRange) {
        const clampedIdx = Math.max(0, Math.min(currentIndex, allRanges.length - 1))
        activeRange = allRanges[clampedIdx] ?? null
      }

      CSS.highlights.set(ALL_MATCHES_NAME, new Highlight(...allRanges))
      if (activeRange) {
        CSS.highlights.set(ACTIVE_MATCH_NAME, new Highlight(activeRange))
      } else {
        CSS.highlights.delete(ACTIVE_MATCH_NAME)
      }

      // Smoothly scroll to the active match when query, verse, or match index changes
      const scrollKey = `${query}:${targetVerseKey ?? ''}:${currentIndex}:${currentMatch?.recordKey ?? ''}:${currentMatch?.occurrenceIndex ?? -1}`
      if (activeRange && scrollKey !== lastScrollKeyRef.current) {
        lastScrollKeyRef.current = scrollKey
        if (scrollTimer) window.clearTimeout(scrollTimer)
        // 120ms timeout ensures ContinuousReader's initial mount scroll has settled
        scrollTimer = window.setTimeout(() => {
          if (container instanceof HTMLElement) {
            scrollRangeIntoView(activeRange, container)
          }
        }, 120)
      }
    }

    scan()

    const container = document.querySelector(containerSelector)
    let observer: MutationObserver | null = null
    if (container) {
      observer = new MutationObserver(() => scan())
      observer.observe(container, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      if (scrollTimer) window.clearTimeout(scrollTimer)
      observer?.disconnect()
      CSS.highlights.delete(ALL_MATCHES_NAME)
      CSS.highlights.delete(ACTIVE_MATCH_NAME)
    }
  }, [containerSelector, query, currentIndex, matchCase, wholeWord, currentMatch, targetVerseKey])
}
