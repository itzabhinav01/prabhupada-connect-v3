import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, NotebookPen, X } from 'lucide-react'

import { getChapterRecords, getVerseRecord } from '../../services/api'
import { resolveDirectReference } from '../../services/directReference'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { splitPurportParagraphs } from './textUtils'
import { classifyPurportParagraph } from './purportFormatting'
import { renderWithCitations } from './CitationLink'
import type { VerseRecord } from '../../types/scripture'

interface PurportInfo {
  text: string | null
  isGrouped: boolean
  sourceRef: string | null
  note: string | null
}

function resolvePurportInfo(record: VerseRecord, recIdx: number, allRecords: VerseRecord[]): PurportInfo {
  if (record.purports && record.purports.trim()) {
    return { text: record.purports, isGrouped: false, sourceRef: null, note: null }
  }

  // Check if this verse is part of a multi-verse range (e.g. BG 1.4-6 where 1.4 carries the purport)
  // Only borrow if a preceding record explicitly has a range in its reference covering this text.
  for (let j = recIdx - 1; j >= Math.max(0, recIdx - 5); j--) {
    const prev = allRecords[j]
    if (prev?.purports && prev.purports.trim()) {
      const prevRef = prev.reference ?? ''
      if (/[-–—]/.test(prevRef)) {
        return { text: prev.purports, isGrouped: true, sourceRef: prev.reference ?? prev.recordKey, note: null }
      }
      break
    }
  }

  // Special known corpus grouping context: SB 4.6.9 to 4.6.22
  if (record.bookKey === 'SB' && record.recordKey.startsWith('SB-4.6-')) {
    const num = parseInt(record.recordKey.replace('SB-4.6-', ''), 10)
    if (num >= 9 && num <= 22) {
      return {
        text: null,
        isGrouped: false,
        sourceRef: null,
        note: 'Texts 9–22 describe Kailāsa Hill without individual purports (see Text 8).',
      }
    }
  }

  return { text: null, isGrouped: false, sourceRef: null, note: null }
}

/** v2's Split View "Parallel Scripture" mode — a self-contained, read-only
 * scripture comparison panel independent of the main reader's tab state.
 * Supports continuous chapter scrolling with auto-jump to the searched verse,
 * full purport paragraph formatting, citations, and navigation. */
