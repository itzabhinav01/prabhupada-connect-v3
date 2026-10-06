import { openPath } from '@tauri-apps/plugin-opener'
import { useEffect, useMemo, useState } from 'react'
import { Download, FileArchive, Plus, Printer, Search, Trash2 } from 'lucide-react'

import { exportNotesHtml, exportNotesMarkdown, exportNotesObsidian } from '../../services/api'
import { resolveDirectReference } from '../../services/directReference'
import { useStudyStore } from '../../stores/useStudyStore'
import { useUIStore } from '../../stores/useUIStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import type { Note } from '../../types/study'
import { useOpenReaderForVerse } from './useOpenReaderForVerse'

const TAG_RE = /#([a-zA-Z0-9_-]+)/g
const NOTE_BODY_TOKEN_RE = /(\[\[[^\]]+\]\]|#[a-zA-Z0-9_-]+)/g

function extractTags(text: string): string[] {
  const tags = new Set<string>()
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1])
  return [...tags]
}

/** Renders `[[BG 18.66]]`-style wikilinks as clickable gold links (resolved
 * through the same direct-reference parser the `@` sidebar search and
 * Parallel Scripture panel use — there's no separate "navigate_to_reference"
 * command) and plain `#hashtag` tokens as gold non-link spans, matching
 * v2's note-body rendering. Used for both the detail pane and list previews. */
function renderNoteBody(content: string, onOpenVerse: (ref: string) => void): React.ReactNode {
  const parts = content.split(NOTE_BODY_TOKEN_RE)
  return parts.map((part, i) => {
    const wikiMatch = part.match(/^\[\[(.+)\]\]$/)
    if (wikiMatch) {
      const ref = wikiMatch[1]
      return (
        <button
          key={i}
          type="button"
          onClick={() => onOpenVerse(ref)}
          className="text-amber-400 hover:text-amber-300 underline underline-offset-2 font-medium"
        >
          {ref}
        </button>
      )
    }
    if (/^#[a-zA-Z0-9_-]+$/.test(part)) {
      return (
        <span key={i} className="text-amber-500/80 font-medium">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function NotesTab() {
  const allNotes = useStudyStore((s) => s.allNotes)
  const loadAllNotes = useStudyStore((s) => s.loadAllNotes)
  const createNote = useStudyStore((s) => s.createNote)
  const deleteNote = useStudyStore((s) => s.deleteNote)
  const openNotesDrawerForNote = useUIStore((s) => s.openNotesDrawerForNote)
  const openReaderForVerse = useOpenReaderForVerse()

  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  useEffect(() => {
    void loadAllNotes()
  }, [loadAllNotes])

  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of allNotes) {
      for (const t of extractTags(n.contentText)) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [allNotes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...allNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return sorted
      .filter((n) => !activeTag || extractTags(n.contentText).includes(activeTag))
      .filter(
        (n) =>
          !q ||
          n.contentText.toLowerCase().includes(q) ||
          (n.verseId ?? '').toLowerCase().includes(q) ||
          (n.title ?? '').toLowerCase().includes(q),
      )
  }, [allNotes, query, activeTag])

  const selected: Note | undefined = filtered.find((n) => n.id === selectedId) ?? filtered[0]

  const handleOpenInReader = (verseId: string) => {
    const target = deriveNavigationTarget(verseId)
    if (target) void openReaderForVerse(target.bookKey, target.chapterKey, verseId)
  }

  const handleOpenWikiLink = (ref: string) => {
    void resolveDirectReference(ref).then((resolved) => {
      if (resolved) handleOpenInReader(resolved.recordKey)
    })
  }

  const handleNewStandaloneNote = async () => {
    const note = await createNote(null, '{"type":"doc","content":[]}', '', 'Untitled Note')
    setSelectedId(note.id)
    openNotesDrawerForNote(note.id)
  }

  const handleExportObsidian = async () => {
    setExportStatus('Exporting…')
    try {
      const path = await exportNotesObsidian()
      setExportStatus(`Exported vault to: ${path}`)
    } catch (e) {
      setExportStatus(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const handleExportMarkdown = async () => {
    setExportStatus('Exporting…')
    try {
      const path = await exportNotesMarkdown()
      setExportStatus(`Exported to: ${path}`)
    } catch (e) {
      setExportStatus(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const handleExportHtml = async () => {
    setExportStatus('Generating…')
    try {
      const path = await exportNotesHtml()
      await openPath(path)
      setExportStatus(`Opened in browser: ${path}`)
    } catch (e) {
      setExportStatus(e instanceof Error ? e.message : 'Export failed')
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-8 pt-8 pb-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-semibold text-neutral-100">Personal Realizations &amp; Notes</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleNewStandaloneNote()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
            >
              <Plus size={13} /> New Note
            </button>
            <button
              type="button"
              onClick={() => void handleExportObsidian()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            >
              <FileArchive size={13} /> Export Obsidian Vault (.zip)
            </button>
            <button
              type="button"
              onClick={() => void handleExportMarkdown()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            >
              <Download size={13} /> Export Markdown
            </button>
            <button
              type="button"
              onClick={() => void handleExportHtml()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            >
              <Printer size={13} /> Print / PDF
            </button>
          </div>
        </div>

        <div className="relative max-w-sm mb-3">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reflections, tags, verses…"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-2 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {tagCloud.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                activeTag === null ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              All
            </button>
            {tagCloud.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                  activeTag === tag ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                #{tag} <span className="text-neutral-600">{count}</span>
              </button>
            ))}
          </div>
        )}
        {exportStatus && <p className="text-xs text-neutral-500 mt-2">{exportStatus}</p>}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-full max-w-[400px] min-w-[320px] border-r border-neutral-800 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 && (
            <p className="text-sm text-neutral-600 px-4 py-6">No notes {query || activeTag ? 'match your filters' : 'yet'}.</p>
          )}
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => setSelectedId(note.id)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900 ${
                selected?.id === note.id ? 'bg-neutral-900' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-neutral-100 truncate">{note.title || note.verseId || 'Untitled Note'}</span>
                {note.verseId && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                    {note.verseId}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 line-clamp-2 mb-1">{note.contentText || '(empty)'}</p>
              {extractTags(note.contentText).length > 0 && (
                <div className="text-[11px] text-amber-500/70 mb-1">
                  {extractTags(note.contentText)
                    .map((t) => `#${t}`)
                    .join(' ')}
                </div>
              )}
              <div className="text-[11px] text-neutral-600">{new Date(note.updatedAt).toLocaleDateString()}</div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-8 py-8">
          {!selected && <p className="text-sm text-neutral-600">Select a note to view it here.</p>}
          {selected && (
            <div className="max-w-2xl">
              <h2 className="text-xl font-semibold text-neutral-100 mb-2">{selected.title || selected.verseId || 'Untitled Note'}</h2>
              {selected.verseId && (
                <button
                  type="button"
                  onClick={() => handleOpenInReader(selected.verseId!)}
                  className="text-xs font-semibold text-amber-500/80 hover:text-amber-400 mb-4"
                >
                  {selected.verseId} — Open in Reading View
                </button>
              )}
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => openNotesDrawerForNote(selected.id)}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteNote(selected.id)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-red-400 hover:bg-neutral-800"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
              <p className="font-serif text-[15px] leading-relaxed text-neutral-200 whitespace-pre-wrap">
                {selected.contentText ? renderNoteBody(selected.contentText, handleOpenWikiLink) : '(empty)'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
