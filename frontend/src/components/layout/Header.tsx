import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Minus,
  Plus,
  Rows,
  Search,
  SearchCheck,
  Sparkles,
  Type,
} from 'lucide-react'

import { useNavigationStore } from '../../stores/useNavigationStore'
import {
  READING_WIDTH_PX,
  type LineSpacing,
  type ReadingWidth,
  useReaderStore,
} from '../../stores/useReaderStore'
import { useSplitViewStore } from '../../stores/useSplitViewStore'
import { useStudyStore } from '../../stores/useStudyStore'
import { useTabStore } from '../../stores/useTabStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useUIStore } from '../../stores/useUIStore'
import type { Book, TocChapter, VerseRecord } from '../../types/scripture'

function BreadcrumbSegment<T>({
  label,
  items,
  isOpen,
  onToggle,
  onClose,
  renderItem,
  isActive,
  onSelect,
  className = '',
}: {
  label: string
  items: T[]
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  renderItem: (item: T) => string
  isActive: (item: T) => boolean
  onSelect: (item: T) => void
  className?: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setDropdownPos(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const maxLeft = Math.max(8, window.innerWidth - 300)
      setDropdownPos({ top: rect.bottom + 6, left: Math.min(rect.left, maxLeft) })
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        title={label}
        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors truncate ${
          isOpen
            ? 'bg-neutral-800 text-amber-300'
            : 'text-neutral-300 hover:bg-neutral-800/80 hover:text-neutral-100'
        } ${className}`}
      >
        {label}
      </button>
      {isOpen &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            className="w-72 max-h-80 overflow-y-auto scrollbar-thin bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1.5"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onSelect(item)
                  onClose()
                }}
                className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                  isActive(item)
                    ? 'bg-amber-500/15 text-amber-300 font-medium'
                    : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {renderItem(item)}
              </button>
            ))}
            {items.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-600">Nothing to show</div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

const WIDTH_OPTIONS: { value: ReadingWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'comfortable', label: 'Comfort' },
  { value: 'wide', label: 'Wide' },
]

const SPACING_OPTIONS: { value: LineSpacing; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
]

export function Header() {
  const books = useNavigationStore((s) => s.books)
  const selectedBook = useNavigationStore((s) => s.selectedBook)
  const toc = useNavigationStore((s) => s.toc)
  const selectedChapter = useNavigationStore((s) => s.selectedChapter)
  const chapterRecords = useNavigationStore((s) => s.chapterRecords)
  const activeVerseId = useNavigationStore((s) => s.activeVerseId)
  const readingMode = useNavigationStore((s) => s.readingMode)
  const selectBook = useNavigationStore((s) => s.selectBook)
  const selectChapter = useNavigationStore((s) => s.selectChapter)
  const jumpToVerse = useNavigationStore((s) => s.jumpToVerse)
  const toggleReadingMode = useNavigationStore((s) => s.toggleReadingMode)
  const nextChapter = useNavigationStore((s) => s.nextChapter)
  const prevChapter = useNavigationStore((s) => s.prevChapter)

  const readingWidth = useReaderStore((s) => s.readingWidth)
  const setReadingWidth = useReaderStore((s) => s.setReadingWidth)
  const lineSpacing = useReaderStore((s) => s.lineSpacing)
  const setLineSpacing = useReaderStore((s) => s.setLineSpacing)
  const fontSize = useReaderStore((s) => s.fontSize)
  const increaseFontSize = useReaderStore((s) => s.increaseFontSize)
  const decreaseFontSize = useReaderStore((s) => s.decreaseFontSize)
  const resetFontSize = useReaderStore((s) => s.resetFontSize)

  const showSanskrit = useReaderStore((s) => s.showSanskrit)
  const toggleSanskrit = useReaderStore((s) => s.toggleSanskrit)
  const showTransliteration = useReaderStore((s) => s.showTransliteration)
  const toggleTransliteration = useReaderStore((s) => s.toggleTransliteration)
  const showSynonyms = useReaderStore((s) => s.showSynonyms)
  const toggleSynonyms = useReaderStore((s) => s.toggleSynonyms)
  const showTranslation = useReaderStore((s) => s.showTranslation)
  const toggleTranslation = useReaderStore((s) => s.toggleTranslation)
  const showPurport = useReaderStore((s) => s.showPurport)
  const togglePurport = useReaderStore((s) => s.togglePurport)
  const showPronunciationGuide = useReaderStore((s) => s.showPronunciationGuide)
  const togglePronunciationGuide = useReaderStore((s) => s.togglePronunciationGuide)
  const showBacklinks = useReaderStore((s) => s.showBacklinks)
  const toggleBacklinks = useReaderStore((s) => s.toggleBacklinks)

  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const openSearchTabForBook = useTabStore((s) => s.openSearchTabForBook)
  const toggleZenMode = useThemeStore((s) => s.toggleZenMode)

  const loadBookmarks = useStudyStore((s) => s.loadBookmarks)
  const isBookmarked = useStudyStore((s) => s.isBookmarked)
  const toggleBookmark = useStudyStore((s) => s.toggleBookmark)

  const splitMode = useSplitViewStore((s) => s.mode)
  const cycleSplitMode = useSplitViewStore((s) => s.cycle)

  useEffect(() => {
    void loadBookmarks()
  }, [loadBookmarks])

  const [openDropdown, setOpenDropdown] = useState<
    'book' | 'canto' | 'chapter' | 'verse' | 'appearance' | null
  >(null)
  const toggle = (key: typeof openDropdown) =>
    setOpenDropdown((cur) => (cur === key ? null : key))

  const appearanceBtnRef = useRef<HTMLButtonElement>(null)
  const appearanceMenuRef = useRef<HTMLDivElement>(null)
  const [appearancePos, setAppearancePos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (openDropdown !== 'appearance') {
      setAppearancePos(null)
      return
    }
    const rect = appearanceBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setAppearancePos({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      })
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        appearanceBtnRef.current?.contains(target) ||
        appearanceMenuRef.current?.contains(target)
      ) {
        return
      }
      setOpenDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openDropdown])

  const cantoNumbers = [...new Set(toc.map((c) => c.cantoNumber).filter((c): c is string => !!c))]
  const chaptersInCanto = selectedChapter?.cantoNumber
    ? toc.filter((c) => c.cantoNumber === selectedChapter.cantoNumber)
    : toc

  const SVA_SECTION_TITLES: Record<string, string> = {
    '1': 'Standard Prayers',
    '2': 'Bhaktivinoda Ṭhākura',
    '3': 'Narottama dāsa Ṭhākura',
    '4': 'Other Ācāryas',
  }
  const formatDivision = (num: string) => {
    if (selectedBook?.bookKey === 'SVA') {
      return SVA_SECTION_TITLES[num] ? `Section ${num}: ${SVA_SECTION_TITLES[num]}` : `Section ${num}`
    }
    if (selectedBook?.bookKey === 'BB') {
      return `Part ${num}`
    }
    return `Canto ${num}`
  }

  const activeRecord = chapterRecords.find((r) => r.recordKey === activeVerseId)

  return (
    <div className="h-11 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur flex items-center justify-between px-3 gap-3 select-none shrink-0">
      {/* Left: Single-line Breadcrumb + Chapter Stepper */}
      <div className="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
        {selectedBook ? (
          <>
            <BreadcrumbSegment<Book>
              label={selectedBook.title ?? selectedBook.bookKey}
              items={books}
              isOpen={openDropdown === 'book'}
              onToggle={() => toggle('book')}
              onClose={() => setOpenDropdown(null)}
              renderItem={(b) => b.title ?? b.bookKey}
              isActive={(b) => b.bookKey === selectedBook.bookKey}
              onSelect={(b) => void selectBook(b)}
              className="max-w-[180px] sm:max-w-[220px] font-semibold text-neutral-200"
            />

            {cantoNumbers.length > 0 && selectedChapter?.cantoNumber && (
              <>
                <ChevronRight size={13} className="text-neutral-600 shrink-0" />
                <BreadcrumbSegment<string>
                  label={formatDivision(selectedChapter.cantoNumber)}
                  items={cantoNumbers}
                  isOpen={openDropdown === 'canto'}
                  onToggle={() => toggle('canto')}
                  onClose={() => setOpenDropdown(null)}
                  renderItem={formatDivision}
                  isActive={(c) => c === selectedChapter.cantoNumber}
                  onSelect={(canto) => {
                    const first = toc.find((c) => c.cantoNumber === canto)
                    if (first) void selectChapter(first)
                  }}
                  className="max-w-[140px] shrink-0"
                />
              </>
            )}

            {selectedChapter && (
              <>
                <ChevronRight size={13} className="text-neutral-600 shrink-0" />
                <BreadcrumbSegment<TocChapter>
                  label={selectedChapter.label}
                  items={chaptersInCanto}
                  isOpen={openDropdown === 'chapter'}
                  onToggle={() => toggle('chapter')}
                  onClose={() => setOpenDropdown(null)}
                  renderItem={(c) => c.label}
                  isActive={(c) => c.chapterKey === selectedChapter.chapterKey}
                  onSelect={(c) => void selectChapter(c)}
                  className="max-w-[200px] md:max-w-[280px] lg:max-w-[360px]"
                />
              </>
            )}

            {activeRecord && chapterRecords.length > 1 && (
              <>
                <ChevronRight size={13} className="text-neutral-600 shrink-0" />
                <BreadcrumbSegment<VerseRecord>
                  label={activeRecord.reference ?? activeRecord.recordKey}
                  items={chapterRecords}
                  isOpen={openDropdown === 'verse'}
                  onToggle={() => toggle('verse')}
                  onClose={() => setOpenDropdown(null)}
                  renderItem={(r) => r.reference ?? r.recordKey}
                  isActive={(r) => r.recordKey === activeRecord.recordKey}
                  onSelect={(r) => jumpToVerse(r.recordKey)}
                  className="shrink-0 bg-neutral-900/90 border border-neutral-800/80 text-amber-400/90"
                />
              </>
            )}

            {/* Compact Prev / Next Chapter stepper right beside the chapter/verse */}
            <div className="flex items-center ml-1.5 bg-neutral-900/70 border border-neutral-800/80 rounded-md p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => void prevChapter()}
                className="p-1 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                title="Previous chapter"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="w-px h-3.5 bg-neutral-800" />
              <button
                type="button"
                onClick={() => void nextChapter()}
                className="p-1 rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                title="Next chapter"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <span className="text-xs text-neutral-500 px-2">Select a scripture to begin reading</span>
        )}
      </div>

      {/* Right: Clean, Clutter-Free Reader Action Bar */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Consolidated Typography & Reader View Popover */}
        <button
          ref={appearanceBtnRef}
          type="button"
          onClick={() => toggle('appearance')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            openDropdown === 'appearance'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
          }`}
          title="Reader Appearance & Layout"
        >
          <Type size={13} />
          <span className="tabular-nums text-[11px] text-neutral-400">{fontSize}px</span>
        </button>

        {openDropdown === 'appearance' &&
          appearancePos &&
          createPortal(
            <div
              ref={appearanceMenuRef}
              style={{
                position: 'fixed',
                top: appearancePos.top,
                right: appearancePos.right,
                zIndex: 9999,
              }}
              className="w-80 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-3.5 space-y-3.5 text-xs"
            >
              {/* Font size row */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400 mb-1.5">
                  <span>Text Size</span>
                  <button
                    type="button"
                    onClick={resetFontSize}
                    className="text-[10px] text-neutral-500 hover:text-amber-400 transition-colors"
                  >
                    Reset
                  </button>
                </div>
                <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={decreaseFontSize}
                    className="flex-1 py-1 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-800 transition-colors"
                    title="Decrease font size"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-16 text-center font-medium text-neutral-200 tabular-nums">
                    {fontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={increaseFontSize}
                    className="flex-1 py-1 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-800 transition-colors"
                    title="Increase font size"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Reading Mode (Continuous vs Focus) */}
              <div>
                <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Reading Mode</div>
                <div className="grid grid-cols-2 gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (readingMode !== 'continuous') toggleReadingMode()
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                      readingMode === 'continuous'
                        ? 'bg-neutral-800 text-amber-300 font-medium'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Rows size={13} />
                    <span>Continuous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (readingMode !== 'focus') toggleReadingMode()
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                      readingMode === 'focus'
                        ? 'bg-neutral-800 text-amber-300 font-medium'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <AlignCenter size={13} />
                    <span>Focus</span>
                  </button>
                </div>
              </div>

              {/* Column Width */}
              <div>
                <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Page Width</div>
                <div className="grid grid-cols-3 gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                  {WIDTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReadingWidth(opt.value)}
                      title={`${READING_WIDTH_PX[opt.value]}px`}
                      className={`py-1.5 rounded-md transition-colors ${
                        readingWidth === opt.value
                          ? 'bg-neutral-800 text-amber-300 font-medium'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing */}
              <div>
                <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Line Spacing</div>
                <div className="grid grid-cols-3 gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                  {SPACING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLineSpacing(opt.value)}
                      className={`py-1.5 rounded-md transition-colors ${
                        lineSpacing === opt.value
                          ? 'bg-neutral-800 text-amber-300 font-medium'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verse Layers Visibility */}
              <div>
                <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Visible Layers</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Devanāgarī', active: showSanskrit, onClick: toggleSanskrit },
                    {
                      label: 'Transliteration',
                      active: showTransliteration,
                      onClick: toggleTransliteration,
                    },
                    { label: 'Synonyms', active: showSynonyms, onClick: toggleSynonyms },
                    { label: 'Translation', active: showTranslation, onClick: toggleTranslation },
                    { label: 'Purport', active: showPurport, onClick: togglePurport },
                    {
                      label: 'Sanskrit Meter',
                      active: showPronunciationGuide,
                      onClick: togglePronunciationGuide,
                      title: 'Show Pronunciation & Recitation Guide (Sanskrit Meter)',
                    },
                    {
                      label: 'Referencing Notes',
                      active: showBacklinks,
                      onClick: toggleBacklinks,
                      title: 'Show Referencing Notes in Reader (Backlinks)',
                    },
                  ].map((layer) => (
                    <button
                      key={layer.label}
                      type="button"
                      onClick={layer.onClick}
                      title={layer.title}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
                        layer.active
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      <span className="truncate mr-1">{layer.label}</span>
                      {layer.active && <Check size={12} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )}

        <button
          type="button"
          onClick={cycleSplitMode}
          className={`p-1.5 rounded-md transition-colors ${
            splitMode !== 'none'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
          }`}
          title="Split View / Dual Pane (Alt+S)"
        >
          <Columns2 size={15} />
        </button>

        <div className="w-px h-4 bg-neutral-800 mx-0.5" />

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="Quick Search (Ctrl+K)"
        >
          <Search size={15} />
        </button>

        {selectedBook && (
          <button
            type="button"
            onClick={() =>
              openSearchTabForBook(
                selectedBook.bookKey,
                selectedBook.title ?? selectedBook.bookKey,
              )
            }
            className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            title={`Search in ${selectedBook.title ?? selectedBook.bookKey}`}
          >
            <SearchCheck size={15} />
          </button>
        )}

        {activeRecord && (
          <button
            type="button"
            onClick={() =>
              void toggleBookmark(
                activeRecord.recordKey,
                selectedBook?.title ?? selectedBook?.bookKey ?? '',
                activeRecord.reference ?? activeRecord.recordKey,
              )
            }
            className={`p-1.5 rounded-md transition-all active:scale-90 ${
              isBookmarked(activeRecord.recordKey)
                ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
            title="Toggle bookmark for this verse (Ctrl+Shift+B)"
          >
            {isBookmarked(activeRecord.recordKey) ? (
              <BookmarkCheck size={15} className="fill-amber-400/20" />
            ) : (
              <Bookmark size={15} />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={toggleZenMode}
          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="Zen Mode (Ctrl+Shift+F)"
        >
          <Sparkles size={15} />
        </button>
      </div>
    </div>
  )
}
