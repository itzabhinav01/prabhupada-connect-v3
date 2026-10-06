import { create } from 'zustand'

import { saveSetting } from '../services/api'
import type { SupabaseCredentials } from '../services/supabaseSync'
import { debounce } from '../utils/debounce'

export const DEFAULT_SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  'https://zaiovlzihmgoswzacgpj.supabase.co'

export const DEFAULT_SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphaW92bHppaG1nb3N3emFjZ3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNzYyMTQsImV4cCI6MjEwNjg1MjIxNH0.JHHblI-WlDWjqa5Qpt-fRwDyDl4JW3_5hszeFe5YVf0'

/** Strips accidental `/rest/v1` or trailing slashes so both
 * `https://xxxx.supabase.co` and `https://xxxx.supabase.co/rest/v1/` work seamlessly. */
export function normalizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '')
}

const debouncedSaveUrl = debounce((url: string) => void saveSetting('supabaseUrl', JSON.stringify(url)), 500)
const debouncedSaveAnonKey = debounce((anonKey: string) => void saveSetting('supabaseAnonKey', JSON.stringify(anonKey)), 500)

interface SyncSettingsState {
  url: string
  anonKey: string
  /** Minutes between automatic background syncs; `0` = manual only. Default: `5`. */
  intervalMinutes: number
  setUrl: (url: string) => void
  setAnonKey: (anonKey: string) => void
  setIntervalMinutes: (minutes: number) => void
  resetToDefaultProject: () => void
  credentials: () => SupabaseCredentials | null
}

export const useSyncSettingsStore = create<SyncSettingsState>((set, get) => ({
  url: DEFAULT_SUPABASE_URL,
  anonKey: DEFAULT_SUPABASE_ANON_KEY,
  intervalMinutes: 5,

  setUrl: (url) => {
    const normalized = normalizeSupabaseUrl(url)
    set({ url: normalized })
    debouncedSaveUrl(normalized)
  },
  setAnonKey: (anonKey) => {
    const trimmed = anonKey.trim()
    set({ anonKey: trimmed })
    debouncedSaveAnonKey(trimmed)
  },
  setIntervalMinutes: (intervalMinutes) => {
    set({ intervalMinutes })
    void saveSetting('syncIntervalMinutes', JSON.stringify(intervalMinutes))
  },
  resetToDefaultProject: () => {
    set({
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
    })
    void saveSetting('supabaseUrl', JSON.stringify(DEFAULT_SUPABASE_URL))
    void saveSetting('supabaseAnonKey', JSON.stringify(DEFAULT_SUPABASE_ANON_KEY))
  },

  credentials: () => {
    const { url, anonKey } = get()
    const cleanUrl = normalizeSupabaseUrl(url || DEFAULT_SUPABASE_URL)
    const cleanKey = (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim()
    return cleanUrl && cleanKey ? { url: cleanUrl, anonKey: cleanKey } : null
  },
}))

/** Seeds the project URL/anon key and auto-sync interval from persisted
 * settings at startup without triggering a redundant save. Falls back to the
 * built-in Supabase project so users can immediately Sign Up / Sign In with zero setup. */
export function hydrateSyncSettings(url: string, anonKey: string, intervalMinutes: number) {
  const cleanUrl = normalizeSupabaseUrl(url || DEFAULT_SUPABASE_URL)
  const cleanKey = (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim()
  useSyncSettingsStore.setState({
    url: cleanUrl,
    anonKey: cleanKey,
    intervalMinutes: intervalMinutes > 0 ? intervalMinutes : 5,
  })
}
