import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bookmark, ChevronDown, Highlighter, Loader2, Search, StickyNote, X, Zap } from 'lucide-react'

import { searchCorpus, searchImportedBooks, unifiedSearch } from '../../services/api'
import { resolveDirectReference, type SearchFilters, type SearchScope, type SearchSort, type SearchSource } from '../../services/directReference'
import { AdvancedSearchModal } from '../search/AdvancedSearchModal'
import { useDirectReferenceAutocomplete } from '../search/useDirectReferenceAutocomplete'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useSearchHitStore } from '../../stores/useSearchHitStore'
import { useTabStore, type SearchTabPayload } from '../../stores/useTabStore'
import { useUIStore } from '../../stores/useUIStore'
import type { BookmarkHit, HighlightHit, NoteHit, SearchHit, SearchParams, UnifiedSearchResponse } from '../../types/study'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from './useOpenReaderForVerse'

const PAGE_SIZE = 25
const LOAD_MORE_SIZE = 50

const SOURCE_OPTIONS: { value: SearchSource; label: string }[] = [
  { value: 'all', label: 'All Results' },
  { value: 'scripture', label: 'Scripture' },
  { value: 'notes', label: 'My Notes' },
  { value: 'bookmarks', label: 'Bookmarks' },
  { value: 'highlights', label: 'My Highlights' },
]

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: 'all', label: 'All Fields' },
  { value: 'devanagari', label: 'Devanagari' },
  { value: 'synonyms', label: 'Synonyms' },
  { value: 'translation', label: 'Translation' },
  { value: 'purport', label: 'Purport' },
]

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Best Match (Relevance)' },
  { value: 'canonical', label: 'Canonical Scripture Order' },
]

import { cleanSearchSnippet } from '../search/SearchModal'

