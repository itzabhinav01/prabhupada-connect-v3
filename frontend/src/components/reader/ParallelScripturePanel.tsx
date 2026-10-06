import { useState } from 'react'
import { ChevronLeft, ChevronRight, NotebookPen, X } from 'lucide-react'

import { getChapterRecords } from '../../services/api'
import { resolveDirectReference } from '../../services/directReference'
import { deriveNavigationTarget } from '../../utils/recordKey'
import type { VerseRecord } from '../../types/scripture'

/** v2's Split View "Parallel Scripture" mode — a self-contained, read-only
 * verse lookup independent of the main reader's book/chapter state. Not
 * `<VerseView />`: that component reads the *main* reader's `selectedBook`
 * for its citation label and bookmark attribution, which would silently
 * mislabel a parallel verse from a different book. */
export function ParallelScripturePanel({ onSwitchMode, onClose }: { onSwitchMode: () => void; onClose: () => void }) {
  const [input, setInput] = useState('')
  const [siblings, setSiblings] = useState<VerseRecord[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = siblings[index] ?? null

  // A verse-group's combined purport is stored once, on the group's opening
  // record (e.g. BG-1-4 carries the purport for Texts 4-6; BG-1-5/1-6 are
  // blank) — confirmed directly against the corpus, not assumed. Walk
  // backward through the already-loaded chapter siblings for the nearest
  // one that actually has it, rather than rendering nothing.
  const purport = (() => {
    if (!current) return null
    if (current.purports && current.purports.trim()) {
      return { text: current.purports, sourceRef: null as string | null }
    }
    for (let i = index - 1; i >= Math.max(0, index - 5); i--) {
      const sibling = siblings[i]
      if (sibling?.purports && sibling.purports.trim()) {
        return { text: sibling.purports, sourceRef: sibling.reference ?? sibling.recordKey }
      }
    }
    return null
  })()

  const handleSubmit = async () => {
    const query = input.trim()
    if (!query) return
    setLoading(true)
    setError(null)
    try {
      const resolved = await resolveDirectReference(query)
      if (!resolved) {
        setError(`No verse found for "${query}"`)
        setSiblings([])
        return
      }
      const target = deriveNavigationTarget(resolved.recordKey)
      if (!target) {
        setError('Could not resolve chapter for that verse')
        return
      }
      const records = await getChapterRecords(target.bookKey, target.chapterKey)
      const idx = records.findIndex((r) => r.recordKey === resolved.recordKey)
      setSiblings(records)
      setIndex(idx === -1 ? 0 : idx)
    } catch {
      setError('Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit()
          }}
          placeholder="Compare verse e.g. BG 2.13, SB 1.1.1…"
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
        />
        <button
          type="button"
          onClick={onSwitchMode}
          title="Switch to Realization Notebook"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <NotebookPen size={15} />
        </button>
        <button type="button" onClick={onClose} title="Close split view" className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {loading && <p className="text-sm text-neutral-500">Looking up…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && !current && (
          <p className="text-sm text-neutral-600">Type a reference above to compare it side-by-side.</p>
        )}
        {current && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-amber-500/80">{current.reference ?? current.recordKey}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="p-1 rounded-md text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(siblings.length - 1, i + 1))}
                  disabled={index >= siblings.length - 1}
                  className="p-1 rounded-md text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            {current.devanagari && (
              <p className="text-lg text-center mb-3 leading-relaxed" lang="sa">
                {current.devanagari}
              </p>
            )}
            {current.transliteration && (
              <p className="text-sm italic text-neutral-400 text-center mb-3">{current.transliteration}</p>
            )}
            {current.synonyms && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-neutral-500 mb-1">Synonyms</div>
                <p className="text-sm text-neutral-300 leading-relaxed">{current.synonyms}</p>
              </div>
            )}
            {current.translation && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-neutral-500 mb-1">Translation</div>
                <p className="text-sm text-neutral-200 leading-relaxed">{current.translation}</p>
              </div>
            )}
            {purport && (
              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">Purport</div>
                {purport.sourceRef && (
                  <div className="text-[11px] text-amber-500/70 italic mb-1">(From {purport.sourceRef})</div>
                )}
                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{purport.text}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
