import { useEffect, useRef } from 'react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import { READING_WIDTH_PX, useReaderStore } from '../../stores/useReaderStore'
import type { VerseRecord } from '../../types/scripture'
import { VerseView } from './VerseView'

export function ContinuousReader({ records }: { records: VerseRecord[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const readingWidth = useReaderStore((s) => s.readingWidth)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const setActiveVerse = useNavigationStore((s) => s.setActiveVerse)
  const jumpToken = useNavigationStore((s) => s.jumpToken)
  const selectedChapterKey = useNavigationStore((s) => s.selectedChapter?.chapterKey ?? null)

  const restoredForChapterRef = useRef<string | null>(null)
  const restoredJumpTokenRef = useRef<number>(-1)
  const suppressScrollSyncRef = useRef(false)

  // Scroll restoration: smoothly scroll to activeVerseId when chapter changes,
  // jumpToken changes, or on initial mount.
  useEffect(() => {
    if (records.length === 0) return
    const chapterChanged = restoredForChapterRef.current !== selectedChapterKey
    const jumped = restoredJumpTokenRef.current !== jumpToken
    if (!chapterChanged && !jumped) return

    restoredForChapterRef.current = selectedChapterKey
    restoredJumpTokenRef.current = jumpToken

    const targetKey = activeVerseId ?? records[0]?.recordKey
    if (!targetKey) return

    const targetEl = itemRefs.current.get(targetKey)
    if (targetEl && containerRef.current) {
      suppressScrollSyncRef.current = true
      targetEl.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' })
      const timer = window.setTimeout(() => {
        suppressScrollSyncRef.current = false
      }, 150)
      return () => window.clearTimeout(timer)
    }
  }, [selectedChapterKey, jumpToken, records, activeVerseId])

  // Track active verse via IntersectionObserver as user scrolls
  useEffect(() => {
    const container = containerRef.current
    if (!container || records.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSyncRef.current) return
        // Pick the topmost visible entry
        const visibleEntries = entries.filter((e) => e.isIntersecting)
        if (visibleEntries.length > 0) {
          // Sort by top coordinate relative to viewport
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          const topKey = visibleEntries[0].target.getAttribute('data-verse-key')
          if (topKey && topKey !== useNavigationStore.getState().activeVerseId) {
            setActiveVerse(topKey)
          }
        }
      },
      {
        root: container,
        rootMargin: '-5% 0px -75% 0px',
        threshold: 0,
      },
    )

    itemRefs.current.forEach((el) => {
      observer.observe(el)
    })

    return () => observer.disconnect()
  }, [records, setActiveVerse])

  return (
    <div
      ref={containerRef}
      data-reader-canvas
      className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin"
    >
      <div
        className="mx-auto px-6 py-8 flex flex-col gap-8"
        style={{ maxWidth: READING_WIDTH_PX[readingWidth] }}
      >
        {records.map((record) => (
          <div
            key={record.recordKey}
            data-verse-key={record.recordKey}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(record.recordKey, node)
              } else {
                itemRefs.current.delete(record.recordKey)
              }
            }}
            className="w-full"
          >
            <VerseView record={record} />
          </div>
        ))}
      </div>
    </div>
  )
}
