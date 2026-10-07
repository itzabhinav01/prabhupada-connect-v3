import { getSetting, saveSetting } from './api'
import type { ReadingMode } from '../stores/useNavigationStore'
import type { LineSpacing } from '../stores/useReaderStore'
import type { ReadingWidth } from '../stores/useReaderStore'
import type { CustomPalette, Theme } from '../stores/useThemeStore'
import { DEFAULT_CUSTOM_PALETTE } from '../stores/useThemeStore'
import { DEFAULT_HIGHLIGHT_PALETTE, type HighlightColor } from '../stores/useHighlightPaletteStore'

export interface PersistedSettings {
  theme: Theme
  textBrightness: number
  fontSize: number
  readingWidth: ReadingWidth
  lineSpacing: LineSpacing
  readingMode: ReadingMode
  showSanskrit: boolean
  showTransliteration: boolean
  showSynonyms: boolean
  showPurport: boolean
  showPronunciationGuide: boolean
  showBacklinks: boolean
  focusModeDefault: boolean
  customPalette: CustomPalette
  highlightPalette: HighlightColor[]
  /** Persisted so the auto-sync scheduler (`useAutoSync` in AppLayout.tsx)
   * can reconnect without the Cloud Sync settings panel being open — the
   * anon key is Supabase's own public client key (not a secret; RLS is what
   * actually protects data), so plaintext storage alongside every other
   * setting is the same trust model Supabase's own docs assume. The
   * password is deliberately never persisted here; after one sign-in,
   * supabase-js's own session persistence (localStorage) keeps the device
   * signed in without it. */
  supabaseUrl: string
  supabaseAnonKey: string
  /** Minutes between automatic background syncs; `0` = manual only. */
  syncIntervalMinutes: number
  /** Custom bookmark collection categories defined by the user even if currently empty */
  customBookmarkCollections: string[]
  /** Sidebar book order the user dragged into place, as a list of
   * `bookKey`s (the virtual `'CC'` key included) — `[]` means "no override,
   * use the corpus's own canonical order." */
  customBookOrder: string[]
}

const DEFAULTS: PersistedSettings = {
  theme: 'dark',
  textBrightness: 100,
  fontSize: 20,
  readingWidth: 'comfortable',
  lineSpacing: 'normal',
  readingMode: 'continuous',
  showSanskrit: true,
  showTransliteration: true,
  showSynonyms: true,
  showPurport: true,
  showPronunciationGuide: true,
  showBacklinks: false,
  focusModeDefault: false,
  customPalette: DEFAULT_CUSTOM_PALETTE,
  highlightPalette: DEFAULT_HIGHLIGHT_PALETTE,
  customBookmarkCollections: [],
  supabaseUrl: 'https://zaiovlzihmgoswzacgpj.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphaW92bHppaG1nb3N3emFjZ3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNzYyMTQsImV4cCI6MjEwNjg1MjIxNH0.JHHblI-WlDWjqa5Qpt-fRwDyDl4JW3_5hszeFe5YVf0',
  syncIntervalMinutes: 5,
  customBookOrder: [],
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function isValidCustomPalette(value: unknown): value is CustomPalette {
  if (typeof value !== 'object' || value === null) return false
  const keys: (keyof CustomPalette)[] = ['canvas', 'surface', 'navPane', 'textPrimary', 'textSecondary', 'accent', 'border']
  return keys.every((k) => {
    const v = (value as Record<string, unknown>)[k]
    return typeof v === 'string' && HEX_COLOR_RE.test(v)
  })
}

/** Loads every persisted setting in parallel, falling back to defaults for
 * anything missing or malformed. Never throws — a fresh install (or a
 * backend hiccup) should still boot with sane defaults.
 *
 * `customPalette` additionally gets a semantic validity check (every slot
 * must be a real `#rrggbb` hex color), not just a JSON-parses-ok check —
 * this is what actually saves a corrupted palette (e.g. a stray `#ff0000`
 * written by an automated test run) from surviving into a real session. If
 * the palette is invalid, `theme` is also forced back to `'dark'` rather
 * than staying on `'custom'` with garbage colors. */
export async function loadInitialSettings(): Promise<PersistedSettings> {
  const keys = Object.keys(DEFAULTS) as (keyof PersistedSettings)[]
  const raw = await Promise.all(
    keys.map((key) =>
      getSetting(key).catch(() => null),
    ),
  )

  const result = { ...DEFAULTS }
  keys.forEach((key, i) => {
    const value = raw[i]
    if (value == null) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(result as any)[key] = JSON.parse(value)
    } catch {
      // malformed value under this key — keep the default
    }
  })

  if (!isValidCustomPalette(result.customPalette)) {
    result.customPalette = DEFAULT_CUSTOM_PALETTE
    // Persist the correction immediately rather than only fixing the
    // in-memory value — otherwise a corrupted stored palette (e.g. from an
    // automated test run writing a raw color straight into settings)
    // reappears on every subsequent launch until someone happens to touch
    // the Palette Designer again.
    void saveSetting('customPalette', JSON.stringify(DEFAULT_CUSTOM_PALETTE))
    if (result.theme === 'custom') {
      result.theme = 'dark'
      void saveSetting('theme', JSON.stringify('dark'))
    }
  }

  // Automatically heal stale test/dummy Supabase endpoints from prior test runs
  if (
    !result.supabaseUrl ||
    result.supabaseUrl.includes('test-project.supabase.co') ||
    !result.supabaseUrl.startsWith('http')
  ) {
    result.supabaseUrl = DEFAULTS.supabaseUrl
    void saveSetting('supabaseUrl', JSON.stringify(DEFAULTS.supabaseUrl))
  }
  if (
    !result.supabaseAnonKey ||
    result.supabaseAnonKey.includes('test-anon') ||
    result.supabaseAnonKey.length < 20
  ) {
    result.supabaseAnonKey = DEFAULTS.supabaseAnonKey
    void saveSetting('supabaseAnonKey', JSON.stringify(DEFAULTS.supabaseAnonKey))
  }

  return result
}
