import { create } from 'zustand'

import { getBookFolders, getBookToc, getBooks, getChapterRecords, getVerseRecord, saveSetting, type BookFolder } from '../services/api'
import type { Book, TocChapter, VerseRecord } from '../types/scripture'
import { debounce } from '../utils/debounce'

export type ReadingMode = 'continuous' | 'focus'

const debouncedSaveReadingMode = debounce(
  (mode: ReadingMode) => void saveSetting('readingMode', JSON.stringify(mode)),
  400,
)

interface NavigationState {
  books: Book[]
  /** The user's custom book folders (Settings → Corpus & Books) — kept here
   * rather than fetched locally by each consumer so the Library catalog and
   * Sidebar both see the same list without duplicating the fetch. */
  folders: BookFolder[]
  /** Sidebar book order the user dragged into place (a list of `bookKey`s,
   * the virtual `'CC'` key included) — `[]` means "no override." */
  customBookOrder: string[]
  selectedBook: Book | null
  toc: TocChapter[]
  selectedChapter: TocChapter | null
  chapterRecords: VerseRecord[]
  activeVerseId: string | null
  /** Bumped by `jumpToVerse` so the continuous reader knows to scroll —
   * plain scroll-driven `setActiveVerse` calls leave it untouched. */
  jumpToken: number
  readingMode: ReadingMode

  isLoadingBooks: boolean
  isLoadingToc: boolean
  isLoadingChapter: boolean
  error: string | null

  loadBooks: () => Promise<void>
  loadFolders: () => Promise<void>
  saveCustomBookOrder: (order: string[]) => Promise<void>
  selectBook: (book: Book) => Promise<void>
  selectChapter: (chapter: TocChapter) => Promise<void>
  setActiveVerse: (verseId: string) => void
  jumpToVerse: (verseId: string) => void
  toggleReadingMode: () => void
  setReadingMode: (mode: ReadingMode) => void
  nextVerse: () => void
  prevVerse: () => void
  nextChapter: () => Promise<void>
  prevChapter: () => Promise<void>
  /** Jumps to a citation target (bookKey/chapterKey/recordKey), verifying
   * the verse actually exists in this corpus before navigating anywhere. */
  navigateToCitation: (bookKey: string, chapterKey: string, recordKey: string) => Promise<boolean>
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  books: [],
  folders: [],
  customBookOrder: [],
  selectedBook: null,
  toc: [],
  selectedChapter: null,
  chapterRecords: [],
  activeVerseId: null,
  jumpToken: 0,
  readingMode: 'continuous',

  isLoadingBooks: false,
  isLoadingToc: false,
  isLoadingChapter: false,
  error: null,

  loadBooks: async () => {
    set({ isLoadingBooks: true, error: null })
    try {
      const books = await getBooks()
      set({ books, isLoadingBooks: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoadingBooks: false })
    }
    void get().loadFolders()
  },

  loadFolders: async () => {
    try {
      const folders = await getBookFolders()
      set({ folders })
    } catch {
      set({ folders: [] })
    }
  },

  saveCustomBookOrder: async (order: string[]) => {
    set({ customBookOrder: order })
    await saveSetting('customBookOrder', JSON.stringify(order))
  },