function renderSnippet(snippet: string): ReactNode {
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

function SourceBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${tone}`}>{label}</span>
}

function ResultCard({
  badge,
  reference,
  title,
  body,
  onOpen,
}: {
  badge: ReactNode
  reference: string
  title?: string | null
  body: ReactNode
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3 border-b border-neutral-900 last:border-b-0 hover:bg-neutral-900/60"
    >
      <div className="flex items-center gap-2 mb-1">
        {badge}
        <span className="text-xs font-semibold text-amber-500/80">{reference}</span>
        {title && <span className="text-xs text-neutral-500 truncate">{title}</span>}
      </div>
      <p className="text-sm text-neutral-300 leading-relaxed">{body}</p>
    </button>
  )
}

function BookMultiSelectDropdown({
  books,
  selectedKeys,
  onChange,
}: {
  books: { bookKey: string; title: string | null; abbreviation?: string | null }[]
  selectedKeys?: string[]
  onChange: (keys: string[] | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const allBookKeys = useMemo(() => books.map((b) => b.bookKey), [books])
  const isAllSelected = !selectedKeys || selectedKeys.length === 0 || selectedKeys.length === allBookKeys.length

  const filteredBooks = useMemo(() => {
    if (!filterText.trim()) return books
    const q = filterText.toLowerCase()
    return books.filter((b) => (b.title ?? b.bookKey).toLowerCase().includes(q) || b.bookKey.toLowerCase().includes(q))
  }, [books, filterText])

  const buttonLabel = useMemo(() => {
    if (isAllSelected) return `All Books (${books.length})`
    if (selectedKeys.length === 0) return 'No Books Selected'
    if (selectedKeys.length === 1) {
      const book = books.find((b) => b.bookKey === selectedKeys[0])
      return book?.title ?? selectedKeys[0]
    }
    return `${selectedKeys.length} Books Selected`
  }, [isAllSelected, selectedKeys, books])

  const toggleBook = (key: string) => {
    const current = isAllSelected ? [...allBookKeys] : [...(selectedKeys ?? [])]
    const exists = current.includes(key)
    const next = exists ? current.filter((k) => k !== key) : [...current, key]
    if (next.length === allBookKeys.length) {
      onChange(undefined)
    } else {
      onChange(next)
    }
  }

  const selectAll = () => {
    onChange(undefined)
  }

  const clearAll = () => {
    onChange([])
  }

  const selectScripturesOnly = () => {
    const scriptureKeys = ['BG', 'SB', 'CC'].filter((k) => allBookKeys.includes(k))
    onChange(scriptureKeys)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-300 max-w-[200px]"
        title="Filter by books (Select all, clear, or pick multiple books)"
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-50 flex flex-col p-2 gap-2 text-xs">
          {/* Action buttons */}
          <div className="flex items-center gap-1 pb-1.5 border-b border-neutral-800">
            <button
              type="button"
              onClick={selectAll}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px]"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-[11px]"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={selectScripturesOnly}
              className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px]"
            >
              Scriptures Only
            </button>
          </div>

          {/* Quick search input */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter books…"
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 pl-6 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Checkbox list */}
          <div className="max-h-60 overflow-y-auto scrollbar-thin flex flex-col gap-0.5">
            {filteredBooks.map((b) => {
              const checked = isAllSelected || (selectedKeys?.includes(b.bookKey) ?? false)
              return (
                <label
                  key={b.bookKey}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 cursor-pointer text-neutral-300 select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBook(b.bookKey)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="truncate">{b.title ?? b.bookKey}</span>
                </label>
              )
            })}
            {filteredBooks.length === 0 && (
              <span className="text-neutral-600 px-2 py-2 text-center">No matching books</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SearchTab({ tabId }: { tabId: string }) {
  const payload = useTabStore((s) => s.tabs.find((t) => t.id === tabId)?.payload) as SearchTabPayload | undefined
  const updateTabPayload = useTabStore((s) => s.updateTabPayload)
  const renameTab = useTabStore((s) => s.renameTab)
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const openReaderForVerse = useOpenReaderForVerse()
  const advancedSearchToken = useUIStore((s) => s.advancedSearchToken)

  const [query, setQuery] = useState(payload?.query ?? '')
  const [filters, setFilters] = useState<SearchFilters>(
    payload?.filters ?? { bookGroup: 'all', source: 'all', exactWord: false, matchCase: false, scope: 'all', sort: 'relevance' },
  )
  const [result, setResult] = useState<UnifiedSearchResponse | null>(null)
  // Scripture hits are tracked separately from the rest of `result` so
  // "Load More" can grow just this list without re-fetching notes/
  // bookmarks/highlights every time.
  const [scriptureHits, setScriptureHits] = useState<SearchHit[]>([])
  const [scriptureTotal, setScriptureTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [rawQuery, setRawQuery] = useState<string | null>(null)
  const [advancedBookKeys, setAdvancedBookKeys] = useState<string[]>([])
  const debounceRef = useRef<number | null>(null)
  const lastAdvancedToken = useRef(advancedSearchToken)

  const { active: refMode, suggestions: refSuggestions } = useDirectReferenceAutocomplete(query)

  useEffect(() => {
    if (books.length === 0) void loadBooks()
  }, [books.length, loadBooks])

  // Ctrl+Shift+S (from anywhere, via ReaderCanvas) bumps this token; open
  // the modal the first time this tab instance sees a value it hasn't
  // already reacted to — covers both "tab already open" and "tab just
  // got created to receive this request" without re-opening on every
  // ordinary re-render.
  useEffect(() => {
    if (advancedSearchToken !== lastAdvancedToken.current) {
      lastAdvancedToken.current = advancedSearchToken
      if (advancedSearchToken > 0) setAdvancedOpen(true)
    }
  }, [advancedSearchToken])

  // Persist query/filters into the tab payload (survives tab switches) and
  // keep the tab's title readable.
  useEffect(() => {
    updateTabPayload(tabId, { query, filters })
    renameTab(tabId, query ? `Search: ${query}` : 'Search')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters])

  const buildBaseParams = (): { bookGroup?: string; bookCodes?: string[] } => {
    let bookCodes: string[] | undefined = undefined
    if (rawQuery !== null && advancedBookKeys.length > 0) {
      bookCodes = advancedBookKeys
    } else if (filters.bookCodes !== undefined) {
      if (filters.bookCodes.length === 0) {
        bookCodes = ['__none__']
      } else if (filters.bookCodes.length < books.length) {
        bookCodes = filters.bookCodes
      }
    } else if (filters.bookGroup && filters.bookGroup !== 'all') {
      const isKnownGroup = ['gita', 'bhagavatam', 'cc'].includes(filters.bookGroup)
      if (!isKnownGroup) {
        bookCodes = [filters.bookGroup]
      }
    }
    const bookGroup =
      filters.bookGroup && ['gita', 'bhagavatam', 'cc'].includes(filters.bookGroup) ? filters.bookGroup : undefined
    return { bookGroup, bookCodes }
  }

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = (rawQuery ?? query).trim()
    if (!q || refMode) {
      setResult(null)
      setScriptureHits([])
      setScriptureTotal(0)
      setElapsedMs(null)
      return
    }
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      const { bookGroup, bookCodes } = buildBaseParams()
      const start = performance.now()
      const includeImported = filters.source === 'all' || filters.source === 'scripture'
      Promise.all([
        unifiedSearch(
          {
            query: q,
            bookGroup,
            bookCodes,
            prefix: rawQuery === null,
            raw: rawQuery !== null,
            limit: PAGE_SIZE,
            offset: 0,
            exactWord: filters.exactWord,
            matchCase: filters.matchCase,
            scope: filters.scope === 'all' ? undefined : filters.scope,
            sort: filters.sort,
          },
          filters.source,
        ),
        // Imported books (Settings → Corpus & Books) live in a separate
        // extension database with their own simple LIKE-based search, not
        // the bundled corpus's FTS5 index — merged in here so they still
        // show up in the one Search tab users already know, rather than
        // needing a second, separate search surface.
        includeImported && rawQuery === null ? searchImportedBooks(q) : Promise.resolve([]),
      ])
        .then(([res, importedHits]) => {
          const scoped = importedHits.filter((h) => filters.bookGroup === 'all' || h.bookKey === filters.bookGroup)
          setResult(res)
          setScriptureHits([...res.scripture.hits, ...scoped])
          setScriptureTotal(res.scripture.total + scoped.length)
          setElapsedMs(Math.round(performance.now() - start))
        })
        .catch(() => {
          setResult(null)
          setScriptureHits([])
          setScriptureTotal(0)
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rawQuery, advancedBookKeys, filters, refMode])

  const loadMoreScripture = () => {
    const q = (rawQuery ?? query).trim()
    if (!q || loadingMore) return
    setLoadingMore(true)
    const { bookGroup, bookCodes } = buildBaseParams()
    const params: SearchParams = {
      query: q,
      bookGroup,
      bookCodes,
      prefix: rawQuery === null,
      raw: rawQuery !== null,
      limit: LOAD_MORE_SIZE,
      offset: scriptureHits.length,
      exactWord: filters.exactWord,
      matchCase: filters.matchCase,
      scope: filters.scope === 'all' ? undefined : filters.scope,
      sort: filters.sort,
    }
    searchCorpus(params)
      .then((res) => {
        setScriptureHits((prev) => [...prev, ...res.hits])
        setScriptureTotal(res.total)
      })
      .finally(() => setLoadingMore(false))
  }

  const bannerText = useMemo(() => {
    if (loading) return 'Searching…'
    if (!result) return ''
    const parts: string[] = []
    if (filters.source === 'all' || filters.source === 'scripture') {
      parts.push(
        scriptureHits.length < scriptureTotal
          ? `${scriptureHits.length.toLocaleString()} of ${scriptureTotal.toLocaleString()} scripture`
          : `${scriptureTotal.toLocaleString()} scripture`,
      )
    }
    if (filters.source === 'all' || filters.source === 'notes') parts.push(`${result.notesTotal} notes`)
    if (filters.source === 'all' || filters.source === 'bookmarks') parts.push(`${result.bookmarksTotal} bookmarks`)
    if (filters.source === 'all' || filters.source === 'highlights') parts.push(`${result.highlightsTotal} highlights`)
    return `Results for "${rawQuery ?? query}": ${parts.join(', ')}${elapsedMs !== null ? ` (${elapsedMs}ms)` : ''}`
  }, [loading, result, filters.source, rawQuery, query, elapsedMs, scriptureHits.length, scriptureTotal])

  const handleOpenScripture = (hit: SearchHit) => {
    const target = deriveNavigationTarget(hit.recordKey)
    if (!target) return
    useSearchHitStore.getState().setHits(scriptureHits.map((h) => h.recordKey), rawQuery ?? query)
    void openReaderForVerse(target.bookKey, target.chapterKey, hit.recordKey, {
      newTab: true,
      titleSuffix: hit.reference ?? hit.recordKey,
    })
  }
  const handleOpenByVerseId = (verseId: string) => {
    const target = deriveNavigationTarget(verseId)
    if (target) {
      void openReaderForVerse(target.bookKey, target.chapterKey, verseId, {
        newTab: true,
        titleSuffix: verseId,
      })
    }
  }

  const handleReferenceEnter = async () => {
    const hit = await resolveDirectReference(query)
    if (hit) {
      void openReaderForVerse(hit.bookKey, deriveNavigationTarget(hit.recordKey)?.chapterKey ?? '', hit.recordKey, {
        newTab: true,
        titleSuffix: hit.reference ?? hit.recordKey,
      })
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-neutral-800 bg-neutral-950/80">
        <div className="flex items-center gap-2 px-4 py-3">
          <Search size={16} className="text-neutral-500 shrink-0" />
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setRawQuery(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && refMode) void handleReferenceEnter()
              }}
              placeholder='Search the corpus… try "supreme lord", kṛṣṇa, or @BG 2.20'
              className="w-full bg-transparent text-neutral-100 placeholder:text-neutral-600 focus:outline-none text-sm"
              autoFocus
            />
            {rawQuery && (
              <div className="absolute -bottom-5 left-0 text-[10px] text-amber-500/70">
                Advanced query active — <code className="text-neutral-500">{rawQuery}</code>
              </div>
            )}
            {refMode && refSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-96 max-h-72 overflow-y-auto scrollbar-thin bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 py-1">
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
                          })
                        }
                      } else {
                        setQuery(s.queryToComplete)
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800"
                  >
                    <div className="text-neutral-200">{s.displayText}</div>
                    <div className="text-xs text-neutral-500">{s.subText}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setRawQuery(null)
              }}
              className="p-1 rounded-md text-neutral-500 hover:bg-neutral-800"
            >
              <X size={15} />
            </button>
          )}
          <BookMultiSelectDropdown
            books={books}
            selectedKeys={filters.bookCodes}
            onChange={(selected) => setFilters((f) => ({ ...f, bookCodes: selected }))}
          />
          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 shrink-0"
          >
            <Zap size={12} /> Advanced Search
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-neutral-900 overflow-x-auto">
          {SOURCE_OPTIONS.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 shrink-0 cursor-pointer">
              <input
                type="radio"
                name="search-source"
                checked={filters.source === s.value}
                onChange={() => setFilters((f) => ({ ...f, source: s.value }))}
                className="accent-amber-500"
              />
              <span className="text-xs text-neutral-300">{s.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center flex-wrap gap-4 px-4 py-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.exactWord}
              onChange={(e) => setFilters((f) => ({ ...f, exactWord: e.target.checked }))}
              className="accent-amber-500"
            />
            <span className="text-xs text-neutral-400">Match Exact Word</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.matchCase}
              onChange={(e) => setFilters((f) => ({ ...f, matchCase: e.target.checked }))}
              className="accent-amber-500"
            />
            <span className="text-xs text-neutral-400">Match Case</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500">Scope:</span>
            <select
              value={filters.scope}
              onChange={(e) => setFilters((f) => ({ ...f, scope: e.target.value as SearchScope }))}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1 text-xs text-neutral-300"
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500">Sort:</span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SearchSort }))}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1 text-xs text-neutral-300"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {bannerText && <div className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-900">{bannerText}</div>}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {(filters.source === 'all' || filters.source === 'scripture') &&
          scriptureHits.map((hit) => (
            <ResultCard
              key={hit.recordKey}
              badge={<SourceBadge label={hit.bookKey} tone="bg-neutral-800 text-neutral-400" />}
              reference={hit.reference ?? hit.recordKey}
              title={hit.title}
              body={renderSnippet(hit.snippet)}
              onOpen={() => handleOpenScripture(hit)}
            />
          ))}

        {(filters.source === 'all' || filters.source === 'scripture') && scriptureHits.length < scriptureTotal && (
          <div className="px-4 py-4 flex flex-col items-center gap-2">
            <p className="text-xs text-neutral-600">
              Showing {scriptureHits.length.toLocaleString()} of {scriptureTotal.toLocaleString()} results
            </p>
            <button
              type="button"
              onClick={loadMoreScripture}
              disabled={loadingMore}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {loadingMore && <Loader2 size={14} className="animate-spin" />}
              Load More Results (+{LOAD_MORE_SIZE})
            </button>
          </div>
        )}

        {(filters.source === 'all' || filters.source === 'notes') &&
          result?.notes.map((n: NoteHit, i) => (
            <ResultCard
              key={n.verseId ?? `standalone-${i}`}
              badge={<SourceBadge label="Note" tone="bg-sky-500/20 text-sky-300" />}
              reference={n.verseId ?? 'Standalone Note'}
              body={n.contentText}
              onOpen={() => {
                if (n.verseId) handleOpenByVerseId(n.verseId)
              }}
            />
          ))}

        {(filters.source === 'all' || filters.source === 'bookmarks') &&
          result?.bookmarks.map((b: BookmarkHit) => (
            <ResultCard
              key={b.verseId}
              badge={<SourceBadge label="Bookmark" tone="bg-amber-500/20 text-amber-300" />}
              reference={b.verseRef}
              title={b.bookTitle}
              body={b.tag ?? ''}
              onOpen={() => handleOpenByVerseId(b.verseId)}
            />
          ))}

        {(filters.source === 'all' || filters.source === 'highlights') &&
          result?.highlights.map((h: HighlightHit) => (
            <ResultCard
              key={h.verseId + h.createdAt}
              badge={<SourceBadge label="Highlight" tone="bg-fuchsia-500/20 text-fuchsia-300" />}
              reference={h.verseId}
              body={h.selectedText}
              onOpen={() => handleOpenByVerseId(h.verseId)}
            />
          ))}

        {!loading &&
          !refMode &&
          (rawQuery ?? query).trim() &&
          result &&
          scriptureHits.length + result.notes.length + result.bookmarks.length + result.highlights.length === 0 && (
            <p className="px-4 py-8 text-sm text-neutral-600 text-center">No results found.</p>
          )}

        {!query.trim() && (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-neutral-600 text-sm">
            <Search size={22} className="text-neutral-700" />
            Search scripture, notes, bookmarks, and highlights at once.
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1"><StickyNote size={12} /> Notes</span>
              <span className="flex items-center gap-1"><Bookmark size={12} /> Bookmarks</span>
              <span className="flex items-center gap-1"><Highlighter size={12} /> Highlights</span>
            </div>
          </div>
        )}
      </div>

      {advancedOpen && (
        <AdvancedSearchModal
          initialQuery={rawQuery ?? query}
          onClose={() => setAdvancedOpen(false)}
          onRun={(fts5Query, checkedBookKeys) => {
            setRawQuery(fts5Query)
            setAdvancedBookKeys(checkedBookKeys)
          }}
        />
      )}
    </div>
  )
}
