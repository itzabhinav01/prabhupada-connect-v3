import type { ReactNode } from 'react'

import { renderWithCitations } from '../reader/CitationLink'
import type { SynonymFlat } from '../reader/synonymsFormatting'
import type { Highlight } from '../../types/study'
import { highlightsForSegment, type TextSegment } from './highlightable'

export function renderSegmentWithHighlights(
  segment: TextSegment,
  highlights: Highlight[],
  onHighlightClick: (highlight: Highlight, anchorEl: HTMLElement) => void,
): ReactNode {
  const local = highlightsForSegment(highlights, segment)
  if (local.length === 0) return renderWithCitations(segment.text)

  const pieces: ReactNode[] = []
  let cursor = 0

  local.forEach((h) => {
    if (h.localStart > cursor) {
      pieces.push(<span key={`t-${h.id}`}>{renderWithCitations(segment.text.slice(cursor, h.localStart))}</span>)
    }
    if (h.localStart >= cursor) {
      pieces.push(
        <mark
          key={`h-${h.id}`}
          data-highlight-id={h.id}
          onClick={(e) => onHighlightClick(h, e.currentTarget)}
          className="rounded-sm cursor-pointer"
          style={{ backgroundColor: h.color, color: '#1a1a1a' }}
        >
          {renderWithCitations(segment.text.slice(h.localStart, h.localEnd))}
        </mark>,
      )
      cursor = h.localEnd
    }
  })

  if (cursor < segment.text.length) {
    pieces.push(<span key="t-end">{renderWithCitations(segment.text.slice(cursor))}</span>)
  }

  return pieces
}

interface StyleRegion {
  start: number
  end: number
  render: (text: string) => ReactNode
}

/** The shared merge engine behind `renderSynonymsSegment` and
 * `renderParagraphWithSpeaker`: intersects an arbitrary set of "style
 * regions" (lemma spans, a dialogue speaker prefix, ...) against the
 * verse's highlight ranges so neither system has to know about the other —
 * every atomic run gets exactly the style + highlight-or-not treatment it
 * should, and a highlight can freely span across (or sit inside) a styled
 * region without either breaking. Regions are assumed non-overlapping with
 * each other; where none apply, `renderWithCitations` is used as the
 * default (unstyled prose, still citation-aware). */
function renderWithStyleRegions(
  segment: TextSegment,
  regions: StyleRegion[],
  highlights: Highlight[],
  onHighlightClick: (highlight: Highlight, anchorEl: HTMLElement) => void,
): ReactNode {
  const localHighlights = highlightsForSegment(highlights, segment)
  if (regions.length === 0) return renderSegmentWithHighlights(segment, highlights, onHighlightClick)

  const boundarySet = new Set<number>([0, segment.text.length])
  regions.forEach((r) => {
    boundarySet.add(r.start)
    boundarySet.add(r.end)
  })
  localHighlights.forEach((h) => {
    boundarySet.add(h.localStart)
    boundarySet.add(h.localEnd)
  })
  const boundaries = [...boundarySet].sort((a, b) => a - b)

  const pieces: ReactNode[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    if (start >= end) continue

    const region = regions.find((r) => r.start <= start && r.end >= end)
    const activeHighlight = localHighlights.find((h) => h.localStart <= start && h.localEnd >= end)
    const text = segment.text.slice(start, end)
    const content = region ? region.render(text) : renderWithCitations(text)

    pieces.push(
      activeHighlight ? (
        <mark
          key={`${start}-${end}`}
          data-highlight-id={activeHighlight.id}
          onClick={(e) => onHighlightClick(activeHighlight, e.currentTarget)}
          className="rounded-sm cursor-pointer"
          style={{ backgroundColor: activeHighlight.color, color: '#1a1a1a' }}
        >
          {content}
        </mark>
      ) : (
        <span key={`${start}-${end}`}>{content}</span>
      ),
    )
  }

  return pieces
}

/** Milestone 3.2: like `renderSegmentWithHighlights`, but for the synonyms
 * segment specifically — splits runs on lemma/separator boundaries (from
 * `synonymsFormatting.ts`) so each Sanskrit lemma gets its own golden-accent
 * styling independent of any highlight overlapping it. */
export function renderSynonymsSegment(
  segment: TextSegment,
  synonyms: SynonymFlat,
  highlights: Highlight[],
  onHighlightClick: (highlight: Highlight, anchorEl: HTMLElement) => void,
  onLemmaClick?: (lemma: string) => void,
): ReactNode {
  const regions: StyleRegion[] = [
    ...synonyms.lemmaRanges.map((r) => ({
      ...r,
      render: (text: string) =>
        onLemmaClick ? (
          <button
            type="button"
            onClick={() => onLemmaClick(text)}
            title={`Find every occurrence of "${text}" in the corpus`}
            className="font-semibold italic cursor-pointer hover:underline decoration-dotted underline-offset-2 bg-transparent border-0 p-0"
            style={{ color: 'var(--accent-color)' }}
          >
            {text}
          </button>
        ) : (
          <span className="font-semibold" style={{ color: 'var(--accent-color)' }}>
            {text}
          </span>
        ),
    })),
    ...synonyms.separatorRanges.map((r) => ({
      ...r,
      render: (text: string) => <span className="text-neutral-600">{text}</span>,
    })),
  ]
  return renderWithStyleRegions(segment, regions, highlights, onHighlightClick)
}

/** Milestone 3.3: renders a purport paragraph classified as dialogue
 * (`"Reporter: What about..."`), styling the `Speaker:` prefix distinctly
 * from the spoken text that follows — same highlight-preserving merge as
 * synonyms, just with one prefix region instead of many lemma regions. */
export function renderParagraphWithSpeaker(
  segment: TextSegment,
  speakerPrefixEnd: number,
  highlights: Highlight[],
  onHighlightClick: (highlight: Highlight, anchorEl: HTMLElement) => void,
): ReactNode {
  const regions: StyleRegion[] = [
    {
      start: 0,
      end: speakerPrefixEnd,
      render: (text: string) => <span className="speaker-name">{text}</span>,
    },
  ]
  return renderWithStyleRegions(segment, regions, highlights, onHighlightClick)
}
