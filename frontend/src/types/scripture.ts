// Mirrors the serde `camelCase` wire format of the Rust structs in
// `src-tauri/src/db/corpus.rs`. Field names here must stay in lockstep with
// that file — there is no code generation step, so changes on either side
// need a matching edit on the other.

export interface Book {
  bookKey: string
  abbreviation: string
  edition: string | null
  title: string | null
  category: string | null
  corpusId: string | null
  author: string | null
  canonicalOrder: number
  totalRecords: number
  isPdf: boolean
  pdfPath: string | null
}

export type RecordType = 'Verse' | 'Narrative' | 'Chapter' | 'Song' | 'Purport'

export interface VerseRecord {
  recordKey: string
  bookKey: string
  sequence: number
  parentKey: string | null
  recordType: RecordType
  reference: string | null
  referenceStatus: string
  title: string | null
  devanagari: string | null
  transliteration: string | null
  synonyms: string | null
  translation: string | null
  purports: string | null
}

export interface VerseSummary {
  recordKey: string
  sequence: number
  recordType: RecordType
  reference: string | null
  title: string | null
}

/// A chapter/section-level table-of-contents entry. `chapterKey` is the
/// opaque, stable identifier to pass into `getChapterVerses` /
/// `getChapterRecords` — it is either an explicit chapter header's record
/// key, or a synthesized `{bookKey}::{chapterPath}` key for books with no
/// explicit chapter rows. Never parse it; treat it as an opaque token.
export interface TocChapter {
  chapterKey: string
  label: string
  cantoNumber: string | null
  chapterNumber: string | null
  firstRecordKey: string
  lastRecordKey: string
  recordCount: number
  verseStart: string | null
  verseEnd: string | null
}
