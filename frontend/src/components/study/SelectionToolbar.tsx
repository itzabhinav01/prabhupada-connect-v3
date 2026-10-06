import { type RefObject, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Copy, StickyNote } from 'lucide-react'

import { captureSelectionRange } from './highlightable'
import { useHighlightPaletteStore } from '../../stores/useHighlightPaletteStore'

interface PendingSelection {
  start: number
  end: number
  text: string
}

export function SelectionToolbar({
  containerRef,
  citationLabel,
  onHighlight,
  onAddNote,
  onLookup,
}: {
  containerRef: RefObject<HTMLElement | null>
  citationLabel: string
  onHighlight: (color: string, start: number, end: number, text: string) => void
  onAddNote: () => void
  onLookup: (word: string) => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const highlightColors = useHighlightPaletteStore((s) => s.palette)

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('#selection-toolbar')) return
      const root = containerRef.current
      if (!root) return
      requestAnimationFrame(() => {
        const captured = captureSelectionRange(root)
        if (!captured) {
          setPos(null)
          setPending(null)
          return
        }
        const range = window.getSelection()?.getRangeAt(0)
        const rect = range?.getBoundingClientRect()
        if (!rect) return
        setPos({ x: rect.left + rect.width / 2, y: rect.top })
        setPending(captured)
      })
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [containerRef])

  useEffect(() => {
    if (!pos) return
    const handleDown = (e: MouseEvent) => {
      const el = document.getElementById('selection-toolbar')
      if (el && !el.contains(e.target as Node)) {
        setPos(null)
        setPending(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPos(null)
        setPending(null)
      }
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [pos])

  if (!pos || !pending) return null

  const dismiss = () => {
    setPos(null)
    setPending(null)
  }

  const handleColor = (color: string) => {
    onHighlight(color, pending.start, pending.end, pending.text)
    window.getSelection()?.removeAllRanges()
    dismiss()
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(`${pending.text} — [${citationLabel}]`)
    window.getSelection()?.removeAllRanges()
    dismiss()
  }

  const handleNote = () => {
    onAddNote()
    dismiss()
  }

  const handleLookup = () => {
    // The IAST diacritic range (not a hand-enumerated character list, which
    // is easy to leave gaps in — a first attempt here omitted `ṛ`, silently
    // mangling extremely common words like "Dhṛtarāṣṭra"/"Kṛṣṇa"). Matches
    // the same Unicode-range class `typography.rs` already uses for "is
    // this an IAST letter" everywhere else in this codebase.
    const firstWord = pending.text.trim().split(/\s+/)[0]?.replace(/[^a-zA-ZÀ-ɏḀ-ỿ'-]/gu, '')
    if (firstWord) onLookup(firstWord)
    dismiss()
  }

  return createPortal(
    <div
      id="selection-toolbar"
      className="fixed z-50 flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 shadow-2xl"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
    >
      {highlightColors.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => handleColor(c.hex)}
          className="w-6 h-6 rounded-full border border-black/20 hover:scale-110 transition-transform"
          style={{ backgroundColor: c.hex }}
          title={c.label}
        />
      ))}
      <div className="w-px h-5 bg-neutral-700 mx-1" />
      <button
        type="button"
        onClick={handleNote}
        className="p-1.5 rounded-md text-neutral-300 hover:bg-neutral-800"
        title="Add note"
      >
        <StickyNote size={15} />
      </button>
      <button
        type="button"
        onClick={handleLookup}
        className="p-1.5 rounded-md text-neutral-300 hover:bg-neutral-800"
        title="Look up in concordance"
      >
        <BookOpen size={15} />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md text-neutral-300 hover:bg-neutral-800"
        title="Copy with citation"
      >
        <Copy size={15} />
      </button>
    </div>,
    document.body,
  )
}
