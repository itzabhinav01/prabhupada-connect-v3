import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const SHORTCUT_GROUPS: { heading: string; rows: [string, string][] }[] = [
  {
    heading: 'Navigation',
    rows: [
      ['Ctrl+Left / Ctrl+Right', 'Previous / Next verse'],
      ['Ctrl+T', 'Open Library tab'],
      ['Ctrl+W', 'Close tab'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / Previous tab'],
    ],
  },
  {
    heading: 'Search & Find',
    rows: [
      ['Ctrl+F', 'In-page find (or focus sidebar search)'],
      ['Ctrl+K', 'Quick search'],
      ['Ctrl+Shift+S', 'Advanced Search (Folio Word Wheel)'],
      ['F3 / Shift+F3', 'Next / Previous find match'],
    ],
  },
  {
    heading: 'Reader',
    rows: [
      ['F11 / Ctrl+Shift+F', 'Toggle Zen mode'],
      ['Ctrl+Shift+L', 'Cycle theme (Dark / Light / Sepia / Forest / Custom)'],
      ['Alt+S', 'Cycle split view'],
      ['Ctrl+= / Ctrl+−', 'Increase / Decrease font size'],
      ['Ctrl+0', 'Reset font size'],
      ['Escape', 'Close find bar / exit Zen mode'],
    ],
  },
  {
    heading: 'Personal Library',
    rows: [
      ['Ctrl+Shift+B', 'Bookmark active verse'],
      ['Ctrl+B', 'Bookmarks tab'],
      ['Ctrl+H', 'History tab'],
    ],
  },
  {
    heading: 'Help',
    rows: [['F1', 'Open User Guide']],
  },
]

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Keyboard Shortcuts" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.heading}>
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              {group.heading}
            </div>
            <div className="flex flex-col gap-1">
              {group.rows.map(([keys, desc]) => (
                <div key={keys} className="flex items-center justify-between gap-4 text-sm">
                  <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono whitespace-nowrap">
                    {keys}
                  </kbd>
                  <span className="text-neutral-400 text-right">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

export function UserGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="User Guide & Manual" onClose={onClose}>
      <p className="text-sm text-neutral-400">Help documentation coming soon.</p>
    </ModalShell>
  )
}
