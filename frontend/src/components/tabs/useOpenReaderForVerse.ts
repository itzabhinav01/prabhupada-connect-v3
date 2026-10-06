import { getVerseRecord } from '../../services/api'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTabStore } from '../../stores/useTabStore'
import type { TocChapter } from '../../types/scripture'

/**
 * The one navigation path every "click something, land on a verse" call
 * site should use (bookmarks, history, notes, scripture hyperlinks, search
 * results, `@` direct-reference jumps): it opens/switches the target reader tab
 * first (so activeTabId switches before navigation store mutation), and then
 * drives the live reading position via `navigateToCitation`. This ensures
 * that `useReaderTabSync` never accidentally mutates the previously active tab.
 *
 * Pass `{ newTab: true }` (used by scripture hyperlinks, Quick Search modal, and
 * Search Studio) to always open the clicked result in a brand new reader tab.
 * Pass `{ inPlace: true }` for a call site that *is* the navigation itself,
 * not a side list — e.g. the sidebar's `@` jump on a TOC tab — to replace
 * the active tab instead of appending one.
 */
export function useOpenReaderForVerse() {
  const navigateToCitation = useNavigationStore((s) => s.navigateToCitation)
  const openReaderTab = useTabStore((s) => s.openReaderTab)
  const navigateActiveTab = useTabStore((s) => s.navigateActiveTab)

  return async (
    bookKey: string,
    chapterKey: string,
    verseId: string,
    opts?: { inPlace?: boolean; newTab?: boolean; titleSuffix?: string },
  ): Promise<boolean> => {
    // 1. Verify that the target verse exists first, before altering tabs or shared navigation state.
    const verse = await getVerseRecord(verseId).catch(() => null)
    if (!verse) return false

    let books = useNavigationStore.getState().books
    if (books.length === 0) {
      await useNavigationStore.getState().loadBooks()
      books = useNavigationStore.getState().books
    }
    const book = books.find((b) => b.bookKey === bookKey)
    const baseTitle = book?.title ?? bookKey
    const title = opts?.titleSuffix ? `${baseTitle} — ${opts.titleSuffix}` : baseTitle

    // 2. Open or navigate the target tab FIRST so that activeTabId switches to the
    // target tab before driving the shared navigation store. This prevents
    // useReaderTabSync's effect from mutating or renaming the previously active tab!
    if (opts?.inPlace) {
      navigateActiveTab({ type: 'reader', title, payload: { bookKey, chapterKey, verseId } })
    } else {
      openReaderTab({ bookKey, chapterKey, verseId, title, forceNewTab: opts?.newTab })
    }

    // 3. Drive the live navigation store to the target citation.
    const ok = await navigateToCitation(bookKey, chapterKey, verseId)
    return ok
  }
}

/** Same direct-nav-first approach as `useOpenReaderForVerse`, but for
 * landing on a chapter (from the TOC tab) rather than a specific verse —
 * always navigates the active tab in place, since its one caller (the TOC
 * tab's chapter list) is drilling down within that same tab, not browsing
 * a side list. */
export function useOpenReaderForChapter() {
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const selectBook = useNavigationStore((s) => s.selectBook)
  const selectChapter = useNavigationStore((s) => s.selectChapter)
  const navigateActiveTab = useTabStore((s) => s.navigateActiveTab)

  return async (bookKey: string, chapter: TocChapter, bookTitle: string): Promise<void> => {
    let bookList = books
    if (bookList.length === 0) {
      await loadBooks()
      bookList = useNavigationStore.getState().books
    }
    const book = bookList.find((b) => b.bookKey === bookKey)
    if (!book) return

    if (useNavigationStore.getState().selectedBook?.bookKey !== bookKey) {
      await selectBook(book)
    }
    await selectChapter(chapter)

    navigateActiveTab({
      type: 'reader',
      title: `${bookTitle} — ${chapter.label}`,
      payload: { bookKey, chapterKey: chapter.chapterKey, verseId: chapter.firstRecordKey },
    })
  }
}
