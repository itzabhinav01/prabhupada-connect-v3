import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import { READING_WIDTH_PX, useReaderStore } from '../../stores/useReaderStore'
import type { VerseRecord } from '../../types/scripture'
import { VerseView } from './VerseView'

export function FocusReader({ records }: { records: VerseRecord[] }) {
  const readingWidth = useReaderStore((s) => s.readingWidth)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const nextVerse = useNavigationStore((s) => s.nextVerse)
  const prevVerse = useNavigationStore((s) => s.prevVerse)

  const index = records.findIndex((r) => r.recordKey === activeVerseId)
  const record = index >= 0 ? records[index] : records[0]

  if (!record) return null

  return (
    <div
      data-reader-canvas
      className="flex-1 min-w-0 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-thin px-6 py-8"
    >
      <div className="w-full flex flex-col" style={{ maxWidth: READING_WIDTH_PX[readingWidth] }}>
        <VerseView record={record} />

        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={prevVerse}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 transition-colors"
          >
            <ChevronLeft size={16} />
            <span className="text-sm">Previous</span>
            <kbd className="ml-1.5 text-[10px] text-neutral-500 border border-neutral-700 rounded px-1">Ctrl+←</kbd>
          </button>

          <span className="text-xs text-neutral-600">
            {index + 1} / {records.length}
          </span>

          <button
            type="button"
            onClick={nextVerse}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 transition-colors"
          >
            <kbd className="mr-1.5 text-[10px] text-neutral-500 border border-neutral-700 rounded px-1">Ctrl+→</kbd>
            <span className="text-sm">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
