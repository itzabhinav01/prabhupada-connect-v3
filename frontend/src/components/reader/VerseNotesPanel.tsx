import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'
import { Bold, Code, FileDown, Italic, List, ListOrdered, Plus, Quote, Strikethrough, Trash2 } from 'lucide-react'

import { useStudyStore } from '../../stores/useStudyStore'
import type { Note } from '../../types/study'

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
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

/** v2's inline "Personal Realizations & Notes" section, shown below every
 * verse's translation rather than behind a separate drawer click. Writes to
 * the same notes `NotesDrawer`/`NotesTab` use, so this, the drawer, and the
 * Notes tab always agree — none of them owns a separate copy of the data.
 * A verse can now carry more than one note (`notes` has no per-verse
 * uniqueness anymore), so this shows a picker above the editor once there's
 * more than one, rather than assuming a single slot. */
export function VerseNotesPanel({ verseId }: { verseId: string }) {
  const notes = useStudyStore((s) => s.notesByVerse[verseId]) ?? []
  const loadNotesForVerse = useStudyStore((s) => s.loadNotesForVerse)
  const createNote = useStudyStore((s) => s.createNote)
  const updateNote = useStudyStore((s) => s.updateNote)
  const deleteNote = useStudyStore((s) => s.deleteNote)

  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  // TipTap's `editor` object identity is stable across content edits (it
  // mutates internally, matching its own DOM) — React has no reason to
  // re-render this component just because the user typed, so the Save
  // button's `hasContent` check below would otherwise evaluate against
  // whatever `editor.getText()` returned at the LAST render (empty, at
  // mount) forever. `onUpdate` ties a real state change to every edit so
  // the button's enabled state actually tracks what's on screen.
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    setEditing(false)
    setEditingId(null)
    void loadNotesForVerse(verseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseId])

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    onUpdate: ({ editor }) => setHasContent(!!editor.getText().trim()),
  })

  const startEditing = (note: Note | null) => {
    setEditingId(note?.id ?? null)
    setTitle(note?.title ?? '')
    try {
      editor?.commands.setContent(note ? JSON.parse(note.contentJson) : '')
    } catch {
      editor?.commands.setContent(note?.contentText ?? '')
    }
    setHasContent(!!note?.contentText.trim())
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setEditingId(null)
    editor?.commands.clearContent()
    setTitle('')
    setHasContent(false)
  }

  const handleSave = async () => {
    if (!editor) return
    setSaving(true)
    const contentJson = JSON.stringify(editor.getJSON())
    const contentText = editor.getText()
    const trimmedTitle = title.trim() || null
    if (editingId != null) {
      await updateNote(editingId, contentJson, contentText, trimmedTitle)
    } else {
      await createNote(verseId, contentJson, contentText, trimmedTitle)
    }
    setSaving(false)
    setEditing(false)
    setEditingId(null)
  }

  const handleDelete = async (id: number) => {
    await deleteNote(id)
    if (editingId === id) cancelEditing()
  }

  const handleExportDraft = () => {
    if (!editor) return
    const text = `# ${title || 'Realization'}\n\n${editor.getText()}`
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${verseId}-realization-draft.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-8 border-t border-neutral-800 pt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest uppercase text-neutral-500">
            Personal Realizations &amp; Notes
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
            {notes.length}
          </span>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => startEditing(null)}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
          >
            <Plus size={13} /> {notes.length > 0 ? 'Add Another Note' : 'Add Realization'}
          </button>
        )}
      </div>

      {!editing && notes.length === 0 && (
        <p className="text-sm text-neutral-600 italic mb-4">
          No personal realizations added for this verse yet. Click "Add Realization" to record your notes.
        </p>
      )}

      {!editing && notes.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700"
            >
              <button type="button" onClick={() => startEditing(note)} className="flex-1 text-left p-3 min-w-0">
                {note.title && <div className="text-sm font-semibold text-amber-400 mb-1">{note.title}</div>}
                <div className="text-sm text-neutral-300 whitespace-pre-wrap line-clamp-6">{note.contentText}</div>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(note.id)}
                title="Delete note"
                className="p-2 mt-1 mr-1 text-neutral-600 hover:text-red-400 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-amber-500/30 bg-neutral-900 overflow-hidden">
          <div className="px-4 pt-4">
            <div className="text-[10px] font-bold tracking-widest uppercase text-amber-500 mb-3">
              {editingId != null ? 'Edit Realization' : 'New Realization'}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional, e.g. Reflections on surrender)..."
              className="w-full bg-transparent border-b border-neutral-700 pb-2 mb-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {editor && (
            <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-neutral-800 flex-wrap">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
                <Bold size={15} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
                <Italic size={15} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
                <Strikethrough size={15} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
                <Code size={15} />
              </ToolbarButton>
              <div className="w-px h-4 bg-neutral-800 mx-1" />
              <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
                <List size={15} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
                <ListOrdered size={15} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Scripture quote">
                <Quote size={15} />
              </ToolbarButton>
            </div>
          )}

          <div className="px-4 py-3 min-h-[140px]">
            <EditorContent
              editor={editor}
              className="notes-editor text-neutral-200 text-sm leading-relaxed [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:outline-none"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !hasContent}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Realization'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="px-3 py-1.5 rounded-md text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportDraft}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300"
            >
              <FileDown size={13} /> Export Draft (.md)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
