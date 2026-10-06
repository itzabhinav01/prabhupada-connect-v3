import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'

import { getConcordance, type ConcordanceResult } from '../../services/api'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'

function renderSnippet(snippet: string): ReactNode {
  const parts = snippet.split(/(<mark>.*?<\/mark>)/g)
  return parts.map((part, i) => {
    const match = part.match(/^<mark>(.*)<\/mark>$/)
    if (match) {
      return (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
          {match[1]}
        </mark>
      )
    }
    return <span key={i}>{part}</span>
  })
}

/** v2's `ConcordanceDialog.xaml` — the "Sanskrit Lemma & Grammatical Word
 * Explorer": every corpus occurrence of a clicked Synonyms lemma, grouped
 * by book with frequency chips. Rendered through a portal for the same
 * reason `ChantingGuide` is — it lives inside a `transform`-positioned
 * virtualized list item, which would otherwise pin its `fixed` overlay to
 * that scrolled ancestor instead of the real viewport. */
export function ConcordanceDrawer({ lemma, onClose }: { lemma: string; onClose: () => void }) {
  const [result, setResult] = useState<ConcordanceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookFilter, setBookFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const openReaderForVerse = useOpenReaderForVerse()
  const books = useNavigationStore((s) => s.books)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setBookFilter(null)
    void getConcordance(lemma).then((r) => {
      if (!cancelled) {
        setResult(r)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [lemma])

  const bookTitle = (bookKey: string) => books.find((b) => b.bookKey === bookKey)?.title ?? bookKey

  const filteredMatches = useMemo(() => {
    if (!result) return []
    const q = query.trim().toLowerCase()
    return result.matches
      .filter((m) => !bookFilter || m.bookKey === bookFilter)
      .filter((m) => !q || m.snippet.toLowerCase().includes(q) || (m.reference ?? '').toLowerCase().includes(q))
  }, [result, bookFilter, query])

  const handleOpen = (recordKey: string) => {
    const target = deriveNavigationTarget(recordKey)
    if (target) void openReaderForVerse(target.bookKey, target.chapterKey, recordKey)
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-neutral-950 border-l border-neutral-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-amber-400">{lemma}</h2>
            {result && <p className="text-xs text-neutral-500 mt-0.5">{result.total.toLocaleString()} occurrences across all books</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Searching corpus…
          </div>
        ) : (
          <>
            {result && result.byBook.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin px-4 py-3 border-b border-neutral-800">
                <button
                  type="button"
                  onClick={() => setBookFilter(null)}
                  className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                    bookFilter === null ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  All ({result.total})
                </button>
                {result.byBook.map((b) => (
                  <button
                    key={b.bookKey}
                    type="button"
                    onClick={() => setBookFilter(b.bookKey === bookFilter ? null : b.bookKey)}
                    className={`shrink-0 text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                      bookFilter === b.bookKey ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    {b.bookKey} {b.count}
                  </button>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-b border-neutral-800">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter results (e.g. 10.14, compassion, therefore)…"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
              {filteredMatches.length === 0 && <p className="text-sm text-neutral-600 py-4">No occurrences match.</p>}
              <div className="flex flex-col gap-1">
                {filteredMatches.map((m) => (
                  <button
                    key={m.recordKey}
                    type="button"
                    onClick={() => handleOpen(m.recordKey)}
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-neutral-900"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-amber-500/80">{m.reference ?? m.recordKey}</span>
                      <span className="text-xs text-neutral-500">{bookTitle(m.bookKey)}</span>
                    </div>
                    <p className="text-sm text-neutral-300">{renderSnippet(m.snippet)}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
