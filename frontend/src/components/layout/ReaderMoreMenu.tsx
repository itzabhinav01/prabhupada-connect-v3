import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, Clock, Globe, HelpCircle, Highlighter, Keyboard, MoreHorizontal, Search, StickyNote } from 'lucide-react'

import { useTabStore } from '../../stores/useTabStore'
import { useUIStore } from '../../stores/useUIStore'
import { KeyboardShortcutsModal, UserGuideModal } from './ReaderInfoModal'

interface MenuItem {
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
  onSelect: () => void
}

/** v2's `···` overflow menu (`MainPage.xaml` `MoreOptionsMenuButton`) — a
 * handful of these duplicate the toolbar's own quick-access icons
 * (Bookmarks, Notes, History), matching v2's own layout; the rest
 * (Highlights, Advanced Search, User Guide, Keyboard Shortcuts) aren't
 * otherwise reachable from the reader toolbar. */
export function ReaderMoreMenu() {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'guide' | 'shortcuts' | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)

  const openUtilityTab = useTabStore((s) => s.openUtilityTab)
  const openSearchTab = useTabStore((s) => s.openSearchTab)
  const openBrowserTab = useTabStore((s) => s.openBrowserTab)
  const requestAdvancedSearch = useUIStore((s) => s.requestAdvancedSearch)

  useEffect(() => {
    if (!open) {
      setDropdownPos(null)
      return
    }
    // The dropdown is portaled to `document.body` (see below) so it isn't
    // clipped by TabBar's `overflow-x-auto` — CSS forces the y-axis to
    // `auto` too whenever x is anything but `visible`, which clips any
    // absolutely-positioned child that would otherwise extend below it.
    // Being outside that DOM subtree means it has to be positioned from
    // the button's own screen coordinates instead of `absolute` CSS.
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items: MenuItem[] = [
    { label: 'Recently Read', icon: Clock, onSelect: () => openUtilityTab('history', 'Reading History') },
    { label: 'Bookmarks', icon: Bookmark, onSelect: () => openUtilityTab('bookmarks', 'Bookmarks') },
    { label: 'Notes & Realizations', icon: StickyNote, onSelect: () => openUtilityTab('notes', 'Notes') },
    { label: 'Highlights', icon: Highlighter, onSelect: () => openUtilityTab('highlights', 'Highlights') },
    { label: 'Open Browser', icon: Globe, onSelect: () => openBrowserTab() },
    {
      label: 'Advanced Search (Folio)',
      icon: Search,
      onSelect: () => {
        openSearchTab('')
        setTimeout(() => requestAdvancedSearch(), 0)
      },
    },
    { label: 'User Guide & Manual', icon: HelpCircle, onSelect: () => setModal('guide') },
    { label: 'Keyboard Shortcuts', icon: Keyboard, onSelect: () => setModal('shortcuts') },
  ]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        title="More options"
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
            className="w-56 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-1"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onSelect()
                  setOpen(false)
                }}
                className="w-full flex items-center gap-3 text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              >
                <item.icon size={14} className="text-neutral-500 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {modal === 'guide' && <UserGuideModal onClose={() => setModal(null)} />}
      {modal === 'shortcuts' && <KeyboardShortcutsModal onClose={() => setModal(null)} />}
    </>
  )
}
