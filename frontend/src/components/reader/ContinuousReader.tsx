import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import { READING_WIDTH_PX, useReaderStore } from '../../stores/useReaderStore'
import type { VerseRecord } from '../../types/scripture'
import { VerseView } from './VerseView'

export function ContinuousReader({ records }: { records: VerseRecord[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const readingWidth = useReaderStore((s) => s.readingWidth)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const setActiveVerse = useNavigationStore((s) => s.setActiveVerse)
  const jumpToken = useNavigationStore((s) => s.jumpToken)
  const selectedChapterKey = useNavigationStore((s) => s.selectedChapter?.chapterKey ?? null)

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    // Measured directly against real verses (SB 3.5.1-8): 1160-1890px, ~1400
    // average, with the VerseNotesPanel now added below every verse. 600 was
    // right when verses were shorter, before that panel existed — badly
    // under-estimating meant scrollToIndex landed well short of the real
    // target before measurement corrected it. The corrective second scroll
    // below handles final accuracy regardless; this just keeps the initial
    // jump small for both very short and very long verses.
    estimateSize: () => 1400,
    overscan: 4,
  })

  // When split view opens/closes or container width changes, dynamic line wrapping
  // drastically alters verse heights. Re-measure virtual items so the full verse
  // content always loads and scroll boundaries are accurate.
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      virtualizer.measure()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [virtualizer])

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
