/** Shared by `useInPageFind` (counts matches over verse data for "X of Y")
 * and `useHighlightFindMatches` (scans rendered DOM text to highlight) so
 * the "Aa" (match case) / "[ab]" (whole word) toggles behave identically
 * in both places. */

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch)
}

/** True if a match at `[start, start + needleLength)` in `text` is bounded
 * by non-word characters (or the string's edges) on both sides. */
export function isWholeWordMatch(text: string, start: number, needleLength: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[start + needleLength])
}

/** Every occurrence's start index of `needle` in `haystack`, optionally
 * filtered to whole-word matches. Both strings should already be run
 * through the same case-folding step (or not) by the caller. */
export function findAllOccurrences(haystack: string, needle: string, wholeWord: boolean): number[] {
  if (!needle) return []
  const indices: number[] = []
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    if (!wholeWord || isWholeWordMatch(haystack, idx, needle.length)) {
      indices.push(idx)
    }
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return indices
}
