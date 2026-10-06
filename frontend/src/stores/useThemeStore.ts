import { getCurrentWindow } from '@tauri-apps/api/window'
import { create } from 'zustand'

import { saveSetting } from '../services/api'
import { debounce } from '../utils/debounce'

export type Theme = 'dark' | 'oled' | 'light' | 'sepia' | 'sandalwood' | 'forest' | 'ocean' | 'custom'

export const THEMES: { value: Exclude<Theme, 'custom'>; label: string; preview: { bg: string; text: string; accent: string } }[] = [
  { value: 'dark', label: 'Dark', preview: { bg: '#0f172a', text: '#f8fafc', accent: '#f59e0b' } },
  { value: 'oled', label: 'Midnight OLED', preview: { bg: '#000000', text: '#fafafa', accent: '#fbbf24' } },
  { value: 'light', label: 'Light', preview: { bg: '#ffffff', text: '#090d16', accent: '#9f1239' } },
  { value: 'sepia', label: 'Cream Sepia', preview: { bg: '#fbf0d9', text: '#1e1307', accent: '#9a3412' } },
  { value: 'sandalwood', label: 'Warm Sandalwood', preview: { bg: '#f6efe2', text: '#181006', accent: '#b45309' } },
  { value: 'forest', label: 'Forest Green', preview: { bg: '#0d1f18', text: '#eef6f2', accent: '#d4a72c' } },
  { value: 'ocean', label: 'Yamunā Dusk', preview: { bg: '#091526', text: '#f2f7fd', accent: '#fbbf24' } },
]

export interface CustomPalette {
  canvas: string
  surface: string
  navPane: string
  textPrimary: string
  textSecondary: string
  accent: string
  border: string
}

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  canvas: '#0f172a',
  surface: '#1a2438',
  navPane: '#0f172a',
  textPrimary: '#f8fafc',
  textSecondary: '#b6c4d6',
  accent: '#fbbf24',
  border: '#263349',
}

const PRESET_PALETTES: Record<Exclude<Theme, 'custom'>, CustomPalette> = {
  dark: DEFAULT_CUSTOM_PALETTE,
  oled: {
    canvas: '#000000',
    surface: '#0d0d11',
    navPane: '#050507',
    textPrimary: '#fafafa',
    textSecondary: '#c4c4cc',
    accent: '#fbbf24',
    border: '#1f1f26',
  },
  light: {
    canvas: '#ffffff',
    surface: '#f1f5f9',
    navPane: '#f8fafc',
    textPrimary: '#090d16',
    textSecondary: '#1e293b',
    accent: '#881337',
    border: '#cbd5e1',
  },
  sepia: {
    canvas: '#fbf0d9',
    surface: '#efe2c4',
    navPane: '#f5e6c8',
    textPrimary: '#1e1307',
    textSecondary: '#46331b',
    accent: '#7c2d12',
    border: '#d5c199',
  },
  sandalwood: {
    canvas: '#f6efe2',
    surface: '#ebe1ce',
    navPane: '#efe5d4',
    textPrimary: '#181006',
    textSecondary: '#3e301d',
    accent: '#92400e',
    border: '#d6c7ac',
  },
  forest: {
    canvas: '#0d1f18',
    surface: '#132a21',
    navPane: '#0a1913',
    textPrimary: '#eef6f2',
    textSecondary: '#b4cec2',
    accent: '#e5be52',
    border: '#1e3a2e',
  },
  ocean: {
    canvas: '#091526',
    surface: '#102038',
    navPane: '#07111f',
    textPrimary: '#f2f7fd',
    textSecondary: '#b5cae6',
    accent: '#fbbf24',
    border: '#1c3252',
  },
}

const ALL_CUSTOM_CSS_VARS = [
  '--t-950',
  '--t-900',
  '--t-800',
  '--t-700',
  '--t-600',
  '--t-500-raw',
  '--t-400-raw',
  '--t-300-raw',
  '--t-200-raw',
  '--t-100-raw',
  '--t-accent-500',
  '--t-accent-400',
  '--t-accent-300',
  '--t-nav-bg',
  '--effective-brightness',
]

