import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'

import type { Highlight } from '../../types/study'
import { useHighlightPaletteStore } from '../../stores/useHighlightPaletteStore'

export function HighlightPopover({
  highlight,
  anchorEl,
  onClose,
  onDelete,
  onChangeColor,
}: {
  highlight: Highlight
  anchorEl: HTMLElement
  onClose: () => void
  onDelete: () => void
  onChangeColor: (color: string) => void
}) {
  const rect = anchorEl.getBoundingClientRect()
  const highlightColors = useHighlightPaletteStore((s) => s.palette)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      const el = document.getElementById('highlight-popover')
      if (el && !el.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return createPortal(
    <div
      id="highlight-popover"
      className="fixed z-50 flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 shadow-2xl"
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
    >
      {highlightColors.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChangeColor(c.hex)}
          className="w-5 h-5 rounded-full border border-black/20 hover:scale-110 transition-transform"
          style={{ backgroundColor: c.hex, boxShadow: c.hex === highlight.color ? '0 0 0 2px white' : 'none' }}
          title={c.label}
        />
      ))}
      <div className="w-px h-5 bg-neutral-700 mx-1" />
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-md text-red-400 hover:bg-neutral-800"
        title="Remove highlight"
      >
        <Trash2 size={14} />
      </button>
    </div>,
    document.body,
  )
}
