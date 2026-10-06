import { invoke } from '@tauri-apps/api/core'

import type { Book, TocChapter, VerseRecord, VerseSummary } from '../types/scripture'
import type {
  Bookmark,
  Highlight,
  HistoryEntry,
  NewBookmark,
  NewHighlight,
  NewHistoryEntry,
  NewNote,
  Note,
  SearchHit,
  SearchParams,
  SearchResponse,
  UnifiedSearchResponse,
} from '../types/study'

export class ApiError extends Error {
  readonly operation: string

  constructor(operation: string, cause: unknown) {
    super(`${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.operation = operation
    this.name = 'ApiError'
  }
}

/** Populated by `getBooks()` (and kept current by the imported-books
 * commands below) so `getBookToc`/`getChapterRecords`/`getVerseRecord` can
 * transparently route to the extension database's parallel commands for a
 * user-imported book, without every call site needing to know or care
 * which source a given BookKey came from. */
const importedBookKeys = new Set<string>()

export async function getBooks(): Promise<Book[]> {
  try {
    const [corpusBooks, imported] = await Promise.all([invoke<Book[]>('get_books'), listImportedBooks()])
    importedBookKeys.clear()
    const importedAsBooks: Book[] = imported.map((b) => {
      importedBookKeys.add(b.bookKey)
      return {
        bookKey: b.bookKey,
        abbreviation: b.isPdf ? 'PDF' : b.bookKey,
        edition: b.isPdf ? 'PDF Document' : null,
        title: b.title,
        category: 'Imported',
        corpusId: null,
        author: b.author ?? null,
        canonicalOrder: 100000,
        totalRecords: b.recordCount,
        isPdf: b.isPdf,
        pdfPath: b.pdfPath,
      }
    })
    return [...corpusBooks, ...importedAsBooks]
  } catch (e) {
    throw new ApiError('getBooks', e)
  }
}

export async function getBookToc(bookKey: string): Promise<TocChapter[]> {
  try {
    if (importedBookKeys.has(bookKey)) {
      return await invoke<TocChapter[]>('get_imported_book_toc', { bookKey })
    }
    return await invoke<TocChapter[]>('get_book_toc', { bookKey })
  } catch (e) {
    throw new ApiError('getBookToc', e)
  }
}

export async function getChapterVerses(bookKey: string, chapterKey: string): Promise<VerseSummary[]> {
  try {
    return await invoke<VerseSummary[]>('get_chapter_verses', { bookKey, chapterKey })
  } catch (e) {
    throw new ApiError('getChapterVerses', e)
  }
}

export async function getChapterRecords(bookKey: string, chapterKey: string): Promise<VerseRecord[]> {
  try {
    if (importedBookKeys.has(bookKey)) {
      return await invoke<VerseRecord[]>('get_imported_chapter_records', { chapterKey })
    }
    return await invoke<VerseRecord[]>('get_chapter_records', { bookKey, chapterKey })
  } catch (e) {
    throw new ApiError('getChapterRecords', e)
  }
}

export async function getVerseRecord(recordKey: string): Promise<VerseRecord | null> {
  try {
    const bookKey = recordKey.split('-')[0]
    if (importedBookKeys.has(bookKey)) {
      return await invoke<VerseRecord | null>('get_imported_verse_record', { recordKey })
    }
    return await invoke<VerseRecord | null>('get_verse_record', { recordKey })
  } catch (e) {
    throw new ApiError('getVerseRecord', e)
  }
}

// --- Imported books (Settings → Corpus & Books) -------------------------------

export interface ImportedBook {
  bookKey: string
  title: string
  author: string | null
  recordCount: number
  isPdf: boolean
  pdfPath: string | null
}

export interface ImportResult {
  bookKey: string
  title: string
  recordCount: number
}

export async function importBookJson(path: string): Promise<ImportResult> {
  try {
    const result = await invoke<ImportResult>('import_book_json', { path })
    importedBookKeys.add(result.bookKey)
    return result
  } catch (e) {
    throw new ApiError('importBookJson', e)
  }
}

export async function importBookPdf(path: string, title: string, author?: string): Promise<ImportResult> {
  try {
    const result = await invoke<ImportResult>('import_book_pdf', { path, title, author })
    importedBookKeys.add(result.bookKey)
    return result
  } catch (e) {
    throw new ApiError('importBookPdf', e)
  }
}

export async function listImportedBooks(): Promise<ImportedBook[]> {
  try {
    return await invoke<ImportedBook[]>('list_imported_books')
  } catch (e) {
    throw new ApiError('listImportedBooks', e)
  }
}

export async function removeImportedBook(bookKey: string): Promise<void> {
  try {
    await invoke('remove_imported_book', { bookKey })
    importedBookKeys.delete(bookKey)
  } catch (e) {
    throw new ApiError('removeImportedBook', e)
  }
}

export async function searchImportedBooks(query: string): Promise<SearchHit[]> {
  try {
    return await invoke<SearchHit[]>('search_imported_books', { query })
  } catch (e) {
    throw new ApiError('searchImportedBooks', e)
  }
}

// --- Concordance -------------------------------------------------------------

export interface ConcordanceBookCount {
  bookKey: string
  count: number
}

export interface ConcordanceMatch {
  recordKey: string
  bookKey: string
  reference: string | null
  snippet: string
}

export interface ConcordanceResult {
  lemma: string
  total: number
  byBook: ConcordanceBookCount[]
  matches: ConcordanceMatch[]
}

export async function getConcordance(lemma: string): Promise<ConcordanceResult> {
  try {
    return await invoke<ConcordanceResult>('get_concordance', { lemma })
  } catch (e) {
    throw new ApiError('getConcordance', e)
  }
}

// --- Search ------------------------------------------------------------

export async function searchCorpus(params: SearchParams): Promise<SearchResponse> {
  try {
    return await invoke<SearchResponse>('search_corpus', { params })
  } catch (e) {
    throw new ApiError('searchCorpus', e)
  }
}

export async function unifiedSearch(params: SearchParams, source: string): Promise<UnifiedSearchResponse> {
  try {
    return await invoke<UnifiedSearchResponse>('unified_search', { params, source })
  } catch (e) {
    throw new ApiError('unifiedSearch', e)
  }
}

export interface VocabTerm {
  term: string
  documentCount: number
  totalOccurrences: number
}

export async function getVocabularyTerms(prefix: string, limit = 60): Promise<VocabTerm[]> {
  try {
    return await invoke<VocabTerm[]>('get_vocabulary_terms', { prefix, limit })
  } catch (e) {
    throw new ApiError('getVocabularyTerms', e)
  }
}

// --- Highlights ----------------------------------------------------------

export async function saveHighlight(highlight: NewHighlight): Promise<Highlight> {
  try {
    return await invoke<Highlight>('save_highlight', { highlight })
  } catch (e) {
    throw new ApiError('saveHighlight', e)
  }
}

export async function deleteHighlight(id: number): Promise<void> {
  try {
    await invoke('delete_highlight', { id })
  } catch (e) {
    throw new ApiError('deleteHighlight', e)
  }
}

export async function getHighlightsForVerse(verseId: string): Promise<Highlight[]> {
  try {
    return await invoke<Highlight[]>('get_highlights_for_verse', { verseId })
  } catch (e) {
    throw new ApiError('getHighlightsForVerse', e)
  }
}

export async function getAllHighlights(): Promise<Highlight[]> {
  try {
    return await invoke<Highlight[]>('get_all_highlights')
  } catch (e) {
    throw new ApiError('getAllHighlights', e)
  }
}

/** Every highlight including soft-deleted ones — only `supabaseSync.ts`'s
 * push should use this; everywhere else `getAllHighlights` (active-only) is
 * the right call. */
export async function getAllHighlightsForSync(): Promise<Highlight[]> {
  try {
    return await invoke<Highlight[]>('get_all_highlights_for_sync')
  } catch (e) {
    throw new ApiError('getAllHighlightsForSync', e)
  }
}

/** Persists the Supabase row id a highlight synced under, so the next push
 * upserts that same remote row instead of forking a duplicate. */
export async function setHighlightRemoteId(id: number, remoteId: string): Promise<void> {
  try {
    await invoke('set_highlight_remote_id', { id, remoteId })
  } catch (e) {
    throw new ApiError('setHighlightRemoteId', e)
  }
}

/** Cloud sync PULL (tombstones) — soft-deletes the local highlight (if any)
 * carrying this remote id, applying a deletion that happened on another
 * device. */
export async function applyHighlightTombstone(remoteId: string, deletedAt: string): Promise<void> {
  try {
    await invoke('apply_highlight_tombstone', { remoteId, deletedAt })
  } catch (e) {
    throw new ApiError('applyHighlightTombstone', e)
  }
}

/** Cloud sync PULL — upserts a highlight fetched from Supabase (idempotent
 * on repeated pulls; see `upsert_synced_highlight` in user_store.rs).
 * `remoteId` is omitted by the `.vdbbackup` local-file importer, which has
 * no Supabase row to associate yet. */
export async function upsertSyncedHighlight(h: {
  verseId: string
  color: string
  textRangeStart: number
  textRangeEnd: number
  selectedText: string
  field?: string | null
  createdAt: string
  updatedAt: string
  remoteId?: string | null
}): Promise<void> {
  try {
    await invoke('upsert_synced_highlight', h)
  } catch (e) {
    throw new ApiError('upsertSyncedHighlight', e)
  }
}

// --- Notes -----------------------------------------------------------------
// Multiple notes can exist on the same verse, and a note's `verseId` can be
// `null` (a standalone research note, not anchored to any verse) — there's
// no longer a single "the note for this verse" to upsert onto, so creating
// and editing are two different calls, both identified by the note's own
// `id` rather than `verseId`.

export async function createNote(note: NewNote): Promise<Note> {
  try {
    return await invoke<Note>('create_note', { note })
  } catch (e) {
    throw new ApiError('createNote', e)
  }
}

export async function updateNote(
  id: number,
  contentJson: string,
  contentText: string,
  title?: string | null,
): Promise<Note> {
  try {
    return await invoke<Note>('update_note', { id, title, contentJson, contentText })
  } catch (e) {
    throw new ApiError('updateNote', e)
  }
}

export async function deleteNote(id: number): Promise<void> {
  try {
    await invoke('delete_note', { id })
  } catch (e) {
    throw new ApiError('deleteNote', e)
  }
}

export async function getNotesForVerse(verseId: string): Promise<Note[]> {
  try {
    return await invoke<Note[]>('get_notes_for_verse', { verseId })
  } catch (e) {
    throw new ApiError('getNotesForVerse', e)
  }
}

export async function getAllNotes(): Promise<Note[]> {
  try {
    return await invoke<Note[]>('get_all_notes')
  } catch (e) {
    throw new ApiError('getAllNotes', e)
  }
}

/** Every note including soft-deleted ones — only `supabaseSync.ts`'s push
 * should use this; everywhere else `getAllNotes` (active-only) is the right
 * call. */
export async function getAllNotesForSync(): Promise<Note[]> {
  try {
    return await invoke<Note[]>('get_all_notes_for_sync')
  } catch (e) {
    throw new ApiError('getAllNotesForSync', e)
  }
}

/** Persists the Supabase row id a note synced under, so the next push
 * upserts that same remote row instead of forking a duplicate. */
export async function setNoteRemoteId(id: number, remoteId: string): Promise<void> {
  try {
    await invoke('set_note_remote_id', { id, remoteId })
  } catch (e) {
    throw new ApiError('setNoteRemoteId', e)
  }
}

/** Cloud sync PULL (tombstones) — soft-deletes the local note (if any)
 * carrying this remote id, applying a deletion that happened on another
 * device. */
export async function applyNoteTombstone(remoteId: string, deletedAt: string): Promise<void> {
  try {
    await invoke('apply_note_tombstone', { remoteId, deletedAt })
  } catch (e) {
    throw new ApiError('applyNoteTombstone', e)
  }
}

/** Cloud sync PULL — upserts a note fetched from Supabase (idempotent on
 * repeated pulls; see `upsert_synced_note` in user_store.rs). Kept separate
 * from `saveNote` (the local-edit path) so a plain local save can never
 * accidentally stamp a `remoteId` a pull hasn't actually confirmed. */
export async function upsertSyncedNote(n: {
  verseId?: string | null
  title?: string | null
  contentText: string
  contentJson: string
  remoteId: string
  createdAt: string
  updatedAt: string
}): Promise<void> {
  try {
    await invoke('upsert_synced_note', n)
  } catch (e) {
    throw new ApiError('upsertSyncedNote', e)
  }
}

// --- Bookmarks ---------------------------------------------------------------

export async function addBookmark(bookmark: NewBookmark): Promise<Bookmark> {
  try {
    return await invoke<Bookmark>('add_bookmark', { bookmark })
  } catch (e) {
    throw new ApiError('addBookmark', e)
  }
}

export async function removeBookmark(verseId: string): Promise<void> {
  try {
    await invoke('remove_bookmark', { verseId })
  } catch (e) {
    throw new ApiError('removeBookmark', e)
  }
}

export async function getBookmarks(): Promise<Bookmark[]> {
  try {
    return await invoke<Bookmark[]>('get_bookmarks')
  } catch (e) {
    throw new ApiError('getBookmarks', e)
  }
}

/** Persists the Supabase row id a bookmark synced under, so the next push
 * upserts that same remote row instead of forking a duplicate. */
export async function setBookmarkRemoteId(verseId: string, remoteId: string): Promise<void> {
  try {
    await invoke('set_bookmark_remote_id', { verseId, remoteId })
  } catch (e) {
    throw new ApiError('setBookmarkRemoteId', e)
  }
}

/** Every bookmark including soft-deleted ones — only `supabaseSync.ts`'s
 * push should use this; everywhere else, `getBookmarks` (active-only) is
 * the right call. */
export async function getBookmarksForSync(): Promise<Bookmark[]> {
  try {
    return await invoke<Bookmark[]>('get_bookmarks_for_sync')
  } catch (e) {
    throw new ApiError('getBookmarksForSync', e)
  }
}

/** Cloud sync PULL (tombstones) — soft-deletes the local bookmark (if any)
 * carrying this remote id, applying a deletion that happened on another
 * device. */
export async function applyBookmarkTombstone(remoteId: string, deletedAt: string): Promise<void> {
  try {
    await invoke('apply_bookmark_tombstone', { remoteId, deletedAt })
  } catch (e) {
    throw new ApiError('applyBookmarkTombstone', e)
  }
}

/** Records the Supabase `vb_bookmark_collections.id` every bookmark sharing
 * this tag should push under, so pushes upsert the one real remote
 * collection instead of each device forking its own id for the same name. */
export async function setBookmarkRemoteCollectionId(tag: string, remoteCollectionId: string): Promise<void> {
  try {
    await invoke('set_bookmark_remote_collection_id', { tag, remoteCollectionId })
  } catch (e) {
    throw new ApiError('setBookmarkRemoteCollectionId', e)
  }
}

/** Bookmarks have no dedicated collections table — `tag` doubles as the
 * collection name — so these bulk-update every bookmark sharing a tag. */
export async function renameBookmarkCollection(oldTag: string, newTag: string): Promise<void> {
  try {
    await invoke('rename_bookmark_collection', { oldTag, newTag })
  } catch (e) {
    throw new ApiError('renameBookmarkCollection', e)
  }
}

export async function clearBookmarkCollection(tag: string): Promise<void> {
  try {
    await invoke('clear_bookmark_collection', { tag })
  } catch (e) {
    throw new ApiError('clearBookmarkCollection', e)
  }
}

export async function moveBookmarkToCollection(verseId: string, tag: string | null): Promise<void> {
  try {
    await invoke('move_bookmark_to_collection', { verseId, tag })
  } catch (e) {
    throw new ApiError('moveBookmarkToCollection', e)
  }
}

// --- Reading history -----------------------------------------------------------

export async function recordHistory(entry: NewHistoryEntry): Promise<HistoryEntry> {
  try {
    return await invoke<HistoryEntry>('record_history', { entry })
  } catch (e) {
    throw new ApiError('recordHistory', e)
  }
}

export async function getHistory(limit?: number): Promise<HistoryEntry[]> {
  try {
    return await invoke<HistoryEntry[]>('get_history', { limit })
  } catch (e) {
    throw new ApiError('getHistory', e)
  }
}

/** Cloud sync PULL — inserts a history entry fetched from Supabase only if
 * it isn't already present locally (idempotent on repeated pulls). */
export async function insertHistoryIfAbsent(h: {
  verseId: string
  bookTitle: string
  verseRef: string
  timestamp: string
}): Promise<void> {
  try {
    await invoke('insert_history_if_absent', h)
  } catch (e) {
    throw new ApiError('insertHistoryIfAbsent', e)
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await invoke('clear_history')
  } catch (e) {
    throw new ApiError('clearHistory', e)
  }
}

// --- Book folders (custom organization) -------------------------------------

export interface BookFolder {
  id: number
  name: string
  sortOrder: number
  bookKeys: string[]
}

export async function getBookFolders(): Promise<BookFolder[]> {
  try {
    return await invoke<BookFolder[]>('get_book_folders')
  } catch (e) {
    throw new ApiError('getBookFolders', e)
  }
}

export async function createBookFolder(name: string): Promise<BookFolder> {
  try {
    return await invoke<BookFolder>('create_book_folder', { name })
  } catch (e) {
    throw new ApiError('createBookFolder', e)
  }
}

export async function renameBookFolder(id: number, name: string): Promise<void> {
  try {
    await invoke('rename_book_folder', { id, name })
  } catch (e) {
    throw new ApiError('renameBookFolder', e)
  }
}

export async function deleteBookFolder(id: number): Promise<void> {
  try {
    await invoke('delete_book_folder', { id })
  } catch (e) {
    throw new ApiError('deleteBookFolder', e)
  }
}

export async function reorderBookFolders(orderedIds: number[]): Promise<void> {
  try {
    await invoke('reorder_book_folders', { orderedIds })
  } catch (e) {
    throw new ApiError('reorderBookFolders', e)
  }
}

export async function addBookToFolder(folderId: number, bookKey: string): Promise<void> {
  try {
    await invoke('add_book_to_folder', { folderId, bookKey })
  } catch (e) {
    throw new ApiError('addBookToFolder', e)
  }
}

export async function removeBookFromFolder(folderId: number, bookKey: string): Promise<void> {
  try {
    await invoke('remove_book_from_folder', { folderId, bookKey })
  } catch (e) {
    throw new ApiError('removeBookFromFolder', e)
  }
}

export async function reorderBooksInFolder(folderId: number, orderedBookKeys: string[]): Promise<void> {
  try {
    await invoke('reorder_books_in_folder', { folderId, orderedBookKeys })
  } catch (e) {
    throw new ApiError('reorderBooksInFolder', e)
  }
}

// --- Backup & restore --------------------------------------------------------

export interface BackupFileInfo {
  filename: string
  modifiedAt: string
  sizeBytes: number
}

export async function exportBackup(): Promise<string> {
  try {
    return await invoke<string>('export_backup')
  } catch (e) {
    throw new ApiError('exportBackup', e)
  }
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  try {
    return await invoke<BackupFileInfo[]>('list_backups')
  } catch (e) {
    throw new ApiError('listBackups', e)
  }
}

export async function importBackup(filename: string, mode: 'merge' | 'replace'): Promise<string> {
  try {
    return await invoke<string>('import_backup', { filename, mode })
  } catch (e) {
    throw new ApiError('importBackup', e)
  }
}

export async function createSnapshot(): Promise<string> {
  try {
    return await invoke<string>('create_snapshot')
  } catch (e) {
    throw new ApiError('createSnapshot', e)
  }
}

/** Raw `.db` file snapshots (both the automatic on-launch ones and manual
 * `createSnapshot()` ones) — distinct from `listBackups`/`importBackup`,
 * which work with the separate JSON export format. */
export async function listSnapshots(): Promise<BackupFileInfo[]> {
  try {
    return await invoke<BackupFileInfo[]>('list_snapshots')
  } catch (e) {
    throw new ApiError('listSnapshots', e)
  }
}

export async function restoreSnapshot(filename: string): Promise<void> {
  try {
    await invoke('restore_snapshot', { filename })
  } catch (e) {
    throw new ApiError('restoreSnapshot', e)
  }
}

export async function exportNotesMarkdown(): Promise<string> {
  try {
    return await invoke<string>('export_notes_markdown')
  } catch (e) {
    throw new ApiError('exportNotesMarkdown', e)
  }
}

export async function exportNotesObsidian(): Promise<string> {
  try {
    return await invoke<string>('export_notes_obsidian')
  } catch (e) {
    throw new ApiError('exportNotesObsidian', e)
  }
}

export async function exportNotesHtml(): Promise<string> {
  try {
    return await invoke<string>('export_notes_html')
  } catch (e) {
    throw new ApiError('exportNotesHtml', e)
  }
}

// --- Settings --------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>('get_setting', { key })
  } catch (e) {
    throw new ApiError('getSetting', e)
  }
}

export async function saveSetting(key: string, valueJson: string): Promise<void> {
  try {
    await invoke('save_setting', { key, valueJson })
  } catch (e) {
    throw new ApiError('saveSetting', e)
  }
}
