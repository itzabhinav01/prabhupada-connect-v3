import { create } from 'zustand'

import * as api from '../services/api'
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
  allNotes: [],
  history: [],

  loadHighlightsForVerse: async (verseId: string) => {
    const highlights = await api.getHighlightsForVerse(verseId)
    set((s) => ({ highlightsByVerse: { ...s.highlightsByVerse, [verseId]: highlights } }))
    return highlights
  },

  addHighlight: async (verseId, color, textRangeStart, textRangeEnd, selectedText, field = null) => {
    await api.saveHighlight({ verseId, color, textRangeStart, textRangeEnd, selectedText, field })
    await get().loadHighlightsForVerse(verseId)
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
    if (wasBookmarked) {
      await api.removeBookmark(verseId)
      set((s) => {
        const next = new Set(s.bookmarkedVerseIds)
        next.delete(verseId)
        return { bookmarkedVerseIds: next, bookmarks: s.bookmarks.filter((b) => b.verseId !== verseId) }
      })
    } else {
      const bookmark = await api.addBookmark({ verseId, bookTitle, verseRef, tag: null })
      set((s) => ({
        bookmarkedVerseIds: new Set(s.bookmarkedVerseIds).add(verseId),
        bookmarks: [bookmark, ...s.bookmarks.filter((b) => b.verseId !== verseId)],
      }))
    }
  },

  removeBookmarkById: async (verseId: string) => {
    await api.removeBookmark(verseId)
    set((s) => {
      const next = new Set(s.bookmarkedVerseIds)
      next.delete(verseId)
      return { bookmarkedVerseIds: next, bookmarks: s.bookmarks.filter((b) => b.verseId !== verseId) }
    })
  },

  renameBookmarkCollection: async (oldTag, newTag) => {
    await api.renameBookmarkCollection(oldTag, newTag)
    await get().loadBookmarks()
  },

  clearBookmarkCollection: async (tag) => {
    await api.clearBookmarkCollection(tag)
    await get().loadBookmarks()
  },

  moveBookmarkToCollection: async (verseId, tag) => {
    await api.moveBookmarkToCollection(verseId, tag)
    await get().loadBookmarks()
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
