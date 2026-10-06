// Imports a v2 (`VedaBaseModern2`) personal-data backup — either its
// `.vdbbackup` ZIP container or a plain `.json` export — into this app's
// local database. Deliberately reuses the exact same per-entity functions
// `supabaseSync.ts`'s `pullAll()` uses (verse lookup, offset realignment,
// color resolution, bookmark/note/highlight upserts): a v2 backup row and a
// v2-origin Supabase row carry the same shape and the same quirks (colors,
// hardcoded highlight offsets), so there's one place that knows how to make
// sense of them, not two.

import { invoke } from '@tauri-apps/api/core'

import {
  addBookmark,
  createNote,
  getVerseRecord,
  insertHistoryIfAbsent,
  setBookmarkRemoteId,
  upsertSyncedHighlight,
} from './api'
import { alignRemoteHighlightOffsets, v2ColorSlotToHex } from './supabaseSync'
import { useNavigationStore } from '../stores/useNavigationStore'

// v2's local JSON export uses its C# model classes' raw PascalCase property
// names (no naming policy registered — see `read_v2_backup_file`'s Rust
// doc comment), so these interfaces intentionally mirror
// `UserDataModels.cs` field-for-field rather than this app's own camelCase
// conventions.
interface V2Collection {
  Id: string
  Name: string
  SortOrder: number
  DeletedUtc: string | null
}
interface V2Bookmark {
  Id: string
  RecordKey: string
  CollectionId: string | null
  Title: string | null
  CreatedUtc: string
  DeletedUtc: string | null
}
interface V2Highlight {
  Id: string
  RecordKey: string
  Field: string | null
  Color: number
  StartOffset: number
  Length: number
  SelectedText: string | null
  CreatedUtc: string
  UpdatedUtc: string
  DeletedUtc: string | null
}
interface V2Note {
  Id: string
  RecordKey: string | null
  Title: string | null
  Content: string
  CreatedUtc: string
  UpdatedUtc: string
  DeletedUtc: string | null
}
interface V2HistoryEntry {
  RecordKey: string
  LastOpenedUtc: string
}
interface V2BackupPayload {
  Bookmarks?: V2Bookmark[]
  Collections?: V2Collection[]
  Highlights?: V2Highlight[]
  Notes?: V2Note[]
  ReadingHistory?: V2HistoryEntry[]
}

export interface V2ImportResult {
  importedBookmarks: number
  importedHighlights: number
  importedNotes: number
  importedHistory: number
  skippedGeneralNotes: number
  errors: string[]
}

async function resolveBookAndVerse(recordKey: string): Promise<{ bookTitle: string; verseRef: string }> {
  const verse = await getVerseRecord(recordKey)
  const book = useNavigationStore.getState().books.find((b) => b.bookKey === verse?.bookKey)
  return {
    bookTitle: book?.title ?? verse?.bookKey ?? recordKey,
    verseRef: verse?.reference ?? recordKey,
  }
}

/** Reads and parses a v2 backup file (ZIP `.vdbbackup` or plain `.json`) —
 * the file-system read happens in Rust (`read_v2_backup_file`); this only
 * casts the result. Throws if the path doesn't exist or isn't a
 * recognizable v2 backup — callers should surface that message as-is. */
export async function readV2BackupFile(path: string): Promise<V2BackupPayload> {
  return invoke<V2BackupPayload>('read_v2_backup_file', { path })
}

/** Imports every *active* (non-tombstoned) row from a parsed v2 backup into
 * the local database. Tombstones aren't imported — this is a one-time
 * "bring my data over" restore, not an ongoing sync, so there's no later
 * pull that needs to see a deletion propagate. A v2 "general research note"
 * (`RecordKey: null`, no verse association) has nowhere to go in v3's
 * schema (`notes.verse_id` is `NOT NULL`) and is skipped, counted
 * separately rather than silently dropped. */
export async function importV2Backup(payload: V2BackupPayload): Promise<V2ImportResult> {
  const result: V2ImportResult = {
    importedBookmarks: 0,
    importedHighlights: 0,
    importedNotes: 0,
    importedHistory: 0,
    skippedGeneralNotes: 0,
    errors: [],
  }

  const collectionNameById = new Map<string, string>(
    (payload.Collections ?? []).filter((c) => !c.DeletedUtc).map((c) => [c.Id, c.Name]),
  )

  for (const b of (payload.Bookmarks ?? []).filter((b) => !b.DeletedUtc)) {
    try {
      const { bookTitle, verseRef } = await resolveBookAndVerse(b.RecordKey)
      const tag = (b.CollectionId ? collectionNameById.get(b.CollectionId) : null) ?? b.Title ?? null
      await addBookmark({ verseId: b.RecordKey, bookTitle, verseRef, tag })
      await setBookmarkRemoteId(b.RecordKey, b.Id)
      result.importedBookmarks++
    } catch (e) {
      result.errors.push(`bookmark ${b.RecordKey}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const h of (payload.Highlights ?? []).filter((h) => !h.DeletedUtc)) {
    try {
      const selectedText = h.SelectedText ?? ''
      const record = await getVerseRecord(h.RecordKey)
      const { start, end } = record
        ? alignRemoteHighlightOffsets(record, h.Field, h.StartOffset, h.Length, selectedText)
        : { start: h.StartOffset, end: h.StartOffset + h.Length }
      await upsertSyncedHighlight({
        verseId: h.RecordKey,
        color: v2ColorSlotToHex(h.Color),
        textRangeStart: start,
        textRangeEnd: end,
        selectedText,
        field: h.Field,
        createdAt: h.CreatedUtc,
        updatedAt: h.UpdatedUtc,
      })
      result.importedHighlights++
    } catch (e) {
      result.errors.push(`highlight ${h.RecordKey}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const n of (payload.Notes ?? []).filter((n) => !n.DeletedUtc)) {
    try {
      await createNote({
        verseId: n.RecordKey ?? null,
        title: n.Title ?? null,
        contentText: n.Content,
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: n.Content ? [{ type: 'text', text: n.Content }] : [] }],
        }),
      })
      result.importedNotes++
    } catch (e) {
      result.errors.push(`note ${n.RecordKey ?? 'standalone'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const entry of payload.ReadingHistory ?? []) {
    try {
      const { bookTitle, verseRef } = await resolveBookAndVerse(entry.RecordKey)
      await insertHistoryIfAbsent({
        verseId: entry.RecordKey,
        bookTitle,
        verseRef,
        timestamp: entry.LastOpenedUtc,
      })
      result.importedHistory++
    } catch (e) {
      result.errors.push(`history ${entry.RecordKey}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}
