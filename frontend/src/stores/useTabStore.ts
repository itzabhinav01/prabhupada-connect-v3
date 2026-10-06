import { create } from 'zustand'

import type { SearchFilters } from '../services/directReference'
import { DEFAULT_SEARCH_FILTERS } from '../services/directReference'

export type TabType =
  | 'toc'
  | 'reader'
  | 'search'
  | 'settings'
  | 'notes'
  | 'bookmarks'
  | 'history'
  | 'highlights'
  | 'help'
  | 'browser'
  | 'pdf'

export interface TocTabPayload {
  /** null renders the full Library / Book Catalog view (the `[+]` default). */
  bookKey: string | null
}

export interface ReaderTabPayload {
  bookKey: string
  chapterKey: string | null
  verseId: string | null
}

export interface SearchTabPayload {
  query: string
  filters: SearchFilters
  /** Set when opened via "Search in Book" from the reader toolbar — the
   * Search tab pre-filters its book picker to just this book on mount. */
  scopeBookKey?: string
  scopeBookTitle?: string
}

export interface BrowserTabPayload {
  url: string
}

export interface PdfTabPayload {
  title: string
  pdfPath: string
}

export type TabPayload =
  | TocTabPayload
  | ReaderTabPayload
  | SearchTabPayload
  | BrowserTabPayload
  | PdfTabPayload
  | Record<string, never>

export interface Tab {
  id: string
  type: TabType
  title: string
  isClosable: boolean
  payload: TabPayload
}

let nextId = 1
function makeTabId(): string {
  return `tab-${nextId++}-${Date.now().toString(36)}`
}

function defaultLibraryTab(): Tab {
  return { id: makeTabId(), type: 'toc', title: 'Library', isClosable: true, payload: { bookKey: null } }
}

interface TabState {
  tabs: Tab[]
  activeTabId: string

  openTab: (
    tab: Partial<Pick<Tab, 'id' | 'isClosable'>> & Pick<Tab, 'type' | 'title' | 'payload'>,
    opts?: { reuseKey?: string },
  ) => string
  /** Replaces the active tab's content in place (v2's `NavigateCurrentTab`
   * behavior) instead of appending a new tab — the one navigation primitive
   * every non-`[+]` tab-opening action should go through. Falls back to
   * `openTab` only on the startup edge case where there's no active tab. */
  navigateActiveTab: (tab: Pick<Tab, 'type' | 'title' | 'payload'>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabPayload: (id: string, patch: Partial<TabPayload>) => void
  renameTab: (id: string, title: string) => void
  cycleTab: (direction: 1 | -1) => void
  openLibraryTab: () => void
  openTocTab: (bookKey: string, title: string) => void
  openReaderTab: (args: {
    bookKey: string
    chapterKey: string | null
    verseId: string | null
    title: string
    forceNewTab?: boolean
  }) => string
  openSearchTab: (query: string) => void
  openSearchTabForBook: (bookKey: string, bookTitle: string) => void
  openUtilityTab: (type: 'settings' | 'notes' | 'bookmarks' | 'history' | 'highlights' | 'help', title: string) => void
  openHelpTab: () => void
  openBrowserTab: (url?: string) => void
  openPdfTab: (title: string, pdfPath: string) => void
}

const INITIAL_TAB = defaultLibraryTab()

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [INITIAL_TAB],
  activeTabId: INITIAL_TAB.id,

