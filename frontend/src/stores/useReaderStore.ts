import { create } from 'zustand'

import { saveSetting } from '../services/api'
import { debounce } from '../utils/debounce'

export type ReadingWidth = 'narrow' | 'comfortable' | 'wide'
export type LineSpacing = 'compact' | 'normal' | 'relaxed'

export const READING_WIDTH_PX: Record<ReadingWidth, number> = {
  narrow: 580,
  comfortable: 720,
  wide: 880,
}

export const LINE_SPACING_VALUES: Record<LineSpacing, number> = {
  compact: 1.5,
  normal: 1.75,
  relaxed: 2.0,
}

const MIN_FONT_SIZE = 14
const MAX_FONT_SIZE = 32
const FONT_STEP = 2
const DEFAULT_FONT_SIZE = 20

function applyLineSpacingToDom(spacing: LineSpacing) {
  document.documentElement.style.setProperty('--reading-line-height', String(LINE_SPACING_VALUES[spacing]))
}

export function applyFontSizeToDom(fontSize: number) {
  const root = document.documentElement
  root.style.setProperty('--reading-font-size', `${fontSize}px`)
  root.style.setProperty('--font-size-sanskrit', `${fontSize}px`)
  root.style.setProperty('--font-size-translit', `${fontSize}px`)
  root.style.setProperty('--font-size-synonyms', `${Math.max(12, Math.round(fontSize * 0.8))}px`)
  root.style.setProperty('--font-size-translation', `${Math.max(13, Math.round(fontSize * 0.9))}px`)
  root.style.setProperty('--font-size-purport', `${Math.max(12, Math.round(fontSize * 0.85))}px`)
}

const debouncedSave = debounce((key: string, value: unknown) => void saveSetting(key, JSON.stringify(value)), 400)

interface ReaderState {
  fontSize: number
  readingWidth: ReadingWidth
  lineSpacing: LineSpacing
  showSanskrit: boolean
  showSynonyms: boolean
  showTranslation: boolean
  showPurport: boolean
  showTransliteration: boolean
  showPronunciationGuide: boolean
  showBacklinks: boolean
  focusModeDefault: boolean

  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void
  setFontSize: (size: number) => void
  setReadingWidth: (width: ReadingWidth) => void
  setLineSpacing: (spacing: LineSpacing) => void
  toggleSanskrit: () => void
  toggleSynonyms: () => void
  toggleTranslation: () => void
  togglePurport: () => void
  toggleTransliteration: () => void
  togglePronunciationGuide: () => void
  toggleBacklinks: () => void
  setShowBacklinks: (val: boolean) => void
  setFocusModeDefault: (value: boolean) => void
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  fontSize: DEFAULT_FONT_SIZE,
  readingWidth: 'comfortable',
  lineSpacing: 'normal',
  showSanskrit: true,
  showSynonyms: true,
  showTranslation: true,
  showPurport: true,
  showTransliteration: true,
  showPronunciationGuide: true,
  showBacklinks: false,
  focusModeDefault: false,

  increaseFontSize: () => {
    const fontSize = Math.min(MAX_FONT_SIZE, get().fontSize + FONT_STEP)
    applyFontSizeToDom(fontSize)
    set({ fontSize })
    debouncedSave('fontSize', fontSize)
  },
  decreaseFontSize: () => {
    const fontSize = Math.max(MIN_FONT_SIZE, get().fontSize - FONT_STEP)
    applyFontSizeToDom(fontSize)
    set({ fontSize })
    debouncedSave('fontSize', fontSize)
  },
  resetFontSize: () => {
    applyFontSizeToDom(DEFAULT_FONT_SIZE)
    set({ fontSize: DEFAULT_FONT_SIZE })
    debouncedSave('fontSize', DEFAULT_FONT_SIZE)
  },
  setFontSize: (size: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
    applyFontSizeToDom(clamped)
    set({ fontSize: clamped })
    debouncedSave('fontSize', clamped)
  },
  setReadingWidth: (readingWidth) => {
    set({ readingWidth })
    debouncedSave('readingWidth', readingWidth)
  },
  setLineSpacing: (lineSpacing) => {
    applyLineSpacingToDom(lineSpacing)
    set({ lineSpacing })
    debouncedSave('lineSpacing', lineSpacing)
  },
  toggleSanskrit: () =>
    set((s) => {
      const showSanskrit = !s.showSanskrit
      debouncedSave('showSanskrit', showSanskrit)
      return { showSanskrit }
    }),
  toggleSynonyms: () =>
    set((s) => {
      const showSynonyms = !s.showSynonyms
      debouncedSave('showSynonyms', showSynonyms)
      return { showSynonyms }
    }),
  toggleTranslation: () =>
    set((s) => {
      const showTranslation = !s.showTranslation
      debouncedSave('showTranslation', showTranslation)
      return { showTranslation }
    }),
  togglePurport: () =>
    set((s) => {
      const showPurport = !s.showPurport
      debouncedSave('showPurport', showPurport)
      return { showPurport }
    }),
  toggleTransliteration: () =>
    set((s) => {
      const showTransliteration = !s.showTransliteration
      debouncedSave('showTransliteration', showTransliteration)
      return { showTransliteration }
    }),
  togglePronunciationGuide: () =>
    set((s) => {
      const showPronunciationGuide = !s.showPronunciationGuide
      debouncedSave('showPronunciationGuide', showPronunciationGuide)
      return { showPronunciationGuide }
    }),
  toggleBacklinks: () =>
    set((s) => {
      const showBacklinks = !s.showBacklinks
      debouncedSave('showBacklinks', showBacklinks)
      return { showBacklinks }
    }),
  setShowBacklinks: (showBacklinks) => {
    set({ showBacklinks })
    debouncedSave('showBacklinks', showBacklinks)
  },
  setFocusModeDefault: (focusModeDefault) => {
    set({ focusModeDefault })
    debouncedSave('focusModeDefault', focusModeDefault)
  },
}))

/** Seeds fontSize/readingWidth/lineSpacing from persisted settings at
 * startup, applying line spacing to the DOM immediately, without triggering
 * a redundant save. */
export function hydrateReaderSettings(fontSize: number, readingWidth: ReadingWidth, lineSpacing: LineSpacing) {
  applyLineSpacingToDom(lineSpacing)
  applyFontSizeToDom(fontSize)
  useReaderStore.setState({ fontSize, readingWidth, lineSpacing })
}
