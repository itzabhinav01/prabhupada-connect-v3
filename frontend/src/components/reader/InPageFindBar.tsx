import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

import type { useInPageFind } from './useInPageFind'

export function InPageFindBar({ find }: { find: ReturnType<typeof useInPageFind> }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      find.close()
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (e.shiftKey) find.prev()
      else find.next()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      find.prev()
    }
  }

  return (
    <div className="absolute top-3 right-3 z-40 flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 shadow-2xl">
      <input
        ref={inputRef}
        value={find.query}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in chapter (Ctrl+F)…"
        className="w-48 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
      />
      <button
        type="button"
        onClick={find.toggleMatchCase}
        title="Match case"
        className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
          find.matchCase ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
        }`}
      >
        Aa
      </button>
      <button
        type="button"
        onClick={find.toggleWholeWord}
        title="Match whole word"
        className={`px-1.5 py-0.5 rounded text-xs font-mono ${
          find.wholeWord ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
        }`}
      >
        [ab]
      </button>
      <span className="text-xs text-neutral-500 tabular-nums whitespace-nowrap px-1">
        {find.matches.length === 0
          ? find.query
            ? '0 of 0'
            : ''
          : `${find.currentIndex + 1} of ${find.matches.length}`}
      </span>
      <button
        type="button"
        onClick={find.prev}
        disabled={find.matches.length === 0}
        title="Previous match (Shift+Enter / ↑)"
        className="p-1 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={find.next}
        disabled={find.matches.length === 0}
        title="Next match (Enter / ↓)"
        className="p-1 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
      >
        <ChevronDown size={14} />
      </button>
      <div className="w-px h-4 bg-neutral-700 mx-0.5" />
      <button
        type="button"
        onClick={find.close}
        title="Close (Esc)"
        className="p-1 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
      >
        <X size={14} />
      </button>
    </div>
  )
}
