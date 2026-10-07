import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import { READING_WIDTH_PX, useReaderStore } from '../../stores/useReaderStore'
import type { VerseRecord } from '../../types/scripture'
import { VerseView } from './VerseView'

export function ContinuousReader({ records }: { records: VerseRecord[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const readingWidth = useReaderStore((s) => s.readingWidth)
  const fontSize = useReaderStore((s) => s.fontSize)
  const lineSpacing = useReaderStore((s) => s.lineSpacing)
  const showSanskrit = useReaderStore((s) => s.showSanskrit)
  const showTransliteration = useReaderStore((s) => s.showTransliteration)
  const showSynonyms = useReaderStore((s) => s.showSynonyms)
  const showPurport = useReaderStore((s) => s.showPurport)
  const showPronunciationGuide = useReaderStore((s) => s.showPronunciationGuide)
  const showBacklinks = useReaderStore((s) => s.showBacklinks)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const setActiveVerse = useNavigationStore((s) => s.setActiveVerse)
  const jumpToken = useNavigationStore((s) => s.jumpToken)
  const selectedChapterKey = useNavigationStore((s) => s.selectedChapter?.chapterKey ?? null)

  const estimateSize = (index: number) => {
    const r = records[index]
    if (!r) return 260
    let est = 45
    if (showSanskrit && r.devanagari) est += 65
    if (showTransliteration && r.transliteration) est += 55
    if (showPronunciationGuide && r.transliteration) est += 40
    if (showSynonyms && r.synonyms) est += Math.min(Math.round(r.synonyms.length * 0.22), 200)
    if (r.translation) est += Math.min(Math.round(r.translation.length * 0.32), 220)
    if (showPurport && r.purports) est += Math.min(Math.round(r.purports.length * 0.35), 3500)
    est += 45 // compact personal notes header
    if (showBacklinks) est += 35
    return Math.max(est, 140)
  }

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => records[index]?.recordKey ?? index,
    estimateSize,
    overscan: 4,
  })

  // When split view opens/closes or window width changes, line wrapping changes.
  // Only re-measure when client width actually changes by > 8px, avoiding clearing
  // measurements during ordinary scrolling or minor vertical layout shifts.
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const newWidth = entry.contentRect.width
      if (Math.abs(newWidth - lastWidth) > 8) {
        lastWidth = newWidth
        virtualizer.measure()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [virtualizer])

  // Re-measure when active typography/toggle settings change
  useEffect(() => {
    virtualizer.measure()
  }, [fontSize, readingWidth, lineSpacing, showSanskrit, showTransliteration, showSynonyms, showPurport, showPronunciationGuide, showBacklinks, virtualizer])

  // Scroll restoration: jump to the current active verse whenever a new
  // chapter loads, an explicit "jump" is requested (breadcrumb click), or
  // this reader remounts after returning from Focus mode. Deliberately NOT
  // keyed on every activeVerseId change — that field also updates from the
  // scroll handler below, and re-triggering scrollToIndex from that would
  // fight the user's own scrolling.
  const restoredForChapterRef = useRef<string | null>(null)
  const restoredJumpTokenRef = useRef<number>(-1)
  // Set while a programmatic scrollToIndex (below) is landing, so the
  // `scroll` events it fires along the way don't get read by handleScroll
  // as the user browsing to the chapter's first record (its pre-scroll
  // resting position) and clobber the verse we're actually jumping to.
  const suppressScrollSyncRef = useRef(false)
  useEffect(() => {
    if (records.length === 0) return
    const chapterChanged = restoredForChapterRef.current !== selectedChapterKey
    const jumped = restoredJumpTokenRef.current !== jumpToken
    if (!chapterChanged && !jumped) return
    restoredForChapterRef.current = selectedChapterKey
    restoredJumpTokenRef.current = jumpToken
    const idx = Math.max(
      0,
      records.findIndex((r) => r.recordKey === activeVerseId),
    )
    suppressScrollSyncRef.current = true
    virtualizer.scrollToIndex(idx, { align: 'start' })
    // The first call lands using `estimateSize` for anything not yet
    // measured — once those items actually mount, `measureElement` corrects
    // their real height, but the scroll position already set doesn't move
    // to match, so the target can drift out from under it. A second call
    // after that measurement pass (one rAF for layout, one more so the
    // resulting re-render has committed) re-lands on the corrected offset.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(idx, { align: 'start' })
        requestAnimationFrame(() => {
          suppressScrollSyncRef.current = false
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapterKey, jumpToken, records])

  const handleScroll = () => {
    if (suppressScrollSyncRef.current) return
    const el = parentRef.current
    if (!el) return
    const threshold = el.scrollTop + 96 // a little below the top edge
    const items = virtualizer.getVirtualItems()
    let current = items[0]
    for (const item of items) {
      if (item.start <= threshold) current = item
      else break
    }
    const record = current && records[current.index]
    if (record && record.recordKey !== activeVerseId) {
      setActiveVerse(record.recordKey)
    }
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      data-reader-canvas
      className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin"
    >
      <div
        className="mx-auto px-6 py-8"
        style={{ maxWidth: READING_WIDTH_PX[readingWidth], position: 'relative', height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const record = records[virtualItem.index]
          return (
            <div
              key={record.recordKey}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <VerseView record={record} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
