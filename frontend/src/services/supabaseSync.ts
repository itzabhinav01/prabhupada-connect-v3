// Milestone 4.7: Supabase Cloud Sync. This is a real, working client against
// the schema in `database/supabase_schema_v3.sql` (which itself extends
// VedaBaseModern2's own `supabase_schema.sql` with one additive table) — but
// it needs a project the USER creates and connects; Claude cannot create a
// Supabase account or project on anyone's behalf. Until a project URL + anon
// key are saved (Settings → Cloud Sync), every function here is a no-op that
// resolves to a clear "not connected" result rather than throwing.

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

import {
  addBookmark,
  applyBookmarkTombstone,
  applyHighlightTombstone,
  applyNoteTombstone,
  getAllHighlightsForSync,
  getAllNotesForSync,
  getBookmarksForSync,
  getHistory,
  getSetting,
  getVerseRecord,
  insertHistoryIfAbsent,
  saveSetting,
  setBookmarkRemoteCollectionId,
  setBookmarkRemoteId,
  setHighlightRemoteId,
  setNoteRemoteId,
  upsertSyncedHighlight,
  upsertSyncedNote,
} from './api'
import { buildHighlightSegments } from '../components/study/highlightable'
import { useHighlightPaletteStore } from '../stores/useHighlightPaletteStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useStudyStore } from '../stores/useStudyStore'
import { normalizeSupabaseUrl, useSyncSettingsStore } from '../stores/useSyncSettingsStore'
import type { Bookmark, Highlight, HistoryEntry, Note } from '../types/study'
import type { VerseRecord } from '../types/scripture'

export interface SupabaseCredentials {
  url: string
  anonKey: string
}

let client: SupabaseClient | null = null
let clientCredentials: SupabaseCredentials | null = null

function getClient(creds: SupabaseCredentials): SupabaseClient {
  const cleanUrl = normalizeSupabaseUrl(creds.url)
  const cleanKey = creds.anonKey.trim()
  if (client && clientCredentials?.url === cleanUrl && clientCredentials?.anonKey === cleanKey) {
    return client
  }
  client = createClient(cleanUrl, cleanKey)
  clientCredentials = { url: cleanUrl, anonKey: cleanKey }
  return client
}

export async function getDeviceId(): Promise<string> {
  const existing = await getSetting('deviceId')
  if (existing) return JSON.parse(existing)
  const id = crypto.randomUUID()
  await saveSetting('deviceId', JSON.stringify(id))
  return id
}

// --- Auth --------------------------------------------------------------------

export async function signUp(creds: SupabaseCredentials, email: string, password: string) {
  const { data, error } = await getClient(creds).auth.signUp({ email, password })
  if (error) throw error
  return { user: data.user, session: data.session }
}

