import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Folder, GripVertical, HelpCircle, Loader2, Search, Settings, X } from 'lucide-react'

import { addBookToFolder, removeBookFromFolder, type BookFolder } from '../../services/api'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'
import { getDirectReferenceSuggestions, isReferenceQuery, resolveDirectReference } from '../../services/directReference'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTabStore } from '../../stores/useTabStore'
import type { Book } from '../../types/scripture'
import { CC_LILA_BOOK_KEYS, CC_VIRTUAL_BOOK_KEY, groupBooksByCategory } from './bookGroups'
import { deriveNavigationTarget } from '../../utils/recordKey'
import type { ReferenceSuggestion } from '../../services/directReference'

/** DOM id for the sidebar's search box — the global `Ctrl+F`
 * shortcut (bound in `AppLayout.tsx`) focuses this directly when the
 * active tab isn't a reader (where `Ctrl+F` opens in-page find instead). */
export const GLOBAL_SEARCH_INPUT_ID = 'global-search-input'

/** Strips Sanskrit diacritics and punctuation for fuzzy matching. */
function normalizeForFuzzy(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Checks if `needle` is a character subsequence of `haystack` and returns a compactness score. */
function subsequenceScore(needle: string, haystack: string): number {
  if (!needle) return 0
  let nIdx = 0
  let firstMatch = -1
  let lastMatch = -1
  for (let hIdx = 0; hIdx < haystack.length && nIdx < needle.length; hIdx++) {
    if (haystack[hIdx] === needle[nIdx]) {
      if (firstMatch === -1) firstMatch = hIdx
      lastMatch = hIdx
      nIdx++
    }
  }
  if (nIdx < needle.length) return 0
  const span = Math.max(1, lastMatch - firstMatch + 1)
  return Math.max(1, Math.round((needle.length / span) * 35))
}

/** Fuzzy-matches a book against a plain filter query (title, abbreviation, bookKey, initials, or subsequence). */
function scoreBookFuzzy(book: Book, rawQuery: string): number {
  const q = normalizeForFuzzy(rawQuery)
  if (!q) return 100

  const title = normalizeForFuzzy(book.title ?? '')
  const key = normalizeForFuzzy(book.bookKey)
  const abbr = normalizeForFuzzy(book.abbreviation ?? '')
  const words = title.split(' ').filter(Boolean)
  const initials = words.map((w) => w[0]).join('')

  if (key === q || abbr === q || initials === q) return 120
  if (title.startsWith(q) || key.startsWith(q) || abbr.startsWith(q) || initials.startsWith(q)) return 105
  if (words.some((w) => w.startsWith(q))) return 95
  if (title.includes(q)) return 85

  const qTokens = q.split(' ').filter(Boolean)
  if (qTokens.length > 1) {
    let total = 0
    for (const tok of qTokens) {
      if (title.includes(tok) || key.includes(tok) || abbr.includes(tok)) {
        total += 50
      } else {
        const sub = subsequenceScore(tok, title)
        if (sub === 0) return 0
        total += sub
      }
    }
    return total / qTokens.length
  }

  return subsequenceScore(q.replace(/\s+/g, ''), title.replace(/\s+/g, ''))
}

/** A draggable sidebar book row (the grip handle is the only drag surface —
 * the row itself stays a plain click target so clicking a book still just
 * opens it, with no risk of a click being swallowed as a drag start).
 * Right-clicking anywhere on the row opens the reorder/folder context menu. */
function SortableBookRow({
  book,
  isActive,
  onOpen,
  onContextMenu,
}: {
  book: Book
  isActive: boolean
  onOpen: (book: Book) => void
  onContextMenu: (e: React.MouseEvent, book: Book) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.bookKey })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-0.5"
      onContextMenu={(e) => onContextMenu(e, book)}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="p-1 text-neutral-700 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0"
        tabIndex={-1}
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </button>
      <button
        type="button"
        onClick={() => onOpen(book)}
        className={`flex-1 min-w-0 flex items-center px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
          isActive ? 'bg-amber-500/10 text-amber-300 font-medium' : 'text-neutral-300 hover:bg-neutral-800/60'
        }`}
      >
        <span className="truncate">{book.title ?? book.bookKey}</span>
      </button>
    </div>
  )
}

