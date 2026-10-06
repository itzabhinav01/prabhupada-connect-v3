import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark } from 'lucide-react'

import { ChantingGuide } from '../chanting/ChantingGuide'
import { analyzeMeter } from '../chanting/meter'
import { ConcordanceDrawer } from '../study/ConcordanceDrawer'
import { HighlightPopover } from '../study/HighlightPopover'
import { renderParagraphWithSpeaker, renderSegmentWithHighlights, renderSynonymsSegment } from '../study/HighlightedText'
import { buildHighlightSegments, getSynonymsFlat, getSynonymsFlatForText, parseSongPayload } from '../study/highlightable'
import { SelectionToolbar } from '../study/SelectionToolbar'
import { classifyPurportParagraph, formatQuotedVerse } from './purportFormatting'
import { VerseNotesPanel } from './VerseNotesPanel'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useReaderStore } from '../../stores/useReaderStore'
import { useStudyStore } from '../../stores/useStudyStore'
import { useUIStore } from '../../stores/useUIStore'
import type { VerseRecord } from '../../types/scripture'
import type { Highlight } from '../../types/study'

export function VerseView({ record }: { record: VerseRecord }) {
  const fontSize = useReaderStore((s) => s.fontSize)
  const showSanskrit = useReaderStore((s) => s.showSanskrit)
  const showSynonyms = useReaderStore((s) => s.showSynonyms)
  const showPurport = useReaderStore((s) => s.showPurport)
  const showTransliteration = useReaderStore((s) => s.showTransliteration)
  const showPronunciationGuide = useReaderStore((s) => s.showPronunciationGuide)
  const [chantingOpen, setChantingOpen] = useState(false)
  const [concordanceLemma, setConcordanceLemma] = useState<string | null>(null)

  const selectedBook = useNavigationStore((s) => s.selectedBook)
  const openNotesDrawerForVerse = useUIStore((s) => s.openNotesDrawerForVerse)
  const activeHighlightId = useUIStore((s) => s.activeHighlightId)
  const flashHighlight = useUIStore((s) => s.flashHighlight)

  const highlightsByVerse = useStudyStore((s) => s.highlightsByVerse)
  const loadHighlightsForVerse = useStudyStore((s) => s.loadHighlightsForVerse)
  const addHighlight = useStudyStore((s) => s.addHighlight)
  const removeHighlight = useStudyStore((s) => s.removeHighlight)
  const isBookmarked = useStudyStore((s) => s.isBookmarked)
  const toggleBookmark = useStudyStore((s) => s.toggleBookmark)

  const highlightRootRef = useRef<HTMLDivElement>(null)
  const [activePopover, setActivePopover] = useState<{ highlight: Highlight; anchor: HTMLElement } | null>(null)

  const highlights = highlightsByVerse[record.recordKey] ?? []
  const song = useMemo(() => parseSongPayload(record.purports), [record.purports])
  const segments = useMemo(() => buildHighlightSegments(record), [record])
  const bookmarked = isBookmarked(record.recordKey)
  const citationLabel = record.reference ? `${selectedBook?.abbreviation ?? record.bookKey} ${record.reference.replace(/^\S+\s*/, '')}` : record.recordKey
  const meterAnalysis = useMemo(
    () => (!song && record.transliteration ? analyzeMeter(record.transliteration) : null),
    [song, record.transliteration],
  )

  useEffect(() => {
    void loadHighlightsForVerse(record.recordKey)
  }, [record.recordKey, loadHighlightsForVerse])

  useEffect(() => {
    if (!activeHighlightId || !highlightRootRef.current) return
    const mark = highlightRootRef.current.querySelector<HTMLElement>(`mark[data-highlight-id="${activeHighlightId}"]`)
    if (!mark) return
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    mark.style.outline = '2px solid rgba(245, 158, 11, 0.95)'
    mark.style.outlineOffset = '2px'
    mark.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.45)'
    const timer = window.setTimeout(() => {
      mark.style.outline = ''
      mark.style.outlineOffset = ''
      mark.style.boxShadow = ''
      flashHighlight(null)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [activeHighlightId, highlights.length, flashHighlight])

  const handleHighlightClick = (highlight: Highlight, anchorEl: HTMLElement) => {
    setActivePopover({ highlight, anchor: anchorEl })
  }

  const handleAddHighlight = (color: string, start: number, end: number, text: string) => {
    // Independent of `SelectionToolbar`'s own offset math — just reads
    // which `data-field` wrapper the live selection anchor sits inside, so
    // this can't disturb the (already-correct) highlight range logic.
    const anchorNode = window.getSelection()?.anchorNode ?? null
    const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
    const field = anchorEl?.closest('[data-field]')?.getAttribute('data-field') ?? null
    void addHighlight(record.recordKey, color, start, end, text, field)
  }

  const handleBookmarkToggle = () => {
    void toggleBookmark(record.recordKey, selectedBook?.title ?? record.bookKey, record.reference ?? record.recordKey)
  }

  return (
    <article data-verse-key={record.recordKey} className="pb-10 border-b border-neutral-800/60 last:border-b-0">
      <header>
        <div className="flex items-center justify-end gap-1.5 mb-2">
          <button
            type="button"
            onClick={handleBookmarkToggle}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this verse'}
            className={`flex items-center p-1.5 rounded-md border ${
              bookmarked
                ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                : 'text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>

        {song ? (
          <div className="text-center mb-6 pb-4 border-b border-neutral-800/60">
            {record.reference && (
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-1">
                {record.reference}
              </div>
            )}
            <h2
              className="text-xl font-bold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {song.bannerTitle || record.title || record.reference}
            </h2>
            {song.subtitle && (
              <p className="text-sm text-neutral-400 italic mt-1 whitespace-pre-line">
                {song.subtitle}
              </p>
            )}
          </div>
        ) : (
          (record.reference || (record.title && record.recordType !== 'Verse')) && (
            <div className="text-center mb-4">
              {record.reference && (
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-500/80">
                  {record.reference}
                </span>
              )}
              {record.title && record.recordType !== 'Verse' && (
                <h2 className="text-lg font-semibold text-neutral-100 mt-1">{record.title}</h2>
              )}
            </div>
          )
        )}
      </header>

      {!song && showSanskrit && record.devanagari && (
        <p
          className="whitespace-pre-line break-words mb-3 leading-[1.9] text-center"
          style={{ color: 'var(--text-primary)', fontSize: `${fontSize}px` }}
          lang="sa"
        >
          {record.devanagari.trim()}
        </p>
      )}

      {!song && showTransliteration && record.transliteration && (
        <>
          <p
            className="whitespace-pre-line break-words mb-1 italic leading-[1.9] text-center"
            style={{ color: 'var(--text-primary)', fontSize: `${fontSize}px` }}
          >
            {formatQuotedVerse(record.transliteration.trim())}
          </p>
          {showPronunciationGuide && meterAnalysis && (
            <div className="flex items-center justify-center gap-2 mt-1 mb-4">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                ♩ {meterAnalysis.meterName}
              </span>
              <span className="text-[11px] text-neutral-600">{meterAnalysis.totalSyllables} syllables</span>
              <button
                type="button"
                onClick={() => setChantingOpen(true)}
                className="text-[11px] text-neutral-500 hover:text-amber-400"
              >
                ▶ Chant Pulse
              </button>
            </div>
          )}
        </>
      )}

      <div ref={highlightRootRef}>
        {song ? (
          <div className="space-y-8">
            {segments
              .filter((s) => s.key === 'song-intro')
              .map((s) => (
                <div
                  key={s.key}
                  data-field="song-intro"
                  className="text-[15px] leading-relaxed text-neutral-300 italic bg-neutral-900/40 border border-neutral-800/70 rounded-lg px-4 py-3 whitespace-pre-line"
                >
                  {renderSegmentWithHighlights(s, highlights, handleHighlightClick)}
                </div>
              ))}

            {(song.stanzas ?? []).map((st, idx) => {
              const linesSeg = segments.find((s) => s.key === `stanza-${idx}-lines`)
              const synSeg = segments.find((s) => s.key === `stanza-${idx}-synonyms`)
              const transSeg = segments.find((s) => s.key === `stanza-${idx}-translation`)
              const rawLabel = st.label?.trim() ?? ''
              const isShortLabel = rawLabel.length > 0 && rawLabel.length <= 25
              const inferredNumberMatch = !isShortLabel && linesSeg ? st.translation?.trim().match(/^(\d+)\)/) : null
              const displayLabel = isShortLabel
                ? /^\d+$/.test(rawLabel)
                  ? `Stanza ${rawLabel}`
                  : `Stanza ${rawLabel}`
                : inferredNumberMatch
                  ? `Stanza ${inferredNumberMatch[1]}`
                  : null

              if (!linesSeg && !synSeg && !transSeg) return null

              return (
                <section
                  key={`stanza-${idx}`}
                  className="pb-6 border-b border-neutral-800/50 last:border-b-0 last:pb-0"
                >
                  {displayLabel && (
                    <div className="text-center mb-2">
                      <span className="inline-block text-[11px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25">
                        {displayLabel}
                      </span>
                    </div>
                  )}

                  {showTransliteration && linesSeg && (
                    <div
                      data-field={`stanza-${idx}-lines`}
                      className="whitespace-pre-line break-words mb-4 italic leading-[1.9] text-center"
                      style={{ color: 'var(--text-primary)', fontSize: `${fontSize}px` }}
                    >
                      {renderSegmentWithHighlights(linesSeg, highlights, handleHighlightClick)}
                    </div>
                  )}

                  {showSynonyms && synSeg && (() => {
                    const flat = getSynonymsFlatForText(synSeg.text)
                    return (
                      <div data-field={`stanza-${idx}-synonyms`} className="mb-4">
                        <div className="scripture-section-header">Word-for-Word</div>
                        <p className="text-[14.5px] leading-relaxed text-neutral-400 break-words">
                          {flat
                            ? renderSynonymsSegment(synSeg, flat, highlights, handleHighlightClick, setConcordanceLemma)
                            : renderSegmentWithHighlights(synSeg, highlights, handleHighlightClick)}
                        </p>
                      </div>
                    )
                  })()}

                  {transSeg && (
                    <div data-field={`stanza-${idx}-translation`}>
                      <blockquote
                        className="border-l-2 border-amber-500/70 pl-4 py-1 text-[16.5px] leading-relaxed font-medium break-words whitespace-pre-line"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {renderSegmentWithHighlights(transSeg, highlights, handleHighlightClick)}
                      </blockquote>
                    </div>
                  )}
                </section>
              )
            })}

            {segments
              .filter((s) => s.key === 'song-notes')
              .map((s) => (
                <div
                  key={s.key}
                  data-field="song-notes"
                  className="pt-3 border-t border-neutral-800/60 text-xs text-neutral-400 italic whitespace-pre-line"
                >
                  {renderSegmentWithHighlights(s, highlights, handleHighlightClick)}
                </div>
              ))}
          </div>
        ) : (
          <>
            {showSynonyms &&
              segments
                .filter((s) => s.key === 'synonyms')
                .map((s) => {
                  const flat = getSynonymsFlat(record)
                  return (
                    <div key={s.key} data-field="synonyms">
                      <div className="scripture-section-header">Synonyms</div>
                      <p className="mb-5 text-[15px] leading-relaxed text-neutral-400 break-words">
                        {flat
                          ? renderSynonymsSegment(s, flat, highlights, handleHighlightClick, setConcordanceLemma)
                          : renderSegmentWithHighlights(s, highlights, handleHighlightClick)}
                      </p>
                    </div>
                  )
                })}

            {segments
              .filter((s) => s.key === 'translation')
              .map((s) => (
                <div key={s.key} data-field="translation">
                  <div className="scripture-section-header">Translation</div>
                  <blockquote
                    className="mb-5 border-l-2 border-amber-500/70 pl-4 py-1 text-[17px] leading-relaxed font-medium break-words"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {renderSegmentWithHighlights(s, highlights, handleHighlightClick)}
                  </blockquote>
                </div>
              ))}

            {showPurport && segments.some((s) => s.key.startsWith('purport-')) && (
              <div data-field="purport">
                {Boolean(
                  record.devanagari ||
                    record.transliteration ||
                    record.synonyms ||
                    segments.some((s) => s.key === 'translation'),
                ) && <div className="scripture-section-header">Purport</div>}
                <div className="text-neutral-300 text-[15px] leading-[var(--reading-line-height)] space-y-4 break-words">
                  {segments
                    .filter((s) => s.key.startsWith('purport-'))
                    .map((s) => {
                      const classification = classifyPurportParagraph(s.text)
                      const rendered = renderSegmentWithHighlights(s, highlights, handleHighlightClick)

                      if (classification.kind === 'verse') {
                        return (
                          <p key={s.key} className="purport-verse">
                            {rendered}
                          </p>
                        )
                      }
                      if (classification.kind === 'subheading') {
                        return (
                          <p key={s.key} className="prose-subheading">
                            {rendered}
                          </p>
                        )
                      }
                      if (classification.kind === 'dialogue') {
                        return (
                          <p key={s.key} className="mb-4 last:mb-0">
                            {renderParagraphWithSpeaker(s, classification.speakerEnd, highlights, handleHighlightClick)}
                          </p>
                        )
                      }
                      return (
                        <p key={s.key} className="mb-4 last:mb-0">
                          {rendered}
                        </p>
                      )
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <VerseNotesPanel verseId={record.recordKey} reference={record.reference} />

      <SelectionToolbar
        containerRef={highlightRootRef}
        citationLabel={citationLabel}
        onHighlight={handleAddHighlight}
        onAddNote={() => openNotesDrawerForVerse(record.recordKey)}
        onLookup={(word) => setConcordanceLemma(word)}
      />

      {activePopover && (
        <HighlightPopover
          highlight={activePopover.highlight}
          anchorEl={activePopover.anchor}
          onClose={() => setActivePopover(null)}
          onDelete={() => {
            void removeHighlight(activePopover.highlight.id, record.recordKey)
            setActivePopover(null)
          }}
          onChangeColor={(color) => {
            const h = activePopover.highlight
            void removeHighlight(h.id, record.recordKey).then(() =>
              addHighlight(record.recordKey, color, h.textRangeStart, h.textRangeEnd, h.selectedText, h.field),
            )
            setActivePopover(null)
          }}
        />
      )}

      {chantingOpen && record.transliteration && (
        <ChantingGuide transliteration={record.transliteration} onClose={() => setChantingOpen(false)} />
      )}

      {concordanceLemma && <ConcordanceDrawer lemma={concordanceLemma} onClose={() => setConcordanceLemma(null)} />}
    </article>
  )
}
