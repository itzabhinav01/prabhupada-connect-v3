import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Code,
  FileDown,
  Italic,
  List,
  ListOrdered,
  Plus,
  Quote,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
  Table as TableIcon,
  Link as LinkIcon,
  AtSign,
  Edit2,
  ChevronDown,
  ChevronUp,
  GitFork,
  ExternalLink,
  X,
} from 'lucide-react'

import * as api from '../../services/api'
import { useStudyStore } from '../../stores/useStudyStore'
import { useTabStore } from '../../stores/useTabStore'
import { useOpenReaderForVerse } from '../tabs/useOpenReaderForVerse'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { NoteContentRenderer } from '../study/NoteContentRenderer'
import type { Note } from '../../types/study'

export function VerseNotesPanel({ verseId, reference }: { verseId: string; reference?: string | null }) {
  const notes = useStudyStore((s) => s.notesByVerse[verseId]) ?? []
  const loadNotesForVerse = useStudyStore((s) => s.loadNotesForVerse)
  const createNote = useStudyStore((s) => s.createNote)
  const updateNote = useStudyStore((s) => s.updateNote)
  const deleteNote = useStudyStore((s) => s.deleteNote)
  const openReaderForVerse = useOpenReaderForVerse()
  const openUtilityTab = useTabStore((s) => s.openUtilityTab)

  const [backlinks, setBacklinks] = useState<api.NoteBacklink[]>([])
  const [backlinksOpen, setBacklinksOpen] = useState(true)
  const [loadingBacklinks, setLoadingBacklinks] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasContent, setHasContent] = useState(false)

  // Popover dialog states
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [tableWithHeader, setTableWithHeader] = useState(true)
  const [hoveredRow, setHoveredRow] = useState(0)
  const [hoveredCol, setHoveredCol] = useState(0)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const [atDialogOpen, setAtDialogOpen] = useState(false)
  const [atRefInput, setAtRefInput] = useState('')

  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditing(false)
    setEditingId(null)
    void loadNotesForVerse(verseId)

    let isMounted = true
    setLoadingBacklinks(true)
    void api
      .getBacklinksForVerse(verseId, reference)
      .then((data) => {
        if (isMounted) {
          setBacklinks(data)
          setLoadingBacklinks(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setBacklinks([])
          setLoadingBacklinks(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [verseId, reference, loadNotesForVerse])

  const openSourceVerse = (sourceVerseId: string) => {
    const target = deriveNavigationTarget(sourceVerseId)
    if (target) {
      void openReaderForVerse(target.bookKey, target.chapterKey, sourceVerseId, { newTab: true })
    }
  }

  const openInNotesTab = () => {
    openUtilityTab('notes', 'Notes')
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-amber-400 underline underline-offset-2 hover:text-amber-300',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
    onUpdate: ({ editor }) => setHasContent(!!editor.getText().trim()),
  })

  const startEditing = (note: Note | null) => {
    setEditingId(note?.id ?? null)
    setTitle(note?.title ?? '')
    if (editor) {
      if (note?.contentJson) {
        try {
          editor.commands.setContent(JSON.parse(note.contentJson))
        } catch {
          editor.commands.setContent(note.contentText ?? '')
        }
      } else {
        editor.commands.setContent(note?.contentText ?? '')
      }
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
    setTableDialogOpen(false)
    setLinkDialogOpen(false)
    setAtDialogOpen(false)
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
    if (window.confirm('Are you sure you want to delete this realization?')) {
      await deleteNote(id)
      if (editingId === id) cancelEditing()
    }
  }

  const handleExportSingleNote = (note: Note) => {
    const text = `# Realization on ${verseId}\n${note.title ? `## ${note.title}\n\n` : ''}*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n${note.contentText}`
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${verseId}-${note.id}-realization.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportDraft = () => {
    if (!editor) return
    const text = `# Realization on ${verseId}\n${title ? `## ${title}\n\n` : ''}*Draft exported on ${new Date().toLocaleDateString()}*\n\n---\n\n${editor.getText()}`
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${verseId}-realization-draft.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const insertCustomTable = (rows: number, cols: number, withHeader: boolean) => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: withHeader }).run()
    setTableDialogOpen(false)
  }

  const openLinkDialog = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    setLinkText(selectedText)
    setLinkUrl('')
    setLinkDialogOpen(true)
    setTableDialogOpen(false)
    setAtDialogOpen(false)
  }

  const insertCustomLink = () => {
    if (!editor || !linkUrl.trim()) return
    const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`
    if (linkText.trim()) {
      editor.chain().focus().insertContent(`<a href="${url}">${linkText.trim()}</a> `).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkDialogOpen(false)
  }

  const insertAtReference = () => {
    if (!editor || !atRefInput.trim()) return
    const clean = atRefInput.trim().replace(/^@/, '')
    editor.chain().focus().insertContent(`@${clean} `).run()
    setAtDialogOpen(false)
    setAtRefInput('')
  }

  return (
    <div className="mt-8 border-t border-neutral-800/80 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest uppercase text-amber-500/90">
            Personal Realizations &amp; Notes
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700/60">
            {notes.length}
          </span>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => startEditing(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Plus size={13} /> {notes.length > 0 ? 'Add Another Note' : 'Add Realization'}
          </button>
        )}
      </div>

      {/* Empty State */}
      {!editing && notes.length === 0 && (
        <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-4 text-center">
          <p className="text-xs text-neutral-500 italic mb-2">
            No personal realizations added for this verse yet.
          </p>
          <button
            type="button"
            onClick={() => startEditing(null)}
            className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            <Plus size={12} /> Click here to record reflections and notes
          </button>
        </div>
      )}

      {/* Saved Realizations List */}
      {!editing && notes.length > 0 && (
        <div className="flex flex-col gap-3 mb-4">
          {notes.map((note) => (
            <article
              key={note.id}
              className="rounded-xl bg-neutral-900/70 border border-neutral-800/80 p-4 hover:border-neutral-700 transition-all shadow-sm"
            >
              {/* Card Meta & Header */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-neutral-800/60">
                <div className="min-w-0 flex-1">
                  {note.title ? (
                    <h4 className="text-sm font-semibold text-amber-400 truncate tracking-wide">{note.title}</h4>
                  ) : (
                    <span className="text-xs font-medium text-neutral-400 italic">Untitled Realization</span>
                  )}
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {new Date(note.updatedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => startEditing(note)}
                    title="Edit realization"
                    className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800 hover:text-amber-400 transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSingleNote(note)}
                    title="Export realization (.md)"
                    className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                  >
                    <FileDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(note.id)}
                    title="Delete realization"
                    className="p-1.5 rounded text-neutral-500 hover:bg-neutral-800 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Card Body with rich scripture hyperlinks, @ references, and hashtags */}
              <div className="text-sm text-neutral-200">
                <NoteContentRenderer content={note.contentText} />
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Edit / New Realization Form */}
      {editing && (
        <div
          ref={editorRef}
          className="rounded-xl border border-amber-500/40 bg-neutral-900 shadow-xl overflow-hidden relative"
        >
          {/* Card Title Header */}
          <div className="px-4 pt-3.5 pb-2 border-b border-neutral-800/80 bg-neutral-900/90">
            <div className="text-[10px] font-bold tracking-widest uppercase text-amber-500 mb-2">
              {editingId != null ? 'Edit Realization' : 'New Realization'}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional, e.g. Reflections on surrender)..."
              className="w-full bg-transparent text-sm font-medium text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
          </div>

          {/* Rich Formatting Toolbar (Matching v2 layout) */}
          {editor && (
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800 bg-neutral-950/60 flex-wrap relative text-xs">
              {/* Text Style dropdown */}
              <select
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'p') editor.chain().focus().setParagraph().run()
                  else if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run()
                  else if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run()
                  else if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run()
                  e.target.selectedIndex = 0
                }}
                className="bg-neutral-900 border border-neutral-800 text-neutral-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500/50"
                title="Text Style"
              >
                <option value="">Text Style ▾</option>
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>

              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* Bold, Italic, Underline, Strike, Highlight, Code */}
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded transition-colors font-bold ${
                  editor.isActive('bold')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Bold (Ctrl+B)"
              >
                <Bold size={14} />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded transition-colors italic ${
                  editor.isActive('italic')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Italic (Ctrl+I)"
              >
                <Italic size={14} />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`p-1.5 rounded transition-colors underline ${
                  editor.isActive('underline')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Underline (Ctrl+U)"
              >
                <UnderlineIcon size={14} />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`p-1.5 rounded transition-colors line-through ${
                  editor.isActive('strike')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Strikethrough"
              >
                <Strikethrough size={14} />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHighlight({ color: '#facc15' }).run()}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  editor.isActive('highlight')
                    ? 'bg-amber-400 text-neutral-950 ring-1 ring-amber-300'
                    : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                }`}
                title="Highlight text"
              >
                H
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCode().run()}
                className={`p-1.5 rounded transition-colors font-mono text-xs ${
                  editor.isActive('code')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Inline code"
              >
                <Code size={14} />
              </button>

              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* Lists */}
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                  editor.isActive('bulletList')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Bullet list (- )"
              >
                <List size={14} /> List
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                  editor.isActive('orderedList')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Numbered list (1. )"
              >
                <ListOrdered size={14} /> List
              </button>

              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* Table Popover Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setTableDialogOpen(!tableDialogOpen)
                    setLinkDialogOpen(false)
                    setAtDialogOpen(false)
                  }}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                    tableDialogOpen || editor.isActive('table')
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                  title="Insert table"
                >
                  <TableIcon size={14} /> Table <ChevronDown size={11} />
                </button>

                {tableDialogOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
                      <span className="text-xs font-semibold text-neutral-300">Insert Table</span>
                      <span className="text-[11px] text-amber-400 font-mono">
                        {hoveredCol > 0 ? `${hoveredCol} × ${hoveredRow}` : `${tableCols} × ${tableRows}`}
                      </span>
                    </div>

                    {/* 6x6 Matrix */}
                    <div
                      className="grid grid-cols-6 gap-1 p-1 bg-neutral-950 rounded border border-neutral-800 mb-2.5"
                      onMouseLeave={() => {
                        setHoveredRow(0)
                        setHoveredCol(0)
                      }}
                    >
                      {Array.from({ length: 36 }).map((_, idx) => {
                        const r = Math.floor(idx / 6) + 1
                        const c = (idx % 6) + 1
                        const isHighlighted = r <= (hoveredRow || tableRows) && c <= (hoveredCol || tableCols)
                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => {
                              setHoveredRow(r)
                              setHoveredCol(c)
                            }}
                            onClick={() => insertCustomTable(r, c, tableWithHeader)}
                            className={`w-6 h-6 rounded-sm border cursor-pointer transition-colors ${
                              isHighlighted
                                ? 'bg-amber-500/40 border-amber-500/80'
                                : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                            }`}
                          />
                        )
                      })}
                    </div>

                    {/* Presets */}
                    <div className="flex items-center gap-1 mb-2.5">
                      <span className="text-[10px] text-neutral-500">Presets:</span>
                      {[
                        [2, 2],
                        [3, 3],
                        [4, 2],
                        [5, 4],
                      ].map(([r, c]) => (
                        <button
                          key={`${r}x${c}`}
                          type="button"
                          onClick={() => insertCustomTable(r, c, tableWithHeader)}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        >
                          {r}×{c}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <label className="flex items-center gap-1 text-neutral-400">
                        Rows:
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={tableRows}
                          onChange={(e) => setTableRows(parseInt(e.target.value, 10) || 1)}
                          className="w-12 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-xs text-neutral-200"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-neutral-400">
                        Cols:
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={tableCols}
                          onChange={(e) => setTableCols(parseInt(e.target.value, 10) || 1)}
                          className="w-12 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-xs text-neutral-200"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                      <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tableWithHeader}
                          onChange={(e) => setTableWithHeader(e.target.checked)}
                          className="rounded border-neutral-700 text-amber-500"
                        />
                        Header row
                      </label>
                      <button
                        type="button"
                        onClick={() => insertCustomTable(tableRows, tableCols, tableWithHeader)}
                        className="px-2.5 py-1 rounded bg-amber-500 text-neutral-950 font-medium text-xs hover:bg-amber-400"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* Link Popover Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={openLinkDialog}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                    linkDialogOpen || editor.isActive('link')
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                  title="Insert hyperlink"
                >
                  <LinkIcon size={14} /> Link <ChevronDown size={11} />
                </button>

                {linkDialogOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 w-72 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
                      <span className="text-xs font-semibold text-neutral-300">Insert Hyperlink</span>
                      <button
                        type="button"
                        onClick={() => setLinkDialogOpen(false)}
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="space-y-2 mb-3">
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase mb-0.5">Text:</div>
                        <input
                          type="text"
                          value={linkText}
                          onChange={(e) => setLinkText(e.target.value)}
                          placeholder="e.g. Prabhupada Vani"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase mb-0.5">Web URL:</div>
                        <input
                          type="text"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') insertCustomLink()
                          }}
                          placeholder="e.g. https://prabhupadavani.org"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLinkDialogOpen(false)}
                        className="px-2.5 py-1 rounded text-xs text-neutral-400 hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={insertCustomLink}
                        className="px-2.5 py-1 rounded bg-amber-500 text-neutral-950 font-medium text-xs hover:bg-amber-400"
                      >
                        Insert Link
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* @ Ref Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setAtDialogOpen(!atDialogOpen)
                    setTableDialogOpen(false)
                    setLinkDialogOpen(false)
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    atDialogOpen
                      ? 'bg-amber-400 text-neutral-950'
                      : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  }`}
                  title="Insert Scripture Reference (@Ref)"
                >
                  <AtSign size={13} /> Ref
                </button>

                {atDialogOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 w-72 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
                      <span className="text-xs font-semibold text-amber-400">Insert Scripture Citation</span>
                      <button
                        type="button"
                        onClick={() => setAtDialogOpen(false)}
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-400 mb-2">
                      Enter reference (e.g. <span className="font-mono text-amber-400">BG 4.8</span>,{' '}
                      <span className="font-mono text-amber-400">SB 4.2.2</span>,{' '}
                      <span className="font-mono text-amber-400">CC Madhya 20.108</span>):
                    </p>
                    <input
                      type="text"
                      value={atRefInput}
                      onChange={(e) => setAtRefInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') insertAtReference()
                      }}
                      autoFocus
                      placeholder="e.g. BG 4.8"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 mb-3"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAtDialogOpen(false)}
                        className="px-2.5 py-1 rounded text-xs text-neutral-400 hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={insertAtReference}
                        className="px-2.5 py-1 rounded bg-amber-500 text-neutral-950 font-medium text-xs hover:bg-amber-400"
                      >
                        Insert @Ref
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quote Block */}
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
                  editor.isActive('blockquote')
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
                title="Blockquote (> )"
              >
                <Quote size={13} /> Quote
              </button>
            </div>
          )}

          {/* TipTap Editable Canvas */}
          <div className="px-4 py-3 min-h-[140px] bg-neutral-950/40">
            <EditorContent
              editor={editor}
              data-placeholder="Record your reflections, realizations, and notes here... (Type # for H1, - for list, @bg 1.1 for links)"
              className="notes-editor text-neutral-200 text-sm leading-relaxed [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:outline-none"
            />
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-900/90">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !hasContent}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save Realization'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="px-3 py-1.5 rounded-md text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportDraft}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <FileDown size={13} /> Export Draft (.md)
            </button>
          </div>
        </div>
      )}

      {/* Bidirectional Link Matrix / Backlinks Section */}
      <div className="mt-5 border-t border-neutral-800/60 pt-3.5">
        <button
          type="button"
          onClick={() => setBacklinksOpen(!backlinksOpen)}
          className="flex items-center justify-between w-full text-left py-1 px-1.5 rounded-lg hover:bg-neutral-900/60 transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <GitFork size={13} className="text-amber-400 group-hover:text-amber-300 transition-colors" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-amber-500/90 group-hover:text-amber-400 transition-colors">
              Notes Referencing This Verse
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700/60">
              {backlinks.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-500 group-hover:text-neutral-300 transition-colors">
            <span className="text-[11px]">{backlinksOpen ? 'Hide' : 'Show'}</span>
            {backlinksOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {backlinksOpen && (
          <div className="mt-2.5 space-y-2.5">
            {loadingBacklinks ? (
              <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/20 p-3 text-center text-xs text-neutral-500">
                Scanning notes for backlinks…
              </div>
            ) : backlinks.length === 0 ? (
              <div className="rounded-lg border border-neutral-800/40 bg-neutral-900/20 p-3 text-center">
                <p className="text-xs text-neutral-400 italic mb-1">
                  No other notes reference this verse yet.
                </p>
                <p className="text-[11px] text-neutral-500">
                  Mention this verse anywhere using <span className="text-amber-400/90 font-mono">@{reference || verseId}</span> or <span className="text-amber-400/90 font-mono">[[{reference || verseId}]]</span> to see bidirectional connections here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {backlinks.map((b) => (
                  <article
                    key={b.id}
                    className="rounded-lg bg-neutral-900/60 border border-neutral-800/80 p-3 hover:border-amber-500/40 transition-all shadow-sm group"
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800/60">
                      <div className="flex items-center gap-2 min-w-0">
                        {b.sourceVerseId ? (
                          <button
                            type="button"
                            onClick={() => openSourceVerse(b.sourceVerseId!)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
                            title={`Jump to source verse ${b.sourceVerseId}`}
                          >
                            <ExternalLink size={10} /> Note on {b.sourceVerseId}
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                            Standalone Note
                          </span>
                        )}
                        <h5 className="text-xs font-semibold text-neutral-200 truncate">
                          {b.sourceTitle || 'Untitled Realization'}
                        </h5>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800 font-mono text-[9px] uppercase">
                          {b.linkType}
                        </span>
                        <span>
                          {new Date(b.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={openInNotesTab}
                          className="text-amber-500/80 hover:text-amber-400 transition-colors ml-1 cursor-pointer"
                          title="Open in Notes Tab"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-300 leading-relaxed pl-2 border-l-2 border-amber-500/30">
                      <NoteContentRenderer content={b.excerpt} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
