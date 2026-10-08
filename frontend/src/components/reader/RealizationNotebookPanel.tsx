import { BookOpen, X } from 'lucide-react'
import { VerseNotesPanel } from './VerseNotesPanel'

/**
 * Split View "Realization Notebook" mode — unified with VerseNotesPanel so
 * note-taking in the split view provides 100% feature parity with the main reader:
 * full Tiptap rich-text editor (Bold, Italic, Underline, Strikethrough, Code, Quote,
 * Lists, Tables, Citations, Links), multiple notes per verse, backlinks, tags,
 * and Markdown export.
 */
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
  return (
    <div className="flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0 bg-neutral-900/60">
        <span className="flex-1 text-sm font-semibold text-amber-400 truncate">
          {activeReference || 'Verse Notes & Realizations'}
        </span>
        <button
          type="button"
          onClick={onSwitchMode}
          title="Switch to Parallel Scripture (Alt+S)"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <BookOpen size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close split view"
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body: Full VerseNotesPanel */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {activeRecordKey ? (
          <VerseNotesPanel verseId={activeRecordKey} reference={activeReference} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-neutral-500 text-sm">
            <p className="font-medium text-neutral-400 mb-1">Realization Notebook</p>
            <p className="text-xs text-neutral-600">
              Select or scroll to a verse in the reader to view, write, and manage realizations and rich notes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
