import { create } from 'zustand'

import { saveSetting } from '../services/api'
import { debounce } from '../utils/debounce'

export interface HighlightColor {
  id: string
  hex: string
  label: string
}

export const DEFAULT_HIGHLIGHT_PALETTE: HighlightColor[] = [
  { id: 'color-1', hex: '#fef08a', label: 'Colour 1' },
  { id: 'color-2', hex: '#bbf7d0', label: 'Colour 2' },
  { id: 'color-3', hex: '#bae6fd', label: 'Colour 3' },
]

let nextColorId = DEFAULT_HIGHLIGHT_PALETTE.length + 1

const debouncedSave = debounce(
  (palette: HighlightColor[]) => void saveSetting('highlightPalette', JSON.stringify(palette)),
  400,
)

interface HighlightPaletteState {
  palette: HighlightColor[]
  addColor: (hex: string, label?: string) => void
  removeColor: (id: string) => void
  updateColor: (id: string, patch: Partial<Pick<HighlightColor, 'hex' | 'label'>>) => void
  resetPalette: () => void
}

export const useHighlightPaletteStore = create<HighlightPaletteState>((set, get) => ({
  palette: DEFAULT_HIGHLIGHT_PALETTE,

  addColor: (hex, label) => {
    const palette = [...get().palette, { id: `color-${nextColorId++}`, hex, label: label ?? `Colour ${get().palette.length + 1}` }]
    set({ palette })
    debouncedSave(palette)
  },
  removeColor: (id) => {
    const palette = get().palette.filter((c) => c.id !== id)
    set({ palette })
    debouncedSave(palette)
  },
  updateColor: (id, patch) => {
    const palette = get().palette.map((c) => (c.id === id ? { ...c, ...patch } : c))
    set({ palette })
    debouncedSave(palette)
  },
  resetPalette: () => {
    set({ palette: DEFAULT_HIGHLIGHT_PALETTE })
    debouncedSave(DEFAULT_HIGHLIGHT_PALETTE)
  },
}))

/** Seeds the palette from persisted settings at startup without triggering
 * a redundant save. */
export function hydrateHighlightPalette(palette: HighlightColor[]) {
  if (palette.length === 0) return
  const maxId = palette.reduce((max, c) => {
    const n = Number(c.id.replace('color-', ''))
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
  nextColorId = maxId + 1
  useHighlightPaletteStore.setState({ palette })
}
