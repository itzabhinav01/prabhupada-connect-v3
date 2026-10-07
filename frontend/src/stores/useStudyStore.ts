import { create } from 'zustand'

import * as api from '../services/api'
import { scheduleBackgroundSync } from '../services/supabaseSync'
import type { Bookmark, Highlight, HistoryEntry, Note } from '../types/study'

interface StudyState {
  highlightsByVerse: Record<string, Highlight[]>
  allHighlights: Highlight[]
  /** Active (non-deleted) notes per verse — a verse can now have several,
   * or (if absent from this map) none loaded yet. */
  notesByVerse: Record<string, Note[]>
  bookmarkedVerseIds: Set<string>
  bookmarks: Bookmark[]
  allNotes: Note[]
  history: HistoryEntry[]

  loadHighlightsForVerse: (verseId: string) => Promise<Highlight[]>
  addHighlight: (
    verseId: string,
    color: string,
    textRangeStart: number,
    textRangeEnd: number,
    selectedText: string,
    field?: string | null,
  ) => Promise<void>
  removeHighlight: (id: number, verseId: string) => Promise<void>
  loadAllHighlights: () => Promise<void>

  loadNotesForVerse: (verseId: string) => Promise<Note[]>
  createNote: (verseId: string | null, contentJson: string, contentText: string, title?: string | null) => Promise<Note>
  updateNote: (id: number, contentJson: string, contentText: string, title?: string | null) => Promise<Note>
  deleteNote: (id: number) => Promise<void>
  loadAllNotes: () => Promise<void>

  customCollections: string[]
  hydrateCustomCollections: (collections: string[]) => void
  addCollection: (name: string) => Promise<void>
  removeCollection: (name: string) => Promise<void>

  loadBookmarks: () => Promise<void>
  isBookmarked: (verseId: string) => boolean
  toggleBookmark: (verseId: string, bookTitle: string, verseRef: string) => Promise<void>
  removeBookmarkById: (verseId: string) => Promise<void>
  renameBookmarkCollection: (oldTag: string, newTag: string) => Promise<void>
  clearBookmarkCollection: (tag: string) => Promise<void>
  moveBookmarkToCollection: (verseId: string, tag: string | null) => Promise<void>

  logHistory: (verseId: string, bookTitle: string, verseRef: string) => Promise<void>
  loadHistory: (limit?: number) => Promise<void>
  clearHistory: () => Promise<void>
}

