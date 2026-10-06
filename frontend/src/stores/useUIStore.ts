import { create } from 'zustand'

/** Either a brand new note being drafted for a verse (no `id` yet — one is
 * assigned on first save) or an existing note (verse-anchored or
 * standalone) being edited by its own `id`, now that a verse can hold more
 * than one note. */
export type NotesDrawerTarget = { mode: 'create'; verseId: string } | { mode: 'edit'; noteId: number }

interface UIState {
  /** The quick Ctrl+K search popup — distinct from the full Search tab it
   * hands off to on submit (see `useTabStore.openSearchTab`). */
  searchOpen: boolean
  /** The note editor popup (opened from a verse's own "Note" action, or
   * from the Notes tab's "Edit") — distinct from the Notes tab, which lists
   * *all* notes. */
  notesDrawerTarget: NotesDrawerTarget | null
  /** Bumped by `Ctrl+Shift+S` (a global shortcut, reachable from anywhere)
   * so the Search tab — which owns the actual Advanced Search modal's open
   * state — knows to open it. 0 means "never requested"; any tab instance
   * only reacts once per distinct value it hasn't seen yet. */
  advancedSearchToken: number
  activeHighlightId: number | null

  setSearchOpen: (open: boolean) => void
  openNotesDrawerForVerse: (verseId: string) => void
  openNotesDrawerForNote: (noteId: number) => void
  closeNotesDrawer: () => void
  requestAdvancedSearch: () => void
  flashHighlight: (id: number | null) => void
  /** True while any modal/popup above is open — used to keep Escape from
   * simultaneously closing one AND exiting Zen mode. */
  anyOverlayOpen: () => boolean
}

export const useUIStore = create<UIState>((set, get) => ({
  searchOpen: false,
  notesDrawerTarget: null,
  advancedSearchToken: 0,
  activeHighlightId: null,

  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openNotesDrawerForVerse: (verseId) => set({ notesDrawerTarget: { mode: 'create', verseId } }),
  openNotesDrawerForNote: (noteId) => set({ notesDrawerTarget: { mode: 'edit', noteId } }),
  closeNotesDrawer: () => set({ notesDrawerTarget: null }),
  requestAdvancedSearch: () => set((s) => ({ advancedSearchToken: s.advancedSearchToken + 1 })),
  flashHighlight: (activeHighlightId) => set({ activeHighlightId }),

  anyOverlayOpen: () => {
    const s = get()
    return s.searchOpen || s.notesDrawerTarget !== null
  },
}))
