import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Folder as FolderIcon, HelpCircle, Loader2 } from 'lucide-react'

import { getBookToc } from '../../services/api'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTabStore, type TocTabPayload } from '../../stores/useTabStore'
import type { Book, TocChapter } from '../../types/scripture'
import { CC_LILA_BOOK_KEYS, CC_LILA_LABELS, CC_VIRTUAL_BOOK_KEY, filterBooksByQuery, groupBooksByCategory } from '../layout/bookGroups'
import { useOpenReaderForChapter } from '../tabs/useOpenReaderForVerse'

/** Śrīmad-Bhāgavatam's real published-volume subtitles (Canto 1 "Creation"
 * through Canto 12 "The Age of Deterioration") — genuine bibliographic
 * titles from Prabhupāda's actual books, not invented copy. Chapter/verse
 * counts next to them are still computed live from the real TOC data. */
/** English subtitles for each līlā (v2's `LibraryViewModel.cs` TOC-page
 * headers), distinct from the plain `CC_LILA_LABELS` used elsewhere. */
const CC_LILA_SUBTITLES: Record<string, string> = {
  DI: "The Lord's Early Pastimes",
  MADHYA: "The Lord's Middle Pastimes",
  ANTYA: "The Lord's Final Pastimes",
}

const SB_CANTO_TITLES: Record<string, string> = {
  '1': 'Creation',
  '2': 'The Cosmic Manifestation',
  '3': 'The Status Quo',
  '4': 'The Creation of the Fourth Order',
  '5': 'The Creative Impetus',
  '6': 'Prescribed Duties for Mankind',
  '7': 'The Science of God',
  '8': 'Withdrawal of the Cosmic Creations',
  '9': 'Liberation',
  '10': 'The Summum Bonum',
  '11': 'General History',
  '12': 'The Age of Deterioration',
}

const SVA_SECTION_TITLES: Record<string, string> = {
  '1': 'Standard Prayers',
  '2': 'Songs of Śrīla Bhaktivinoda Ṭhākura',
  '3': 'Songs of Śrīla Narottama dāsa Ṭhākura',
  '4': 'Songs of Other Vaiṣṇava Ācāryas',
}

const BB_PART_TITLES: Record<string, string> = {
  '1': "Finding the Essence of the Supreme Lord's Mercy",
  '2': 'The Glories of Goloka',
}

function LibraryCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left p-4 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 transition-colors"
    >
      <div className="text-sm font-medium text-neutral-100 mb-1">{book.title ?? book.bookKey}</div>
      <div className="text-xs text-neutral-500">
        {book.author ? `${book.author} · ` : ''}
        {book.totalRecords.toLocaleString()} records
      </div>
    </button>
  )
}

