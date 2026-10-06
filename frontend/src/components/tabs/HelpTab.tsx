import { useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Search } from 'lucide-react'

export const V2_BASE_SCHEMA_SQL = `-- ============================================================================
-- Bhaktivedanta VedaBase Modern / Prabhupāda Connect v3 — Production Supabase Schema
-- Run this single script in your Supabase project's SQL Editor (SQL Editor -> New Query).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vb_schema_info (
    version INT PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.vb_schema_info ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_schema_info' AND policyname = 'vb_schema_info_read_policy') THEN
        CREATE POLICY vb_schema_info_read_policy ON public.vb_schema_info FOR SELECT USING (true);
    END IF;
END $$;
INSERT INTO public.vb_schema_info (version, updated_at) VALUES (1, NOW())
ON CONFLICT (version) DO UPDATE SET updated_at = EXCLUDED.updated_at;

CREATE TABLE IF NOT EXISTS public.vb_bookmark_collections (
    id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL, device_id TEXT NOT NULL, PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_bookmark_collections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_bookmark_collections' AND policyname = 'collections_owner_policy') THEN
        CREATE POLICY collections_owner_policy ON public.vb_bookmark_collections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_collections_user_updated ON public.vb_bookmark_collections (user_id, updated_at);

CREATE TABLE IF NOT EXISTS public.vb_bookmarks (
    id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL, collection_id TEXT NULL, title TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL, device_id TEXT NOT NULL, PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_bookmarks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_bookmarks' AND policyname = 'bookmarks_owner_policy') THEN
        CREATE POLICY bookmarks_owner_policy ON public.vb_bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_bookmarks_user_updated ON public.vb_bookmarks (user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vb_bookmarks_user_active_verse ON public.vb_bookmarks (user_id, record_key) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.vb_highlights (
    id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL, field TEXT NOT NULL, color TEXT NOT NULL,
    start_offset INT NOT NULL DEFAULT -1, length INT NOT NULL DEFAULT -1, selected_text TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL, device_id TEXT NOT NULL, PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_highlights ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_highlights' AND policyname = 'highlights_owner_policy') THEN
        CREATE POLICY highlights_owner_policy ON public.vb_highlights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_highlights_user_updated ON public.vb_highlights (user_id, updated_at);

CREATE TABLE IF NOT EXISTS public.vb_notes (
    id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NULL, title TEXT NULL, content TEXT NOT NULL, field TEXT NULL,
    start_offset INT NULL, length INT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL, device_id TEXT NOT NULL, PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_notes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_notes' AND policyname = 'notes_owner_policy') THEN
        CREATE POLICY notes_owner_policy ON public.vb_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_notes_user_updated ON public.vb_notes (user_id, updated_at);

-- ============================================================================
-- v3 addition: reading history (v2's schema above has no equivalent table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vb_reading_history (
    id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL, book_title TEXT NOT NULL, verse_ref TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(), device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
ALTER TABLE public.vb_reading_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vb_reading_history' AND policyname = 'reading_history_owner_policy') THEN
        CREATE POLICY reading_history_owner_policy ON public.vb_reading_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_vb_reading_history_user_timestamp ON public.vb_reading_history (user_id, "timestamp");
`

const AI_CONVERSION_PROMPT = `You are a book converter for Prabhupāda Connect VedaBase. Convert the following text into a JSON array of scripture records.

Each record must have these fields:
{
  "BookKey": "MYBOOK",         // Short unique identifier e.g. "TQK", "SSR"
  "RecordKey": "MYBOOK-1",     // Unique key per record: BookKey + sequential number
  "Reference": "MYBOOK 1: Title of Chapter",
  "Title": "Chapter or verse title",
  "Synonyms": null,            // Sanskrit word-for-word if applicable, else null
  "Translation": null,         // English translation if applicable, else null
  "Purport": "Full text of this record"
}

Output ONLY the JSON array. No markdown, no explanation. Begin the array with [ and end with ].`

