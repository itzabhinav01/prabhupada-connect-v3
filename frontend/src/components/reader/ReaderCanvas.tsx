import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import { useReaderStore } from '../../stores/useReaderStore'
import { useSearchHitStore } from '../../stores/useSearchHitStore'
import { useSplitViewStore } from '../../stores/useSplitViewStore'
import { useStudyStore } from '../../stores/useStudyStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { ContinuousReader } from './ContinuousReader'
import { FocusReader } from './FocusReader'
import { InPageFindBar } from './InPageFindBar'
import { ParallelScripturePanel } from './ParallelScripturePanel'
import { RealizationNotebookPanel } from './RealizationNotebookPanel'
import { useHighlightFindMatches } from './useHighlightFindMatches'
import { useInPageFind } from './useInPageFind'

const HISTORY_LOG_DEBOUNCE_MS = 3000
const ZOOM_BADGE_TIMEOUT_MS = 1500

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/** Ctrl+=/Ctrl+-/Ctrl+0 and Ctrl+Wheel all drive the reader's existing
 * `fontSize` setting (already exposed via Header.tsx's +/- buttons) rather
 * than a separate multiplicative "zoom" — a second, overlapping scale
 * factor would compound unpredictably with font size instead of just
 * being another way to reach the same setting. This badge briefly surfaces
 * whatever the current value becomes after any of those triggers. */
function useZoomBadge(fontSize: number) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setVisible(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(false), ZOOM_BADGE_TIMEOUT_MS)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [fontSize])

  return visible
}

