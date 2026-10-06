import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Minus, X } from 'lucide-react'

import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { SearchModal } from '../search/SearchModal'
import { NotesDrawer } from '../study/NotesDrawer'
import { TabBar } from '../tabs/TabBar'
import { TabContentRouter } from '../tabs/TabContentRouter'
import { getCurrentUser, pingSupabaseKeepAlive, syncNow } from '../../services/supabaseSync'
import { useInPageFindStore } from '../../stores/useInPageFindStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useReaderStore } from '../../stores/useReaderStore'
import { useReaderTabSync } from '../../stores/useReaderTabSync'
import { useStudyStore } from '../../stores/useStudyStore'
import { useSyncSettingsStore } from '../../stores/useSyncSettingsStore'
import { useTabStore } from '../../stores/useTabStore'
import { useThemeStore, type Theme } from '../../stores/useThemeStore'
import { useUIStore } from '../../stores/useUIStore'
import { Header } from './Header'
import { GLOBAL_SEARCH_INPUT_ID, Sidebar } from './Sidebar'

const THEME_ORDER: Theme[] = ['dark', 'oled', 'light', 'sepia', 'sandalwood', 'forest', 'ocean', 'custom']

/** Fires a startup keep-alive ping (preventing Supabase Free Tier from pausing),
 * runs an immediate bidirectional `syncNow` on startup if signed in, and
 * schedules periodic background syncs according to `intervalMinutes`. */
function useAutoSync() {
  const url = useSyncSettingsStore((s) => s.url)
  const anonKey = useSyncSettingsStore((s) => s.anonKey)
  const intervalMinutes = useSyncSettingsStore((s) => s.intervalMinutes)
  const credentials = useSyncSettingsStore((s) => s.credentials)

  useEffect(() => {
    const creds = credentials()
    if (!creds) return
    // 1. Always send a lightweight keep-alive query so Supabase Free Tier stays active
    void pingSupabaseKeepAlive(creds)
    // 2. If user is already signed in, sync immediately on app launch
    void getCurrentUser(creds)
      .then((user) => {
        if (user) return syncNow(creds)
      })
      .catch(() => {})
  }, [url, anonKey, credentials])

  useEffect(() => {
    if (!intervalMinutes) return
    const timer = setInterval(
      () => {
        const creds = credentials()
        if (!creds) return
        void pingSupabaseKeepAlive(creds)
        void syncNow(creds).catch(() => {})
      },
      intervalMinutes * 60 * 1000,
    )
    return () => clearInterval(timer)
  }, [intervalMinutes, credentials])
}

function ZenExitButton({ onExit }: { onExit: () => void }) {
  const [showToast, setShowToast] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowToast(false), 3500)
    return () => clearTimeout(timer)
  }, [])

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize()
    } catch {
      await invoke('window_minimize').catch(() => {})
    }
  }

  const handleClose = async () => {
    try {
      await getCurrentWindow().close()
    } catch {
      await invoke('window_close').catch(() => {})
    }
  }

  return createPortal(
    <>
      {showToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-opacity duration-500 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/95 border border-amber-500/40 text-amber-200 text-xs font-medium shadow-2xl backdrop-blur-md">
            <span>Zen Focus Mode active &bull; Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 font-mono">Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 font-mono">F11</kbd> to return</span>
          </div>
        </div>
      )}
      <div className="fixed top-3 right-4 z-50 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onExit}
          title="Exit Zen mode (Esc or F11)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/90 text-amber-300 border border-amber-500/40 shadow-lg text-xs font-medium hover:bg-neutral-800 hover:text-amber-200 transition-all cursor-pointer backdrop-blur-md opacity-85 hover:opacity-100"
        >
          <Minimize2 size={13} />
          <span>Exit Zen Mode (Esc)</span>
        </button>
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize window"
          className="p-1.5 rounded-full bg-neutral-900/90 text-neutral-400 border border-neutral-700/60 shadow-lg hover:bg-neutral-800 hover:text-neutral-100 transition-all cursor-pointer backdrop-blur-md opacity-75 hover:opacity-100"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          title="Close window"
          className="p-1.5 rounded-full bg-neutral-900/90 text-neutral-400 border border-neutral-700/60 shadow-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-all cursor-pointer backdrop-blur-md opacity-75 hover:opacity-100"
        >
          <X size={13} />
        </button>
      </div>
    </>,
    document.body,
  )
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/**
 * All app-wide keyboard shortcuts, bound once here so they work from any
 * tab (Library, Search, Settings, Reader) — not just while a reader tab
 * happens to be mounted. `Ctrl+F` is the one context-dependent shortcut:
 * on a reader tab it opens the in-page find bar (via `useInPageFindStore`,
 * so this hook doesn't need the reader's chapter data); anywhere else it
 * focuses the sidebar's global search box instead.
 */
