import { useEffect, useRef } from 'react'

import { useNavigationStore } from './useNavigationStore'
import { useTabStore, type ReaderTabPayload } from './useTabStore'

/**
 * Bridges the tab model onto the single shared `useNavigationStore`: this
 * app still has one "hot" reading position at a time (one corpus/reader
 * pipeline, not N independent ones), so a reader tab's book/chapter/verse
 * is persisted in its own tab payload and restored into the shared nav
 * store whenever that tab becomes active — and written back to the payload
 * whenever the nav store moves while that tab is the active one. Switching
 * between two reader tabs re-fetches the chapter's records (a sub-ms local
 * SQLite call) rather than keeping every open tab's reader mounted, but the
 * position itself (book, chapter, active verse) round-trips correctly.
 */
export function useReaderTabSync() {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)
  const updateTabPayload = useTabStore((s) => s.updateTabPayload)
  const renameTab = useTabStore((s) => s.renameTab)

  const selectedBook = useNavigationStore((s) => s.selectedBook)
  const selectedChapter = useNavigationStore((s) => s.selectedChapter)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const selectBook = useNavigationStore((s) => s.selectBook)
  const selectChapter = useNavigationStore((s) => s.selectChapter)
  const jumpToVerse = useNavigationStore((s) => s.jumpToVerse)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const lastRestoredTabId = useRef<string | null>(null)

  // Restore the active reader tab's remembered position into the shared
  // nav store whenever the active tab changes to a different reader tab.
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'reader') return
    if (lastRestoredTabId.current === activeTab.id) return
    lastRestoredTabId.current = activeTab.id

    const payload = activeTab.payload as ReaderTabPayload
    void (async () => {
      let bookList = books
      if (bookList.length === 0) {
        await loadBooks()
        bookList = useNavigationStore.getState().books
      }
      const book = bookList.find((b) => b.bookKey === payload.bookKey)
      if (!book) return

      const alreadyOnBook = useNavigationStore.getState().selectedBook?.bookKey === payload.bookKey
      if (!alreadyOnBook) {
        await selectBook(book)
      }

      if (payload.chapterKey) {
        const currentChapterKey = useNavigationStore.getState().selectedChapter?.chapterKey
        if (currentChapterKey !== payload.chapterKey) {
          const toc = useNavigationStore.getState().toc
          const chapter = toc.find((c) => c.chapterKey === payload.chapterKey)
          if (chapter) await selectChapter(chapter)
        }
      }

      if (payload.verseId) {
        jumpToVerse(payload.verseId)
      }
    })()
  }, [activeTab, books, loadBooks, selectBook, selectChapter, jumpToVerse])

  // While a reader tab is active, keep its payload in sync with the live
  // nav store so switching away and back restores this exact position.
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'reader') return
    if (!selectedBook) return
    if (lastRestoredTabId.current !== activeTab.id) return
    const payload = activeTab.payload as ReaderTabPayload
    const nextChapterKey = selectedChapter?.chapterKey ?? null
    // Guard against a write-back -> new tab-object-identity -> effect-rerun
    // loop: only write when the content actually changed, not just the
    // `activeTab` object reference (which changes on every tab-array update,
    // including the one this very effect just caused).
    if (
      payload.bookKey === selectedBook.bookKey &&
      payload.chapterKey === nextChapterKey &&
      payload.verseId === activeVerseId
    ) {
      return
    }
    updateTabPayload(activeTab.id, {
      bookKey: selectedBook.bookKey,
      chapterKey: nextChapterKey,
      verseId: activeVerseId,
    } satisfies ReaderTabPayload)

    // Book switched out from under this tab (e.g. via Header's breadcrumb
    // dropdown, not a tab-open action) — keep the tab label truthful.
    if (payload.bookKey !== selectedBook.bookKey) {
      const title = selectedChapter
        ? `${selectedBook.title ?? selectedBook.bookKey} — ${selectedChapter.label}`
        : selectedBook.title ?? selectedBook.bookKey
      renameTab(activeTab.id, title)
    }
  }, [activeTab, selectedBook, selectedChapter, activeVerseId, updateTabPayload, renameTab])
}