  selectBook: async (book: Book) => {
    set({
      selectedBook: book,
      toc: [],
      selectedChapter: null,
      chapterRecords: [],
      activeVerseId: null,
      isLoadingToc: true,
      error: null,
    })
    try {
      const toc = await getBookToc(book.bookKey)
      set({ toc, isLoadingToc: false })
      if (toc.length > 0) {
        await get().selectChapter(toc[0])
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoadingToc: false })
    }
  },

  selectChapter: async (chapter: TocChapter) => {
    const { selectedBook } = get()
    if (!selectedBook) return
    set({ selectedChapter: chapter, chapterRecords: [], isLoadingChapter: true, error: null })
    try {
      const records = await getChapterRecords(selectedBook.bookKey, chapter.chapterKey)
      set({
        chapterRecords: records,
        activeVerseId: records[0]?.recordKey ?? null,
        isLoadingChapter: false,
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoadingChapter: false })
    }
  },

  setActiveVerse: (verseId: string) => set({ activeVerseId: verseId }),

  jumpToVerse: (verseId: string) => set((s) => ({ activeVerseId: verseId, jumpToken: s.jumpToken + 1 })),

  toggleReadingMode: () =>
    set((s) => {
      const readingMode = s.readingMode === 'continuous' ? 'focus' : 'continuous'
      debouncedSaveReadingMode(readingMode)
      return { readingMode }
    }),

  setReadingMode: (mode: ReadingMode) => {
    set({ readingMode: mode })
    debouncedSaveReadingMode(mode)
  },

  nextVerse: () => {
    const { chapterRecords, activeVerseId } = get()
    const idx = chapterRecords.findIndex((r) => r.recordKey === activeVerseId)
    if (idx === -1) return
    if (idx < chapterRecords.length - 1) {
      set({ activeVerseId: chapterRecords[idx + 1].recordKey })
    } else {
      void get().nextChapter()
    }
  },

  prevVerse: () => {
    const { chapterRecords, activeVerseId } = get()
    const idx = chapterRecords.findIndex((r) => r.recordKey === activeVerseId)
    if (idx === -1) return
    if (idx > 0) {
      set({ activeVerseId: chapterRecords[idx - 1].recordKey })
    } else {
      void get().prevChapter()
    }
  },

  nextChapter: async () => {
    const { toc, selectedChapter } = get()
    if (!selectedChapter) return
    const idx = toc.findIndex((c) => c.chapterKey === selectedChapter.chapterKey)
    if (idx === -1 || idx >= toc.length - 1) return
    await get().selectChapter(toc[idx + 1])
  },

  prevChapter: async () => {
    const { toc, selectedChapter } = get()
    if (!selectedChapter) return
    const idx = toc.findIndex((c) => c.chapterKey === selectedChapter.chapterKey)
    if (idx <= 0) return
    await get().selectChapter(toc[idx - 1])
    // Land on the last verse of the previous chapter, matching the natural
    // direction of travel when paging backwards past a chapter boundary.
    const records = get().chapterRecords
    if (records.length > 0) {
      set({ activeVerseId: records[records.length - 1].recordKey })
    }
  },

  navigateToCitation: async (bookKey: string, chapterKey: string, recordKey: string) => {
    const verse = await getVerseRecord(recordKey).catch(() => null)
    if (!verse) return false
    const resolvedRecordKey = verse.recordKey

    let { books } = get()
    if (books.length === 0) {
      await get().loadBooks()
      books = get().books
    }
    const book = books.find((b) => b.bookKey === bookKey)
    if (!book) return false

    const alreadyOnBook = get().selectedBook?.bookKey === bookKey
    const toc = alreadyOnBook ? get().toc : await getBookToc(bookKey).catch(() => [])
    const chapter = toc.find((c) => c.chapterKey === chapterKey)
    if (!chapter) return false

    if (!alreadyOnBook || get().selectedChapter?.chapterKey !== chapterKey) {
      set({ selectedBook: book, toc })
      await get().selectChapter(chapter)
    }
    get().jumpToVerse(resolvedRecordKey)
    return true
  },
}))

/** Seeds readingMode from persisted settings at startup without triggering
 * a redundant save. */
export function hydrateReadingMode(readingMode: ReadingMode) {
  useNavigationStore.setState({ readingMode })
}

/** Seeds the sidebar's custom book order from persisted settings at startup
 * without triggering a redundant save. */
export function hydrateCustomBookOrder(order: string[]) {
  useNavigationStore.setState({ customBookOrder: order })
}

if (import.meta.env.DEV) {
  // Dev-only escape hatch so the store can be driven directly from an
  // external devtools/CDP session for automated verification, without
  // depending on fragile DOM click simulation.
  ;(window as unknown as { __navStore: typeof useNavigationStore }).__navStore = useNavigationStore
}