export function ReaderCanvas() {
  const chapterRecords = useNavigationStore((s) => s.chapterRecords)
  const isLoadingChapter = useNavigationStore((s) => s.isLoadingChapter)
  const selectedBook = useNavigationStore((s) => s.selectedBook)
  const selectedChapter = useNavigationStore((s) => s.selectedChapter)
  const readingMode = useNavigationStore((s) => s.readingMode)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const nextVerse = useNavigationStore((s) => s.nextVerse)
  const prevVerse = useNavigationStore((s) => s.prevVerse)

  const logHistory = useStudyStore((s) => s.logHistory)

  const fontSize = useReaderStore((s) => s.fontSize)
  const increaseFontSize = useReaderStore((s) => s.increaseFontSize)
  const decreaseFontSize = useReaderStore((s) => s.decreaseFontSize)
  const zoomBadgeVisible = useZoomBadge(fontSize)

  const splitMode = useSplitViewStore((s) => s.mode)
  const setSplitMode = useSplitViewStore((s) => s.set)
  const cycleSplitMode = useSplitViewStore((s) => s.cycle)

  const searchHitKeys = useSearchHitStore((s) => s.hitKeys)
  const searchHitQuery = useSearchHitStore((s) => s.query)
  const dismissSearchHits = useSearchHitStore((s) => s.dismiss)
  const searchHitIndex = activeVerseId ? searchHitKeys.indexOf(activeVerseId) : -1
  const searchHitVisible = searchHitKeys.length > 0 && searchHitIndex !== -1

  const goToSearchHit = (index: number) => {
    if (searchHitKeys.length === 0) return
    const wrapped = (index + searchHitKeys.length) % searchHitKeys.length
    const key = searchHitKeys[wrapped]
    const target = deriveNavigationTarget(key)
    if (target) void useNavigationStore.getState().navigateToCitation(target.bookKey, target.chapterKey, key)
  }
  const nextSearchHit = () => goToSearchHit(searchHitIndex + 1)
  const prevSearchHit = () => goToSearchHit(searchHitIndex - 1)

  const find = useInPageFind(chapterRecords)
  const effectiveQuery = find.isOpen
    ? find.query
    : searchHitVisible
      ? searchHitQuery
      : ''
  const effectiveIndex = find.isOpen ? find.currentIndex : 0
  const effectiveMatch = find.isOpen ? find.currentMatch : null
  const effectiveTargetVerse = find.isOpen ? null : (searchHitVisible ? activeVerseId : null)

  useHighlightFindMatches(
    '[data-reader-canvas]',
    effectiveQuery,
    effectiveIndex,
    find.isOpen ? find.matchCase : false,
    find.isOpen ? find.wholeWord : false,
    effectiveMatch,
    effectiveTargetVerse,
  )

  // Global shortcuts (theme, zen, tabs, Ctrl+F dispatch, Escape) live in
  // AppLayout.tsx so they work from any tab. Only verse navigation stays
  // here — it's meaningless outside a mounted reader — and it backs off
  // while the find bar is open so typing in it can't also page verses.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || find.isOpen) return
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        cycleSplitMode()
        return
      }
      if ((e.altKey || e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (e.key === 'ArrowRight') nextVerse()
        else prevVerse()
        return
      }
      if (e.key === 'F3' && searchHitKeys.length > 0) {
        e.preventDefault()
        if (e.shiftKey) prevSearchHit()
        else nextSearchHit()
        return
      }
      if (e.key === 'Escape' && searchHitVisible) {
        e.preventDefault()
        dismissSearchHits()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        nextVerse()
      } else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        prevVerse()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nextVerse, prevVerse, find.isOpen, cycleSplitMode, searchHitKeys, searchHitVisible, dismissSearchHits, activeVerseId])

  // Debounced reading-history log: only records a verse once the reader has
  // lingered on it for a bit, so rapid scrolling/paging doesn't spam entries.
  const historyTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!activeVerseId || !selectedBook) return
    const record = chapterRecords.find((r) => r.recordKey === activeVerseId)
    if (!record) return

    if (historyTimer.current) window.clearTimeout(historyTimer.current)
    historyTimer.current = window.setTimeout(() => {
      void logHistory(activeVerseId, selectedBook.title ?? selectedBook.bookKey, record.reference ?? activeVerseId)
    }, HISTORY_LOG_DEBOUNCE_MS)

    return () => {
      if (historyTimer.current) window.clearTimeout(historyTimer.current)
    }
  }, [activeVerseId, selectedBook, chapterRecords, logHistory])

  if (!selectedBook) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        Select a book from the sidebar to begin reading.
      </div>
    )
  }

  if (isLoadingChapter || chapterRecords.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading chapter…
      </div>
    )
  }

  const activeRecord = chapterRecords.find((r) => r.recordKey === activeVerseId)

  return (
    <div className="relative flex-1 min-w-0 min-h-0 flex">
      <div
        className="relative flex-1 min-w-0 min-h-0 flex flex-col"
        onWheel={(e) => {
          if (!e.ctrlKey) return
          e.preventDefault()
          if (e.deltaY < 0) increaseFontSize()
          else decreaseFontSize()
        }}
      >
        {readingMode === 'continuous' ? (
          <ContinuousReader key={`${selectedBook.bookKey}_${selectedChapter?.chapterKey ?? activeRecord?.parentKey ?? 'all'}`} records={chapterRecords} />
        ) : (
          <FocusReader records={chapterRecords} />
        )}
        {find.isOpen && <InPageFindBar find={find} />}
        {zoomBadgeVisible && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-neutral-800/90 border border-neutral-700 text-xs text-neutral-200 shadow-lg transition-opacity">
            {fontSize}px
          </div>
        )}
        {searchHitVisible && (
          <div
            className="fixed bottom-6 right-6 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl z-50"
            title={`From search: "${searchHitQuery}"`}
          >
            <span className="text-xs text-neutral-400">Hit</span>
            <span className="text-sm font-bold text-amber-400">
              {searchHitIndex + 1} of {searchHitKeys.length}
            </span>
            <button
              type="button"
              onClick={prevSearchHit}
              title="Previous hit (Shift+F3)"
              className="p-1 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={nextSearchHit}
              title="Next hit (F3)"
              className="p-1 rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              onClick={dismissSearchHits}
              title="Dismiss (Esc)"
              className="text-neutral-600 hover:text-neutral-400"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {splitMode !== 'none' && (
        <div className="w-[45%] min-w-[360px] shrink-0 bg-neutral-950 flex flex-col min-h-0 h-full overflow-hidden border-l border-neutral-800">
          {splitMode === 'parallel' ? (
            <ParallelScripturePanel
              initialRecordKey={activeRecord?.recordKey ?? null}
              onSwitchMode={() => setSplitMode('notebook')}
              onClose={() => setSplitMode('none')}
            />
          ) : (
            <RealizationNotebookPanel
              activeRecordKey={activeRecord?.recordKey ?? null}
              activeReference={activeRecord?.reference ?? activeRecord?.recordKey ?? ''}
              onSwitchMode={() => setSplitMode('parallel')}
              onClose={() => setSplitMode('none')}
            />
          )}
        </div>
      )}
    </div>
  )
}
