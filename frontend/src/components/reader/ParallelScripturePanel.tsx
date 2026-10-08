import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, NotebookPen, X, Search } from 'lucide-react'

import { getChapterRecords, getVerseRecord } from '../../services/api'
import { resolveDirectReference } from '../../services/directReference'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useReaderStore } from '../../stores/useReaderStore'
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

/**
 * Split View "Parallel Scripture" mode — matching the main reader's typography,
 * font sizes, and presentation while offering independent verse/chapter navigation
 * and side-by-side comparative scripture study.
 */
export function ParallelScripturePanel({
  initialRecordKey,
  onSwitchMode,
  onClose,
}: {
  initialRecordKey?: string | null
  onSwitchMode: () => void
  onClose: () => void
}) {
  const showSanskrit = useReaderStore((s) => s.showSanskrit)
  const showTransliteration = useReaderStore((s) => s.showTransliteration)
  const showSynonyms = useReaderStore((s) => s.showSynonyms)
  const showTranslation = useReaderStore((s) => s.showTranslation)
  const showPurport = useReaderStore((s) => s.showPurport)

  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)

  const [input, setInput] = useState('')
  const [siblings, setSiblings] = useState<VerseRecord[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const verseRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (books.length === 0) void loadBooks()
  }, [books.length, loadBooks])

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
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadReference(input)
            }}
            placeholder="Compare verse e.g. BG 2.13, SB 4.6.9…"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

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

      {/* Scripture View Body (Continuous Layout Matching Main Reader) */}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        aria-label="Parallel scripture reader"
        className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin focus:outline-none"
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
            <p className="text-sm font-medium text-neutral-300 mb-1">Parallel Scripture View</p>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-sm mx-auto">
              Enter any scripture reference above (e.g.{' '}
              <span className="text-amber-400 font-mono">BG 2.13</span>,{' '}
              <span className="text-amber-400 font-mono">SB 1.1.1</span>,{' '}
              <span className="text-amber-400 font-mono">CC Adi 1.1</span>) to read and compare side-by-side with identical reader typography.
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
                className={`pb-8 mb-8 border-b border-neutral-800/60 last:border-b-0 transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                }`}
              >
                {/* Verse Citation Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-amber-500/90 tracking-wide">
                    {record.reference ?? record.recordKey}
                  </span>
                  {isActive && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Current
                    </span>
                  )}
                </div>

                {/* Devanagari */}
                {showSanskrit && record.devanagari && (
                  <div
                    data-field="devanagari"
                    lang="sa"
                    className="font-devanagari leading-loose text-center text-amber-100/90 whitespace-pre-line mb-3"
                    style={{ fontSize: 'var(--font-size-devanagari, 1.25rem)' }}
                  >
                    {record.devanagari}
                  </div>
                )}

                {/* Transliteration */}
                {showTransliteration && record.transliteration && (
                  <div
                    data-field="transliteration"
                    className="font-scripture italic leading-relaxed text-center text-neutral-300 whitespace-pre-line mb-4"
                    style={{ fontSize: 'var(--font-size-translit, 1.05rem)' }}
                  >
                    {record.transliteration}
                  </div>
                )}

                {/* Synonyms */}
                {showSynonyms && record.synonyms && (
                  <div
                    data-field="synonyms"
                    className="text-neutral-300 leading-relaxed mb-4 text-justify"
                    style={{ fontSize: 'var(--font-size-translation, 1rem)' }}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                      Synonyms
                    </div>
                    {renderWithCitations(record.synonyms)}
                  </div>
                )}

                {/* Translation */}
                {showTranslation && record.translation && (
                  <div
                    data-field="translation"
                    className="font-medium text-neutral-100 leading-relaxed mb-4 pl-3 border-l-2 border-amber-500/60 text-justify"
                    style={{ fontSize: 'var(--font-size-translation, 1.05rem)' }}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/70 mb-1">
                      Translation
                    </div>
                    {renderWithCitations(record.translation)}
                  </div>
                )}

                {/* Purport */}
                {showPurport && (
                  <div
                    data-field="purport"
                    className="text-neutral-200 leading-relaxed space-y-3 text-justify mt-4 pt-3 border-t border-neutral-800/40"
                    style={{ fontSize: 'var(--font-size-purport, 1rem)' }}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                      Purport
                    </div>

                    {purportInfo.sourceRef && (
                      <div className="text-[11px] text-amber-500/80 italic mb-2">
                        (Purport from combined verse {purportInfo.sourceRef})
                      </div>
                    )}

                    {paragraphs.length > 0 ? (
                      paragraphs.map((p, pIdx) => {
                        const classification = classifyPurportParagraph(p)
                        if (classification.kind === 'verse') {
                          return (
                            <div
                              key={pIdx}
                              className="font-scripture italic text-amber-200/90 pl-3 border-l-2 border-amber-500/40 my-3 whitespace-pre-line bg-amber-500/5 py-1.5 rounded-r"
                            >
                              {renderWithCitations(p)}
                            </div>
                          )
                        }
                        if (classification.kind === 'subheading') {
                          return (
                            <h4
                              key={pIdx}
                              className="font-bold text-amber-400 mt-4 mb-1 uppercase tracking-wider text-sm"
                            >
                              {renderWithCitations(p)}
                            </h4>
                          )
                        }
                        return (
                          <p key={pIdx} className="leading-relaxed">
                            {renderWithCitations(p)}
                          </p>
                        )
                      })
                    ) : purportInfo.note ? (
                      <p className="italic text-neutral-400 py-1 bg-neutral-900/40 border border-neutral-800/60 rounded px-2.5">
                        {purportInfo.note}
                      </p>
                    ) : (
                      <p className="italic text-neutral-500 py-1">
                        No separate purport for this verse in the original corpus.
                      </p>
                    )}
                  </div>
                )}
              </article>
            )
          })}
      </div>
    </div>
  )
}
