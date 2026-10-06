import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

import { useHighlightPaletteStore } from '../../stores/useHighlightPaletteStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useStudyStore } from '../../stores/useStudyStore'
import { useUIStore } from '../../stores/useUIStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from './useOpenReaderForVerse'

const FIELD_LABEL: Record<string, string> = {
  translation: 'Translation',
  synonyms: 'Synonyms',
  purport: 'Purport',
}

export function HighlightsTab() {
  const allHighlights = useStudyStore((s) => s.allHighlights)
  const loadAllHighlights = useStudyStore((s) => s.loadAllHighlights)
  const removeHighlight = useStudyStore((s) => s.removeHighlight)
  const palette = useHighlightPaletteStore((s) => s.palette)
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const flashHighlight = useUIStore((s) => s.flashHighlight)
  const openReaderForVerse = useOpenReaderForVerse()

  const [query, setQuery] = useState('')
  const [bookFilter, setBookFilter] = useState<string>('all')
  const [colorFilter, setColorFilter] = useState<string>('all')

  useEffect(() => {
    void loadAllHighlights()
    if (books.length === 0) void loadBooks()
  }, [loadAllHighlights, loadBooks, books.length])

  const bookTitleByKey = useMemo(() => new Map(books.map((b) => [b.bookKey, b.title ?? b.bookKey])), [books])

  const withBook = useMemo(
    () =>
      allHighlights.map((h) => {
        const bookKey = deriveNavigationTarget(h.verseId)?.bookKey ?? null
        return { highlight: h, bookKey, bookTitle: bookKey ? bookTitleByKey.get(bookKey) ?? bookKey : h.verseId }
      }),
    [allHighlights, bookTitleByKey],
  )

  const bookOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const { bookKey, bookTitle } of withBook) {
      if (bookKey) seen.set(bookKey, bookTitle)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [withBook])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return withBook
      .filter(({ bookKey }) => bookFilter === 'all' || bookKey === bookFilter)
      .filter(({ highlight }) => colorFilter === 'all' || highlight.color === colorFilter)
      .filter(
        ({ highlight, bookTitle }) =>
          !q || highlight.selectedText.toLowerCase().includes(q) || bookTitle.toLowerCase().includes(q),
      )
      .sort((a, b) => b.highlight.createdAt.localeCompare(a.highlight.createdAt))
  }, [withBook, query, bookFilter, colorFilter])

  const handleOpen = (verseId: string, highlightId: number) => {
    const target = deriveNavigationTarget(verseId)
    if (target) {
      flashHighlight(highlightId)
      void openReaderForVerse(target.bookKey, target.chapterKey, verseId)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-semibold text-neutral-100 mb-1">Highlights</h1>
        <p className="text-sm text-neutral-500 mb-6">{filtered.length} highlights</p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search highlights…"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-2 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <select
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-2 text-sm text-neutral-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="all">All Books</option>
            {bookOptions.map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-2 text-sm text-neutral-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="all">All Colors</option>
            {palette.map((p) => (
              <option key={p.id} value={p.hex}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-neutral-600 px-1 py-4">No highlights {query || bookFilter !== 'all' || colorFilter !== 'all' ? 'match your filters' : 'yet'}.</p>
        )}

        <div className="flex flex-col gap-2">
          {filtered.map(({ highlight, bookTitle }) => {
            const swatch = highlight.color
            const colorLabel = palette.find((p) => p.hex === highlight.color)?.label ?? highlight.color
            const fieldLabel = highlight.field ? FIELD_LABEL[highlight.field] ?? highlight.field : null
            return (
              <div key={highlight.id} className="flex rounded-md border border-neutral-800 hover:bg-neutral-900/60 overflow-hidden">
                <div className="w-1 shrink-0" style={{ backgroundColor: swatch }} />
                <button type="button" onClick={() => handleOpen(highlight.verseId, highlight.id)} className="flex-1 text-left px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-amber-500/80">{highlight.verseId}</span>
                    <span className="text-xs text-neutral-500">{bookTitle}</span>
                    {fieldLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">{fieldLabel}</span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-300 italic mt-1 line-clamp-2">&ldquo;{highlight.selectedText}&rdquo;</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${swatch}33`, color: swatch }}
                    >
                      {colorLabel}
                    </span>
                    <span className="text-[11px] text-neutral-600">{new Date(highlight.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void removeHighlight(highlight.id, highlight.verseId)}
                  className="p-2 mr-1 self-start mt-1 text-neutral-600 hover:text-red-400"
                  title="Delete highlight"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