function hexLuminance(hex: string): number {
  const m = hex.trim().replace(/^#/, '')
  if (m.length !== 6) return 0
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function isLightTheme(theme: Theme, palette: CustomPalette): boolean {
  if (theme === 'light' || theme === 'sepia' || theme === 'sandalwood') return true
  if (theme === 'custom') return hexLuminance(palette.canvas) > 0.5
  return false
}

function syncNativeWindowTheme(isLight: boolean) {
  try {
    void getCurrentWindow().setTheme(isLight ? 'light' : 'dark')
  } catch {
    // Non-Tauri browser preview environment
  }
}

const MIN_BRIGHTNESS = 50
const MAX_BRIGHTNESS = 100

function applyThemeToDom(theme: Theme, palette: CustomPalette) {
  const light = isLightTheme(theme, palette)
  document.documentElement.setAttribute('data-theme', theme === 'custom' ? (light ? 'light' : 'dark') : theme)
  syncNativeWindowTheme(light)
}

function applyBrightnessToDom(brightness: number) {
  document.documentElement.style.setProperty('--text-brightness', `${brightness}%`)
}

function applyCustomPaletteToDom(theme: Theme, palette: CustomPalette) {
  const root = document.documentElement.style
  if (theme !== 'custom') {
    ALL_CUSTOM_CSS_VARS.forEach((cssVar) => root.removeProperty(cssVar))
    return
  }
  const light = hexLuminance(palette.canvas) > 0.5
  root.setProperty('--effective-brightness', light ? '100%' : 'var(--text-brightness)')
  root.setProperty('--t-950', palette.canvas)
  root.setProperty('--t-900', palette.surface)
  root.setProperty('--t-nav-bg', palette.navPane)
  root.setProperty('--t-800', palette.border)
  root.setProperty('--t-700', `color-mix(in srgb, ${palette.border} 72%, ${palette.textSecondary})`)
  root.setProperty('--t-600', `color-mix(in srgb, ${palette.textSecondary} 62%, ${palette.canvas})`)
  root.setProperty('--t-500-raw', `color-mix(in srgb, ${palette.textSecondary} 82%, ${palette.canvas})`)
  root.setProperty('--t-400-raw', palette.textSecondary)
  root.setProperty('--t-300-raw', `color-mix(in srgb, ${palette.textPrimary} 55%, ${palette.textSecondary})`)
  root.setProperty('--t-200-raw', `color-mix(in srgb, ${palette.textPrimary} 80%, ${palette.textSecondary})`)
  root.setProperty('--t-100-raw', palette.textPrimary)
  root.setProperty('--t-accent-500', palette.accent)
  root.setProperty('--t-accent-400', palette.accent)
  root.setProperty('--t-accent-300', palette.accent)
}

const debouncedSaveTheme = debounce((theme: Theme) => void saveSetting('theme', JSON.stringify(theme)), 400)
const debouncedSaveBrightness = debounce(
  (brightness: number) => void saveSetting('textBrightness', JSON.stringify(brightness)),
  400,
)
const debouncedSaveCustomPalette = debounce(
  (palette: CustomPalette) => void saveSetting('customPalette', JSON.stringify(palette)),
  400,
)

interface ThemeState {
  theme: Theme
  textBrightness: number
  zenMode: boolean
  customPalette: CustomPalette

  setTheme: (theme: Theme) => void
  setTextBrightness: (value: number) => void
  toggleZenMode: () => void
  setZenMode: (value: boolean) => void
  setCustomPaletteColor: (key: keyof CustomPalette, hex: string) => void
  copyPaletteFromPreset: (preset: Exclude<Theme, 'custom'>) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  textBrightness: 100,
  zenMode: false,
  customPalette: DEFAULT_CUSTOM_PALETTE,

  setTheme: (theme) => {
    const palette = get().customPalette
    applyThemeToDom(theme, palette)
    applyCustomPaletteToDom(theme, palette)
    set({ theme })
    debouncedSaveTheme(theme)
  },

  setTextBrightness: (value) => {
    const textBrightness = Math.max(MIN_BRIGHTNESS, Math.min(MAX_BRIGHTNESS, value))
    applyBrightnessToDom(textBrightness)
    set({ textBrightness })
    debouncedSaveBrightness(textBrightness)
  },

  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
  setZenMode: (zenMode) => set({ zenMode }),

  setCustomPaletteColor: (key, hex) => {
    const customPalette = { ...get().customPalette, [key]: hex }
    set({ customPalette })
    if (get().theme === 'custom') {
      applyThemeToDom('custom', customPalette)
      applyCustomPaletteToDom('custom', customPalette)
    }
    debouncedSaveCustomPalette(customPalette)
  },

  copyPaletteFromPreset: (preset) => {
    const customPalette: CustomPalette = { ...(PRESET_PALETTES[preset] ?? DEFAULT_CUSTOM_PALETTE) }
    set({ customPalette })
    if (get().theme === 'custom') {
      applyThemeToDom('custom', customPalette)
      applyCustomPaletteToDom('custom', customPalette)
    }
    debouncedSaveCustomPalette(customPalette)
  },
}))

/** Applies theme/brightness/custom-palette and seeds the store, without
 * re-triggering a save — used once at startup after loading persisted
 * settings, before the first paint. */
export function hydrateTheme(theme: Theme, textBrightness: number, customPalette: CustomPalette = DEFAULT_CUSTOM_PALETTE) {
  applyThemeToDom(theme, customPalette)
  applyBrightnessToDom(textBrightness)
  applyCustomPaletteToDom(theme, customPalette)
  useThemeStore.setState({ theme, textBrightness, customPalette })
}
