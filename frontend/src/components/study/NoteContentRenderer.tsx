import { type ReactNode } from 'react'
import { CitationLink } from '../reader/CitationLink'
import { segmentCitations } from '../reader/citations'
import { resolveDirectReference } from '../../services/directReference'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'

interface NoteContentRendererProps {
  content: string
  className?: string
}

const WIKILINK_OR_TAG_RE = /(\[\[[^\]]+\]\]|#[a-zA-Z0-9_-]+)/g

function SubTextSegment({ text }: { text: string }) {
  const openReaderForVerse = useOpenReaderForVerse()

  const parts = text.split(WIKILINK_OR_TAG_RE)
  if (parts.length === 1) return <>{text}</>

  return (
    <>
      {parts.map((part, i) => {
        const wikiMatch = part.match(/^\[\[(.+)\]\]$/)
        if (wikiMatch) {
          const ref = wikiMatch[1]
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                void resolveDirectReference(ref).then((resolved) => {
                  if (!resolved) return
                  const target = deriveNavigationTarget(resolved.recordKey)
                  if (target) {
                    void openReaderForVerse(target.bookKey, target.chapterKey, resolved.recordKey, {
                      newTab: true,
                      titleSuffix: resolved.reference,
                    })
                  }
                })
              }}
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2 font-medium cursor-pointer"
              title={`Open ${ref} in new tab`}
            >
              [[{ref}]]
            </button>
          )
        }
        if (/^#[a-zA-Z0-9_-]+$/.test(part)) {
          return (
            <span key={i} className="text-amber-500/85 font-medium px-1 py-0.5 rounded bg-amber-500/10">
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

/**
 * Renders personal note content with full fidelity:
 * - Embedded scripture citations & `@` references (`@bg 4.8`, `@SB 4.2.2`, `[Bg. 4.8]`)
 *   become interactive `CitationLink` components with hover preview and click-to-open in new tab.
 * - `[[WikiLinks]]` become clickable scripture/note links.
 * - `#hashtags` become gold tag badges.
 * - Markdown paragraphs, blockquotes, bold/italic are cleanly supported.
 */
export function NoteContentRenderer({ content, className = '' }: NoteContentRendererProps) {
  if (!content || !content.trim()) {
    return <span className="text-neutral-500 italic">(empty)</span>
  }

  // Split into paragraphs by double newlines or single newlines
  const paragraphs = content.split(/\r?\n\s*\r?\n/)

  return (
    <div className={`space-y-2.5 ${className}`}>
      {paragraphs.map((para, pIdx) => {
        const trimmed = para.trim()
        if (!trimmed) return null

        // Check if paragraph is a blockquote
        const isQuote = trimmed.startsWith('> ')
        const cleanPara = isQuote ? trimmed.replace(/^>\s*/, '') : trimmed

        // First pass: segment scripture citations (including `@` mentions like `@bg 4.8`)
        const citationSegments = segmentCitations(cleanPara)

        const renderedSegments: ReactNode[] = citationSegments.map((seg, sIdx) => {
          if (seg.kind === 'citation' && seg.citation) {
            return (
              <CitationLink key={sIdx} citation={seg.citation}>
                {seg.text}
              </CitationLink>
            )
          }
          return <SubTextSegment key={sIdx} text={seg.text} />
        })

        if (isQuote) {
          return (
            <blockquote
              key={pIdx}
              className="border-l-2 border-amber-500/60 pl-3 py-0.5 italic text-neutral-300 my-1 bg-amber-500/5 rounded-r"
            >
              {renderedSegments}
            </blockquote>
          )
        }

        return (
          <p key={pIdx} className="leading-relaxed whitespace-pre-wrap">
            {renderedSegments}
          </p>
        )
      })}
    </div>
  )
}