/** Portal-rendered at the right-click point — Move Up/Down reorder within
 * `customBookOrder`, and (when custom folders exist) toggling this book's
 * membership in each one. Dismissed on outside click or Escape. */
function BookContextMenu({
  book,
  x,
  y,
  folders,
  onMove,
  onToggleFolder,
  onClose,
}: {
  book: Book
  x: number
  y: number
  folders: BookFolder[]
  onMove: (direction: 1 | -1) => void
  onToggleFolder: (folder: BookFolder) => void
  onClose: () => void
}) {
  useEffect(() => {
    const handleDown = () => onClose()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return createPortal(
    <div
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
      className="w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onMove(-1)}
        className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
      >
        Move Up
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
      >
        Move Down
      </button>
      {folders.length > 0 && (
        <>
          <div className="my-1 border-t border-neutral-800" />
          {folders.map((f) => {
            const inFolder = f.bookKeys.includes(book.bookKey)
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onToggleFolder(f)}
                className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                {inFolder ? `✓ In folder: ${f.name}` : `Add to folder: ${f.name}`}
              </button>
            )
          })}
        </>
      )}
    </div>,
    document.body,
  )
}

/** Left-pane search box:
 *  1. Fuzzy-filters the book list in the left pane as you type (press Enter to open top matching book).
 *  2. Supports `@` direct-reference quick access (`@bg 2.13`, `@sb 1.1.1`) to jump straight to any verse. */
