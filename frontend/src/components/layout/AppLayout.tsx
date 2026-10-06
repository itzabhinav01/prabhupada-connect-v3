import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2 } from 'lucide-react'

import { SearchModal } from '../search/SearchModal'
import { NotesDrawer } from '../study/NotesDrawer'
import { TabBar } from '../tabs/TabBar'
import { TabContentRouter } from '../tabs/TabContentRouter'
import { syncNow } from '../../services/supabaseSync'
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

/** Fires a silent background `syncNow` on the interval saved in Settings →
 * Cloud Sync (`useSyncSettingsStore`, persisted as `syncIntervalMinutes`) —
 * `0` leaves auto-sync off. Reschedules immediately whenever the interval
 * changes (no restart needed), and no-ops quietly if the project URL/anon
 * key aren't set or the user isn't signed in (`syncNow` itself already
 * reports that as a `errors: ['Not signed in']` result rather than
 * throwing). */
function useAutoSync() {
  const intervalMinutes = useSyncSettingsStore((s) => s.intervalMinutes)
  const credentials = useSyncSettingsStore((s) => s.credentials)

  useEffect(() => {
    if (!intervalMinutes) return
    const timer = setInterval(
      () => {
        const creds = credentials()
        if (creds) void syncNow(creds).catch(() => {})
      },
      intervalMinutes * 60 * 1000,
    )
    return () => clearInterval(timer)
  }, [intervalMinutes, credentials])
}

function ZenExitButton({ onExit }: { onExit: () => void }) {
  return createPortal(
    <button
      type="button"
      onClick={onExit}
      title="Exit Zen mode (Esc or Ctrl+Shift+F)"
      className="fixed top-3 right-3 z-50 p-2 rounded-full bg-neutral-900/60 text-neutral-500 opacity-30 hover:opacity-100 hover:text-neutral-200 hover:bg-neutral-900 transition-all"
    >
      <Minimize2 size={15} />
    </button>,
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