function useGlobalKeyboardShortcuts() {
  const openLibraryTab = useTabStore((s) => s.openLibraryTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const cycleTab = useTabStore((s) => s.cycleTab)
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openUtilityTab = useTabStore((s) => s.openUtilityTab)
  const openSearchTab = useTabStore((s) => s.openSearchTab)
  const openHelpTab = useTabStore((s) => s.openHelpTab)

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const zenMode = useThemeStore((s) => s.zenMode)
  const toggleZenMode = useThemeStore((s) => s.toggleZenMode)
  const setZenMode = useThemeStore((s) => s.setZenMode)

  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const requestAdvancedSearch = useUIStore((s) => s.requestAdvancedSearch)
  const anyOverlayOpen = useUIStore((s) => s.anyOverlayOpen)

  const findIsOpen = useInPageFindStore((s) => s.isOpen)
  const openFind = useInPageFindStore((s) => s.open)
  const closeFind = useInPageFindStore((s) => s.close)

  const increaseFontSize = useReaderStore((s) => s.increaseFontSize)
  const decreaseFontSize = useReaderStore((s) => s.decreaseFontSize)
  const resetFontSize = useReaderStore((s) => s.resetFontSize)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const isReaderActive = tabs.find((t) => t.id === activeTabId)?.type === 'reader'

      if (e.key === 'F1') {
        e.preventDefault()
        openHelpTab()
        return
      }
      // Zen mode (F11 / Ctrl+Shift+F) is checked first, and everything else
      // below explicitly excludes Shift, so Ctrl+F (in-page find) can never
      // swallow it.
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) || e.key === 'F11') {
        e.preventDefault()
        toggleZenMode()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
        setTheme(nextTheme)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        openSearchTab('')
        // Deferred a tick: if the Search tab doesn't exist yet, opening it
        // and bumping the token in the same call would both land before
        // SearchTab's first mount, so its `lastAdvancedToken` ref would
        // capture the already-bumped value and never see it as "new".
        setTimeout(() => requestAdvancedSearch(), 0)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        // Read live state at press-time rather than subscribing — this
        // shortcut only matters at the instant it's pressed, and reader
        // state (which verse is active) lives in useNavigationStore, not
        // anything this hook otherwise needs to re-render for.
        const nav = useNavigationStore.getState()
        const activeRecord = nav.chapterRecords.find((r) => r.recordKey === nav.activeVerseId)
        if (activeRecord) {
          void useStudyStore
            .getState()
            .toggleBookmark(
              activeRecord.recordKey,
              nav.selectedBook?.title ?? nav.selectedBook?.bookKey ?? '',
              activeRecord.reference ?? activeRecord.recordKey,
            )
        }
        return
      }
      if (e.key === 'Escape') {
        if (findIsOpen) {
          closeFind()
          return
        }
        if (zenMode && !anyOverlayOpen()) {
          setZenMode(false)
          return
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        if (isReaderActive) openFind()
        else document.getElementById(GLOBAL_SEARCH_INPUT_ID)?.focus()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        openUtilityTab('bookmarks', 'Bookmarks')
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        openUtilityTab('history', 'Reading History')
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        increaseFontSize()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        decreaseFontSize()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        resetFontSize()
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        openLibraryTab()
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        closeTab(activeTabId)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    openLibraryTab,
    closeTab,
    cycleTab,
    tabs,
    activeTabId,
    openUtilityTab,
    openSearchTab,
    theme,
    setTheme,
    zenMode,
    toggleZenMode,
    setZenMode,
    setSearchOpen,
    requestAdvancedSearch,
    anyOverlayOpen,
    findIsOpen,
    openFind,
    closeFind,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    openHelpTab,
  ])
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const zenMode = useThemeStore((s) => s.zenMode)
  const setZenMode = useThemeStore((s) => s.setZenMode)

  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const searchOpen = useUIStore((s) => s.searchOpen)
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const notesDrawerTarget = useUIStore((s) => s.notesDrawerTarget)
  const closeNotesDrawer = useUIStore((s) => s.closeNotesDrawer)

  useReaderTabSync()
  useGlobalKeyboardShortcuts()
  useAutoSync()

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {!zenMode && <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!zenMode && <TabBar />}
        {!zenMode && activeTab.type === 'reader' && <Header />}
        <TabContentRouter tab={activeTab} />
      </div>

      {zenMode && <ZenExitButton onExit={() => setZenMode(false)} />}

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {notesDrawerTarget && <NotesDrawer target={notesDrawerTarget} onClose={closeNotesDrawer} />}
    </div>
  )
}
