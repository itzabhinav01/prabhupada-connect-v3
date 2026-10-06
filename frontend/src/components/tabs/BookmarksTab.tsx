import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, FolderPlus, MoreHorizontal, Search, Trash2 } from 'lucide-react'

import { getVerseRecord } from '../../services/api'
import { useStudyStore } from '../../stores/useStudyStore'
import { deriveNavigationTarget } from '../../utils/recordKey'
import { useOpenReaderForVerse } from './useOpenReaderForVerse'

const UNCATEGORIZED = '__uncategorized__'

function InlinePromptDialog({
  title,
  defaultValue = '',
  onConfirm,
  onCancel,
}: {
  title: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-6 w-80 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onConfirm(value.trim())
            if (e.key === 'Escape') onCancel()
          }}
          className="bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-amber-500/50"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function BookmarkMenu({
  collections,
  currentTag,
  onMoveTo,
  onDelete,
}: {
  collections: string[]
  currentTag: string | null
  onMoveTo: (tag: string | null) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSubmenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 mr-1 text-neutral-600 hover:text-neutral-300"
        title="More"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 py-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSubmenu((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Move to…
              <ChevronRight size={12} />
            </button>
            {submenu && (
              <div className="absolute top-0 right-full mr-1 w-44 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto scrollbar-thin">
                <button
                  type="button"
                  onClick={() => {
                    onMoveTo(null)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800 ${currentTag === null ? 'text-amber-400' : 'text-neutral-300'}`}
                >
                  Uncategorized
                </button>
                {collections.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onMoveTo(c)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-800 truncate ${currentTag === c ? 'text-amber-400' : 'text-neutral-300'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onMoveTo(currentTag)
              setOpen(false)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Remove from collection
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-neutral-800"
          >
            Delete Bookmark
          </button>
        </div>
      )}
    </div>
  )
}

export function BookmarksTab() {
  const bookmarks = useStudyStore((s) => s.bookmarks)
  const loadBookmarks = useStudyStore((s) => s.loadBookmarks)
  const removeBookmarkById = useStudyStore((s) => s.removeBookmarkById)
  const renameBookmarkCollection = useStudyStore((s) => s.renameBookmarkCollection)
  const clearBookmarkCollection = useStudyStore((s) => s.clearBookmarkCollection)
  const moveBookmarkToCollection = useStudyStore((s) => s.moveBookmarkToCollection)
  const history = useStudyStore((s) => s.history)
  const loadHistory = useStudyStore((s) => s.loadHistory)
  const openReaderForVerse = useOpenReaderForVerse()
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState<string>('all')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  type DialogState = { mode: 'new' } | { mode: 'rename'; current: string } | null
  const [dialog, setDialog] = useState<DialogState>(null)

  useEffect(() => {
    void loadBookmarks()
    void loadHistory(1)
  }, [loadBookmarks, loadHistory])

  useEffect(() => {
    let cancelled = false
    const missing = bookmarks.filter((b) => !(b.verseId in previews))
    if (missing.length === 0) return
    void Promise.all(
      missing.map(async (b) => {
        const record = await getVerseRecord(b.verseId).catch(() => null)
        return [b.verseId, record?.translation?.slice(0, 100) ?? ''] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setPreviews((prev) => {
        const next = { ...prev }
        for (const [id, text] of entries) next[id] = text
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks])

  const collections = useMemo(() => {
    const tags = new Set<string>()
    for (const b of bookmarks) if (b.tag) tags.add(b.tag)
    return [...tags].sort()
  }, [bookmarks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...bookmarks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return sorted
      .filter((b) => {
        if (collection === 'all') return true
        if (collection === UNCATEGORIZED) return !b.tag
        return b.tag === collection
      })
      .filter((b) => !q || b.bookTitle.toLowerCase().includes(q) || b.verseRef.toLowerCase().includes(q))
  }, [bookmarks, query, collection])

  const handleNewCollection = () => {
    setDialog({ mode: 'new' })
  }

  const handleRenameCollection = () => {
    if (collection === 'all' || collection === UNCATEGORIZED) return
    setDialog({ mode: 'rename', current: collection })
  }

  const handleDialogConfirm = (name: string) => {
    if (dialog?.mode === 'new') {
      setCollection(name)
    } else if (dialog?.mode === 'rename' && name !== dialog.current) {
      void renameBookmarkCollection(dialog.current, name).then(() => setCollection(name))
    }
    setDialog(null)
  }

  const handleDeleteCollection = () => {
    if (collection === 'all' || collection === UNCATEGORIZED) return
    if (!window.confirm(`Delete collection "${collection}"? Bookmarks move to Uncategorized.`)) return
    void clearBookmarkCollection(collection).then(() => setCollection('all'))
  }

  const lastRead = history[0]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-neutral-100">Bookmarks</h1>
          <button
            type="button"
            onClick={handleNewCollection}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
          >
            <FolderPlus size={13} /> New Collection
          </button>
        </div>
        <p className="text-sm text-neutral-500 mb-4">{filtered.length} bookmarks</p>

        {lastRead && (
          <button
            type="button"
            onClick={() => {
              const target = deriveNavigationTarget(lastRead.verseId)
              if (target) void openReaderForVerse(target.bookKey, target.chapterKey, lastRead.verseId)
            }}
            className="w-full text-left mb-6 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
          >
            <div className="text-xs text-amber-500/70 mb-1">Continue Reading</div>
            <div className="text-sm text-neutral-200">{lastRead.bookTitle}</div>
            <div className="text-xs font-semibold text-amber-500/80 mt-0.5">{lastRead.verseRef}</div>
          </button>
        )}

        <div className="flex items-center gap-2 mb-6">
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-2 text-sm text-neutral-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="all">All</option>
            <option value={UNCATEGORIZED}>Uncategorized</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {collection !== 'all' && collection !== UNCATEGORIZED && (
            <>
              <button
                type="button"
                onClick={handleRenameCollection}
                className="text-xs px-2 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-900"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={handleDeleteCollection}
                className="text-xs px-2 py-1.5 rounded-md text-red-400 hover:bg-neutral-900"
              >
                Delete
              </button>
            </>
          )}
          <div className="relative flex-1 min-w-[140px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter bookmarks…"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-2 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-neutral-600 px-1 py-4">
            No bookmarks yet. Bookmark a passage in Reading View to find it here.
          </p>
        )}
        {filtered.map((b) => (
          <div key={b.id} className="flex items-center gap-1 mb-1 rounded-md hover:bg-neutral-900">
            <button
              type="button"
              onClick={() => {
                const target = deriveNavigationTarget(b.verseId)
                if (target) void openReaderForVerse(target.bookKey, target.chapterKey, b.verseId)
              }}
              className="flex-1 text-left px-3 py-2.5 min-w-0"
            >
              <div className="text-sm text-neutral-200 truncate">{b.bookTitle}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-amber-500/80">{b.verseRef}</span>
                <span className="text-[11px] text-neutral-600">{new Date(b.createdAt).toLocaleDateString()}</span>
              </div>
              {previews[b.verseId] && (
                <p className="text-xs text-neutral-500 mt-1 line-clamp-1">{previews[b.verseId]}</p>
              )}
            </button>
            <BookmarkMenu
              collections={collections}
              currentTag={b.tag}
              onMoveTo={(tag) => void moveBookmarkToCollection(b.verseId, tag)}
              onDelete={() => void removeBookmarkById(b.verseId)}
            />
            <button
              type="button"
              onClick={() => void removeBookmarkById(b.verseId)}
              className="p-2 mr-1 text-neutral-600 hover:text-red-400"
              title="Remove bookmark"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {dialog && (
        <InlinePromptDialog
          title={dialog.mode === 'new' ? 'New collection name:' : 'Rename collection to:'}
          defaultValue={dialog.mode === 'rename' ? dialog.current : ''}
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
