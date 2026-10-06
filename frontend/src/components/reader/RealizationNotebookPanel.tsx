import { useEffect, useState } from 'react'
import { Eye, Edit3, AtSign, BookOpen, X } from 'lucide-react'
import { NoteContentRenderer } from '../study/NoteContentRenderer'
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
  const [showPreview, setShowPreview] = useState(false)
  const [showRefDialog, setShowRefDialog] = useState(false)
  const [refInput, setRefInput] = useState('')

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

  const handleInsertRef = () => {
    const val = refInput.trim()
    if (!val) return
    const formatted = val.startsWith('@') ? val : `@${val}`
    setContent((c) => (c && !c.endsWith(' ') && !c.endsWith('\n') ? `${c} ${formatted} ` : `${c}${formatted} `))
    setRefInput('')
    setShowRefDialog(false)
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
    <div className="flex flex-col h-full bg-[#131418]">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0">
        <span className="flex-1 text-sm font-semibold text-amber-400 truncate">{activeReference}</span>
        <span className="text-xs text-neutral-500">{saveState === 'saved' ? 'Saved' : ''}</span>
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          title={showPreview ? 'Switch to Edit' : 'Preview Note'}
          className={`p-1.5 rounded-md ${showPreview ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}
        >
          {showPreview ? <Edit3 size={15} /> : <Eye size={15} />}
        </button>
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
        <div className="flex flex-col h-full p-3 gap-3 min-h-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Realization Title (e.g. Surrender to Krishna)"
            className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => appendTag(tag)}
                  className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-amber-400/90 hover:bg-neutral-700"
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRefDialog((v) => !v)}
                className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-medium flex items-center gap-1 border border-neutral-700/60"
                title="Insert scripture reference link (@bg 4.8)"
              >
                <AtSign size={12} /> Ref
              </button>

              {showRefDialog && (
                <div className="absolute right-0 top-full mt-1.5 z-30 w-64 bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 shadow-xl flex flex-col gap-2">
                  <div className="text-xs font-semibold text-neutral-300">Insert Scripture Reference</div>
                  <input
                    type="text"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInsertRef()
                      if (e.key === 'Escape') setShowRefDialog(false)
                    }}
                    placeholder="e.g. bg 4.8, SB 1.1.1"
                    autoFocus
                    className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowRefDialog(false)}
                      className="px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertRef}
                      className="px-2.5 py-0.5 text-xs font-medium rounded bg-amber-500 text-neutral-950 hover:bg-amber-400"
                    >
                      Insert
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showPreview ? (
            <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-900/60 border border-neutral-800 rounded-md p-3">
              <NoteContentRenderer content={content} />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write personal reflections, realizations, #tags, [[WikiLinks]], and @bg 4.8 references side-by-side with scripture…"
              className="flex-1 min-h-0 resize-none bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
          )}

          <div className="flex justify-between items-center gap-2 pt-1 border-t border-neutral-800/80">
            <span className="text-[11px] text-neutral-500">
              Type <code className="text-amber-400/80">@bg 4.8</code> for live scripture hover preview
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs px-3 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-800"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-medium"
              >
                Save Realization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
