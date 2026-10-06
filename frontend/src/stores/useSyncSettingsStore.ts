import { create } from 'zustand'

import { saveSetting } from '../services/api'
import type { SupabaseCredentials } from '../services/supabaseSync'
import { debounce } from '../utils/debounce'

const ENV_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const ENV_SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

const debouncedSaveUrl = debounce((url: string) => void saveSetting('supabaseUrl', JSON.stringify(url)), 500)
const debouncedSaveAnonKey = debounce((anonKey: string) => void saveSetting('supabaseAnonKey', JSON.stringify(anonKey)), 500)

interface SyncSettingsState {
  url: string
  anonKey: string
  /** Minutes between automatic background syncs; `0` = manual only. */
  intervalMinutes: number
  setUrl: (url: string) => void
  setAnonKey: (anonKey: string) => void
  setIntervalMinutes: (minutes: number) => void
  credentials: () => SupabaseCredentials | null
}

export const useSyncSettingsStore = create<SyncSettingsState>((set, get) => ({
  url: ENV_SUPABASE_URL,
  anonKey: ENV_SUPABASE_ANON_KEY,
  intervalMinutes: 0,

  setUrl: (url) => {
    set({ url })
    debouncedSaveUrl(url)
  },
  setAnonKey: (anonKey) => {
    set({ anonKey })
    debouncedSaveAnonKey(anonKey)
  },
  setIntervalMinutes: (intervalMinutes) => {
    set({ intervalMinutes })
    void saveSetting('syncIntervalMinutes', JSON.stringify(intervalMinutes))
  },

  credentials: () => {
    const { url, anonKey } = get()
    const cleanUrl = url.trim()
    const cleanKey = anonKey.trim()
    return cleanUrl && cleanKey ? { url: cleanUrl, anonKey: cleanKey } : null
  },
}))

/** Seeds the project URL/anon key and auto-sync interval from persisted
 * settings at startup without triggering a redundant save. */
export function hydrateSyncSettings(url: string, anonKey: string, intervalMinutes: number) {
  useSyncSettingsStore.setState({
    url: url || ENV_SUPABASE_URL,
    anonKey: anonKey || ENV_SUPABASE_ANON_KEY,
    intervalMinutes,
  })
}
