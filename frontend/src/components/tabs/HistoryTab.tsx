import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { getVerseRecord } from '../../services/api'
import { useStudyStore } from '../../stores/useStudyStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from './useOpenReaderForVerse'

const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['week', 1000 * 60 * 60 * 24 * 7],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
]

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diffMs) >= ms || unit === 'minute') {
      return RELATIVE_TIME.format(Math.round(diffMs / ms), unit)
    }
  }
  return RELATIVE_TIME.format(0, 'minute')
}

export function HistoryTab() {
  const history = useStudyStore((s) => s.history)
  const loadHistory = useStudyStore((s) => s.loadHistory)
  const clearHistory = useStudyStore((s) => s.clearHistory)
  const openReaderForVerse = useOpenReaderForVerse()
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    void loadHistory(200)
  }, [loadHistory])

  const dedupedHistory = useMemo(() => {
    const map = new Map<string, (typeof history)[number] & { openCount: number }>()
    for (const h of history) {
      const existing = map.get(h.verseId)
      if (!existing) {
        map.set(h.verseId, { ...h, openCount: 1 })
      } else {
        existing.openCount += 1
      }
    }
    return [...map.values()]
  }, [history])

  useEffect(() => {
    let cancelled = false
    const keys = dedupedHistory.slice(0, 60).map((h) => h.verseId)
    if (keys.length === 0) return
    void Promise.all(
      keys.map((key) =>
        getVerseRecord(key)
          .then((rec) => {
            if (!rec) return [key, ''] as const
            const snippet = (rec.translation || rec.transliteration || rec.title || '').replace(/\s+/g, ' ').trim()
            return [key, snippet] as const
          })
          .catch(() => [key, ''] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [k, v] of pairs) {
        if (v) next[k] = v
      }
      setPreviews(next)
    })
    return () => {
      cancelled = true
    }
  }, [dedupedHistory])

  const [mostRecent, ...rest] = dedupedHistory

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      return
    }
    void clearHistory()
    setConfirmingClear(false)
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-neutral-100">Reading History</h1>
          {dedupedHistory.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmingClear && (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="text-xs px-2.5 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-900"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${
                  confirmingClear
                    ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <Trash2 size={13} /> {confirmingClear ? 'Confirm Clear History' : 'Clear History'}
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-500 mb-6">{dedupedHistory.length} unique verses read</p>

        {dedupedHistory.length === 0 && <p className="text-sm text-neutral-600 px-1 py-4">Nothing read yet.</p>}

        {mostRecent && (
          <button
            type="button"
            onClick={() => {
              const target = deriveNavigationTarget(mostRecent.verseId)
              if (target) void openReaderForVerse(target.bookKey, target.chapterKey, mostRecent.verseId)
            }}
            className="w-full text-left mb-6 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
          >
            <div className="text-xs text-amber-500/70 mb-1">Continue Reading</div>
            <div className="text-sm text-neutral-200">{mostRecent.bookTitle}</div>
            <div className="text-xs font-semibold text-amber-500/80 mt-0.5">{mostRecent.verseRef}</div>
            {previews[mostRecent.verseId] && (
              <p className="text-xs text-neutral-400 mt-1.5 line-clamp-2">{previews[mostRecent.verseId]}</p>
            )}
          </button>
        )}

        {rest.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => {
              const target = deriveNavigationTarget(h.verseId)
              if (target) void openReaderForVerse(target.bookKey, target.chapterKey, h.verseId)
            }}
            className="w-full text-left px-3 py-2.5 rounded-md hover:bg-neutral-900 mb-1"
          >
            <div className="text-sm text-neutral-200 truncate">{h.bookTitle}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold text-amber-500/80">{h.verseRef}</span>
              <span className="text-[11px] text-neutral-500">Last opened: {relativeTime(h.timestamp)}</span>
              {h.openCount > 1 && (
                <span className="text-[11px] text-neutral-500">· Read {h.openCount} times</span>
              )}
            </div>
            {previews[h.verseId] && (
              <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{previews[h.verseId]}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
