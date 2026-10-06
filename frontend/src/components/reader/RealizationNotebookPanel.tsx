import { useEffect, useState } from 'react'
import { BookOpen, X } from 'lucide-react'

import { useStudyStore } from '../../stores/useStudyStore'

const QUICK_TAGS = ['#surrender', '#guru-tattva', '#bhakti', '#sadhana', '#sambandha']

/** v2's Split View "Realization Notebook" mode — a quick-jot alternative to
 * the full `NotesDrawer` for the verse currently active in the main reader.
 * A verse can now hold several notes (no more one-note-per-verse row), but
 * this panel deliberately keeps its original one-slot UX as a fast-jot tool
 * — it edits the first active note on the verse (creating one if there is
 * none), rather than growing into a full list picker; `VerseNotesPanel` /
 * `NotesTab` are where every note on a verse is actually browsed. */
export function RealizationNotebookPanel({
  activeRecordKey,
  activeReference,
  onSwitchMode,
  onClose,
}: {
  activeRecordKey: string | null
  activeReference: string
  onSwitchMode: () => void
  onClose: () => void
}) {
  const loadNotesForVerse = useStudyStore((s) => s.loadNotesForVerse)
  const createNote = useStudyStore((s) => s.createNote)
  const updateNote = useStudyStore((s) => s.updateNote)

  const [noteId, setNoteId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    if (!activeRecordKey) return
    let cancelled = false
    void loadNotesForVerse(activeRecordKey).then((notes) => {
      if (cancelled) return
      const note = notes[0] ?? null
      setNoteId(note?.id ?? null)
      setTitle(note?.title ?? '')
      setContent(note?.contentText ?? '')
      setSaveState('idle')
    })
    return () => {
      cancelled = true
    }
  }, [activeRecordKey, loadNotesForVerse])

  const appendTag = (tag: string) => {
    setContent((c) => (c && !c.endsWith(' ') && !c.endsWith('\n') ? `${c} ${tag} ` : `${c}${tag} `))
  }

  const handleSave = () => {
    if (!activeRecordKey) return
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: content ? [{ type: 'text', text: content }] : [] }],
    })
    const save =
      noteId != null
        ? updateNote(noteId, contentJson, content, title || null)
        : createNote(activeRecordKey, contentJson, content, title || null).then((note) => setNoteId(note.id))
    void save.then(() => setSaveState('saved'))
  }

  const handleClear = () => {
    setTitle('')
    setContent('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0">
        <span className="flex-1 text-sm font-semibold text-amber-500/80 truncate">{activeReference}</span>
        <span className="text-xs text-neutral-600">{saveState === 'saved' ? 'Saved' : ''}</span>
        <button
          type="button"
          onClick={onSwitchMode}
          title="Switch to Parallel Scripture"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <BookOpen size={15} />
        </button>
        <button type="button" onClick={onClose} title="Close split view" className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          <X size={15} />
        </button>
      </div>

      {!activeRecordKey ? (
        <p className="text-sm text-neutral-600 p-4">Select a verse in the reader to attach a realization to it.</p>
      ) : (
        <div className="flex flex-col h-full p-4 gap-3 min-h-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Realization Title (e.g. Surrender to Krishna)"
            className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => appendTag(tag)}
                className="text-xs px-2 py-1 rounded bg-neutral-800 text-amber-400 hover:bg-neutral-700"
              >
                {tag}
              </button>
            ))}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write personal reflections, realizations, #tags, and [[WikiLinks]] side-by-side with scripture…"
            className="flex-1 min-h-0 resize-none bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs px-3 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
            >
              Save Realization
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
