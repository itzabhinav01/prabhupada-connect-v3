import { type ReactNode, useRef, useState } from 'react'

import { getVerseRecord } from '../../services/api'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'
import { type ResolvedCitation, segmentCitations } from './citations'

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export function CitationLink({ citation, children }: { citation: ResolvedCitation; children: ReactNode }) {
  const openReaderForVerse = useOpenReaderForVerse()
  const [preview, setPreview] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [missing, setMissing] = useState(false)
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top')
  const [horizontalAlign, setHorizontalAlign] = useState<'center' | 'left' | 'right'>('center')
  const triggerRef = useRef<HTMLButtonElement>(null)

  const updatePlacement = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    // Estimated tooltip height with padding and citation title
    const estimatedHeight = 180

    // Intelligently flip up/down: if not enough room above or more room below, position down!
    if (spaceAbove < estimatedHeight && spaceBelow > spaceAbove) {
      setPlacement('bottom')
    } else {
      setPlacement('top')
    }

    // Intelligently prevent left/right screen overflow
    const halfWidth = 144 // half of w-72 (288px)
    const centerX = rect.left + rect.width / 2
    if (centerX - halfWidth < 12) {
      setHorizontalAlign('left')
    } else if (centerX + halfWidth > window.innerWidth - 12) {
      setHorizontalAlign('right')
    } else {
      setHorizontalAlign('center')
    }
  }

  const handleMouseEnter = () => {
    updatePlacement()
    setHovering(true)
    if (preview !== null || loadingPreview) return
    setLoadingPreview(true)
    getVerseRecord(citation.recordKey)
      .then((record) => {
        const text = record?.translation || record?.purports
        setPreview(text ? truncate(text, 280) : 'Not available in this corpus.')
      })
      .catch(() => setPreview('Not available in this corpus.'))
      .finally(() => setLoadingPreview(false))
  }

  const handleClick = () => {
    void openReaderForVerse(citation.bookKey, citation.chapterKey, citation.recordKey, {
      newTab: true,
      titleSuffix: citation.label || citation.raw,
    }).then((ok) => {
      if (!ok) setMissing(true)
    })
  }

  const isAtMention = citation.raw.startsWith('@')

  return (
    <span className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setHovering(false)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center font-medium cursor-pointer transition-colors ${
          isAtMention
            ? 'px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/30'
            : 'underline decoration-dotted underline-offset-2 text-amber-400 hover:text-amber-300'
        } ${missing ? 'opacity-50 cursor-default' : ''}`}
        title={missing ? 'Not available in this corpus' : `Open ${citation.raw} in new tab`}
      >
        {children}
      </button>
      {hovering && (
        <span
          className={`absolute z-50 w-72 rounded-lg border border-neutral-700 bg-neutral-900/95 p-3 text-xs leading-relaxed text-neutral-200 shadow-2xl pointer-events-none backdrop-blur-md animate-in fade-in duration-150 ${
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
          } ${
            horizontalAlign === 'left'
              ? 'left-0'
              : horizontalAlign === 'right'
              ? 'right-0'
              : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <div className="font-semibold text-amber-400 mb-1 pb-1 border-b border-neutral-800 flex items-center justify-between">
            <span>{citation.label || citation.raw}</span>
            <span className="text-[10px] text-neutral-500 font-normal">Click to open</span>
          </div>
          <div className="text-neutral-300 max-h-56 overflow-y-auto pr-1">
            {loadingPreview ? 'Loading verse preview…' : preview}
          </div>
        </span>
      )}
    </span>
  )
}

/** Renders `text` with any embedded scripture citations turned into
 * clickable, hover-previewable links; plain text otherwise. */
export function renderWithCitations(text: string): ReactNode {
  const segments = segmentCitations(text)
  if (segments.length === 0) return text
  if (segments.length === 1 && segments[0].kind === 'text') return text

  return segments.map((seg, i) =>
    seg.kind === 'citation' && seg.citation ? (
      <CitationLink key={i} citation={seg.citation}>
        {seg.text}
      </CitationLink>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  )
}
