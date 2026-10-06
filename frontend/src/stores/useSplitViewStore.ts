import { create } from 'zustand'

export type SplitMode = 'none' | 'parallel' | 'notebook'

/** v2's Split View / Dual Pane reader (Alt+S) — lifted out of `ReaderCanvas`
 * (rather than local state) so the toolbar button in `Header.tsx` can also
 * toggle it. */
interface SplitViewState {
  mode: SplitMode
  cycle: () => void
  set: (mode: SplitMode) => void
}

export const useSplitViewStore = create<SplitViewState>((set) => ({
  mode: 'none',
  cycle: () => set((s) => ({ mode: s.mode === 'none' ? 'parallel' : s.mode === 'parallel' ? 'notebook' : 'none' })),
  set: (mode) => set({ mode }),
}))