function LibraryCatalog() {
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const isLoadingBooks = useNavigationStore((s) => s.isLoadingBooks)
  const folders = useNavigationStore((s) => s.folders)
  const openTocTab = useTabStore((s) => s.openTocTab)
  const openPdfTab = useTabStore((s) => s.openPdfTab)
  const openUtilityTab = useTabStore((s) => s.openUtilityTab)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (books.length === 0 && !isLoadingBooks) void loadBooks()
  }, [books.length, isLoadingBooks, loadBooks])

  const groups = useMemo(() => groupBooksByCategory(filterBooksByQuery(books, query)), [books, query])

  // Custom folders (Settings → Corpus & Books) rendered as their own
  // sections above the standard category groups — same query filter, and a
  // folder with nothing matching simply doesn't render (never an empty box).
  const folderSections = useMemo(() => {
    const byKey = new Map(books.map((b) => [b.bookKey, b]))
    return folders
      .map((f) => ({ folder: f, books: filterBooksByQuery(f.bookKeys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])), query) }))
      .filter((s) => s.books.length > 0)
  }, [folders, books, query])

  const handleOpen = (book: Book) => {
    if (book.isPdf && book.pdfPath) {
      openPdfTab(book.title ?? book.bookKey, book.pdfPath)
    } else {
      openTocTab(book.bookKey, book.title ?? book.bookKey)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-100 mb-1">Library</h1>
            <p className="text-sm text-neutral-500">{books.length} works in the corpus</p>
          </div>
          <button
            type="button"
            onClick={() => openUtilityTab('help', 'User Guide')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            title="Open the interactive User Guide & Manual (F1)"
          >
            <HelpCircle size={15} />
            New here? Open User Guide (F1)
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter the library…"
          className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 mb-8"
        />

        {isLoadingBooks && (
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading corpus…
          </div>
        )}

        {folderSections.map(({ folder, books: folderBooks }) => (
          <div key={`folder-${folder.id}`} className="mb-8">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-3">
              <FolderIcon size={12} /> {folder.name}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {folderBooks.map((book) => (
                <LibraryCard key={book.bookKey} book={book} onOpen={() => handleOpen(book)} />
              ))}
            </div>
          </div>
        ))}

        {groups.map((group) => (
          <div key={group.label} className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.books.map((book) => (
                <LibraryCard key={book.bookKey} book={book} onOpen={() => handleOpen(book)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A single-level chapter/section row — the same clean list style used for
 * both a plain book's chapters and (per v2) each canto/līlā's chapters. */
function ChapterRow({ chapter, onOpen }: { chapter: TocChapter; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-md text-left border border-transparent hover:border-neutral-800 hover:bg-neutral-900/60 transition-colors"
    >
      <span className="text-sm text-neutral-200 truncate">{chapter.label}</span>
      {chapter.recordCount > 1 && (
        <span className="shrink-0 text-xs text-neutral-500 tabular-nums">{chapter.recordCount} verses</span>
      )}
    </button>
  )
}

/** A clean vertical canto/līlā row (v2's `LibraryPage.xaml` style) — title
 * line, then a subordinate metadata line, no card/grid chrome. */
function CantoRow({
  heading,
  subtitle,
  chapterCount,
  verseCount,
  itemLabel,
  onOpen,
}: {
  heading: string
  subtitle?: string
  chapterCount: number
  verseCount: number
  itemLabel?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3 rounded-md border border-transparent hover:border-neutral-800 hover:bg-neutral-900/60 transition-colors"
    >
      <div className="text-sm font-medium text-neutral-100">
        {heading}
        {subtitle ? `: ${subtitle}` : ''}
      </div>
      <div className="text-xs text-neutral-500 mt-0.5">
        {itemLabel
          ? `${chapterCount} ${itemLabel}`
          : `${chapterCount} chapters · ${verseCount.toLocaleString()} verses`}
      </div>
    </button>
  )
}

/** A chapter entry attached to its real sub-book (used only for the `CC`
 * virtual book), carrying the real bookKey needed to actually navigate
 * there — `CC` itself is never passed to the reader pipeline. */
interface LilaChapter extends TocChapter {
  realBookKey: string
}

interface LilaNode {
  bookKey: string
  title: string
  chapters: LilaChapter[]
  totalVerses: number
}

/** Matches v2's `LibraryViewModel.cs` exactly: Śrī Caitanya-caritāmṛta's TOC
 * tab is a 2-level drill-down (3 Līlās → that līlā's chapters), distinct
 * from the sidebar's flat līlā-prefixed list (`MainViewModel.cs`) — those
 * are two different real v2 UI surfaces, not a contradiction. */
function useCcToc(active: boolean) {
  const [lilas, setLilas] = useState<LilaNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoading(true)
    void Promise.all(CC_LILA_BOOK_KEYS.map((bookKey) => getBookToc(bookKey).then((toc) => ({ bookKey, toc })))).then(
      (results) => {
        if (cancelled) return
        const nodes: LilaNode[] = results.map(({ bookKey, toc }) => ({
          bookKey,
          title: CC_LILA_LABELS[bookKey],
          chapters: toc.map((chapter) => ({ ...chapter, realBookKey: bookKey })),
          totalVerses: toc.reduce((sum, c) => sum + c.recordCount, 0),
        }))
        setLilas(nodes)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [active])

  return { lilas, loading }
}

function BookTocView({ bookKey }: { bookKey: string }) {
  const isCc = bookKey === CC_VIRTUAL_BOOK_KEY
  const books = useNavigationStore((s) => s.books)
  const openReaderForChapter = useOpenReaderForChapter()
  const [toc, setToc] = useState<TocChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [openCanto, setOpenCanto] = useState<string | null>(null)
  const [openLila, setOpenLila] = useState<string | null>(null)
  const ccToc = useCcToc(isCc)

  const book = isCc ? null : books.find((b) => b.bookKey === bookKey) ?? null

  useEffect(() => {
    if (isCc) return
    let cancelled = false
    setLoading(true)
    setOpenCanto(null)
    setOpenLila(null)
    void getBookToc(bookKey).then((result) => {
      if (!cancelled) {
        setToc(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [bookKey, isCc])

  const cantoGroups = useMemo(() => {
    const groups = new Map<string, TocChapter[]>()
    let hasCantos = false
    for (const chapter of toc) {
      if (chapter.cantoNumber) hasCantos = true
      const key = chapter.cantoNumber ?? '__none__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(chapter)
    }
    return hasCantos ? groups : null
  }, [toc])

  const handleOpenChapter = (chapter: TocChapter, realBookKey: string, bookTitle: string) => {
    void openReaderForChapter(realBookKey, chapter, bookTitle)
  }

  if (isCc ? ccToc.loading : loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading table of contents…
      </div>
    )
  }

  if (isCc) {
    const openLilaNode = openLila ? ccToc.lilas.find((l) => l.bookKey === openLila) ?? null : null
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-8 py-10">
          {!openLilaNode && (
            <>
              <h1 className="text-2xl font-semibold text-neutral-100 mb-1">Śrī Caitanya-caritāmṛta</h1>
              <p className="text-sm text-neutral-500 mb-8">3 līlās</p>
              <div className="flex flex-col gap-1">
                {ccToc.lilas.map((lila) => (
                  <CantoRow
                    key={lila.bookKey}
                    heading={lila.title}
                    subtitle={CC_LILA_SUBTITLES[lila.bookKey]}
                    chapterCount={lila.chapters.length}
                    verseCount={lila.totalVerses}
                    onOpen={() => setOpenLila(lila.bookKey)}
                  />
                ))}
              </div>
            </>
          )}

          {openLilaNode && (
            <div>
              <button
                type="button"
                onClick={() => setOpenLila(null)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 mb-4"
              >
                <ChevronLeft size={14} /> Back to Līlās
              </button>
              <h2 className="text-lg font-semibold text-neutral-100 mb-1">
                {openLilaNode.title}: {CC_LILA_SUBTITLES[openLilaNode.bookKey]}
              </h2>
              <p className="text-sm text-neutral-500 mb-6">
                {openLilaNode.chapters.length} chapters · {openLilaNode.totalVerses.toLocaleString()} verses
              </p>
              <div className="flex flex-col gap-1">
                {openLilaNode.chapters.map((chapter) => (
                  <ChapterRow
                    key={chapter.chapterKey}
                    chapter={chapter}
                    onOpen={() => handleOpenChapter(chapter, chapter.realBookKey, 'Śrī Caitanya-caritāmṛta')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const isMultiLevel = cantoGroups !== null
  const chaptersInOpenCanto = isMultiLevel && openCanto ? cantoGroups!.get(openCanto) ?? [] : []
  const divisionPrefix = bookKey === 'SVA' ? 'Section' : bookKey === 'BB' ? 'Part' : 'Canto'
  const divisionPlural = bookKey === 'SVA' ? 'sections' : bookKey === 'BB' ? 'parts' : 'cantos'
  const divisionTitles =
    bookKey === 'SVA' ? SVA_SECTION_TITLES : bookKey === 'BB' ? BB_PART_TITLES : SB_CANTO_TITLES

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-semibold text-neutral-100 mb-1">{book?.title ?? bookKey}</h1>
        <p className="text-sm text-neutral-500 mb-8">
          {isMultiLevel
            ? `${[...cantoGroups!.keys()].filter((k) => k !== '__none__').length} ${divisionPlural}`
            : `${toc.length} sections`}
          {book?.author ? ` · ${book.author}` : ''}
        </p>

        {isMultiLevel && !openCanto && (
          <div className="flex flex-col gap-1">
            {/* Front matter (Dedication/Preface/...) has no canto number —
             * it's grouped under the internal '__none__' key, but reads as
             * plain top-level rows here rather than a bogus "Canto" entry. */}
            {(cantoGroups!.get('__none__') ?? []).map((chapter) => (
              <ChapterRow
                key={chapter.chapterKey}
                chapter={chapter}
                onOpen={() => handleOpenChapter(chapter, bookKey, book?.title ?? bookKey)}
              />
            ))}
            {[...cantoGroups!.entries()]
              .filter(([canto]) => canto !== '__none__')
              .map(([canto, chapters]) => (
                <CantoRow
                  key={canto}
                  heading={`${divisionPrefix} ${canto}`}
                  subtitle={divisionTitles[canto]}
                  chapterCount={chapters.length}
                  verseCount={chapters.reduce((sum, c) => sum + c.recordCount, 0)}
                  itemLabel={bookKey === 'SVA' ? 'songs' : undefined}
                  onOpen={() => setOpenCanto(canto)}
                />
              ))}
          </div>
        )}

        {isMultiLevel && openCanto && (
          <div>
            <button
              type="button"
              onClick={() => setOpenCanto(null)}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 mb-4"
            >
              <ChevronLeft size={14} /> Back to {divisionPrefix}s
            </button>
            <h2 className="text-sm font-semibold text-amber-500/80 mb-3">
              {divisionPrefix} {openCanto}
              {divisionTitles[openCanto] ? `: ${divisionTitles[openCanto]}` : ''}
            </h2>
            <div className="flex flex-col gap-1">
              {chaptersInOpenCanto.map((chapter) => (
                <ChapterRow
                  key={chapter.chapterKey}
                  chapter={chapter}
                  onOpen={() => handleOpenChapter(chapter, bookKey, book?.title ?? bookKey)}
                />
              ))}
            </div>
          </div>
        )}

        {!isMultiLevel && (
          <div className="flex flex-col gap-1">
            {toc.map((chapter) => (
              <ChapterRow
                key={chapter.chapterKey}
                chapter={chapter}
                onOpen={() => handleOpenChapter(chapter, bookKey, book?.title ?? bookKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function BookOverviewTab({ tabId }: { tabId: string }) {
  const payload = useTabStore((s) => s.tabs.find((t) => t.id === tabId)?.payload) as TocTabPayload | undefined
  if (!payload?.bookKey) return <LibraryCatalog />
  return <BookTocView bookKey={payload.bookKey} />
}
