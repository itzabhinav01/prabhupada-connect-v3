import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bold, Italic, List, ListOrdered, Quote, X } from 'lucide-react'

import { useStudyStore } from '../../stores/useStudyStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import type { NotesDrawerTarget } from '../../stores/useUIStore'
import { deriveNavigationTarget } from '../../utils/recordKey'

type SaveState = 'idle' | 'saving' | 'saved'

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void
  active: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active ? 'bg-amber-500/20 text-amber-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}

export function NotesDrawer({ target, onClose }: { target: NotesDrawerTarget; onClose: () => void }) {
  const allNotes = useStudyStore((s) => s.allNotes)
  const createNote = useStudyStore((s) => s.createNote)
  const updateNote = useStudyStore((s) => s.updateNote)
  const navigateToCitation = useNavigationStore((s) => s.navigateToCitation)

  // The note being edited, once it exists — `null` until the first autosave
  // for a brand-new ('create' mode) note. Its own `verseId` (not the
  // `target`'s) is what's trusted from here on, since a 'create' note and
  // its freshly-assigned id are the same thing from the very first save.
  const [noteId, setNoteId] = useState<number | null>(target.mode === 'edit' ? target.noteId : null)
  const existingNote = noteId != null ? allNotes.find((n) => n.id === noteId) ?? null : null
  const verseId = target.mode === 'create' ? target.verseId : existingNote?.verseId ?? null

  const knownRecord = useNavigationStore((s) => (verseId ? s.chapterRecords.find((r) => r.recordKey === verseId) : undefined))
  const citationLabel = verseId ? knownRecord?.reference ?? verseId : 'Standalone Note'

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const saveTimer = useRef<number | null>(null)
  const titleRef = useRef('')
  titleRef.current = title
  // `noteId` starts possibly-null (a 'create' target) and is assigned by
  // the first autosave — later autosaves in the same session must update
  // that same row, not create a second one, so a ref (not state, which
  // wouldn't be visible to an in-flight closure from before the id existed)
  // tracks the authoritative current value.
  const noteIdRef = useRef<number | null>(noteId)
  noteIdRef.current = noteId

  const persist = (contentJson: string, contentText: string, titleValue: string | null) => {
    const save =
      noteIdRef.current != null
        ? updateNote(noteIdRef.current, contentJson, contentText, titleValue)
        : createNote(target.mode === 'create' ? target.verseId : null, contentJson, contentText, titleValue).then((note) => {
            setNoteId(note.id)
            return note
          })
    void save.then(() => setSaveState('saved'))
  }

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    onUpdate: ({ editor }) => {
      setSaveState('saving')
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        persist(JSON.stringify(editor.getJSON()), editor.getText(), titleRef.current || null)
      }, 500)
    },
  })

  const handleTitleChange = (value: string) => {
    setTitle(value)
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (!editor) return
      persist(JSON.stringify(editor.getJSON()), editor.getText(), value || null)
    }, 500)
  }

  useEffect(() => {
    if (!editor) return
    setLoaded(false)
    setTitle(existingNote?.title ?? '')
    if (existingNote) {
      try {
        editor.commands.setContent(JSON.parse(existingNote.contentJson))
      } catch {
        editor.commands.setContent(existingNote.contentText)
      }
    } else {
      editor.commands.setContent('')
    }
    setSaveState('idle')
    setLoaded(true)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const handleJump = () => {
    if (!verseId) return
    const navTarget = deriveNavigationTarget(verseId)
    if (navTarget) void navigateToCitation(navTarget.bookKey, navTarget.chapterKey, verseId)
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-neutral-950 border-l border-neutral-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            {verseId ? (
              <button
                type="button"
                onClick={handleJump}
                className="text-sm font-semibold text-amber-400 hover:text-amber-300"
              >
                {citationLabel}
              </button>
            ) : (
              <span className="text-sm font-semibold text-neutral-400">{citationLabel}</span>
            )}
            <span className="text-xs text-neutral-600">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Realization Title (e.g. Surrender to Krishna)"
            className="w-full bg-transparent text-lg font-semibold text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
          />
        </div>

        {editor && (
          <div className="flex items-center gap-0.5 px-3 py-2 border-b border-neutral-800">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              title="Bold (Ctrl+B)"
            >
              <Bold size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              title="Italic (Ctrl+I)"
            >
              <Italic size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')}
              title="Bullet list"
            >
              <List size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')}
              title="Numbered list"
            >
              <ListOrdered size={15} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive('blockquote')}
              title="Scripture quote"
            >
              <Quote size={15} />
            </ToolbarButton>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
          {!loaded ? (
            <p className="text-sm text-neutral-600">Loading…</p>
          ) : (
            <EditorContent
              editor={editor}
              className="notes-editor text-neutral-200 text-sm leading-relaxed [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
