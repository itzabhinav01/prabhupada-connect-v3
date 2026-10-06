import type { Book } from '../../types/scripture'

export interface BookGroup {
  label: string
  books: Book[]
}

/** Ports v2's `MainViewModel.cs` (lines 86–116) exactly: Caitanya-caritāmṛta
 * is presented as ONE book (`CC`) in the sidebar/catalog, not three. This
 * `CC` book is synthetic — it has no row in `Books` — so any code that
 * receives it back (the TOC tab) must special-case `bookKey === 'CC'`
 * rather than treating it as a real corpus book. */
export const CC_VIRTUAL_BOOK_KEY = 'CC'
export const CC_LILA_BOOK_KEYS = ['DI', 'MADHYA', 'ANTYA'] as const
export const CC_LILA_LABELS: Record<string, string> = {
  DI: 'Ādi-līlā',
  MADHYA: 'Madhya-līlā',
  ANTYA: 'Antya-līlā',
}

function buildVirtualCcBook(lilaBooks: Book[]): Book {
  const first = lilaBooks[0]
  return {
    bookKey: CC_VIRTUAL_BOOK_KEY,
    abbreviation: 'CC',
    edition: first?.edition ?? null,
    title: 'Śrī Caitanya-caritāmṛta',
    category: first?.category ?? null,
    corpusId: null,
    author: first?.author ?? null,
    canonicalOrder: Math.min(...lilaBooks.map((b) => b.canonicalOrder)),
    totalRecords: lilaBooks.reduce((sum, b) => sum + b.totalRecords, 0),
    isPdf: false,
    pdfPath: null,
  }
}

/**
 * The corpus's own `Category` column is a long tail of one-off labels
 * ("Foundational Book", "Dialogue", "Anthology", "Essays & Articles", ...)
 * that don't make a presentable sidebar on their own. This curates them into
 * the five canonical sections requested for the UI, while still deriving
 * membership from the real `bookKey`/`category` data rather than a
 * hardcoded book list.
 */
export function groupBooksByCategory(books: Book[]): BookGroup[] {
  const byKey = new Map(books.map((b) => [b.bookKey, b]))
  const used = new Set<string>()

  const take = (keys: string[]): Book[] => {
    const found: Book[] = []
    for (const k of keys) {
      const b = byKey.get(k)
      if (b) {
        found.push(b)
        used.add(k)
      }
    }
    return found
  }

  const groups: BookGroup[] = []

  const gita = take(['BG'])
  if (gita.length) groups.push({ label: 'Bhagavad-gītā As It Is', books: gita })

  const bhagavatam = take(['SB'])
  if (bhagavatam.length) groups.push({ label: 'Śrīmad-Bhāgavatam', books: bhagavatam })

  const caitanyaLilas = take([...CC_LILA_BOOK_KEYS])
  if (caitanyaLilas.length) {
    groups.push({ label: 'Śrī Caitanya-caritāmṛta', books: [buildVirtualCcBook(caitanyaLilas)] })
  }

  const philosophicalCategories = new Set([
    'Core Summary Study',
    'Shorter Scripture',
    'Scripture',
    'Philosophy',
  ])
  const philosophical = books
    .filter((b) => !used.has(b.bookKey) && philosophicalCategories.has(b.category ?? ''))
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
  philosophical.forEach((b) => used.add(b.bookKey))
  if (philosophical.length) {
    groups.push({ label: 'Major Philosophical Works', books: philosophical })
  }

  const remaining = books
    .filter((b) => !used.has(b.bookKey))
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
  if (remaining.length) {
    groups.push({ label: 'Conversations, Letters & Lectures', books: remaining })
  }

  return groups
}

export function filterBooksByQuery(books: Book[], query: string): Book[] {
  const q = query.trim().toLowerCase()
  if (!q) return books
  return books.filter(
    (b) =>
      b.title?.toLowerCase().includes(q) ||
      b.abbreviation.toLowerCase().includes(q) ||
      b.bookKey.toLowerCase().includes(q),
  )
}