export async function signIn(creds: SupabaseCredentials, email: string, password: string) {
  const { data, error } = await getClient(creds).auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signInWithMagicLink(creds: SupabaseCredentials, email: string) {
  const { error } = await getClient(creds).auth.signInWithOtp({ email })
  if (error) throw error
}

export async function sendPasswordResetEmail(creds: SupabaseCredentials, email: string) {
  const { data, error } = await getClient(creds).auth.resetPasswordForEmail(email.trim())
  if (error) throw error
  return data
}

export async function resetPasswordWithOtp(
  creds: SupabaseCredentials,
  email: string,
  otpToken: string,
  newPassword: string,
) {
  let raw = otpToken.trim()
  const client = getClient(creds)

  // 1. If user pasted the redirect URL from their browser (http://localhost:3000/#access_token=...)
  if (raw.includes('access_token=')) {
    const accessMatch = /[#&?]access_token=([^&]+)/.exec(raw)
    const refreshMatch = /[#&?]refresh_token=([^&]+)/.exec(raw)
    if (accessMatch) {
      const accessToken = decodeURIComponent(accessMatch[1])
      const refreshToken = refreshMatch ? decodeURIComponent(refreshMatch[1]) : ''
      const { error: sessionErr } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (sessionErr) throw sessionErr
      const { data: updateData, error: updateErr } = await client.auth.updateUser({
        password: newPassword,
      })
      if (updateErr) throw updateErr
      return updateData.user
    }
  }

  // 2. If user pasted the full verification link from email (https://.../auth/v1/verify?token=...)
  if (raw.includes('token=')) {
    const m = /[?&]token=([^&]+)/.exec(raw) || /token=([^&]+)/.exec(raw)
    if (m) raw = decodeURIComponent(m[1])
  }

  // 3. Verify OTP using either token_hash (long hex string from link) or 6-digit numeric OTP
  if (raw.length > 20) {
    const { error: verifyErr } = await client.auth.verifyOtp({
      token_hash: raw,
      type: 'recovery',
    })
    if (verifyErr) {
      // Fallback try with email + token
      const { error: fallbackErr } = await client.auth.verifyOtp({
        email: email.trim(),
        token: raw,
        type: 'recovery',
      })
      if (fallbackErr) throw verifyErr
    }
  } else {
    const { error: verifyErr } = await client.auth.verifyOtp({
      email: email.trim(),
      token: raw,
      type: 'recovery',
    })
    if (verifyErr) throw verifyErr
  }

  const { data: updateData, error: updateErr } = await client.auth.updateUser({
    password: newPassword,
  })
  if (updateErr) throw updateErr
  return updateData.user
}

export async function updatePassword(creds: SupabaseCredentials, newPassword: string) {
  const { data, error } = await getClient(creds).auth.updateUser({
    password: newPassword,
  })
  if (error) throw error
  return data.user
}

export async function signOut(creds: SupabaseCredentials) {
  const { error } = await getClient(creds).auth.signOut()
  if (error) throw error
}

export async function getCurrentUser(creds: SupabaseCredentials): Promise<User | null> {
  const { data } = await getClient(creds).auth.getUser()
  return data.user
}

// --- Sync ----------------------------------------------------------------------

export interface SyncResult {
  pushedHighlights: number
  pushedNotes: number
  pushedBookmarks: number
  pushedHistory: number
  errors: string[]
}

/** `pullAll`'s own result shape — previously it reused `SyncResult` with its
 * push-side field names (`pushedHighlights` etc.) to count rows it had just
 * *pulled*, which read backwards at every call site. */
export interface PullResult {
  pulledHighlights: number
  pulledNotes: number
  pulledBookmarks: number
  pulledHistory: number
  errors: string[]
}

/** A highlight's local id isn't stable across devices, so before this fix
 * its remote row used a deterministic composite key derived from the
 * highlight's own data (verse + range + color) instead of a real assigned
 * id — editing the highlighted range or color changed the key, so it
 * pushed as a brand-new row rather than updating the old one, and every
 * device independently re-derived the same formula instead of sharing one
 * real identity. Still used here as a *migration* key: a highlight pushed
 * under the old scheme, before `remote_id` existed, is found by this and
 * adopted rather than forked into a duplicate. */
function legacyHighlightId(h: Highlight): string {
  return `${h.verseId}:${h.textRangeStart}:${h.textRangeEnd}:${h.color}`
}
function historyRemoteId(h: HistoryEntry): string {
  return `${h.verseId}:${h.timestamp}`
}

/** Finds the real Supabase id a local row (highlight/note) must have
 * already been pushed under before `remote_id` existed (`legacyId` — a
 * note's old scheme was simply its `verseId`), so this device adopts that
 * existing row instead of forking a duplicate alongside it. Mints a fresh
 * random id only when nothing matches, i.e. this row has truly never
 * synced before. */
async function resolveLegacyOrFreshId(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  legacyId: string,
): Promise<string> {
  const { data } = await supabase.from(table).select('id').eq('user_id', userId).eq('id', legacyId).maybeSingle()
  return data ? legacyId : crypto.randomUUID()
}

/** Finds (or, failing that, mints) the one stable Supabase id a named
 * bookmark collection should push under. v3 has no local collections table
 * (`tag` doubles as the collection name — see `rename_bookmark_collection`
 * in user_store.rs), so there's nothing to look up locally beyond what's
 * already been recorded on this tag's bookmarks (`known`, checked by the
 * caller first). Reusing an existing remote collection found *by name* —
 * rather than deriving an id from the name, as this used to do — is what
 * stops this device from creating a second "Daily Reading" collection
 * alongside the one a pre-existing v2 install already owns. */
async function resolveCollectionRemoteId(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data } = await supabase
    .from('vb_bookmark_collections')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle()
  return data ? data.id : crypto.randomUUID()
}

/** v2's local palette is a fixed, position-based `HighlightColor` enum
 * (`Colour1`..`Colour16`, with `Yellow`/`Green`/`Blue` as legacy aliases for
 * slots 1-3 — see `UserDataModels.cs`); v3's palette is a user-editable list
 * of arbitrary hex values (`useHighlightPaletteStore`), so there's no fixed
 * hex↔name table that could work both ways. The compatible bridge is
 * position: push the highlight color's 1-based index in the CURRENT local
 * palette as `"Colour{N}"`, and on pull, resolve `"Colour{N}"` (or a legacy
 * name) back through that same index. A highlight whose color isn't in the
 * current palette (edited/removed since it was made) falls back to slot 1
 * rather than dropping the highlight. */
function hexToV2ColorSlot(hex: string): string {
  const palette = useHighlightPaletteStore.getState().palette
  const idx = palette.findIndex((c) => c.hex.toLowerCase() === hex.toLowerCase())
  return `Colour${idx >= 0 ? idx + 1 : 1}`
}

/** Inverse of `hexToV2ColorSlot` — also accepts v2's legacy Yellow/Green/Blue
 * aliases and a bare "1"/"2"/"3", matching `HighlightColorHelper.Parse` on
 * the v2 side. A slot beyond the local palette's length (e.g. a v2 device
 * with more custom colors than this one) falls back to the first color. */
function v2ColorToHex(name: string): string {
  const palette = useHighlightPaletteStore.getState().palette
  const fallback = palette[0]?.hex ?? '#fef08a'
  const trimmed = name.trim().toLowerCase()
  const legacy: Record<string, number> = { yellow: 1, green: 2, blue: 3 }
  let slot = legacy[trimmed]
  if (!slot) {
    const m = /(?:colour|color)?\s*(\d+)/i.exec(trimmed)
    slot = m ? parseInt(m[1], 10) : 1
  }
  return palette[slot - 1]?.hex ?? fallback
}

/** v2 never computes a real in-field character offset when a highlight is
 * made — `ReadingPage.xaml.cs`'s `HandleAddHighlightMessage` always calls
 * `AddHighlightAsync(recordKey, field, 0, text.Length, text, color)`, i.e.
 * `start_offset` is hardcoded to 0 and `length` is just the selected text's
 * length, regardless of where in the field that text actually sits. So a
 * v2-origin highlight pulled with its `start_offset`/`length` trusted as-is
 * would always land at the very start of whatever segment `field` maps to —
 * wrong for anything past the first few characters. The reliable anchor is
 * `selected_text` itself: search for it in the matching segment (falling
 * back to any segment) and use where it's actually found. A highlight made
 * in v3 (which DOES track a real global offset) still round-trips correctly
 * through this same path, since `selected_text` still occurs exactly at its
 * true position. */
export function alignRemoteHighlightOffsets(
  record: VerseRecord,
  field: string | null,
  startOffset: number,
  length: number,
  selectedText: string,
): { start: number; end: number } {
  if (!selectedText) return { start: startOffset, end: startOffset + length }

  const segments = buildHighlightSegments(record)
  const fieldLower = field?.toLowerCase() ?? null
  const targetSegments = fieldLower ? segments.filter((s) => s.key.toLowerCase().startsWith(fieldLower)) : []
  for (const seg of targetSegments.length > 0 ? targetSegments : segments) {
    const idx = seg.text.indexOf(selectedText)
    if (idx !== -1) {
      return { start: seg.start + idx, end: seg.start + idx + selectedText.length }
    }
  }

  // selectedText isn't found verbatim anywhere (e.g. corpus text edited
  // since the highlight was made) — keep the raw values rather than drop
  // the highlight; it may render slightly off, but stays recoverable.
  return { start: startOffset, end: startOffset + length }
}

/** For `.vdbbackup` import: v2's local JSON export serializes `Color` (a
 * `HighlightColor` enum) as its raw underlying integer — .NET's default
 * `System.Text.Json` behavior, since v2 never registers a
 * `JsonStringEnumConverter` (confirmed in `ResearchDataBackupService.cs`'s
 * `JsonOptions`) — unlike the Supabase sync path, which explicitly calls
 * `.ToString()` before pushing. `Yellow=0`/`Colour1=0`, `Green=1`/
 * `Colour2=1`, `Blue=2`/`Colour3=2`, `Colour4=3`... so this is 0-indexed,
 * not the 1-indexed `"Colour{N}"` string `v2ColorToHex` parses. */
export function v2ColorSlotToHex(slot: number): string {
  const palette = useHighlightPaletteStore.getState().palette
  return palette[slot]?.hex ?? palette[0]?.hex ?? '#fef08a'
}

/**
 * Loose structural sanity check that `key` looks like a real corpus
 * RecordKey before pushing it to Supabase — not an exhaustive per-book
 * grammar, since the real formats vary more than a strict pattern could
 * cleanly express (verified directly against the corpus, not assumed):
 * `BG-2-20`, `SB-1.1-1` (canto.chapter, dot then dash — not the all-dash
 * form one might guess), `ĀDI-7-5` (Ādi-līlā's verse keys use the
 * diacritic Ā prefix, unlike Madhya/Antya's plain ASCII), `MADHYA-1-1`,
 * `NOD-1`, front matter like `BG-DEDICATION` / `SB-1-PREFACE`, and the
 * `(NONE)`/`#2`-suffixed keys some books' alternate editions use, e.g.
 * `ISO-(NONE)-MANTRA-1`, `NOI-(NONE)-VERSE-1#2`. A key failing this is
 * logged as a warning, not blocked — it's a canary for a future corpus
 * quirk this check doesn't yet know about, not a hard gate.
 */
export function validateRecordKey(key: string): boolean {
  return /^[\p{Lu}][\p{Lu}0-9]*(-[\p{Lu}0-9().#]+)+$/u.test(key)
}

function warnIfInvalidKey(key: string, context: string): void {
  if (!validateRecordKey(key)) {
    console.warn(`[supabaseSync] "${key}" (${context}) doesn't look like a known RecordKey format`)
  }
}

/** Pushes every local row up to Supabase (upsert by the deterministic/
 * natural key each table uses). This is a "last write wins from this
 * device" push, not a full CRDT merge — reasonable for a personal,
 * low-concurrency research dataset. Pulling remote-only rows back down is a
 * v4.1 follow-up; this alone already makes a device's data recoverable
 * after a reinstall, which is the sync feature's core promise. */
export async function pushAll(creds: SupabaseCredentials): Promise<SyncResult> {
  const supabase = getClient(creds)
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return { pushedHighlights: 0, pushedNotes: 0, pushedBookmarks: 0, pushedHistory: 0, errors: ['Not signed in'] }
  }
  const userId = userData.user.id
  const deviceId = await getDeviceId()
  const errors: string[] = []

  const [highlights, notes, bookmarks, history] = await Promise.all([
    getAllHighlightsForSync(),
    getAllNotesForSync(),
    getBookmarksForSync(),
    getHistory(500),
  ])

  for (const h of highlights) warnIfInvalidKey(h.verseId, 'highlight')
  for (const n of notes) if (n.verseId) warnIfInvalidKey(n.verseId, 'note')
  for (const b of bookmarks) warnIfInvalidKey(b.verseId, 'bookmark')
  for (const h of history) warnIfInvalidKey(h.verseId, 'history')

  // A highlight's remote row id must stay the same across every push (and
  // must be adopted, not regenerated, for one pulled from another device —
  // `pullAll` sets `remoteId` there) or each push forks a new Supabase row.
  // A row with no `remoteId` yet first checks for one already sitting under
  // the old pre-`remote_id` composite-key scheme (`legacyHighlightId`)
  // before minting a genuinely fresh id, so a highlight synced before this
  // fix shipped is adopted rather than duplicated.
  for (const h of highlights) {
    if (!h.remoteId) {
      const resolved = await resolveLegacyOrFreshId(supabase, 'vb_highlights', userId, legacyHighlightId(h))
      await setHighlightRemoteId(h.id, resolved)
      h.remoteId = resolved
    }
  }

  const pushedHighlights = await pushTable(
    supabase,
    'vb_highlights',
    highlights.map((h: Highlight) => ({
      id: h.remoteId,
      user_id: userId,
      record_key: h.verseId,
      // Matches v2's convention (lowercase "translation" | "synonyms" |
      // "purport"); falls back to "translation" for highlights made before
      // the `field` column existed locally — Supabase's `vb_highlights.field`
      // is NOT NULL, so pushing a bare `null` here fails the whole upsert.
      field: h.field ?? 'translation',
      color: hexToV2ColorSlot(h.color),
      start_offset: h.textRangeStart,
      length: h.textRangeEnd - h.textRangeStart,
      selected_text: h.selectedText,
      created_at: h.createdAt,
      updated_at: h.updatedAt,
      deleted_at: h.deletedAt,
      device_id: deviceId,
    })),
    errors,
  )

  // Same adopt-legacy-or-mint-fresh dance as highlights above — a note's
  // old scheme was simply its bare `verseId` as the Supabase row id. A
  // standalone note (`verseId: null`) never existed under that old scheme
  // (v3 couldn't create one before this fix), so there's nothing to look
  // up for it — just mint a fresh id directly. Identified by the note's
  // own `id` now, not `verseId`, which no longer uniquely names a note.
  for (const n of notes) {
    if (!n.remoteId) {
      const resolved = n.verseId
        ? await resolveLegacyOrFreshId(supabase, 'vb_notes', userId, n.verseId)
        : crypto.randomUUID()
      await setNoteRemoteId(n.id, resolved)
      n.remoteId = resolved
    }
  }

  const pushedNotes = await pushTable(
    supabase,
    'vb_notes',
    notes.map((n: Note) => ({
      id: n.remoteId,
      user_id: userId,
      record_key: n.verseId,
      title: n.title,
      content: n.contentText,
      field: null,
      start_offset: null,
      length: null,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      deleted_at: n.deletedAt,
      device_id: deviceId,
    })),
    errors,
  )

  // Collections are derived from bookmarks' `tag` values (v3 has no
  // separate collections table — see `resolveCollectionRemoteId`'s doc
  // comment), so push one `vb_bookmark_collections` row per distinct tag
  // before the bookmarks that reference it. A tag already known on at least
  // one local bookmark (pulled from elsewhere, or resolved on an earlier
  // push) reuses that id directly; otherwise it's looked up by name, and
  // only minted fresh if truly new.
  const distinctTags = [...new Set(bookmarks.map((b) => b.tag).filter((t): t is string => !!t))]
  const collectionIdByTag = new Map<string, string>()
  for (const tag of distinctTags) {
    const known = bookmarks.find((b) => b.tag === tag && b.remoteCollectionId)?.remoteCollectionId
    const resolved = known ?? (await resolveCollectionRemoteId(supabase, userId, tag))
    collectionIdByTag.set(tag, resolved)
    if (!known) {
      await setBookmarkRemoteCollectionId(tag, resolved)
      for (const b of bookmarks) {
        if (b.tag === tag) b.remoteCollectionId = resolved
      }
    }
  }
  const nowIso = new Date().toISOString()
  await pushTable(
    supabase,
    'vb_bookmark_collections',
    distinctTags.map((tag, i) => ({
      id: collectionIdByTag.get(tag),
      user_id: userId,
      name: tag,
      sort_order: i,
      created_at: nowIso,
      updated_at: nowIso,
      device_id: deviceId,
    })),
    errors,
  )

  // A bookmark's remote row id must stay the same across every push (and
  // must be adopted, not regenerated, for one pulled from another device —
  // `pullAll` sets `remoteId` there) or each push forks a new Supabase row.
  for (const b of bookmarks) {
    if (!b.remoteId) {
      const generated = crypto.randomUUID()
      await setBookmarkRemoteId(b.verseId, generated)
      b.remoteId = generated
    }
  }

  const pushedBookmarks = await pushTable(
    supabase,
    'vb_bookmarks',
    bookmarks.map((b: Bookmark) => ({
      id: b.remoteId,
      user_id: userId,
      record_key: b.verseId,
      collection_id: b.tag ? (collectionIdByTag.get(b.tag) ?? null) : null,
      title: b.tag,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
      deleted_at: b.deletedAt,
      device_id: deviceId,
    })),
    errors,
  )

  const pushedHistory = await pushTable(
    supabase,
    'vb_reading_history',
    history.map((h: HistoryEntry) => ({
      id: historyRemoteId(h),
      user_id: userId,
      record_key: h.verseId,
      book_title: h.bookTitle,
      verse_ref: h.verseRef,
      timestamp: h.timestamp,
      device_id: deviceId,
    })),
    errors,
  )

  await saveSetting('lastSyncedAt', JSON.stringify(new Date().toISOString()))
  return { pushedHighlights, pushedNotes, pushedBookmarks, pushedHistory, errors }
}

async function pushTable(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  errors: string[],
): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })
  if (error) {
    errors.push(`${table}: ${error.message}`)
    return 0
  }
  return rows.length
}

