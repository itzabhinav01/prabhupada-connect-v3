import { useEffect } from 'react'

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
export function useHighlightFindMatches(
  containerSelector: string,
  query: string,
  activeRecordKey: string | null,
  matchCase = false,
  wholeWord = false,
) {
  useEffect(() => {
    if (!highlightApiAvailable()) return
    const needle = matchCase ? query.trim() : normalizeIast(query.trim())

    const scan = () => {
      const container = document.querySelector(containerSelector)
      if (!container) return
      if (!needle) {
        CSS.highlights.delete(ALL_MATCHES_NAME)
        CSS.highlights.delete(ACTIVE_MATCH_NAME)
        return
      }

      const allRanges: Range[] = []
      const activeRanges: Range[] = []

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

      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? ''
        const isActiveVerse = activeRecordKey != null && !!node.parentElement?.closest(`[data-verse-key="${activeRecordKey}"]`)

        if (matchCase) {
          // No normalization at all, so occurrence offsets are already
          // real DOM offsets — no offset-map translation needed.
          for (const startOffset of findAllOccurrences(text, needle, wholeWord)) {
            const range = new Range()
            range.setStart(node, startOffset)
            range.setEnd(node, startOffset + needle.length)
            allRanges.push(range)
            if (isActiveVerse) activeRanges.push(range)
          }
          continue
        }

        // Expansions like ṛ→"ri" make the normalized text longer than the
        // original, so a match's offsets in normalized text must go through
        // `offsetMap` to land on the right position in the original `node`
        // text — required to set a Range on text React actually rendered.
        const { text: normalizedText, offsetMap } = normalizeIastWithOffsets(text)
        for (const idx of findAllOccurrences(normalizedText, needle, wholeWord)) {
          const startOffset = offsetMap[idx]
          const endOffset = offsetMap[idx + needle.length]
          if (startOffset !== endOffset) {
            const range = new Range()
            range.setStart(node, startOffset)
            range.setEnd(node, endOffset)
            allRanges.push(range)
            if (isActiveVerse) activeRanges.push(range)
          }
        }
      }

      CSS.highlights.set(ALL_MATCHES_NAME, new Highlight(...allRanges))
      CSS.highlights.set(ACTIVE_MATCH_NAME, new Highlight(...activeRanges))
    }

    scan()

    const container = document.querySelector(containerSelector)
    let observer: MutationObserver | null = null
    if (container) {
      observer = new MutationObserver(() => scan())
      observer.observe(container, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      observer?.disconnect()
      CSS.highlights.delete(ALL_MATCHES_NAME)
      CSS.highlights.delete(ACTIVE_MATCH_NAME)
    }
  }, [containerSelector, query, activeRecordKey, matchCase, wholeWord])
}
