import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Zap } from 'lucide-react'

import { searchCorpus } from '../../services/api'
import { resolveDirectReference } from '../../services/directReference'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'
import { useDirectReferenceAutocomplete } from './useDirectReferenceAutocomplete'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTabStore } from '../../stores/useTabStore'
import type { SearchHit } from '../../types/study'
import { deriveNavigationTarget } from '../../utils/recordKey'

type Scope = 'all' | 'gita' | 'bhagavatam' | 'cc' | 'other'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All Books' },
  { value: 'gita', label: 'Bhagavad-gītā' },
  { value: 'bhagavatam', label: 'Śrīmad-Bhāgavatam' },
  { value: 'cc', label: 'Caitanya-caritāmṛta' },
  { value: 'other', label: 'Other' },
]
const MAJOR_BOOK_KEYS = ['BG', 'SB', 'DI', 'MADHYA', 'ANTYA']

/** Cleans raw Vaishnava song JSON syntax from FTS5 snippets while keeping `<mark>` highlights intact. */
export function cleanSearchSnippet(snippet: string): string {
  if (!snippet.includes('"type"') && !snippet.includes('"stanzas"') && !snippet.includes('"lines"')) {
    return snippet
  }
  return snippet
    .replace(/\{\s*"type"\s*:\s*"song"\s*,?/g, '')
    .replace(/"(bannerTitle|subtitle|intro|stanzas|label|lines|translation)"\s*:\s*/g, ' ')
    .replace(/[\[\]\{\}"]/g, ' ')
    .replace(/\s*,\s*/g, ' · ')
    .replace(/(?:\s*·\s*)+/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function renderSnippet(snippet: string): React.ReactNode {
  const cleaned = cleanSearchSnippet(snippet)
  const parts = cleaned.split(/(<mark>.*?<\/mark>)/g)
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

export function SearchModal({ onClose }: { onClose: () => void }) {
  const books = useNavigationStore((s) => s.books)
  const openReaderForVerse = useOpenReaderForVerse()
  const openSearchTab = useTabStore((s) => s.openSearchTab)

  const [query, setQuery] = useState('')
  const { active: refMode, suggestions: refSuggestions } = useDirectReferenceAutocomplete(query)
  const [scope, setScope] = useState<Scope>('all')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q || refMode) {
      setHits([])
      setTotal(0)
      setElapsedMs(null)
      return
    }
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      const bookCodes =
        scope === 'other' ? books.filter((b) => !MAJOR_BOOK_KEYS.includes(b.bookKey)).map((b) => b.bookKey) : undefined
      const bookGroup = scope !== 'all' && scope !== 'other' ? scope : undefined
      const start = performance.now()
      searchCorpus({ query: q, bookGroup, bookCodes, prefix: true, limit: 25, offset: 0 })
        .then((res) => {
          setHits(res.hits)
          setTotal(res.total)
          setElapsedMs(Math.round(performance.now() - start))
          setSelectedIndex(0)
        })
        .catch(() => {
          setHits([])
          setTotal(0)
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query, scope, books, refMode])

  const openHit = (hit: SearchHit) => {
    const target = deriveNavigationTarget(hit.recordKey)
    if (!target) return
    void openReaderForVerse(target.bookKey, target.chapterKey, hit.recordKey, {
      newTab: true,
      titleSuffix: hit.reference ?? hit.recordKey,
    }).then((ok) => {
      if (ok) onClose()
    })
  }

  const openReference = async (overrideQuery?: string) => {
    const hit = await resolveDirectReference(overrideQuery ?? query)
    if (!hit) return
    const target = deriveNavigationTarget(hit.recordKey)
    if (!target) return
    const ok = await openReaderForVerse(target.bookKey, target.chapterKey, hit.recordKey, {
      newTab: true,
      titleSuffix: hit.reference ?? hit.recordKey,
    })
    if (ok) onClose()
  }

  const openFullSearchTab = () => {
    if (!query.trim()) return
    openSearchTab(query.trim())
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      openFullSearchTab()
    } else if (refMode) {
      if (e.key === 'Enter') {
        e.preventDefault()
        void openReference()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[selectedIndex]
      if (hit) openHit(hit)
    }
  }

  const resultLabel = useMemo(() => {
    if (loading) return 'Searching…'
    if (elapsedMs === null) return ''
    return `Found ${total.toLocaleString()} result${total === 1 ? '' : 's'} in ${elapsedMs}ms`
  }, [loading, total, elapsedMs])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
          <Search size={16} className="text-neutral-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search the corpus… try "supreme lord", kṛṣṇa, or @BG 2.20'
            className="flex-1 bg-transparent text-neutral-100 placeholder:text-neutral-600 focus:outline-none text-sm"
          />
          {query.trim() && (
            <button
              type="button"
              onClick={openFullSearchTab}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 shrink-0"
              title="Open in Search Studio (Ctrl+Enter)"
            >
              <Zap size={11} /> Studio
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1 rounded-md text-neutral-500 hover:bg-neutral-800">
            <X size={15} />
          </button>
        </div>

        {!refMode && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-neutral-800 overflow-x-auto">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScope(s.value)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  scope === s.value
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-neutral-400 border border-neutral-800 hover:bg-neutral-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {!refMode && resultLabel && (
          <div className="px-4 py-2 text-xs text-neutral-500 border-b border-neutral-800">{resultLabel}</div>
        )}

        {refMode && (
          <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
            {refSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (s.recordKey) {
                    const target = deriveNavigationTarget(s.recordKey)
                    if (target) {
                      void openReaderForVerse(target.bookKey, target.chapterKey, s.recordKey, {
                        newTab: true,
                        titleSuffix: s.displayText,
                      }).then((ok) => {
                        if (ok) onClose()
                      })
                    }
                  } else {
                    setQuery(s.queryToComplete)
                  }
                }}
                className="w-full text-left px-4 py-2.5 border-b border-neutral-900 last:border-b-0 hover:bg-neutral-900"
              >
                <div className="text-sm text-neutral-200">{s.displayText}</div>
                <div className="text-xs text-neutral-500">{s.subText}</div>
              </button>
            ))}
            {refSuggestions.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-600 text-center">No matching work or verse.</p>
            )}
          </div>
        )}

        <div className={refMode ? 'hidden' : 'max-h-[28rem] overflow-y-auto scrollbar-thin'}>
          {hits.map((hit, i) => (
            <button
              key={hit.recordKey}
              type="button"
              onClick={() => openHit(hit)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-900 last:border-b-0 ${
                i === selectedIndex ? 'bg-neutral-900' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-neutral-800 text-neutral-400">
                  {hit.bookKey}
                </span>
                <span className="text-xs font-semibold text-amber-500/80">{hit.reference ?? hit.recordKey}</span>
                {hit.title && <span className="text-xs text-neutral-500 truncate">{hit.title}</span>}
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">{renderSnippet(hit.snippet)}</p>
            </button>
          ))}
          {!loading && query.trim() && hits.length === 0 && (
            <p className="px-4 py-6 text-sm text-neutral-600 text-center">No results found.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