export const useStudyStore = create<StudyState>((set, get) => ({
  highlightsByVerse: {},
  allHighlights: [],
  notesByVerse: {},
  bookmarkedVerseIds: new Set(),
  bookmarks: [],
  customCollections: [],
  allNotes: [],
  history: [],

  hydrateCustomCollections: (collections: string[]) => {
    set({ customCollections: collections })
  },

  addCollection: async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = get().customCollections
    if (!current.includes(trimmed)) {
      const next = [...current, trimmed]
      set({ customCollections: next })
      await api.saveSetting('customBookmarkCollections', JSON.stringify(next))
    }
  },

  removeCollection: async (name: string) => {
    // 1. Clear tag on bookmarks in database and local state
    await api.clearBookmarkCollection(name)
    // 2. Remove from custom collections if present
    const current = get().customCollections
    const next = current.filter((c) => c !== name)
    set((s) => ({
      customCollections: next,
      bookmarks: s.bookmarks.map((b) => (b.tag === name ? { ...b, tag: null } : b)),
    }))
    await api.saveSetting('customBookmarkCollections', JSON.stringify(next))
    scheduleBackgroundSync()
  },

  loadHighlightsForVerse: async (verseId: string) => {
    const highlights = await api.getHighlightsForVerse(verseId)
    set((s) => ({ highlightsByVerse: { ...s.highlightsByVerse, [verseId]: highlights } }))
    return highlights
  },

  addHighlight: async (verseId, color, textRangeStart, textRangeEnd, selectedText, field = null) => {
    await api.saveHighlight({ verseId, color, textRangeStart, textRangeEnd, selectedText, field })
    await get().loadHighlightsForVerse(verseId)
    scheduleBackgroundSync()
  },

  removeHighlight: async (id: number, verseId: string) => {
    await api.deleteHighlight(id)
    set((s) => ({
      highlightsByVerse: {
        ...s.highlightsByVerse,
        [verseId]: (s.highlightsByVerse[verseId] ?? []).filter((h) => h.id !== id),
      },
      allHighlights: s.allHighlights.filter((h) => h.id !== id),
    }))
    scheduleBackgroundSync()
  },

  loadAllHighlights: async () => {
    const allHighlights = await api.getAllHighlights()
    set({ allHighlights })
  },

  loadNotesForVerse: async (verseId: string) => {
    const notes = await api.getNotesForVerse(verseId)
    set((s) => ({ notesByVerse: { ...s.notesByVerse, [verseId]: notes } }))
    return notes
  },

  createNote: async (verseId, contentJson, contentText, title = null) => {
    const note = await api.createNote({ verseId, contentJson, contentText, title })
    set((s) => ({
      notesByVerse: note.verseId
        ? { ...s.notesByVerse, [note.verseId]: [...(s.notesByVerse[note.verseId] ?? []), note] }
        : s.notesByVerse,
      allNotes: [note, ...s.allNotes],
    }))
    scheduleBackgroundSync()
    return note
  },

  updateNote: async (id, contentJson, contentText, title = null) => {
    const note = await api.updateNote(id, contentJson, contentText, title)
    set((s) => ({
      notesByVerse: note.verseId
        ? { ...s.notesByVerse, [note.verseId]: (s.notesByVerse[note.verseId] ?? []).map((n) => (n.id === id ? note : n)) }
        : s.notesByVerse,
      allNotes: s.allNotes.map((n) => (n.id === id ? note : n)),
    }))
    scheduleBackgroundSync()
    return note
  },

  deleteNote: async (id: number) => {
    const existing = get().allNotes.find((n) => n.id === id)
    await api.deleteNote(id)
    set((s) => ({
      notesByVerse:
        existing?.verseId != null
          ? { ...s.notesByVerse, [existing.verseId]: (s.notesByVerse[existing.verseId] ?? []).filter((n) => n.id !== id) }
          : s.notesByVerse,
      allNotes: s.allNotes.filter((n) => n.id !== id),
    }))
    scheduleBackgroundSync()
  },

  loadAllNotes: async () => {
    const allNotes = await api.getAllNotes()
    set({ allNotes })
  },

  loadBookmarks: async () => {
    const bookmarks = await api.getBookmarks()
    set({ bookmarks, bookmarkedVerseIds: new Set(bookmarks.map((b) => b.verseId)) })
  },

  isBookmarked: (verseId: string) => get().bookmarkedVerseIds.has(verseId),

  toggleBookmark: async (verseId, bookTitle, verseRef) => {
    const wasBookmarked = get().bookmarkedVerseIds.has(verseId)
    // Instant optimistic UI update
    if (wasBookmarked) {
      set((s) => {
        const next = new Set(s.bookmarkedVerseIds)
        next.delete(verseId)
        return { bookmarkedVerseIds: next, bookmarks: s.bookmarks.filter((b) => b.verseId !== verseId) }
      })
      try {
        await api.removeBookmark(verseId)
      } catch (e) {
        // Rollback on error
        await get().loadBookmarks()
        throw e
      }
    } else {
      const now = new Date().toISOString()
      const optimisticBookmark: Bookmark = {
        id: -Date.now(),
        verseId,
        bookTitle,
        verseRef,
        tag: null,
        createdAt: now,
        updatedAt: now,
        remoteId: null,
        deletedAt: null,
        remoteCollectionId: null,
      }
      set((s) => ({
        bookmarkedVerseIds: new Set(s.bookmarkedVerseIds).add(verseId),
        bookmarks: [optimisticBookmark, ...s.bookmarks.filter((b) => b.verseId !== verseId)],
      }))
      try {
        const realBookmark = await api.addBookmark({ verseId, bookTitle, verseRef, tag: null })
        set((s) => ({
          bookmarks: s.bookmarks.map((b) => (b.verseId === verseId ? realBookmark : b)),
        }))
      } catch (e) {
        // Rollback on error
        await get().loadBookmarks()
        throw e
      }
    }
    scheduleBackgroundSync()
  },

  removeBookmarkById: async (verseId: string) => {
    set((s) => {
      const next = new Set(s.bookmarkedVerseIds)
      next.delete(verseId)
      return { bookmarkedVerseIds: next, bookmarks: s.bookmarks.filter((b) => b.verseId !== verseId) }
    })
    try {
      await api.removeBookmark(verseId)
    } catch (e) {
      await get().loadBookmarks()
      throw e
    }
    scheduleBackgroundSync()
  },

  renameBookmarkCollection: async (oldTag, newTag) => {
    const current = get().customCollections
    const nextCustom = current.map((c) => (c === oldTag ? newTag : c))
    set((s) => ({
      customCollections: nextCustom,
      bookmarks: s.bookmarks.map((b) => (b.tag === oldTag ? { ...b, tag: newTag } : b)),
    }))
    await api.renameBookmarkCollection(oldTag, newTag)
    await api.saveSetting('customBookmarkCollections', JSON.stringify(nextCustom))
    await get().loadBookmarks()
    scheduleBackgroundSync()
  },

  clearBookmarkCollection: async (tag) => {
    await api.clearBookmarkCollection(tag)
    await get().loadBookmarks()
    scheduleBackgroundSync()
  },

  moveBookmarkToCollection: async (verseId, tag) => {
    await api.moveBookmarkToCollection(verseId, tag)
    await get().loadBookmarks()
    scheduleBackgroundSync()
  },

  logHistory: async (verseId, bookTitle, verseRef) => {
    await api.recordHistory({ verseId, bookTitle, verseRef })
  },

  loadHistory: async (limit?: number) => {
    const history = await api.getHistory(limit)
    set({ history })
  },

  clearHistory: async () => {
    await api.clearHistory()
    set({ history: [] })
  },
}))