/** Pulls every row Supabase has for the signed-in user and upserts it into
 * the local database — the other half of sync, so an existing v2/v3 user
 * signing in on a fresh install sees their bookmarks, notes, and
 * highlights immediately. `record_key` is the only identity column the
 * real schema stores for bookmarks/notes (no denormalized book title or
 * verse reference), so those are re-derived locally from the corpus on
 * pull rather than trusted from a remote field that doesn't exist. */
export async function pullAll(creds: SupabaseCredentials): Promise<PullResult> {
  const supabase = getClient(creds)
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return { pulledHighlights: 0, pulledNotes: 0, pulledBookmarks: 0, pulledHistory: 0, errors: ['Not signed in'] }
  }
  const userId = userData.user.id
  const errors: string[] = []

  let pulledHighlights = 0
  let pulledNotes = 0
  let pulledBookmarks = 0
  let pulledHistory = 0

  // A pull before the very first one ever (no watermark) must still fetch
  // everything — the 5-minute lookback on every later pull guards against
  // clock skew between devices (a row saved just before this device's last
  // pull, under a slightly-ahead clock, must not be skipped as "already
  // seen"). Tombstone queries deliberately ignore this watermark — see
  // their comment below.
  const lastPulledAtRaw = await getSetting('lastPulledAt')
  const lastPulledAt = lastPulledAtRaw ? (JSON.parse(lastPulledAtRaw) as string) : null
  const sinceUtc = lastPulledAt ? new Date(new Date(lastPulledAt).getTime() - 5 * 60 * 1000).toISOString() : null

  // Tombstones first: a deletion recorded on another device must retract
  // the row here before anything re-derives state from it below — and
  // before this device's own next push, otherwise it would re-upload the
  // stale local copy with `deleted_at: null` and undo the remote deletion
  // (Root Cause 2 in the sync parity report).
  const { data: deletedHighlights, error: dhErr } = await supabase
    .from('vb_highlights')
    .select('id, deleted_at')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
  if (dhErr) errors.push(`vb_highlights (tombstones): ${dhErr.message}`)
  for (const row of deletedHighlights ?? []) {
    await applyHighlightTombstone(row.id, row.deleted_at as string)
  }

  const { data: deletedNotes, error: dnErr } = await supabase
    .from('vb_notes')
    .select('id, deleted_at')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
  if (dnErr) errors.push(`vb_notes (tombstones): ${dnErr.message}`)
  for (const row of deletedNotes ?? []) {
    await applyNoteTombstone(row.id, row.deleted_at as string)
  }

  const { data: deletedBookmarks, error: dbErr } = await supabase
    .from('vb_bookmarks')
    .select('id, deleted_at')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
  if (dbErr) errors.push(`vb_bookmarks (tombstones): ${dbErr.message}`)
  for (const row of deletedBookmarks ?? []) {
    await applyBookmarkTombstone(row.id, row.deleted_at as string)
  }

  let highlightQuery = supabase
    .from('vb_highlights')
    .select('id, record_key, color, start_offset, length, selected_text, field, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (sinceUtc) highlightQuery = highlightQuery.gt('updated_at', sinceUtc)
  const { data: remoteHighlights, error: hErr } = await highlightQuery
  if (hErr) errors.push(`vb_highlights: ${hErr.message}`)

  // `getVerseRecord` is one IPC round-trip each — with hundreds of
  // highlights, awaiting them one at a time in the loop below serialized
  // the whole pull. Deduplicating keys first (many highlights share a verse)
  // and fetching the rest concurrently cuts both the call count and the
  // wall-clock time, without needing a new Rust command: `getVerseRecord`
  // already branches between the main corpus and an imported book's own
  // storage (see `api.ts`), which a hand-rolled batch SQL query would have
  // silently missed for any imported-book verse.
  const highlightKeys = [...new Set((remoteHighlights ?? []).map((r) => r.record_key))]
  const highlightRecordCache = new Map(
    await Promise.all(highlightKeys.map(async (k) => [k, await getVerseRecord(k)] as const)),
  )

  for (const row of remoteHighlights ?? []) {
    try {
      const selectedText = row.selected_text ?? ''
      const record = highlightRecordCache.get(row.record_key) ?? null
      const { start, end } = record
        ? alignRemoteHighlightOffsets(record, row.field ?? null, row.start_offset, row.length, selectedText)
        : { start: row.start_offset, end: row.start_offset + row.length }
      await upsertSyncedHighlight({
        verseId: row.record_key,
        color: v2ColorToHex(row.color),
        textRangeStart: start,
        textRangeEnd: end,
        selectedText,
        field: row.field ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        remoteId: row.id,
      })
      pulledHighlights++
    } catch (e) {
      errors.push(`highlight ${row.record_key}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Standalone (not verse-anchored) notes, `record_key IS NULL`, are
  // included now that the local schema can actually store one — this used
  // to filter them out entirely (Root Cause 4 in the sync parity report).
  let noteQuery = supabase
    .from('vb_notes')
    .select('id, record_key, title, content, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (sinceUtc) noteQuery = noteQuery.gt('updated_at', sinceUtc)
  const { data: remoteNotes, error: nErr } = await noteQuery
  if (nErr) errors.push(`vb_notes: ${nErr.message}`)
  for (const row of remoteNotes ?? []) {
    try {
      // The remote schema stores plain text only (no rich-text JSON), so a
      // pulled note round-trips as a single plain paragraph locally.
      await upsertSyncedNote({
        verseId: row.record_key,
        title: row.title ?? null,
        contentText: row.content ?? '',
        contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: row.content ? [{ type: 'text', text: row.content }] : [] }] }),
        remoteId: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      pulledNotes++
    } catch (e) {
      errors.push(`note ${row.record_key}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // v2's collections are a separate table (`vb_bookmark_collections`); v3
  // folds a bookmark's collection into its `tag` string (see
  // `resolveCollectionRemoteId`'s doc comment), so pull that table first
  // into an id→name map to resolve each bookmark's `collection_id` below. A
  // collection with no bookmarks referencing it yet has nothing to attach
  // to locally — matching v3's "collections only exist via tags on
  // bookmarks" design — so it isn't persisted on its own.
  const { data: remoteCollections, error: cErr } = await supabase
    .from('vb_bookmark_collections')
    .select('id, name')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (cErr) errors.push(`vb_bookmark_collections: ${cErr.message}`)
  const collectionNameById = new Map<string, string>((remoteCollections ?? []).map((c) => [c.id, c.name]))

  let bookmarkQuery = supabase
    .from('vb_bookmarks')
    .select('id, record_key, title, collection_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (sinceUtc) bookmarkQuery = bookmarkQuery.gt('updated_at', sinceUtc)
  const { data: remoteBookmarks, error: bErr } = await bookmarkQuery
  if (bErr) errors.push(`vb_bookmarks: ${bErr.message}`)

  // Same dedup-and-fetch-concurrently fix as the highlight loop above.
  const bookmarkKeys = [...new Set((remoteBookmarks ?? []).map((r) => r.record_key))]
  const bookmarkRecordCache = new Map(
    await Promise.all(bookmarkKeys.map(async (k) => [k, await getVerseRecord(k)] as const)),
  )

  for (const row of remoteBookmarks ?? []) {
    try {
      const verse = bookmarkRecordCache.get(row.record_key) ?? null
      const book = useNavigationStore.getState().books.find((b) => b.bookKey === verse?.bookKey)
      const tag = (row.collection_id ? collectionNameById.get(row.collection_id) : null) ?? row.title ?? null
      await addBookmark({
        verseId: row.record_key,
        bookTitle: book?.title ?? verse?.bookKey ?? row.record_key,
        verseRef: verse?.reference ?? row.record_key,
        tag,
      })
      await setBookmarkRemoteId(row.record_key, row.id)
      if (row.collection_id && tag) {
        await setBookmarkRemoteCollectionId(tag, row.collection_id)
      }
      pulledBookmarks++
    } catch (e) {
      errors.push(`bookmark ${row.record_key}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const { data: remoteHistory, error: hiErr } = await supabase
    .from('vb_reading_history')
    .select('record_key, book_title, verse_ref, timestamp')
    .eq('user_id', userId)
  if (hiErr) errors.push(`vb_reading_history: ${hiErr.message}`)
  for (const row of remoteHistory ?? []) {
    try {
      await insertHistoryIfAbsent({
        verseId: row.record_key,
        bookTitle: row.book_title,
        verseRef: row.verse_ref,
        timestamp: row.timestamp,
      })
      pulledHistory++
    } catch (e) {
      errors.push(`history ${row.record_key}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await saveSetting('lastPulledAt', JSON.stringify(new Date().toISOString()))
  return { pulledHighlights, pulledNotes, pulledBookmarks, pulledHistory, errors }
}

/** Refreshes the in-memory Zustand study store (`useStudyStore`) after pulling
 * cloud changes so newly synced highlights, notes, bookmarks, and history appear
 * immediately in the active reader and tabs without reloading the app. */
async function refreshLocalStudyStoreAfterSync() {
  const study = useStudyStore.getState()
  const activeHighlightVerses = Object.keys(study.highlightsByVerse)
  const activeNoteVerses = Object.keys(study.notesByVerse)
  await Promise.all([
    study.loadBookmarks(),
    study.loadAllHighlights(),
    study.loadAllNotes(),
    study.loadHistory(),
    ...activeHighlightVerses.map((v) => study.loadHighlightsForVerse(v)),
    ...activeNoteVerses.map((v) => study.loadNotesForVerse(v)),
  ])
}

/** "Sync Now" runs both directions: pull first (so remote-only rows from
 * other devices land locally), then push (so local-only rows and any
 * edits made here reach Supabase) — matching the bidirectional contract. */
export async function syncNow(creds: SupabaseCredentials): Promise<{ pull: PullResult; push: SyncResult }> {
  const pull = await pullAll(creds)
  const push = await pushAll(creds)
  await refreshLocalStudyStoreAfterSync().catch(() => {})
  return { pull, push }
}

let bgSyncTimer: ReturnType<typeof setTimeout> | null = null

/** Triggers a silent background bidirectional sync 2 seconds after any local
 * highlight, note, or bookmark change if the user is signed in. */
export function scheduleBackgroundSync() {
  if (bgSyncTimer) clearTimeout(bgSyncTimer)
  bgSyncTimer = setTimeout(() => {
    bgSyncTimer = null
    const creds = useSyncSettingsStore.getState().credentials()
    if (!creds) return
    void getCurrentUser(creds)
      .then((user) => {
        if (user) return syncNow(creds)
      })
      .catch(() => {})
  }, 2000)
}

/** Lightweight keep-alive ping to prevent Supabase Free Tier from pausing after
 * 7 days of inactivity. Queries `vb_schema_info` (publicly readable via RLS)
 * and records `lastSupabasePingAt`. */
export async function pingSupabaseKeepAlive(creds: SupabaseCredentials): Promise<boolean> {
  try {
    const supabase = getClient(creds)
    const { error } = await supabase.from('vb_schema_info').select('version').limit(1)
    if (!error) {
      await saveSetting('lastSupabasePingAt', JSON.stringify(new Date().toISOString())).catch(() => {})
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function testConnection(creds: SupabaseCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = getClient(creds)
    const { error } = await supabase.from('vb_schema_info').select('version').limit(1)
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Connected — schema found.' }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = raw.includes('Failed to fetch')
      ? `Connection failed: Unable to reach ${creds.url}. Please check your internet connection.`
      : raw
    return { ok: false, message: msg }
  }
}

if (import.meta.env.DEV) {
  // Dev-only escape hatch for direct CDP/devtools verification of the
  // v2 color-slot bridge in isolation.
  ;(
    window as unknown as {
      __sync: { hexToV2ColorSlot: typeof hexToV2ColorSlot; v2ColorToHex: typeof v2ColorToHex }
    }
  ).__sync = { hexToV2ColorSlot, v2ColorToHex }
}

export function buildDiagnostics(creds: SupabaseCredentials | null, lastResult: SyncResult | null): string {
  return JSON.stringify(
    {
      connected: creds !== null,
      projectUrl: creds?.url ?? null,
      lastResult,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )
}