function SidebarBookAndRefBox({
  text,
  onTextChange,
  onEnterBook,
}: {
  text: string
  onTextChange: (val: string) => void
  onEnterBook: () => void
}) {
  const [suggestions, setSuggestions] = useState<ReferenceSuggestion[]>([])
  const openReaderForVerse = useOpenReaderForVerse()
  const refMode = isReferenceQuery(text)

  useEffect(() => {
    if (!refMode) {
      setSuggestions([])
      return
    }
    const timer = window.setTimeout(() => {
      void getDirectReferenceSuggestions(text, 20).then(setSuggestions).catch(() => setSuggestions([]))
    }, 80)
    return () => window.clearTimeout(timer)
  }, [text, refMode])

  const jumpToSuggestion = (s: ReferenceSuggestion) => {
    if (!s.recordKey) {
      onTextChange(s.queryToComplete)
      return
    }
    const target = deriveNavigationTarget(s.recordKey)
    const activeTab = useTabStore.getState().tabs.find((t) => t.id === useTabStore.getState().activeTabId)
    const inPlace = activeTab?.type === 'toc'
    if (target) {
      void openReaderForVerse(target.bookKey, target.chapterKey, s.recordKey, {
        inPlace,
        titleSuffix: s.displayText,
      })
    }
    onTextChange('')
    setSuggestions([])
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onTextChange('')
      setSuggestions([])
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (refMode) {
      const hit = await resolveDirectReference(text)
      if (hit) {
        const target = deriveNavigationTarget(hit.recordKey)
        const activeTab = useTabStore.getState().tabs.find((t) => t.id === useTabStore.getState().activeTabId)
        const inPlace = activeTab?.type === 'toc'
        if (target) {
          void openReaderForVerse(target.bookKey, target.chapterKey, hit.recordKey, {
            inPlace,
            titleSuffix: hit.reference ?? hit.recordKey,
          })
        }
        onTextChange('')
        setSuggestions([])
      } else if (suggestions.length > 0) {
        jumpToSuggestion(suggestions[0])
      }
      return
    }
    onEnterBook()
  }

  return (
    <div className="relative px-3 py-2.5 border-b border-neutral-800">
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-2.5 text-neutral-500 pointer-events-none" />
        <input
          id={GLOBAL_SEARCH_INPUT_ID}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => void handleKeyDown(e)}
          placeholder="Filter books, or @verse…"
          title="Fuzzy search books in sidebar, or type @ (e.g. @bg 2.13) to jump directly to a verse"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-7 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              onTextChange('')
              setSuggestions([])
            }}
            className="absolute right-2 text-neutral-500 hover:text-neutral-300 p-0.5 rounded"
            title="Clear"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {refMode && suggestions.length > 0 && (
        <div className="absolute top-full left-3 right-3 mt-1 max-h-72 overflow-y-auto scrollbar-thin bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 py-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jumpToSuggestion(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800"
            >
              <div className="text-neutral-200">{s.displayText}</div>
              <div className="text-xs text-neutral-500">{s.subText}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const isLoadingBooks = useNavigationStore((s) => s.isLoadingBooks)
  const customBookOrder = useNavigationStore((s) => s.customBookOrder)
  const saveCustomBookOrder = useNavigationStore((s) => s.saveCustomBookOrder)
  const folders = useNavigationStore((s) => s.folders)
  const loadFolders = useNavigationStore((s) => s.loadFolders)

  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openTocTab = useTabStore((s) => s.openTocTab)
  const openUtilityTab = useTabStore((s) => s.openUtilityTab)
  const openPdfTab = useTabStore((s) => s.openPdfTab)

  const [sidebarQuery, setSidebarQuery] = useState('')
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ book: Book; x: number; y: number } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    if (books.length === 0 && !isLoadingBooks) {
      void loadBooks()
    }
  }, [books.length, isLoadingBooks, loadBooks])

  const canonicalBooks = useMemo(() => groupBooksByCategory(books).flatMap((g) => g.books), [books])

  const orderedBooks = useMemo(() => {
    if (customBookOrder.length === 0) return canonicalBooks
    const byKey = new Map(canonicalBooks.map((b) => [b.bookKey, b]))
    const ordered = customBookOrder.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []))
    const seen = new Set(ordered.map((b) => b.bookKey))
    const remaining = canonicalBooks.filter((b) => !seen.has(b.bookKey))
    return [...ordered, ...remaining]
  }, [canonicalBooks, customBookOrder])

  const isFilteringBooks = sidebarQuery.trim().length > 0 && !isReferenceQuery(sidebarQuery)

  const filteredBooks = useMemo(() => {
    if (!isFilteringBooks) return orderedBooks
    return orderedBooks
      .map((book) => ({ book, score: scoreBookFuzzy(book, sidebarQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.book)
  }, [orderedBooks, sidebarQuery, isFilteringBooks])

  const bookIds = useMemo(() => filteredBooks.map((b) => b.bookKey), [filteredBooks])

  const handleDragEnd = (event: DragEndEvent) => {
    if (isFilteringBooks) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedBooks.findIndex((b) => b.bookKey === active.id)
    const newIndex = orderedBooks.findIndex((b) => b.bookKey === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    void saveCustomBookOrder(arrayMove(orderedBooks, oldIndex, newIndex).map((b) => b.bookKey))
  }

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const rawActiveBookKey =
    activeTab && (activeTab.type === 'toc' || activeTab.type === 'reader')
      ? (activeTab.payload as { bookKey: string | null }).bookKey
      : null
  const activeBookKey =
    rawActiveBookKey && (CC_LILA_BOOK_KEYS as readonly string[]).includes(rawActiveBookKey)
      ? CC_VIRTUAL_BOOK_KEY
      : rawActiveBookKey

  const handleOpen = (book: Book) => {
    if (book.isPdf && book.pdfPath) {
      openPdfTab(book.title ?? book.bookKey, book.pdfPath)
    } else {
      openTocTab(book.bookKey, book.title ?? book.bookKey)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, book: Book) => {
    e.preventDefault()
    setContextMenu({ book, x: e.clientX, y: e.clientY })
  }

  const handleMove = (direction: 1 | -1) => {
    if (!contextMenu) return
    const idx = orderedBooks.findIndex((b) => b.bookKey === contextMenu.book.bookKey)
    const targetIdx = idx + direction
    if (idx === -1 || targetIdx < 0 || targetIdx >= orderedBooks.length) return
    const reordered = [...orderedBooks]
    ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
    void saveCustomBookOrder(reordered.map((b) => b.bookKey))
    setContextMenu(null)
  }

  const handleToggleFolder = (folder: { id: number; bookKeys: string[] }) => {
    if (!contextMenu) return
    const bookKey = contextMenu.book.bookKey
    const action = folder.bookKeys.includes(bookKey) ? removeBookFromFolder : addBookToFolder
    void action(folder.id, bookKey).then(loadFolders)
    setContextMenu(null)
  }

  const folderBookLookup = useMemo(() => new Map(books.map((b) => [b.bookKey, b])), [books])
  const nonEmptyFolders = useMemo(() => folders.filter((f) => f.bookKeys.length > 0), [folders])

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-r border-neutral-800 bg-[var(--t-nav-bg)] flex flex-col items-center py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="text-neutral-500 hover:text-neutral-200 p-1.5 rounded-md hover:bg-neutral-800"
          title="Expand sidebar"
        >
          <ChevronsRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => openUtilityTab('settings', 'Settings')}
          className="mt-auto text-neutral-500 hover:text-neutral-200 p-1.5 rounded-md hover:bg-neutral-800"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 border-r border-neutral-800 bg-[var(--t-nav-bg)] flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-2 pb-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Books</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="text-neutral-500 hover:text-neutral-200 p-1 rounded-md hover:bg-neutral-800 shrink-0"
          title="Collapse sidebar"
        >
          <ChevronsLeft size={15} />
        </button>
      </div>
      <SidebarBookAndRefBox
        text={sidebarQuery}
        onTextChange={setSidebarQuery}
        onEnterBook={() => {
          if (filteredBooks.length > 0) {
            handleOpen(filteredBooks[0])
            setSidebarQuery('')
          }
        }}
      />

      <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {isLoadingBooks && (
          <div className="flex items-center gap-2 text-neutral-500 text-sm px-2 py-4">
            <Loader2 size={14} className="animate-spin" /> Loading corpus…
          </div>
        )}

        {!isFilteringBooks && nonEmptyFolders.length > 0 && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setFoldersExpanded((v) => !v)}
              className="w-full flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
            >
              {foldersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Folders
            </button>
            {foldersExpanded &&
              nonEmptyFolders.map((f) => (
                <div key={f.id} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-amber-500/80">
                    <Folder size={11} /> {f.name}
                  </div>
                  {f.bookKeys.flatMap((bk) => (folderBookLookup.has(bk) ? [folderBookLookup.get(bk)!] : [])).map((book) => (
                    <button
                      key={book.bookKey}
                      type="button"
                      onClick={() => handleOpen(book)}
                      onContextMenu={(e) => handleContextMenu(e, book)}
                      className={`w-full flex items-center pl-7 pr-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                        activeBookKey === book.bookKey ? 'bg-amber-500/10 text-amber-300 font-medium' : 'text-neutral-300 hover:bg-neutral-800/60'
                      }`}
                    >
                      <span className="truncate">{book.title ?? book.bookKey}</span>
                    </button>
                  ))}
                </div>
              ))}
            <div className="my-2 border-t border-neutral-800" />
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={bookIds} strategy={verticalListSortingStrategy}>
            {filteredBooks.map((book) => (
              <SortableBookRow
                key={book.bookKey}
                book={book}
                isActive={activeBookKey === book.bookKey}
                onOpen={handleOpen}
                onContextMenu={handleContextMenu}
              />
            ))}
          </SortableContext>
        </DndContext>

        {isFilteringBooks && filteredBooks.length === 0 && (
          <div className="px-3 py-6 text-xs text-neutral-500 text-center">
            No matching books found.
          </div>
        )}

        {!isFilteringBooks && customBookOrder.length > 0 && (
          <button
            type="button"
            onClick={() => void saveCustomBookOrder([])}
            className="mt-1 w-full text-xs text-neutral-600 hover:text-neutral-400 py-1"
          >
            Reset order
          </button>
        )}
      </div>

      {contextMenu && (
        <BookContextMenu
          book={contextMenu.book}
          x={contextMenu.x}
          y={contextMenu.y}
          folders={folders}
          onMove={handleMove}
          onToggleFolder={handleToggleFolder}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div className="flex items-center border-t border-neutral-800 shrink-0">
        <button
          type="button"
          onClick={() => openUtilityTab('settings', 'Settings')}
          className="flex-1 flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 border-r border-neutral-800"
        >
          <Settings size={14} />
          Settings
        </button>
        <button
          type="button"
          onClick={() => openUtilityTab('help', 'User Guide')}
          className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-300"
          title="Open User Guide & Manual (F1)"
        >
          <HelpCircle size={14} />
          User Guide
        </button>
      </div>
    </div>
  )
}
