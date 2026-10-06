// Mirrors the serde `camelCase` wire format of the Rust structs in
// `src-tauri/src/db/user_store.rs` (highlights/notes/bookmarks/history) and
// the search structs in `src-tauri/src/db/corpus.rs`.

export interface Highlight {
  id: number
  verseId: string
  color: string
  textRangeStart: number
  textRangeEnd: number
  selectedText: string
  /** Which verse field the selection was made in — "translation" |
   * "synonyms" | "purport" | null for highlights made before this column
   * existed. */
  field: string | null
  createdAt: string
  updatedAt: string
  /** Supabase `vb_highlights.id` this highlight last synced under — null
   * until the first push (or pull) assigns one. Only present on rows from
   * `getAllHighlightsForSync` (`getAllHighlights`/`getHighlightsForVerse`
   * never return one). */
  remoteId: string | null
  /** Set when soft-deleted locally; only present on rows from
   * `getAllHighlightsForSync`. */
  deletedAt: string | null
}

export interface NewHighlight {
  verseId: string
  color: string
  textRangeStart: number
  textRangeEnd: number
  selectedText: string
  field?: string | null
}

export interface Note {
  id: number
  /** `null` for a standalone research note — not anchored to any verse. */
  verseId: string | null
  title: string | null
  contentJson: string
  contentText: string
  createdAt: string
  updatedAt: string
  /** Supabase `vb_notes.id` this note last synced under — null until the
   * first push (or pull) assigns one. Only present on rows from
   * `getAllNotesForSync` (`getAllNotes`/`getNotesForVerse` never return one). */
  remoteId: string | null
  /** Set when soft-deleted locally; only present on rows from
   * `getAllNotesForSync`. */
  deletedAt: string | null
}

export interface NewNote {
  /** `null` creates a standalone research note, not anchored to any verse. */
  verseId?: string | null
  title?: string | null
  contentJson: string
  contentText: string
}

export interface Bookmark {
  id: number
  verseId: string
  bookTitle: string
  verseRef: string
  tag: string | null
  createdAt: string
  updatedAt: string
  /** Supabase `vb_bookmarks.id` this bookmark last synced under — null until
   * the first push (or pull) assigns one. See `supabaseSync.ts`. */
  remoteId: string | null
  /** Set when the bookmark was soft-deleted locally; only present on rows
   * from `getBookmarksForSync` (a normal `getBookmarks` never returns one —
   * see `user_store.rs`'s `get_bookmarks` vs `get_bookmarks_for_sync`). */
  deletedAt: string | null
  /** Supabase `vb_bookmark_collections.id` this bookmark's `tag` collection
   * last synced under — null until discovered (pulled) or minted (first
   * push of a never-before-synced collection). Only present on rows from
   * `getBookmarksForSync`. */
  remoteCollectionId: string | null
}

export interface NewBookmark {
  verseId: string
  bookTitle: string
  verseRef: string
  tag: string | null
}

export interface HistoryEntry {
  id: number
  verseId: string
  bookTitle: string
  verseRef: string
  timestamp: string
}

export interface NewHistoryEntry {
  verseId: string
  bookTitle: string
  verseRef: string
}

export interface SearchParams {
  query: string
  bookCodes?: string[]
  bookGroup?: string
  prefix?: boolean
  limit?: number
  offset?: number
  exactWord?: boolean
  matchCase?: boolean
  scope?: string
  sort?: string
  /** True when `query` is a hand-composed FTS5 boolean expression from the
   * Advanced Query modal, passed through verbatim instead of auto-quoted. */
  raw?: boolean
}

export interface SearchHit {
  recordKey: string
  bookKey: string
  recordType: string
  reference: string | null
  title: string | null
  snippet: string
}

export interface SearchResponse {
  hits: SearchHit[]
  total: number
  limit: number
  offset: number
}

export interface NoteHit {
  verseId: string | null
  contentText: string
  updatedAt: string
}

export interface BookmarkHit {
  verseId: string
  bookTitle: string
  verseRef: string
  tag: string | null
  createdAt: string
}

export interface HighlightHit {
  verseId: string
  selectedText: string
  color: string
  createdAt: string
}

export interface UnifiedSearchResponse {
  scripture: SearchResponse
  notesTotal: number
  notes: NoteHit[]
  bookmarksTotal: number
  bookmarks: BookmarkHit[]
  highlightsTotal: number
  highlights: HighlightHit[]
}
