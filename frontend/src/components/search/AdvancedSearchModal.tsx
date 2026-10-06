import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { getVocabularyTerms, type VocabTerm } from '../../services/api'
import { useNavigationStore } from '../../stores/useNavigationStore'

const OPERATORS: { label: string; token: string }[] = [
  { label: 'AND', token: 'AND' },
  { label: 'OR', token: 'OR' },
  { label: 'NOT', token: 'NOT' },
  { label: 'NEAR/5', token: 'NEAR/5' },
  { label: 'NEAR/10', token: 'NEAR/10' },
  { label: 'w/5', token: 'w/5' },
  { label: 'w/10', token: 'w/10' },
  { label: '*', token: '*' },
]

/** Normalizes Folio proximity shorthands (`w/N`, `NEAR/N`) into standard FTS5 `NEAR(a b, N)`. */
export function normalizeFolioShorthand(query: string): string {
  return query.replace(/("(?:\\.|[^"\\])*"|\S+)\s+(?:w|near)\/(\d+)\s+("(?:\\.|[^"\\])*"|\S+)/gi, (_m, a: string, n: string, b: string) => `NEAR(${a} ${b}, ${n})`)
}

function appendToken(current: string, token: string): string {
  if (token.startsWith(' ') || current.endsWith(' ') || current.length === 0) return current + token
  return `${current} ${token}`
}

export function AdvancedSearchModal({
  onClose,
  onRun,
  initialQuery = '',
}: {
  onClose: () => void
  onRun: (fts5Query: string, checkedBookKeys: string[]) => void
  initialQuery?: string
}) {
  const books = useNavigationStore((s) => s.books)
  const [query, setQuery] = useState(initialQuery)
  const [wordPrefix, setWordPrefix] = useState('')
  const [vocabTerms, setVocabTerms] = useState<VocabTerm[]>([])
  const [selectedTerm, setSelectedTerm] = useState<VocabTerm | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set(books.map((b) => b.bookKey)))
  const queryBoxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setChecked(new Set(books.map((b) => b.bookKey)))
  }, [books])

  useEffect(() => {
    void getVocabularyTerms(wordPrefix, 60).then(setVocabTerms).catch(() => setVocabTerms([]))
  }, [wordPrefix])

  const insertWord = (term: string) => {
    setQuery((q) => appendToken(q, term))
    queryBoxRef.current?.focus()
  }

  const insertCurrentWord = () => {
    if (selectedTerm) {
      insertWord(selectedTerm.term)
    } else if (wordPrefix.trim()) {
      insertWord(wordPrefix.trim())
    }
  }

  const applyPhrase = () => {
    const trimmed = query.trim()
    if (trimmed && !trimmed.startsWith('"')) {
      setQuery(`"${trimmed}"`)
    } else {
      setQuery((q) => appendToken(q, '""'))
    }
  }

  const toggleBook = (bookKey: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(bookKey)) next.delete(bookKey)
      else next.add(bookKey)
      return next
    })
  }

  const SCRIPTURE_KEYS = new Set(['BG', 'SB', 'CC', 'DI', 'MADHYA', 'ANTYA', 'NOD', 'TLC', 'NOI', 'ISO', 'BS'])

  const checkedCountLabel =
    checked.size === books.length
      ? `All ${books.length} Books Checked`
      : checked.size === 0
        ? 'No Books Checked (0)'
        : `${checked.size} of ${books.length} Books Checked`

  const run = () => {
    const compiled = normalizeFolioShorthand(query.trim())
    if (!compiled) return
    const checkedKeys = checked.size === books.length ? [] : [...checked]
    onRun(compiled, checkedKeys)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-12" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-base font-semibold text-neutral-100">⚡ Advanced Search</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Word Wheel */}
          <div className="flex flex-col min-h-0">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Word Wheel</label>
            <input
              value={wordPrefix}
              onChange={(e) => setWordPrefix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') insertCurrentWord()
              }}
              placeholder="Word:"
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 mb-2"
            />
            <div className="flex-1 min-h-[220px] max-h-[280px] overflow-y-auto scrollbar-thin border border-neutral-800 rounded-md">
              {vocabTerms.map((t) => (
                <button
                  key={t.term}
                  type="button"
                  onClick={() => setSelectedTerm(t)}
                  onDoubleClick={() => insertWord(t.term)}
                  className={`w-full text-left px-3 py-1.5 text-sm border-b border-neutral-900 last:border-b-0 ${
                    selectedTerm?.term === t.term ? 'bg-amber-500/10 text-amber-300' : 'text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  {t.term}
                </button>
              ))}
              {vocabTerms.length === 0 && <p className="px-3 py-4 text-xs text-neutral-600">No terms.</p>}
            </div>
            {selectedTerm && (
              <div className="mt-2 text-xs text-neutral-500">
                <div>
                  {selectedTerm.term} — {selectedTerm.documentCount.toLocaleString()} records with hits
                </div>
                <div>{selectedTerm.totalOccurrences.toLocaleString()} total occurrences across the corpus</div>
              </div>
            )}
            <button
              type="button"
              onClick={insertCurrentWord}
              className="mt-2 self-start px-3 py-1.5 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
            >
              Insert Word into Query ↵
            </button>
          </div>

          {/* Right: Query builder + book checklist */}
          <div className="flex flex-col min-h-0">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Query For</label>
            <textarea
              ref={queryBoxRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              placeholder='e.g. kṛṣṇa AND arjuna, or "supreme personality"'
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 resize-none mb-2"
            />
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {OPERATORS.map((op) => (
                <button
                  key={op.token}
                  type="button"
                  onClick={() => setQuery((q) => appendToken(q, op.token))}
                  className="px-2.5 py-1 rounded-md text-xs text-neutral-300 border border-neutral-800 hover:bg-neutral-900"
                >
                  {op.label}
                </button>
              ))}
              <button
                type="button"
                onClick={applyPhrase}
                className="px-2.5 py-1 rounded-md text-xs text-neutral-300 border border-neutral-800 hover:bg-neutral-900"
              >
                &quot;Phrase&quot;
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Book Branch</label>
              <span className="text-[11px] text-neutral-500">{checkedCountLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setChecked(new Set(books.map((b) => b.bookKey)))}
                className="px-2 py-0.5 rounded text-[11px] text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                className="px-2 py-0.5 rounded text-[11px] text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set(books.filter((b) => SCRIPTURE_KEYS.has(b.bookKey)).map((b) => b.bookKey)))}
                className="px-2 py-0.5 rounded text-[11px] text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
              >
                Scriptures Only
              </button>
            </div>
            <div className="flex-1 min-h-[140px] max-h-[200px] overflow-y-auto scrollbar-thin border border-neutral-800 rounded-md">
              {books.map((b) => (
                <label key={b.bookKey} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked.has(b.bookKey)}
                    onChange={() => toggleBook(b.bookKey)}
                    className="accent-amber-500"
                  />
                  <span className="text-neutral-300 truncate">{b.title ?? b.bookKey}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-800 shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-neutral-400 hover:bg-neutral-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={!query.trim()}
            onClick={run}
            className="px-4 py-1.5 rounded-md text-sm bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 disabled:hover:bg-amber-500/20"
          >
            Search
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