export function ParallelScripturePanel({
  initialRecordKey,
  onSwitchMode,
  onClose,
}: {
  initialRecordKey?: string | null
  onSwitchMode: () => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [siblings, setSiblings] = useState<VerseRecord[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const verseRefs = useRef<Map<string, HTMLElement>>(new Map())

  const loadReference = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const resolved = await resolveDirectReference(trimmed)
      if (!resolved) {
        setError(`No verse found for "${trimmed}"`)
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
      const targetIdx = idx === -1 ? 0 : idx
      setIndex(targetIdx)
      setInput(resolved.reference ?? resolved.recordKey)

      // Auto-scroll to the selected verse in the parallel reader
      requestAnimationFrame(() => {
        const el = verseRefs.current.get(resolved.recordKey)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    } catch {
      setError('Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  // Load initial record on mount if provided and not yet populated
  useEffect(() => {
    if (initialRecordKey && siblings.length === 0) {
      void getVerseRecord(initialRecordKey).then((v) => {
        if (v?.reference) {
          void loadReference(v.reference)
        } else if (v?.recordKey) {
          void loadReference(v.recordKey)
        }
      })
    }
  }, [initialRecordKey])

  const scrollToVerse = (idx: number) => {
    if (idx < 0 || idx >= siblings.length) return
    setIndex(idx)
    const targetRecord = siblings[idx]
    if (targetRecord) {
      const el = verseRefs.current.get(targetRecord.recordKey)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  return (
    <div className="flex flex-col min-h-0 h-full w-full overflow-hidden bg-neutral-950">
      {/* Top Search & Navigation Bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0 bg-neutral-900/60">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void loadReference(input)
          }}
          placeholder="Compare verse e.g. BG 2.13, SB 4.6.9…"
          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50"
        />

        {siblings.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => scrollToVerse(index - 1)}
              disabled={index <= 0}
              title="Previous verse in chapter"
              className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] text-neutral-400 font-mono px-1">
              {index + 1}/{siblings.length}
            </span>
            <button
              type="button"
              onClick={() => scrollToVerse(index + 1)}
              disabled={index >= siblings.length - 1}
              title="Next verse in chapter"
              className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onSwitchMode}
          title="Switch to Realization Notebook"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 shrink-0"
        >
          <NotebookPen size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close split view"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* Main Continuous Verse Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 pb-40 space-y-8"
      >
        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
            Looking up scripture…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && siblings.length === 0 && (
          <div className="text-center py-16 px-4">
            <p className="text-sm font-medium text-neutral-400 mb-1">Parallel Scripture View</p>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Enter a scripture reference above (e.g. <span className="text-amber-500/80 font-mono">SB 4.6.9</span>,{' '}
              <span className="text-amber-500/80 font-mono">BG 2.13</span>,{' '}
              <span className="text-amber-500/80 font-mono">CC Adi 1.1</span>) to compare texts side-by-side.
            </p>
          </div>
        )}

        {!loading &&
          siblings.map((record, i) => {
            const isActive = i === index
            const purportInfo = resolvePurportInfo(record, i, siblings)
            const paragraphs = purportInfo.text ? splitPurportParagraphs(purportInfo.text, record.title) : []

            return (
              <article
                key={record.recordKey}
                ref={(el) => {
                  if (el) verseRefs.current.set(record.recordKey, el)
                  else verseRefs.current.delete(record.recordKey)
                }}
                id={`parallel-${record.recordKey}`}
                onClick={() => setIndex(i)}
                className={`rounded-lg border p-4 transition-colors ${
                  isActive
                    ? 'border-amber-500/50 bg-amber-500/[0.03] shadow-md ring-1 ring-amber-500/20'
                    : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                }`}
              >
                {/* Verse Citation Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800/60">
                  <span className="text-sm font-semibold text-amber-400 tracking-wide">
                    {record.reference ?? record.recordKey}
                  </span>
                  {isActive && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Active
                    </span>
                  )}
                </div>

                {/* Devanagari */}
                {record.devanagari && (
                  <p className="text-base text-center text-amber-100/90 leading-relaxed font-serif my-3" lang="sa">
                    {record.devanagari}
                  </p>
                )}

                {/* Transliteration */}
                {record.transliteration && (
                  <p className="text-xs italic text-neutral-400 text-center leading-relaxed my-3">
                    {record.transliteration}
                  </p>
                )}

                {/* Synonyms */}
                {record.synonyms && (
                  <div className="my-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                      Synonyms
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {renderWithCitations(record.synonyms)}
                    </p>
                  </div>
                )}

                {/* Translation */}
                {record.translation && (
                  <div className="my-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                      Translation
                    </div>
                    <blockquote className="border-l-2 border-amber-500/70 pl-3 py-1 text-sm font-medium text-neutral-200 leading-relaxed bg-amber-500/5 rounded-r">
                      {renderWithCitations(record.translation)}
                    </blockquote>
                  </div>
                )}

                {/* Purport */}
                <div className="mt-4 pt-3 border-t border-neutral-800/50">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                    Purport
                  </div>

                  {purportInfo.sourceRef && (
                    <div className="text-[11px] text-amber-500/80 italic mb-2">
                      (Purport from combined verse {purportInfo.sourceRef})
                    </div>
                  )}

                  {paragraphs.length > 0 ? (
                    <div className="space-y-3">
                      {paragraphs.map((p, pIdx) => {
                        const classification = classifyPurportParagraph(p)
                        if (classification.kind === 'verse') {
                          return (
                            <div
                              key={pIdx}
                              className="text-xs font-serif italic text-amber-200/90 pl-3 border-l-2 border-amber-500/40 my-2 whitespace-pre-line bg-amber-500/5 py-1 rounded-r"
                            >
                              {renderWithCitations(p)}
                            </div>
                          )
                        }
                        if (classification.kind === 'subheading') {
                          return (
                            <h4
                              key={pIdx}
                              className="text-xs font-bold text-amber-400 mt-3 mb-1 uppercase tracking-wider"
                            >
                              {renderWithCitations(p)}
                            </h4>
                          )
                        }
                        return (
                          <p key={pIdx} className="text-xs text-neutral-300 leading-relaxed">
                            {renderWithCitations(p)}
                          </p>
                        )
                      })}
                    </div>
                  ) : purportInfo.note ? (
                    <p className="text-xs italic text-neutral-400 py-1 bg-neutral-900/40 border border-neutral-800/60 rounded px-2.5">
                      {purportInfo.note}
                    </p>
                  ) : (
                    <p className="text-xs italic text-neutral-500 py-1">
                      No separate purport for this verse in the original corpus.
                    </p>
                  )}
                </div>

                {/* Card Quick-Jump Navigation Footer */}
                <div className="flex items-center justify-between pt-3 mt-4 border-t border-neutral-800/40 text-[11px]">
                  {i > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        scrollToVerse(i - 1)
                      }}
                      className="flex items-center gap-1 text-neutral-500 hover:text-amber-400 transition-colors"
                    >
                      <ChevronLeft size={13} /> {siblings[i - 1].reference ?? siblings[i - 1].recordKey}
                    </button>
                  ) : (
                    <span />
                  )}

                  {i < siblings.length - 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        scrollToVerse(i + 1)
                      }}
                      className="flex items-center gap-1 text-neutral-500 hover:text-amber-400 transition-colors"
                    >
                      {siblings[i + 1].reference ?? siblings[i + 1].recordKey} <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              </article>
            )
          })}
      </div>
    </div>
  )
}
