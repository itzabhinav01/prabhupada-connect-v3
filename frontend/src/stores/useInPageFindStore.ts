import { create } from 'zustand'

/**
 * Holds only the in-page find bar's UI intent (open? what query?) — not the
 * computed matches, which depend on the current chapter's `VerseRecord[]`
 * and are therefore still derived inside `useInPageFind` (reader-scoped).
 * Lifting just this much lets the global `Ctrl+F`/`Escape` shortcuts in
 * `AppLayout.tsx` open and close the find bar without needing to know
 * anything about chapter data.
 */
interface InPageFindState {
  isOpen: boolean
  query: string
  currentIndex: number
  /** "Aa" toggle — when on, matching is case-sensitive on the raw text
   * (IAST diacritic-insensitivity is a normalizing/folding step like
   * lowercasing, so match-case necessarily turns it off too, the same
   * trade-off browsers' own case-sensitive find makes with accents). */
  matchCase: boolean
  /** "[ab]" toggle — match must be bounded by non-word characters (or the
   * string's edges) on both sides. */
  wholeWord: boolean
  open: () => void
  close: () => void
  setQuery: (query: string) => void
  setCurrentIndex: (index: number) => void
  toggleMatchCase: () => void
  toggleWholeWord: () => void
}

export const useInPageFindStore = create<InPageFindState>((set) => ({
  isOpen: false,
  query: '',
  currentIndex: 0,
  matchCase: false,
  wholeWord: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', currentIndex: 0 }),
  setQuery: (query) => set({ query, currentIndex: 0 }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  toggleMatchCase: () => set((s) => ({ matchCase: !s.matchCase, currentIndex: 0 })),
  toggleWholeWord: () => set((s) => ({ wholeWord: !s.wholeWord, currentIndex: 0 })),
}))
