import { type ReactNode, useState } from 'react'

import { getVerseRecord } from '../../services/api'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'
import { type ResolvedCitation, segmentCitations } from './citations'

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function CitationLink({ citation, children }: { citation: ResolvedCitation; children: ReactNode }) {
  const openReaderForVerse = useOpenReaderForVerse()
  const [preview, setPreview] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [missing, setMissing] = useState(false)

  const handleMouseEnter = () => {
    setHovering(true)
    if (preview !== null || loadingPreview) return
    setLoadingPreview(true)
    getVerseRecord(citation.recordKey)
      .then((record) => {
        const text = record?.translation || record?.purports
        setPreview(text ? truncate(text, 160) : 'Not available in this corpus.')
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

  return (
    <span className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setHovering(false)}>
      <button
        type="button"
        onClick={handleClick}
        className={`underline decoration-dotted underline-offset-2 font-medium cursor-pointer ${
          missing ? 'text-neutral-500 cursor-default' : 'text-amber-400 hover:text-amber-300'
        }`}
        title={missing ? 'Not available in this corpus' : `Open ${citation.raw} in new tab`}
      >
        {children}
      </button>
      {hovering && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-neutral-300 shadow-xl pointer-events-none">
          {loadingPreview ? 'Loading…' : preview}
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