interface Section {
  id: string
  category: string
  title: string
  body: React.ReactNode
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative mt-2">
      <pre className="text-xs bg-neutral-950 border border-neutral-800 rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto scrollbar-thin whitespace-pre text-neutral-300">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="absolute top-2 right-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono whitespace-nowrap">
        {keys}
      </kbd>
      <span className="text-neutral-400 text-right">{action}</span>
    </div>
  )
}

const CATEGORIES = [
  'Quick Start',
  'Reading View',
  'Split View',
  'Zen Mode',
  'Sanskrit Meters',
  'Advanced Search',
  'Concordance',
  'Notes & Obsidian',
  'Book Import',
  'Supabase Sync',
  'Shortcuts',
  'FAQ',
]

export function HelpTab() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['quick-start', 'reading-view']))

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'quick-start',
        category: 'Quick Start',
        title: '0. Quick Start & Onboarding Guide for New Users',
        body: (
          <div className="space-y-3 text-sm text-neutral-300 leading-relaxed">
            <p className="text-neutral-200 font-medium">
              Welcome to Prabhupāda Connect v3! Everything works 100% offline out-of-the-box with all 55+ original books, letters, and Vaiṣṇava songs bundled locally.
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong className="text-amber-300">Filter Books &amp; Direct Verse Jump (Left Sidebar):</strong> Type any book title or abbreviation in the left sidebar search box (e.g. <code className="text-amber-300">gita</code>, <code className="text-amber-300">bhagavatam</code>, <code className="text-amber-300">jsd</code>) to fuzzy-filter the book list. Prefix with <code className="text-amber-300">@</code> (e.g. <code className="text-amber-300">@bg 2.13</code>, <code className="text-amber-300">@sb 1.1.1</code>, <code className="text-amber-300">@cc adi 1.1</code>) to jump directly to any verse in a new tab!
              </li>
              <li>
                <strong className="text-amber-300">Full-Text Search Studio (🔍 Top-Right or Ctrl+Shift+S):</strong> Click the magnifying glass icon next to the Settings gear in the top-right tab bar (or press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-xs">Ctrl+K</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-xs">Ctrl+Shift+S</kbd>) to search across all translations, purports, synonyms, and songs. Clicking any search result opens that verse in a new tab with matching terms highlighted.
              </li>
              <li>
                <strong className="text-amber-300">Clean Reader Toolbar &amp; Appearance Popover:</strong> Inside any book tab, use the <code className="text-amber-300">T 14px</code> button in the reader header to adjust font size, line spacing, reading width, and toggle Devanāgarī, Transliteration, Synonyms, Translation, Purport, or Chanting Meter badges.
              </li>
              <li>
                <strong className="text-amber-300">Clickable Scriptural Citations &amp; 4-Line Ślokas:</strong> Citations inside purports and chapters (such as <code className="text-amber-300">Bg. 2.13</code>, <code className="text-amber-300">SB 1.2.6</code>, or chapter verse links in <em>Jaladuta Diary</em>) are clickable links that open a preview or jump straight to the verse. Quoted Sanskrit verses are automatically formatted into classical 4-line <em>śloka</em> stanzas.
              </li>
              <li>
                <strong className="text-amber-300">Highlights, Notes &amp; Bookmarks:</strong> Select any text in a verse or purport to pop up the 8-color highlight &amp; note toolbar, or click the <code className="text-amber-300">★</code> / <code className="text-amber-300">✎ Note</code> buttons in the reader header. Access all your study items anytime from the <code className="text-amber-300">⋯</code> menu in the top-right tab bar.
              </li>
              <li>
                <strong className="text-amber-300">8 Custom Themes &amp; Cloud Sync:</strong> Open <strong className="text-neutral-100">Settings (⚙)</strong> to switch between 8 themes (Sacred Gold, Parchment, Sepia, Vrindavan Forest, Midnight Nectar, High Contrast, etc.) or connect your own free Supabase project under <strong className="text-neutral-100">Settings → Cloud Sync</strong>.
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: 'reading-view',
        category: 'Reading View',
        title: '1. Scriptural Reading View & Navigation',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              Each verse shows up to five parts, toggleable in Settings → Reading: Devanāgarī, IAST
              transliteration, word-for-word Synonyms, Translation, and Purport.
            </p>
            <p>Navigate with plain ← / → (or J/K) to step verse-by-verse, or Alt+← / Alt+→ as an alternate binding.</p>
            <p>
              The breadcrumb above the reader (Book › Canto › Chapter › Verse) is fully clickable — each
              segment opens a dropdown to jump anywhere in that level.
            </p>
            <p>Toggle Continuous (scroll through the whole chapter) vs. Focus (one verse at a time) mode from the toolbar.</p>
          </div>
        ),
      },
      {
        id: 'split-view',
        category: 'Split View',
        title: '2. Split-View Comparative Study (Alt+S)',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Alt+S cycles the reader through three states: normal → Parallel Scripture → Realization Notebook → normal.</p>
            <p>
              <strong className="text-neutral-200">Parallel Scripture:</strong> type any reference (e.g. "BG 2.13", "SB
              1.1.1") to load it independently alongside your main reading position, with its own Prev/Next
              to step through that book.
            </p>
            <p>
              <strong className="text-neutral-200">Realization Notebook:</strong> a quick-jot panel for the verse
              you're currently reading — title, quick-tag chips, and a content box. It writes to the same
              note you'd edit via the ✎ Note button, so both stay in sync.
            </p>
          </div>
        ),
      },
      {
        id: 'zen-mode',
        category: 'Zen Mode',
        title: '3. Zen Focus Mode (F11)',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>F11 or Ctrl+Shift+F hides the sidebar and tab bar for distraction-free reading. Press Escape or the floating exit button (top-right) to leave.</p>
            <p>Settings → Reading has a "Start Reading View in Focus Mode" toggle to make every new reader tab open this way by default.</p>
          </div>
        ),
      },
      {
        id: 'meters',
        category: 'Sanskrit Meters',
        title: '4. Classical Sanskrit Prosody & Meter Chanting Guides',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              Every verse with a transliteration is analyzed syllable-by-syllable into laghu (light, ˘) and
              guru (heavy, ¯) weights using real prosodic rules, then matched against known meters:
              Anuṣṭubh (Śloka, 4×8), Triṣṭubh (4×11), Jagatī (4×12), and Payāra (4×14, tolerant of ±1).
            </p>
            <p>
              A badge under the transliteration shows the detected meter and syllable count when "Show
              pronunciation & recitation guide" is on (Settings → Reading). Click "▶ Chant Pulse" to open
              the full per-syllable breakdown with an adjustable-tempo audio metronome (50–90 BPM).
            </p>
          </div>
        ),
      },
      {
        id: 'advanced-search',
        category: 'Advanced Search',
        title: '5. Folio Advanced Search Suite & Operator Reference',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Ctrl+Shift+S (from anywhere) opens the Word Wheel / Advanced Search modal on top of the Search tab.</p>
            <table className="w-full text-xs mt-2 border border-neutral-800">
              <tbody>
                {[
                  ['word1 word2', 'Implicit AND — both terms present'],
                  ['"exact phrase"', 'Adjacent-word phrase match'],
                  ['word*', 'Prefix match'],
                  ['AND / OR / NOT', 'Boolean query mode (Advanced Query tab)'],
                  ['NEAR(a b, N)', 'a and b within N tokens of each other'],
                ].map(([op, desc]) => (
                  <tr key={op} className="border-b border-neutral-800 last:border-0">
                    <td className="px-2 py-1 font-mono text-amber-400">{op}</td>
                    <td className="px-2 py-1 text-neutral-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">
              Diacritic-tolerant matching: typing "krishna" or "sankirtan" also matches "Kṛṣṇa" /
              "saṅkīrtana" — see the FAQ below for exactly how far this goes.
            </p>
          </div>
        ),
      },
      {
        id: 'concordance',
        category: 'Concordance',
        title: '6. Sanskrit Reverse Lexicon & Concordance',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Click any Sanskrit word in a verse's Synonyms line to open the Concordance drawer — every corpus occurrence of that lemma, grouped by book with frequency counts.</p>
            <p>Click a book chip to filter the list to just that book; click any result to jump straight to that verse.</p>
          </div>
        ),
      },
      {
        id: 'notes-obsidian',
        category: 'Notes & Obsidian',
        title: '7. Personal Study: Notes, Wiki-Links, #Tags & Obsidian Export',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Every note can have a title, and its content supports two special tokens:</p>
            <p>
              <code className="text-amber-400">[[BG 18.66]]</code> renders as a clickable gold link that jumps
              straight to that verse.
            </p>
            <p>
              <code className="text-amber-400">#tag-name</code> builds the tag cloud at the top of the Notes tab
              — click a tag to filter.
            </p>
            <p>Export all notes as a single Markdown file, or as an Obsidian-compatible vault (.zip, one .md per note with YAML frontmatter) from the Notes tab toolbar.</p>
          </div>
        ),
      },
      {
        id: 'book-import',
        category: 'Book Import',
        title: '8. Book Import & Universal AI Conversion Prompt',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Settings → Corpus Management lets you import additional books as JSON archives (see the exact schema below) — imported books appear in the Library and are fully searchable alongside the bundled corpus.</p>
            <p>To convert a plain-text or PDF book into the required JSON with an AI assistant, use this prompt:</p>
            <CopyBlock text={AI_CONVERSION_PROMPT} />
          </div>
        ),
      },
      {
        id: 'supabase-sync',
        category: 'Supabase Sync',
        title: '9. Cloud Sync (Zero-Setup Sign In, Sign Up & Auto-Sync)',
        body: (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              Cloud Sync is <strong className="text-emerald-300">pre-configured out of the box</strong> — you do not need to set up any server or paste any API keys!
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open <strong className="text-neutral-100">Settings (⚙) → Cloud Sync</strong>.</li>
              <li>Enter your <strong className="text-neutral-100">Email</strong> and <strong className="text-neutral-100">Password</strong>, then click <strong className="text-amber-300">Create Account (Sign Up)</strong> (first time) or <strong className="text-amber-300">Sign In &amp; Sync</strong>.</li>
              <li>All your bookmarks, 8-color highlights, realization notes, and reading history automatically sync between your local computer and the cloud whenever you make a change or open the app.</li>
            </ol>
            <p className="text-xs text-neutral-500 pt-1">
              For developers hosting their own custom Supabase instance, expand <em>Advanced: Custom Supabase Server Configuration</em> inside Settings → Cloud Sync or copy the complete SQL schema below:
            </p>
            <CopyBlock text={V2_BASE_SCHEMA_SQL} />
          </div>
        ),
      },
      {
        id: 'shortcuts',
        category: 'Shortcuts',
        title: '10. Complete Keyboard Shortcuts Cheatsheet',
        body: (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <ShortcutRow keys="F1" action="Open this User Manual" />
            <ShortcutRow keys="←/→ or J/K" action="Previous / next verse" />
            <ShortcutRow keys="Alt+←/→" action="Previous / next verse (alternate)" />
            <ShortcutRow keys="Ctrl+=/-/0" action="Zoom reader text in/out/reset (also Ctrl+Wheel)" />
            <ShortcutRow keys="F11 / Ctrl+Shift+F" action="Toggle Zen mode" />
            <ShortcutRow keys="Alt+S" action="Cycle Split View (off → Parallel → Notebook)" />
            <ShortcutRow keys="Ctrl+Shift+S" action="Open Advanced Search / Word Wheel" />
            <ShortcutRow keys="Ctrl+Shift+L" action="Toggle light / dark theme" />
            <ShortcutRow keys="Ctrl+Shift+B" action="Toggle bookmark on current verse" />
            <ShortcutRow keys="Ctrl+F" action="In-page find (reader) / focus sidebar search" />
            <ShortcutRow keys="F3 / Shift+F3" action="Next / previous search hit (after opening from Search)" />
            <ShortcutRow keys="Ctrl+H" action="Reading History tab" />
            <ShortcutRow keys="Ctrl+B" action="Bookmarks tab" />
            <ShortcutRow keys="Ctrl+K" action="Quick search popup" />
            <ShortcutRow keys="Ctrl+T / Ctrl+W" action="New Library tab / close active tab" />
            <ShortcutRow keys="Ctrl+Tab / Ctrl+Shift+Tab" action="Cycle tabs" />
            <ShortcutRow keys="Escape" action="Close find bar / dismiss search hits / exit Zen" />
          </div>
        ),
      },
      {
        id: 'faq',
        category: 'FAQ',
        title: '11. FAQ & Troubleshooting',
        body: (
          <div className="space-y-3 text-sm text-neutral-300">
            <div>
              <p className="font-semibold text-neutral-200">Are full Bhaktivedanta purports included in Focus mode?</p>
              <p>Yes — Focus mode only changes layout (one verse at a time vs. continuous scroll), not which fields are shown.</p>
            </div>
            <div>
              <p className="font-semibold text-neutral-200">How do automatic backups work?</p>
              <p>A backup of your personal data (bookmarks, notes, highlights, history) is created on every app launch, keeping the last 7. Restore any of them from Settings → Data &amp; Backup.</p>
            </div>
            <div>
              <p className="font-semibold text-neutral-200">Does the app work completely offline?</p>
              <p>Yes — the entire scripture corpus is bundled locally. Only Cloud Sync (optional) needs an internet connection.</p>
            </div>
            <div>
              <p className="font-semibold text-neutral-200">Exactly how diacritic-tolerant is search?</p>
              <p>
                The corpus index folds Unicode diacritics (so "krsna" and "kṛṣṇa" already match identically),
                and search additionally tries the popular English spelling variant of each word (e.g.
                "krishna" → also tries "krsna"), so it finds the same results either way.
              </p>
            </div>
          </div>
        ),
      },
    ],
    [],
  )

  const filtered = sections.filter((s) => {
    if (activeCategory && s.category !== activeCategory) return false
    if (!query.trim()) return true
    return s.title.toLowerCase().includes(query.toLowerCase())
  })

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-neutral-100">Prabhupāda Connect User Manual &amp; Research Guide</h1>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setOpenSections(new Set(sections.map((s) => s.id)))}
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={() => setOpenSections(new Set())}
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
          >
            Collapse All
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manual (e.g. meter, folio, split view, sync)…"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-2 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1 mb-6">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 text-xs px-2 py-1 rounded-full ${
              activeCategory === null ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c === activeCategory ? null : c)}
              className={`shrink-0 text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                activeCategory === c ? 'bg-amber-500/20 text-amber-300' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {filtered.map((s) => {
            const open = openSections.has(s.id)
            return (
              <div key={s.id} className="rounded-lg border border-neutral-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(s.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left bg-neutral-900/40 hover:bg-neutral-900"
                >
                  <span className="text-sm font-semibold text-neutral-100">{s.title}</span>
                  <ChevronDown size={15} className={`text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && <div className="px-4 py-4 border-t border-neutral-800">{s.body}</div>}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-sm text-neutral-600 px-1 py-4">No sections match your search.</p>}
        </div>
      </div>
    </div>
  )
}
