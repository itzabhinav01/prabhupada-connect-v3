// Milestone 3.2: per-lemma golden-accent styling for word-for-word synonyms,
// layered on top of the existing highlight system rather than replacing it.
//
// `highlightable.ts`'s `buildHighlightSegments` treats the synonyms segment
// as one flat string (so highlight character-offsets survive a page
// reload), and `HighlightedText.tsx` renders that flat string by slicing
// around highlight ranges. To style each lemma individually without
// touching that offset contract, this computes a SECOND, independent set of
// [start,end) ranges — one per lemma, one per separator — over the exact
// same flat text `getSynonymsDisplayText` already produces, then
// `renderSynonymsSegment` merges the two range sets (lemma/separator vs.
// highlight) into atomic runs and renders each with the right combination
// of styles.

import type { SynonymPair } from './textUtils'

export interface SynonymRange {
  start: number
  end: number
}

export interface SynonymFlat {
  text: string
  lemmaRanges: SynonymRange[]
  separatorRanges: SynonymRange[]
}

/** Builds the flat synonyms string AND the lemma/separator ranges within it
 * in one pass, so the two can never drift apart. The text this produces is
 * byte-identical to the original `getSynonymsDisplayText` join. */
export function buildSynonymsFlat(pairs: SynonymPair[]): SynonymFlat {
  let text = ''
  const lemmaRanges: SynonymRange[] = []
  const separatorRanges: SynonymRange[] = []

  pairs.forEach((p, i) => {
    const lemmaStart = text.length
    text += p.lemma
    lemmaRanges.push({ start: lemmaStart, end: text.length })

    if (p.gloss) {
      const sepStart = text.length
      text += ' — '
      separatorRanges.push({ start: sepStart, end: text.length })
      text += p.gloss
    }
    if (i < pairs.length - 1) {
      const sepStart = text.length
      text += '; '
      separatorRanges.push({ start: sepStart, end: text.length })
    }
  })

  return { text, lemmaRanges, separatorRanges }
}