  openTab: (tab, opts) => {
    if (opts?.reuseKey) {
      const existing = get().tabs.find((t) => t.type === tab.type && tabReuseKey(t) === opts.reuseKey)
      if (existing) {
        set((s) => ({
          activeTabId: existing.id,
          tabs: s.tabs.map((t) => (t.id === existing.id ? { ...t, payload: tab.payload, title: tab.title } : t)),
        }))
        return existing.id
      }
    }
    const id = tab.id ?? makeTabId()
    const newTab: Tab = {
      id,
      type: tab.type,
      title: tab.title,
      isClosable: tab.isClosable ?? true,
      payload: tab.payload,
    }
    set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }))
    return id
  },

  navigateActiveTab: (tab) => {
    const { activeTabId, tabs } = get()
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    if (idx === -1) {
      get().openTab(tab)
      return
    }
    // A fresh id (not a mutate-in-place reuse of the old one) deliberately
    // makes this look like "closed the old tab, opened a new one at the
    // same position" to everything downstream — e.g. `useReaderTabSync`'s
    // restore effect keys its "already restored this tab" guard off the
    // tab id, and navigating a reader tab to a *different* book/chapter
    // while reusing its id would make that guard wrongly skip loading the
    // new target.
    const id = makeTabId()
    set((s) => ({
      activeTabId: id,
      tabs: s.tabs.map((t, i) =>
        i === idx ? { id, type: tab.type, title: tab.title, isClosable: t.isClosable, payload: tab.payload } : t,
      ),
    }))
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return s
      let tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (tabs.length === 0) {
        const fresh = defaultLibraryTab()
        tabs = [fresh]
        activeTabId = fresh.id
      } else if (activeTabId === id) {
        const fallbackIdx = Math.max(0, idx - 1)
        activeTabId = tabs[Math.min(fallbackIdx, tabs.length - 1)].id
      }
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabPayload: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, payload: { ...t.payload, ...patch } as TabPayload } : t,
      ),
    })),

  renameTab: (id, title) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),

  cycleTab: (direction) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const nextIdx = (idx + direction + tabs.length) % tabs.length
    set({ activeTabId: tabs[nextIdx].id })
  },

  openLibraryTab: () => {
    get().openTab(
      { type: 'toc', title: 'Library', payload: { bookKey: null } satisfies TocTabPayload },
      { reuseKey: 'toc:__library__' },
    )
  },

  openTocTab: (bookKey, title) => {
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    if (active && active.type === 'toc') {
      get().navigateActiveTab({ type: 'toc', title, payload: { bookKey } satisfies TocTabPayload })
    } else {
      get().openTab(
        { type: 'toc', title, payload: { bookKey } satisfies TocTabPayload },
        { reuseKey: `toc:${bookKey}` },
      )
    }
  },

  openReaderTab: ({ bookKey, chapterKey, verseId, title, forceNewTab }) => {
    return get().openTab(
      { type: 'reader', title, payload: { bookKey, chapterKey, verseId } satisfies ReaderTabPayload },
      forceNewTab ? undefined : { reuseKey: `reader:${bookKey}:${chapterKey ?? ''}` },
    )
  },

  openSearchTab: (query) => {
    const title = query ? `Search: ${query}` : 'Search'
    const payload = { query, filters: DEFAULT_SEARCH_FILTERS } satisfies SearchTabPayload
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    if (active && (active.type === 'search' || (active.type === 'toc' && (active.payload as TocTabPayload).bookKey === null))) {
      get().navigateActiveTab({ type: 'search', title, payload })
    } else {
      get().openTab({ type: 'search', title, payload }, { reuseKey: 'search:__active__' })
    }
  },

  openSearchTabForBook: (bookKey, bookTitle) => {
    const payload = {
      query: '',
      filters: { ...DEFAULT_SEARCH_FILTERS, bookGroup: bookKey },
      scopeBookKey: bookKey,
      scopeBookTitle: bookTitle,
    } satisfies SearchTabPayload
    get().openTab({ type: 'search', title: `Search: ${bookTitle}`, payload }, { reuseKey: 'search:__active__' })
  },

  openUtilityTab: (type, title) => {
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    if (active && active.type === 'toc' && (active.payload as TocTabPayload).bookKey === null) {
      get().navigateActiveTab({ type, title, payload: {} })
    } else {
      get().openTab({ type, title, payload: {} }, { reuseKey: `${type}:__singleton__` })
    }
  },

  openHelpTab: () => {
    get().openTab({ type: 'help', title: 'User Manual', payload: {} }, { reuseKey: 'help:__singleton__' })
  },

  openBrowserTab: (url = 'https://vedabase.io') => {
    get().openTab(
      { type: 'browser', title: 'Browser', payload: { url } satisfies BrowserTabPayload },
      { reuseKey: 'browser:__singleton__' },
    )
  },

  openPdfTab: (title, pdfPath) => {
    const active = get().tabs.find((t) => t.id === get().activeTabId)
    if (active && active.type === 'toc') {
      get().navigateActiveTab({ type: 'pdf', title, payload: { title, pdfPath } satisfies PdfTabPayload })
    } else {
      get().openTab(
        { type: 'pdf', title, payload: { title, pdfPath } satisfies PdfTabPayload },
        { reuseKey: `pdf:${pdfPath}` },
      )
    }
  },
}))

/** The key used to find-or-reuse a tab of the same logical identity instead
 * of piling up duplicates (e.g. clicking the same book twice, or opening
 * Settings from two different places). */
function tabReuseKey(tab: Tab): string {
  switch (tab.type) {
    case 'toc': {
      const p = tab.payload as TocTabPayload
      return p.bookKey ? `toc:${p.bookKey}` : 'toc:__library__'
    }
    case 'reader': {
      const p = tab.payload as ReaderTabPayload
      return `reader:${p.bookKey}:${p.chapterKey ?? ''}`
    }
    case 'pdf': {
      const p = tab.payload as PdfTabPayload
      return `pdf:${p.pdfPath}`
    }
    case 'search':
      return 'search:__active__'
    case 'settings':
    case 'notes':
    case 'bookmarks':
    case 'history':
    case 'highlights':
    case 'help':
    case 'browser':
      return `${tab.type}:__singleton__`
    default:
      return tab.id
  }
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __tabStore: typeof useTabStore }).__tabStore = useTabStore
}
