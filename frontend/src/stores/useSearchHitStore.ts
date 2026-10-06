import { create } from 'zustand'

/**
 * v2's F3/Shift+F3 "next/previous search hit" — the ordered RecordKeys from
 * whatever search results a verse was just opened from, plus the query
 * that produced them (for context in the HUD). Deliberately its own store
 * (not the reader tab's payload): `ReaderCanvas` renders from
 * `useNavigationStore`'s single global reading position regardless of
 * which tab is "active" (see `useReaderTabSync`), so it never reads tab
 * payload — a lightweight store here matches how `useInPageFindStore` /
 * `useSplitViewStore` already sit alongside that.
 */
interface SearchHitState {
  hitKeys: string[]
  query: string
  setHits: (hitKeys: string[], query: string) => void
  dismiss: () => void
}

export const useSearchHitStore = create<SearchHitState>((set) => ({
  hitKeys: [],
  query: '',
  setHits: (hitKeys, query) => set({ hitKeys, query }),
  dismiss: () => set({ hitKeys: [], query: '' }),
}))
