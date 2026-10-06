import type { ComponentType } from 'react'
import { Bookmark, Clock, FileText, Globe, Highlighter, HelpCircle, Library, Plus, Search, Settings, StickyNote, X } from 'lucide-react'

import { ReaderMoreMenu } from '../layout/ReaderMoreMenu'
import { WindowControls } from '../layout/WindowControls'
import { useTabStore, type Tab, type TabType } from '../../stores/useTabStore'

const TAB_ICONS: Record<TabType, ComponentType<{ size?: number; className?: string }>> = {
  toc: Library,
  reader: Library,
  search: Search,
  settings: Settings,
  notes: StickyNote,
  bookmarks: Bookmark,
  history: Clock,
  highlights: Highlighter,
  help: HelpCircle,
  browser: Globe,
  pdf: FileText,
}

function TabItem({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const Icon = TAB_ICONS[tab.type]

  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(tab.id)}
      onMouseDown={(e) => {
        // Middle-click closes, matching browser tab conventions.
        if (e.button === 1 && tab.isClosable) closeTab(tab.id)
      }}
      className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 border-r border-neutral-800 cursor-pointer select-none min-w-0 max-w-[200px] transition-colors ${
        isActive
          ? 'bg-neutral-900 text-neutral-100'
          : 'bg-neutral-950 text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200'
      }`}
      title={tab.title}
    >
      <Icon size={13} className="shrink-0 text-neutral-500" />
      <span className="truncate text-xs">{tab.title}</span>
      {tab.isClosable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            closeTab(tab.id)
          }}
          className="shrink-0 p-0.5 rounded text-neutral-600 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 hover:text-neutral-200 transition-opacity"
          title="Close tab (Ctrl+W)"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openLibraryTab = useTabStore((s) => s.openLibraryTab)
  const openSearchTab = useTabStore((s) => s.openSearchTab)
  const openUtilityTab = useTabStore((s) => s.openUtilityTab)

  return (
    <div className="flex items-stretch h-9 bg-neutral-950 border-b border-neutral-800 shrink-0 select-none">
      <div className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-none" data-tauri-drag-region>
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
        ))}
        <button
          type="button"
          onClick={openLibraryTab}
          className="shrink-0 flex items-center justify-center w-9 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
          title="New tab (Ctrl+T)"
        >
          <Plus size={14} />
        </button>
        {/* Window drag area spanning the remaining space of the tab bar */}
        <div data-tauri-drag-region className="flex-1 min-w-4 h-full cursor-default" />
      </div>

      <div className="flex items-center shrink-0 border-l border-neutral-800">
        <button
          type="button"
          onClick={() => openSearchTab('')}
          className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Open Search Page (Ctrl+Shift+S)"
        >
          <Search size={15} />
        </button>
        <button
          type="button"
          onClick={() => openUtilityTab('help', 'User Guide')}
          className="p-2 text-neutral-400 hover:text-amber-300 hover:bg-neutral-800"
          title="User Guide & Manual (F1)"
        >
          <HelpCircle size={15} />
        </button>
        <button
          type="button"
          onClick={() => openUtilityTab('settings', 'Settings')}
          className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Settings"
        >
          <Settings size={15} />
        </button>
        <div className="px-1 flex items-center">
          <ReaderMoreMenu />
        </div>
        <WindowControls />
      </div>
    </div>
  )
}
