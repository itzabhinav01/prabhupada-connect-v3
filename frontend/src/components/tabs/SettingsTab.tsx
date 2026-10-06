import { getTauriVersion, getVersion } from '@tauri-apps/api/app'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import {
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  Sliders,
  SunMedium,
  ToggleLeft,
  Trash2,
} from 'lucide-react'

import {
  addBookToFolder,
  createBookFolder,
  createSnapshot,
  deleteBookFolder,
  exportBackup,
  getBackupsDir,
  importBackup,
  importBookJson,
  importBookPdf,
  listBackups,
  listImportedBooks,
  listSnapshots,
  removeBookFromFolder,
  removeImportedBook,
  renameBookFolder,
  reorderBookFolders,
  restoreSnapshot,
  type BackupFileInfo,
  type ImportedBook,
} from '../../services/api'
import { checkForUpdate, type UpdateInfo } from '../../services/updateChecker'
import { importV2Backup, readV2BackupFile } from '../../services/vdbbackupImport'
import {
  buildDiagnostics,
  getCurrentUser,
  getDeviceId,
  resetPasswordWithOtp,
  sendPasswordResetEmail,
  signIn,
  signOut,
  signUp,
  syncNow,
  testConnection,
  updatePassword,
  type SupabaseCredentials,
  type SyncResult,
} from '../../services/supabaseSync'
import { V2_BASE_SCHEMA_SQL } from './HelpTab'
import { useHighlightPaletteStore } from '../../stores/useHighlightPaletteStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useStudyStore } from '../../stores/useStudyStore'
import { useSyncSettingsStore } from '../../stores/useSyncSettingsStore'
import { useTabStore } from '../../stores/useTabStore'
import {
  LINE_SPACING_VALUES,
  type LineSpacing,
  READING_WIDTH_PX,
  type ReadingWidth,
  useReaderStore,
} from '../../stores/useReaderStore'
import { THEMES, type CustomPalette, useThemeStore } from '../../stores/useThemeStore'

type SettingsCategory =
  | 'appearance'
  | 'reading'
  | 'brightness'
  | 'toggles'
  | 'highlights'
  | 'backup'
  | 'sync'
  | 'corpus'
  | 'updates'

const CATEGORIES: { value: SettingsCategory; label: string; icon: typeof Palette }[] = [
  { value: 'appearance', label: 'Appearance & Theming', icon: Palette },
  { value: 'reading', label: 'Reading Preferences', icon: Sliders },
  { value: 'brightness', label: 'Text Brightness', icon: SunMedium },
  { value: 'toggles', label: 'Verse Content Toggles', icon: ToggleLeft },
  { value: 'highlights', label: 'Highlighting Colours', icon: Palette },
  { value: 'backup', label: 'Data & Backup', icon: Database },
  { value: 'sync', label: 'Cloud Sync', icon: Cloud },
  { value: 'corpus', label: 'Corpus & Books', icon: Folder },
  { value: 'updates', label: 'App Updates', icon: RefreshCw },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-neutral-100 mb-4">{children}</h2>
}

// --- 1. Appearance & Theming --------------------------------------------------

const PALETTE_SLOTS: { key: keyof CustomPalette; label: string }[] = [
  { key: 'canvas', label: 'Canvas Background' },
  { key: 'surface', label: 'Cards & Surfaces' },
  { key: 'navPane', label: 'Nav Pane' },
  { key: 'textPrimary', label: 'Primary Text' },
  { key: 'textSecondary', label: 'Secondary Text' },
  { key: 'accent', label: 'Accent (Saffron/Gold)' },
  { key: 'border', label: 'Borders & Dividers' },
]

function AppearanceSection() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const customPalette = useThemeStore((s) => s.customPalette)
  const setCustomPaletteColor = useThemeStore((s) => s.setCustomPaletteColor)
  const copyPaletteFromPreset = useThemeStore((s) => s.copyPaletteFromPreset)

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                theme === t.value ? 'border-amber-500/60' : 'border-neutral-800 hover:border-neutral-700'
              }`}
              style={{ backgroundColor: t.preview.bg }}
            >
              {theme === t.value && (
                <span className="absolute top-2 right-2 text-amber-500">
                  <Check size={14} />
                </span>
              )}
              <span className="text-sm font-medium" style={{ color: t.preview.text }}>
                {t.label}
              </span>
              <span className="text-xs" style={{ color: t.preview.accent }}>
                Aa Kṛṣṇa
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTheme('custom')}
            className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
              theme === 'custom' ? 'border-amber-500/60' : 'border-neutral-800 hover:border-neutral-700'
            }`}
            style={{ backgroundColor: customPalette.canvas }}
          >
            {theme === 'custom' && (
              <span className="absolute top-2 right-2 text-amber-500">
                <Check size={14} />
              </span>
            )}
            <span className="text-sm font-medium" style={{ color: customPalette.textPrimary }}>
              Custom
            </span>
            <span className="text-xs" style={{ color: customPalette.accent }}>
              Aa Kṛṣṇa
            </span>
          </button>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Palette Designer</h3>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => copyPaletteFromPreset(preset.value)}
                className="px-2 py-1 rounded-md text-[11px] text-neutral-400 border border-neutral-800 hover:bg-neutral-900 hover:text-neutral-200"
              >
                Copy {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {PALETTE_SLOTS.map((slot) => (
            <div key={slot.key} className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2">
              <input
                type="color"
                value={customPalette[slot.key]}
                onChange={(e) => setCustomPaletteColor(slot.key, e.target.value)}
                className="w-8 h-8 rounded border-none bg-transparent cursor-pointer shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-neutral-300 truncate">{slot.label}</div>
                <input
                  value={customPalette[slot.key]}
                  onChange={(e) => setCustomPaletteColor(slot.key, e.target.value)}
                  className="w-full bg-transparent text-[11px] text-neutral-500 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="rounded-lg border p-4"
          style={{ backgroundColor: customPalette.surface, borderColor: customPalette.border }}
        >
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: customPalette.accent }}>
            Live Preview
          </div>
          <div className="text-sm mb-1" style={{ color: customPalette.textPrimary }}>
            sañjaya uvāca
          </div>
          <div className="text-xs" style={{ color: customPalette.textSecondary }}>
            taṁ tathā kṛpayāviṣṭam — Sañjaya said: seeing Arjuna full of compassion…
          </div>
        </div>
      </section>
    </div>
  )
}

// --- 2. Reading Preferences ----------------------------------------------------

const FONT_SIZE_PRESETS = [
  { label: 'Small', value: 14 },
  { label: 'Medium', value: 17 },
  { label: 'Large', value: 20 },
  { label: 'Extra Large', value: 24 },
]
const WIDTH_OPTIONS: { value: ReadingWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'wide', label: 'Wide' },
]
const SPACING_OPTIONS: { value: LineSpacing; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
]

function ReadingPreferencesSection() {
  const fontSize = useReaderStore((s) => s.fontSize)
  const increaseFontSize = useReaderStore((s) => s.increaseFontSize)
  const decreaseFontSize = useReaderStore((s) => s.decreaseFontSize)
  const readingWidth = useReaderStore((s) => s.readingWidth)
  const setReadingWidth = useReaderStore((s) => s.setReadingWidth)
  const lineSpacing = useReaderStore((s) => s.lineSpacing)
  const setLineSpacing = useReaderStore((s) => s.setLineSpacing)

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Font size</h3>
        <div className="flex items-center gap-2 mb-3">
          {FONT_SIZE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const diff = p.value - fontSize
                const steps = Math.round(diff / 2)
                for (let i = 0; i < Math.abs(steps); i++) (steps > 0 ? increaseFontSize : decreaseFontSize)()
              }}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                fontSize === p.value
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              {p.label} · {p.value}px
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={decreaseFontSize} className="p-1.5 rounded-md border border-neutral-800 text-neutral-300 hover:bg-neutral-900">
            <Minus size={14} />
          </button>
          <span className="text-sm text-neutral-300 w-12 text-center tabular-nums">{fontSize}px</span>
          <button type="button" onClick={increaseFontSize} className="p-1.5 rounded-md border border-neutral-800 text-neutral-300 hover:bg-neutral-900">
            <Plus size={14} />
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Reading width</h3>
        <div className="flex items-center gap-2">
          {WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setReadingWidth(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                readingWidth === opt.value
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              {opt.label} · {READING_WIDTH_PX[opt.value]}px
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Line spacing</h3>
        <div className="flex items-center gap-2">
          {SPACING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLineSpacing(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                lineSpacing === opt.value
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              {opt.label} · {LINE_SPACING_VALUES[opt.value]}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

// --- 3. Text Brightness --------------------------------------------------------

const BRIGHTNESS_PRESETS = [
  { label: 'Crisp White', value: 100 },
  { label: 'Soft White', value: 85 },
  { label: 'Muted Grey', value: 70 },
  { label: 'Subdued Grey', value: 55 },
]

function BrightnessSection() {
  const textBrightness = useThemeStore((s) => s.textBrightness)
  const setTextBrightness = useThemeStore((s) => s.setTextBrightness)

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Contrast presets</h3>
        <div className="grid grid-cols-2 gap-2">
          {BRIGHTNESS_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setTextBrightness(p.value)}
              className={`px-3 py-2 rounded-md text-xs border transition-colors ${
                textBrightness === p.value
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-neutral-800 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              {p.label} · {p.value}%
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Fine-tune (50–100%)</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={100}
            value={textBrightness}
            onChange={(e) => setTextBrightness(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-neutral-500 w-10 text-right tabular-nums">{textBrightness}%</span>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-800 p-4" style={{ backgroundColor: 'var(--t-900)' }}>
        <div className="text-[10px] uppercase tracking-wide text-amber-500/80 mb-2">Live sample</div>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          Material compassion, lamentation and tears are all signs of ignorance of the real self.
        </p>
      </section>
    </div>
  )
}

// --- 4. Verse Content Toggles ----------------------------------------------------

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between py-2.5 border-b border-neutral-900 last:border-b-0 cursor-pointer">
      <span className="text-sm text-neutral-300">{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-amber-500 w-4 h-4" />
    </label>
  )
}

function ContentTogglesSection() {
  const readingMode = useNavigationStore((s) => s.readingMode)
  const setReadingMode = useNavigationStore((s) => s.setReadingMode)
  const focusModeDefault = useReaderStore((s) => s.focusModeDefault)
  const setFocusModeDefault = useReaderStore((s) => s.setFocusModeDefault)
  const showTransliteration = useReaderStore((s) => s.showTransliteration)
  const toggleTransliteration = useReaderStore((s) => s.toggleTransliteration)
  const showSynonyms = useReaderStore((s) => s.showSynonyms)
  const toggleSynonyms = useReaderStore((s) => s.toggleSynonyms)
  const showPurport = useReaderStore((s) => s.showPurport)
  const togglePurport = useReaderStore((s) => s.togglePurport)
  const showPronunciationGuide = useReaderStore((s) => s.showPronunciationGuide)
  const togglePronunciationGuide = useReaderStore((s) => s.togglePronunciationGuide)
  const showBacklinks = useReaderStore((s) => s.showBacklinks)
  const toggleBacklinks = useReaderStore((s) => s.toggleBacklinks)

  return (
    <div>
      <ToggleRow
        label="Start Reading View in Focus Mode"
        checked={focusModeDefault}
        onChange={() => {
          const next = !focusModeDefault
          setFocusModeDefault(next)
          if (next) setReadingMode('focus')
        }}
      />
      <ToggleRow label="Show Transliteration" checked={showTransliteration} onChange={toggleTransliteration} />
      <ToggleRow label="Show Synonyms" checked={showSynonyms} onChange={toggleSynonyms} />
      <ToggleRow label="Show Purport" checked={showPurport} onChange={togglePurport} />
      <ToggleRow
        label="Show Pronunciation & Recitation Guide (Sanskrit Meter)"
        checked={showPronunciationGuide}
        onChange={togglePronunciationGuide}
      />
      <ToggleRow
        label="Show Referencing Notes in Reader (Backlinks)"
        checked={showBacklinks}
        onChange={toggleBacklinks}
      />
      <p className="text-xs text-neutral-600 mt-3">Current reading mode: {readingMode}</p>
    </div>
  )
}

// --- 5. Highlighting Colours Manager ------------------------------------------

function HighlightManagerSection() {
  const palette = useHighlightPaletteStore((s) => s.palette)
  const addColor = useHighlightPaletteStore((s) => s.addColor)
  const removeColor = useHighlightPaletteStore((s) => s.removeColor)
  const updateColor = useHighlightPaletteStore((s) => s.updateColor)
  const resetPalette = useHighlightPaletteStore((s) => s.resetPalette)
  const [newHex, setNewHex] = useState('#fca5a5')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Palette</h3>
        <button
          type="button"
          onClick={resetPalette}
          className="text-[11px] text-neutral-500 hover:text-neutral-300 underline decoration-dotted"
        >
          Reset Palette
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {palette.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2">
            <input
              type="color"
              value={c.hex}
              onChange={(e) => updateColor(c.id, { hex: e.target.value })}
              className="w-7 h-7 rounded border-none bg-transparent cursor-pointer shrink-0"
            />
            <input
              value={c.label}
              onChange={(e) => updateColor(c.id, { label: e.target.value })}
              className="flex-1 bg-transparent text-sm text-neutral-200 focus:outline-none"
            />
            <span className="text-xs text-neutral-600 tabular-nums">{c.hex}</span>
            <span className="w-6 h-6 rounded-full border border-black/20 shrink-0" style={{ backgroundColor: c.hex }} />
            <button
              type="button"
              onClick={() => removeColor(c.id)}
              className="p-1.5 text-neutral-600 hover:text-red-400 shrink-0"
              title="Delete colour"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={newHex}
          onChange={(e) => setNewHex(e.target.value)}
          className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
        />
        <button
          type="button"
          onClick={() => addColor(newHex)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
        >
          <Plus size={13} /> Add colour
        </button>
      </div>
    </div>
  )
}

// --- 6. Data & Backup ----------------------------------------------------------

function DataBackupSection() {
  const [backups, setBackups] = useState<BackupFileInfo[]>([])
  const [snapshots, setSnapshots] = useState<BackupFileInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = () => void listBackups().then(setBackups).catch(() => setBackups([]))
  const refreshSnapshots = () => void listSnapshots().then(setSnapshots).catch(() => setSnapshots([]))
  useEffect(refresh, [])
  useEffect(refreshSnapshots, [])

  const refreshActiveUserData = async () => {
    const study = useStudyStore.getState()
    const activeHighlightVerses = Object.keys(study.highlightsByVerse)
    const activeNoteVerses = Object.keys(study.notesByVerse)
    await Promise.all([
      study.loadBookmarks(),
      study.loadAllHighlights(),
      study.loadAllNotes(),
      study.loadHistory(),
      useNavigationStore.getState().loadFolders(),
      ...activeHighlightVerses.map((v) => study.loadHighlightsForVerse(v)),
      ...activeNoteVerses.map((v) => study.loadNotesForVerse(v)),
    ])
  }

  const runRestoreSnapshot = async (filename: string) => {
    if (!window.confirm(`Restore "${filename}"? This overwrites your current bookmarks, notes, highlights, and history.`)) {
      return
    }
    setBusy(true)
    try {
      await restoreSnapshot(filename)
      await refreshActiveUserData()
      setMessage(`Restored ${filename} — active bookmarks, notes, highlights & history reloaded.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runExport = async () => {
    setBusy(true)
    try {
      const path = await exportBackup()
      setMessage(`Exported to ${path}`)
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (filename: string, mode: 'merge' | 'replace') => {
    setBusy(true)
    try {
      const summary = await importBackup(filename, mode)
      await refreshActiveUserData()
      setMessage(summary)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runSnapshot = async () => {
    setBusy(true)
    try {
      const path = await createSnapshot()
      setMessage(`Snapshot saved to ${path}`)
      refreshSnapshots()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const [v2BackupPath, setV2BackupPath] = useState('')
  const [v2ImportStatus, setV2ImportStatus] = useState<string | null>(null)
  const [v2Importing, setV2Importing] = useState(false)

  const [backupDir, setBackupDir] = useState<string | null>(null)

  useEffect(() => {
    void getBackupsDir().then(setBackupDir).catch(() => {})
  }, [])

  const runPickAndImportV3 = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        title: 'Select Prabhupāda Connect Backup File (.json)',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      })
      if (!selected || typeof selected !== 'string') return
      setBusy(true)
      const mode: 'merge' | 'replace' = window.confirm(
        'Click OK to Merge with your existing data, or Cancel to Cancel this action.',
      )
        ? 'merge'
        : 'merge'
      const summary = await importBackup(selected, mode)
      await refreshActiveUserData()
      setMessage(`Imported ${selected}: ${summary}`)
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runPickAndImportV2 = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        title: 'Select VedaBase v2 Backup Archive (.vdbbackup or .json)',
        filters: [
          { name: 'VedaBase v2 Backup', extensions: ['vdbbackup', 'json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (!selected || typeof selected !== 'string') return
      setV2BackupPath(selected)
      setV2Importing(true)
      setV2ImportStatus('Importing…')
      const payload = await readV2BackupFile(selected)
      const result = await importV2Backup(payload)
      await refreshActiveUserData()
      const parts = [
        `${result.importedBookmarks} bookmarks`,
        `${result.importedHighlights} highlights`,
        `${result.importedNotes} notes`,
        `${result.importedHistory} history entries`,
      ]
      let status = `Successfully imported: ${parts.join(', ')}.`
      if (result.errors.length > 0) {
        status += ` (${result.errors.length} failed — check console)`
        console.warn('[v2 backup import] errors:', result.errors)
      }
      setV2ImportStatus(status)
      refresh()
    } catch (e) {
      setV2ImportStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setV2Importing(false)
    }
  }

  const handleOpenFolder = async (dirPath: string | null) => {
    if (!dirPath) return
    try {
      await openPath(dirPath)
    } catch (e) {
      setMessage(`Could not open folder: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runExport()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50 font-medium"
          >
            Export Backup Archive (.json)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSnapshot()}
            className="px-3 py-2 rounded-md text-sm text-neutral-300 border border-neutral-800 hover:bg-neutral-900 disabled:opacity-50"
          >
            Create Safety Snapshot (.db)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runPickAndImportV3()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-neutral-200 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
          >
            <FolderOpen size={14} className="text-amber-400" />
            Import Backup File…
          </button>
        </div>

        {backupDir && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 pt-1">
            <span className="text-neutral-500">Backup folder:</span>
            <code className="text-[11px] text-neutral-300 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 truncate max-w-md">
              {backupDir}
            </code>
            <button
              type="button"
              onClick={() => void handleOpenFolder(backupDir)}
              className="text-xs text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-medium"
            >
              <FolderOpen size={12} /> Open in Explorer
            </button>
          </div>
        )}
      </section>

      {message && (
        <div className="text-xs text-amber-300/90 bg-neutral-900 border border-amber-500/30 rounded-md px-3.5 py-2.5 break-all flex items-center justify-between gap-2">
          <span>{message}</span>
          {message.startsWith('Exported to') && backupDir && (
            <button
              type="button"
              onClick={() => void handleOpenFolder(backupDir)}
              className="shrink-0 text-amber-400 underline hover:text-amber-300"
            >
              Show in Folder
            </button>
          )}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Available Local Backups ({backups.length})
          </h3>
          {backupDir && (
            <button
              type="button"
              onClick={() => void handleOpenFolder(backupDir)}
              className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
            >
              <FolderOpen size={12} /> Open Backups Directory
            </button>
          )}
        </div>
        {backups.length === 0 && <p className="text-sm text-neutral-600">No backups found yet — export one above.</p>}
        <div className="flex flex-col gap-1.5">
          {backups.map((b) => (
            <div key={b.filename} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-3 py-2 bg-neutral-900/30">
              <div className="min-w-0">
                <div className="text-xs text-neutral-200 font-mono truncate">{b.filename}</div>
                <div className="text-[11px] text-neutral-500">
                  {new Date(b.modifiedAt).toLocaleString()} · {(b.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runImport(b.filename, 'merge')}
                  className="px-2.5 py-1 rounded-md text-[11px] text-neutral-200 border border-neutral-700 hover:bg-neutral-800"
                  title="Merge items with your existing database"
                >
                  Merge
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runImport(b.filename, 'replace')}
                  className="px-2.5 py-1 rounded-md text-[11px] text-red-400 border border-red-900/40 hover:bg-red-950/40"
                  title="Clear existing database and replace with this backup"
                >
                  Replace All
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">Automatic Safety Snapshots</h3>
        <p className="text-xs text-neutral-500 mb-3">
          A raw database snapshot is created automatically on every application launch. The last 7 snapshots are kept intact.
        </p>
        {snapshots.length === 0 && <p className="text-sm text-neutral-600">No automatic backups yet — one is made on the next launch.</p>}
        <div className="flex flex-col">
          {snapshots.map((s) => (
            <div key={s.filename} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
              <div className="min-w-0">
                <div className="text-xs text-neutral-300 font-mono truncate">{s.filename}</div>
                <div className="text-[11px] text-neutral-500">
                  {new Date(s.modifiedAt).toLocaleString()} · {(s.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRestoreSnapshot(s.filename)}
                className="shrink-0 text-xs text-amber-400 hover:text-amber-300 hover:underline disabled:opacity-50 font-medium"
              >
                Restore Snapshot
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400/90 mb-1">
          Import from Prabhupāda Connect v2
        </h3>
        <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
          Restore bookmarks, 8-color highlights, notes, and reading history from a v2 <code>.vdbbackup</code> file (or plain <code>.json</code> export).
          This merges safely into your existing data without overwriting your current work.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={v2Importing}
            onClick={() => void runPickAndImportV2()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50"
          >
            <FolderOpen size={14} /> Browse &amp; Select v2 Backup File…
          </button>
          {v2BackupPath && (
            <span className="text-xs text-neutral-400 font-mono truncate max-w-sm">
              {v2BackupPath}
            </span>
          )}
        </div>
        {v2ImportStatus && <p className="text-xs text-emerald-400 font-medium mt-2.5 break-all">{v2ImportStatus}</p>}
      </section>
    </div>
  )
}

// --- 7. App Updates --------------------------------------------------------

type UpdateCheckStatus = 'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error'

function UpdatesSection() {
  const [appVersion, setAppVersion] = useState('')
  const [status, setStatus] = useState<UpdateCheckStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => setAppVersion('—'))
  }, [])

  const handleCheck = async () => {
    setStatus('checking')
    const info = await checkForUpdate(appVersion || (await getVersion()))
    if (!info) {
      setStatus('error')
      return
    }
    setUpdateInfo(info)
    setStatus(info.isNewer ? 'updateAvailable' : 'upToDate')
  }

  return (
    <section className="rounded-lg border border-neutral-800 p-4 bg-neutral-900/40">
      <p className="text-sm text-neutral-400 mb-4">
        Current version: <span className="font-mono text-neutral-200">v{appVersion || '…'}</span>
      </p>
      <button
        type="button"
        onClick={() => void handleCheck()}
        disabled={status === 'checking'}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
      >
        {status === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {status === 'checking' ? 'Checking…' : 'Check for Updates'}
      </button>

      {status === 'upToDate' && (
        <p className="mt-3 text-sm text-green-400 flex items-center gap-2">
          <CheckCircle size={14} /> You&apos;re on the latest version.
        </p>
      )}

      {status === 'updateAvailable' && updateInfo && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-300 mb-1">v{updateInfo.latestVersion} is available</p>
          <p className="text-xs text-neutral-400 mb-3">Released {new Date(updateInfo.publishedAt).toLocaleDateString()}</p>
          <button
            type="button"
            onClick={() => void openUrl(updateInfo.releaseUrl)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
          >
            <ExternalLink size={12} /> Download from GitHub
          </button>
        </div>
      )}

      {status === 'error' && (
        <p className="mt-3 text-sm text-neutral-500">Could not reach GitHub. Check your internet connection.</p>
      )}
    </section>
  )
}

// --- 8. Cloud Sync (Supabase) --------------------------------------------------

const SYNC_INTERVAL_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'Manual only' },
  { minutes: 15, label: 'Every 15 min' },
  { minutes: 30, label: 'Every 30 min' },
  { minutes: 60, label: 'Every 1 hour' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 1440, label: 'Daily' },
]

function CloudSyncSection() {
  const url = useSyncSettingsStore((s) => s.url)
  const setUrl = useSyncSettingsStore((s) => s.setUrl)
  const anonKey = useSyncSettingsStore((s) => s.anonKey)
  const setAnonKey = useSyncSettingsStore((s) => s.setAnonKey)
  const intervalMinutes = useSyncSettingsStore((s) => s.intervalMinutes)
  const setIntervalMinutes = useSyncSettingsStore((s) => s.setIntervalMinutes)
  const resetToDefaultProject = useSyncSettingsStore((s) => s.resetToDefaultProject)
  const credentials = useSyncSettingsStore((s) => s.credentials)
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot_step1' | 'forgot_step2'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changePasswordVal, setChangePasswordVal] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [showAdvancedServer, setShowAdvancedServer] = useState(false)

  useEffect(() => {
    void getDeviceId().then(setDeviceId)
  }, [])

  const creds: SupabaseCredentials | null = credentials()

  useEffect(() => {
    const activeCreds = credentials()
    if (!activeCreds) {
      setUserEmail(null)
      return
    }
    void getCurrentUser(activeCreds).then((user) => {
      setUserEmail(user?.email ?? null)
    })
  }, [url, anonKey, credentials])

  const formatSyncError = (e: unknown): string => {
    const raw = e instanceof Error ? e.message : String(e)
    if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network error')) {
      return `Network connection error: Unable to reach the server at ${creds?.url || 'Supabase'}. Please verify your internet connection.`
    }
    return raw
  }

  const runImmediateSync = async (activeCreds: SupabaseCredentials, prefixMsg?: string) => {
    const { pull, push } = await syncNow(activeCreds)
    setLastResult(push)
    const errors = [...pull.errors, ...push.errors]
    const summary = `Pulled ${pull.pulledHighlights} highlights, ${pull.pulledNotes} notes, ${pull.pulledBookmarks} bookmarks; pushed ${push.pushedHighlights} highlights, ${push.pushedNotes} notes, ${push.pushedBookmarks} bookmarks.`
    setStatus(
      errors.length > 0
        ? `${prefixMsg ? `${prefixMsg} — ` : ''}Synced with warnings: ${errors.join('; ')}`
        : `${prefixMsg ? `${prefixMsg} — ` : ''}Cloud & Local in sync! ${summary}`,
    )
  }

  const handleTest = async () => {
    if (!creds) return
    setBusy(true)
    const result = await testConnection(creds)
    setStatus(result.message)
    setBusy(false)
  }

  const handleCopySqlSchema = () => {
    void navigator.clipboard.writeText(V2_BASE_SCHEMA_SQL)
    setStatus('Complete Supabase SQL schema copied to clipboard!')
  }

  const handleResetDefaultServer = async () => {
    if (creds) {
      try {
        await signOut(creds)
      } catch {
        // ignore
      }
    }
    setUserEmail(null)
    resetToDefaultProject()
    setStatus('Restored default Prabhupāda Connect Cloud Server.')
  }

  const handleSignIn = async () => {
    if (!creds || !email.trim() || !password) return
    setBusy(true)
    setStatus('Signing in and syncing your highlights, notes & bookmarks…')
    try {
      const user = await signIn(creds, email.trim(), password)
      setUserEmail(user?.email ?? null)
      await runImmediateSync(creds, 'Signed in')
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSignUp = async () => {
    if (!creds || !email.trim() || !password) return
    setBusy(true)
    setStatus('Creating your cloud account…')
    try {
      const { user, session } = await signUp(creds, email.trim(), password)
      if (session && user) {
        setUserEmail(user.email ?? email.trim())
        await runImmediateSync(creds, 'Account created & signed in')
      } else {
        setStatus('Account created! Check your email for a confirmation link, or click Sign In if confirmation is disabled.')
      }
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  // Step 1: Send recovery code (matching v2 SendPasswordResetEmailAsync)
  const handleSendRecoveryCode = async () => {
    if (!creds || !email.trim()) {
      setStatus('Please enter your email address.')
      return
    }
    setBusy(true)
    setStatus(`Sending password reset instructions to ${email.trim()}…`)
    try {
      await sendPasswordResetEmail(creds, email.trim())
      setAuthMode('forgot_step2')
      setStatus(`Verification email sent! Check your inbox (or spam) at ${email.trim()} for the 6-digit code or reset link, then enter it below.`)
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  // Step 2: Verify OTP and set new password (matching v2 ResetPasswordWithOtpAsync)
  const handleResetPasswordWithOtp = async () => {
    if (!creds || !email.trim()) {
      setStatus('Please enter your email address.')
      return
    }
    if (!otpCode.trim()) {
      setStatus('Please enter or paste the recovery link (or 6-digit code) from your email.')
      return
    }
    if (newPassword.length < 6) {
      setStatus('New password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setStatus('New password and confirmation do not match.')
      return
    }
    setBusy(true)
    setStatus('Verifying recovery link/code and setting your new password…')
    try {
      const user = await resetPasswordWithOtp(creds, email.trim(), otpCode.trim(), newPassword)
      setUserEmail(user?.email ?? email.trim())
      setPassword('')
      setOtpCode('')
      setNewPassword('')
      setConfirmNewPassword('')
      setAuthMode('signin')
      await runImmediateSync(creds, 'Password successfully reset! You are now logged in')
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  // Change password while logged in
  const handleChangePassword = async () => {
    if (!creds) return
    if (changePasswordVal.length < 6) {
      setStatus('New password must be at least 6 characters long.')
      return
    }
    if (changePasswordVal !== changePasswordConfirm) {
      setStatus('New password and confirmation do not match.')
      return
    }
    setBusy(true)
    setStatus('Updating your password…')
    try {
      await updatePassword(creds, changePasswordVal)
      setShowChangePassword(false)
      setChangePasswordVal('')
      setChangePasswordConfirm('')
      setStatus('Password successfully updated!')
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    if (!creds) return
    await signOut(creds)
    setUserEmail(null)
    setShowChangePassword(false)
    setStatus('Signed out. Your local highlights, notes, and bookmarks remain safely on this device.')
  }

  const handleSyncNow = async () => {
    if (!creds) return
    setBusy(true)
    setStatus('Syncing highlights, notes, bookmarks & history…')
    try {
      await runImmediateSync(creds)
    } catch (e) {
      setStatus(formatSyncError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleExportDiagnostics = () => {
    const diagnostics = buildDiagnostics(creds, lastResult)
    void navigator.clipboard.writeText(diagnostics)
    setStatus('Diagnostics copied to clipboard.')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="text-xs font-semibold text-emerald-300">
              Prabhupāda Connect Cloud Ready
            </div>
            <div className="text-[11px] text-neutral-400">
              Highlights, notes, bookmarks &amp; reading history sync automatically across Cloud &amp; Local (3-day free-tier keep-alive active).
            </div>
          </div>
        </div>
      </div>

      {!userEmail ? (
        <section className="rounded-lg border border-neutral-800 p-5 bg-neutral-900/40">
          {authMode === 'forgot_step1' ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-amber-300">Reset Password (Step 1 of 2)</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin')
                    setStatus(null)
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  ← Back to Sign In
                </button>
              </div>
              <p className="text-xs text-neutral-400 mb-4">
                Forgot your password? Enter your email address below and we will send a 6-digit recovery code to your inbox:
              </p>
              <div className="flex flex-col gap-2.5 max-w-md">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.trim() && !busy) {
                      void handleSendRecoveryCode()
                    }
                  }}
                  placeholder="Email address"
                  type="email"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!creds || !email.trim() || busy}
                    onClick={() => void handleSendRecoveryCode()}
                    className="px-4 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {busy ? 'Sending Code…' : 'Send 6-Digit Recovery Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : authMode === 'forgot_step2' ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-amber-300">Set New Password (Step 2 of 2)</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin')
                    setStatus(null)
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  ← Back to Sign In
                </button>
              </div>
              <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
                Supabase sent a password reset email to <strong className="text-neutral-200">{email}</strong>.
                <br />
                <span className="text-amber-300 font-medium">Tip:</span> Right-click the reset link in your email &rarr; <strong className="text-neutral-200">Copy link address</strong>, and paste it directly into the box below (or enter your 6-digit code):
              </p>
              <div className="flex flex-col gap-2.5 max-w-md">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Paste email reset link or enter 6-digit code"
                  type="text"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-amber-300 placeholder:text-neutral-600 font-mono focus:outline-none focus:border-amber-500/50"
                />
                {otpCode.trim().startsWith('http') && (
                  <p className="text-[11px] text-emerald-400 font-medium -mt-1">
                    ✓ Reset link detected. Choose your new password below and click Set New Password.
                  </p>
                )}
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min. 6 characters)"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && otpCode.trim() && newPassword && confirmNewPassword && !busy) {
                      void handleResetPasswordWithOtp()
                    }
                  }}
                  placeholder="Confirm new password"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!creds || !email.trim() || !otpCode.trim() || !newPassword || !confirmNewPassword || busy}
                    onClick={() => void handleResetPasswordWithOtp()}
                    className="px-4 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {busy ? 'Setting Password…' : 'Set New Password & Sign In'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSendRecoveryCode()}
                    className="px-3 py-2 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : authMode === 'signup' ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-neutral-100">Create a Cloud Account</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin')
                    setStatus(null)
                  }}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Already have an account? Sign In
                </button>
              </div>
              <p className="text-xs text-neutral-400 mb-4">
                Choose an email and password to sync your bookmarks, highlights, and realization notes across devices:
              </p>
              <div className="flex flex-col gap-2.5 max-w-md">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.trim() && password && !busy) {
                      void handleSignUp()
                    }
                  }}
                  placeholder="Password (min. 6 characters)"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!creds || !email.trim() || !password || busy}
                    onClick={() => void handleSignUp()}
                    className="px-4 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {busy ? 'Creating Account…' : 'Create Account (Sign Up)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot_step1')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-neutral-100">Sign In to Your Cloud Account</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup')
                    setStatus(null)
                  }}
                  className="text-xs text-amber-400 hover:underline"
                >
                  New user? Create Account
                </button>
              </div>
              <p className="text-xs text-neutral-400 mb-4">
                Enter your email and password below to sync your bookmarks, 8-color highlights, and realization notes between this computer and the cloud.
              </p>
              <div className="flex flex-col gap-2.5 max-w-md">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && email.trim() && password && !busy) {
                      void handleSignIn()
                    }
                  }}
                  placeholder="Password"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!creds || !email.trim() || !password || busy}
                    onClick={() => void handleSignIn()}
                    className="px-4 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {busy ? 'Working…' : 'Sign In & Sync'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-300 border border-neutral-700 hover:bg-neutral-800"
                  >
                    Create Account (Sign Up)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot_step1')
                      setStatus(null)
                    }}
                    className="px-3 py-2 rounded-md text-xs text-neutral-300 border border-neutral-700 hover:bg-neutral-800"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-neutral-800 p-5 bg-neutral-900/40">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-0.5">Signed In &amp; Syncing</h3>
              <p className="text-sm font-medium text-neutral-100">{userEmail}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Device ID: {deviceId}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSyncNow()}
              className="px-4 py-2 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
            >
              {busy ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 mb-3">
            Any highlight, note, or bookmark you create or edit is automatically synced between local storage and cloud.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChangePassword((v) => !v)}
              className="px-3 py-1.5 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
            >
              Change Password
            </button>
            <button
              type="button"
              onClick={handleExportDiagnostics}
              className="px-3 py-1.5 rounded-md text-xs text-neutral-300 border border-neutral-800 hover:bg-neutral-900"
            >
              Copy Sync Diagnostics
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="px-3 py-1.5 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
            >
              Sign Out
            </button>
          </div>

          {showChangePassword && (
            <div className="mt-4 p-4 rounded-md border border-neutral-800 bg-neutral-950/60 max-w-md">
              <h4 className="text-xs font-semibold text-neutral-200 mb-2">Change Your Password</h4>
              <div className="flex flex-col gap-2">
                <input
                  value={changePasswordVal}
                  onChange={(e) => setChangePasswordVal(e.target.value)}
                  placeholder="New password (min. 6 characters)"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  type="password"
                  className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy || !changePasswordVal || !changePasswordConfirm}
                    onClick={() => void handleChangePassword()}
                    className="px-3 py-1.5 rounded-md text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    Save New Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(false)}
                    className="px-3 py-1.5 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {lastResult && (
            <p className="text-xs text-neutral-500 mt-3">
              Last push: {lastResult.pushedHighlights} highlights, {lastResult.pushedNotes} notes, {lastResult.pushedBookmarks}{' '}
              bookmarks, {lastResult.pushedHistory} history entries.
            </p>
          )}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-neutral-800">
            <span className="text-xs text-neutral-400">Background auto-sync frequency</span>
            <select
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm text-neutral-300 focus:outline-none focus:border-amber-500/50"
            >
              {SYNC_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {status && (
        <div className="text-xs text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-md px-3.5 py-2.5">
          {status}
        </div>
      )}

      <section className="rounded-lg border border-neutral-800/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedServer((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-neutral-500 hover:text-neutral-300 bg-neutral-900/30 hover:bg-neutral-900/60"
        >
          <span>Advanced: Custom Supabase Server Configuration (Optional)</span>
          {showAdvancedServer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showAdvancedServer && (
          <div className="p-4 border-t border-neutral-800 flex flex-col gap-2.5 bg-neutral-950/40">
            <p className="text-xs text-neutral-500 leading-relaxed">
              The official Prabhupāda Connect Supabase cloud server is already pre-configured out of the box. Only change these fields if you are a developer connecting a custom self-hosted Supabase project.
            </p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Project URL (https://xxxx.supabase.co)"
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
            <input
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="Anon public key (eyJ...)"
              type="password"
              className="bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!creds || busy}
                onClick={() => void handleTest()}
                className="px-3 py-1.5 rounded-md text-xs text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-40"
              >
                Test Server Connection
              </button>
              <button
                type="button"
                onClick={() => void handleResetDefaultServer()}
                className="px-3 py-1.5 rounded-md text-xs text-neutral-300 border border-neutral-800 hover:bg-neutral-900"
              >
                Reset to Built-In Cloud Server
              </button>
              <button
                type="button"
                onClick={handleCopySqlSchema}
                className="px-3 py-1.5 rounded-md text-xs text-neutral-400 border border-neutral-800 hover:bg-neutral-900"
              >
                Copy SQL Schema
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// --- 8. Corpus & Book Management ------------------------------------------------

function CorpusManagementSection() {
  const [newFolderName, setNewFolderName] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [tauriVersion, setTauriVersion] = useState('')
  const [importedBooks, setImportedBooks] = useState<ImportedBook[]>([])
  const [importPath, setImportPath] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [pdfPath, setPdfPath] = useState('')
  const [pdfTitle, setPdfTitle] = useState('')
  const [pdfAuthor, setPdfAuthor] = useState('')
  const [pdfImporting, setPdfImporting] = useState(false)
  const [pdfStatus, setPdfStatus] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const books = useNavigationStore((s) => s.books)
  const loadBooks = useNavigationStore((s) => s.loadBooks)
  const folders = useNavigationStore((s) => s.folders)
  const loadFolders = useNavigationStore((s) => s.loadFolders)
  const openPdfTab = useTabStore((s) => s.openPdfTab)

  const refresh = () => void loadFolders()
  const refreshImported = () => void listImportedBooks().then(setImportedBooks).catch(() => setImportedBooks([]))

  useEffect(() => {
    refresh()
    refreshImported()
    if (books.length === 0) void loadBooks()
    void getVersion().then(setAppVersion).catch(() => setAppVersion('—'))
    void getTauriVersion().then(setTauriVersion).catch(() => setTauriVersion('—'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runImportJson = async () => {
    if (!importPath.trim()) return
    setImporting(true)
    setImportStatus(null)
    try {
      const result = await importBookJson(importPath.trim())
      setImportStatus(`Imported "${result.title}" (${result.recordCount} records).`)
      setImportPath('')
      refreshImported()
      void loadBooks()
    } catch (e) {
      setImportStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  // Matches v2's `ImportPdfDialog.xaml.cs` (lines 48-52): typing/pasting a
  // path auto-fills Title from the filename stem, but only while the user
  // hasn't typed their own title yet.
  const handlePdfPathChange = (value: string) => {
    setPdfPath(value)
    if (pdfTitle.trim()) return
    const stem = value.split(/[/\\]/).pop()?.replace(/\.pdf$/i, '') ?? ''
    if (stem) setPdfTitle(stem.replace(/[_-]+/g, ' ').trim())
  }

  const runImportPdf = async () => {
    if (!pdfPath.trim() || !pdfTitle.trim()) return
    setPdfImporting(true)
    setPdfStatus(null)
    try {
      const result = await importBookPdf(pdfPath.trim(), pdfTitle.trim(), pdfAuthor.trim() || undefined)
      setPdfStatus(`Imported "${result.title}".`)
      setPdfPath('')
      setPdfTitle('')
      setPdfAuthor('')
      refreshImported()
      void loadBooks()
    } catch (e) {
      setPdfStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfImporting(false)
    }
  }

  const runRemoveImported = async (bookKey: string) => {
    if (confirmingRemove !== bookKey) {
      setConfirmingRemove(bookKey)
      return
    }
    setConfirmingRemove(null)
    await removeImportedBook(bookKey)
    refreshImported()
    void loadBooks()
  }

  const totalRecords = books.reduce((sum, b) => sum + b.totalRecords, 0)

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Custom Folders</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g. Japa Books, Daily Reading…"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="button"
            onClick={() => {
              if (!newFolderName.trim()) return
              void createBookFolder(newFolderName.trim()).then(() => {
                setNewFolderName('')
                refresh()
              })
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
          >
            <Plus size={13} /> New Folder
          </button>
        </div>

        {folders.length === 0 && <p className="text-sm text-neutral-600">No custom folders yet.</p>}
        <div className="flex flex-col gap-2">
          {folders.map((f, i) => (
            <div key={f.id} className="rounded-md border border-neutral-800 px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <input
                  defaultValue={f.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== f.name) {
                      void renameBookFolder(f.id, e.target.value.trim()).then(refresh)
                    }
                  }}
                  className="bg-transparent text-sm text-neutral-200 focus:outline-none"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => {
                      const ids = folders.map((x) => x.id)
                      ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                      void reorderBookFolders(ids).then(refresh)
                    }}
                    className="p-1 text-neutral-600 hover:text-neutral-300 disabled:opacity-30"
                    title="Move up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={i === folders.length - 1}
                    onClick={() => {
                      const ids = folders.map((x) => x.id)
                      ;[ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]
                      void reorderBookFolders(ids).then(refresh)
                    }}
                    className="p-1 text-neutral-600 hover:text-neutral-300 disabled:opacity-30"
                    title="Move down"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteBookFolder(f.id).then(refresh)}
                    className="p-1 text-neutral-600 hover:text-red-400"
                    title="Delete folder"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {f.bookKeys.length === 0 && <span className="text-[11px] text-neutral-600">Empty</span>}
                {f.bookKeys.map((bk) => (
                  <span
                    key={bk}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400"
                  >
                    {bk}
                    <button
                      type="button"
                      onClick={() => void removeBookFromFolder(f.id, bk).then(refresh)}
                      className="hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void addBookToFolder(f.id, e.target.value).then(refresh)
                  }}
                  className="bg-neutral-900 border border-neutral-800 rounded text-[10px] text-neutral-400 px-1.5 py-0.5"
                >
                  <option value="">+ Add book…</option>
                  {books
                    .filter((b) => !f.bookKeys.includes(b.bookKey))
                    .map((b) => (
                      <option key={b.bookKey} value={b.bookKey}>
                        {b.title ?? b.bookKey}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Import Additional Books</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Import a book as a JSON archive (see the User Manual's Book Import section for the exact schema and an
          AI conversion prompt). Imported books appear in the Library and are searchable via the Search tab's
          book filter.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="Select a .json book archive or enter path…"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const selected = await openFileDialog({
                  multiple: false,
                  directory: false,
                  title: 'Select Book JSON Archive',
                  filters: [{ name: 'JSON Book', extensions: ['json'] }],
                })
                if (selected && typeof selected === 'string') {
                  setImportPath(selected)
                }
              } catch (e) {
                console.error(e)
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-neutral-300 border border-neutral-700 hover:bg-neutral-800"
            title="Browse your computer for a JSON book file"
          >
            <FolderOpen size={13} /> Browse…
          </button>
          <button
            type="button"
            disabled={importing || !importPath.trim()}
            onClick={() => void runImportJson()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50 whitespace-nowrap font-medium"
          >
            <Plus size={13} /> Import JSON Book
          </button>
        </div>
        {importStatus && <p className="text-xs text-neutral-400 mb-3">{importStatus}</p>}

        <div className="border-t border-neutral-800 pt-3 mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">PDF Book Import</h4>
          <p className="text-xs text-neutral-500 mb-2">
            A PDF scan has no verses to parse — it's added as a single entry that opens in your system PDF viewer.
          </p>
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex gap-2">
              <input
                value={pdfPath}
                onChange={(e) => handlePdfPathChange(e.target.value)}
                placeholder="Select a .pdf document or enter path…"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const selected = await openFileDialog({
                      multiple: false,
                      directory: false,
                      title: 'Select PDF Document',
                      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
                    })
                    if (selected && typeof selected === 'string') {
                      handlePdfPathChange(selected)
                    }
                  } catch (e) {
                    console.error(e)
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-neutral-300 border border-neutral-700 hover:bg-neutral-800"
                title="Browse your computer for a PDF file"
              >
                <FolderOpen size={13} /> Browse…
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
                placeholder="Book Title"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
              <input
                value={pdfAuthor}
                onChange={(e) => setPdfAuthor(e.target.value)}
                placeholder="Śrīla Prabhupāda"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={pdfImporting || !pdfPath.trim() || !pdfTitle.trim()}
            onClick={() => void runImportPdf()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50 whitespace-nowrap font-medium"
          >
            <FileText size={13} /> Import PDF Book
          </button>
          {pdfStatus && <p className="text-xs text-neutral-400 mt-2">{pdfStatus}</p>}
        </div>

        {importedBooks.length === 0 && <p className="text-sm text-neutral-600">No imported books yet.</p>}
        <div className="flex flex-col gap-1.5">
          {importedBooks.map((b) => (
            <div key={b.bookKey} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-semibold text-neutral-200 truncate">{b.title}</div>
                  {b.isPdf && (
                    <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400">
                      <FileText size={10} /> PDF
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">{b.bookKey} · {b.recordCount} records</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {b.isPdf && b.pdfPath && (
                  <button
                    type="button"
                    onClick={() => openPdfTab(b.title, b.pdfPath!)}
                    className="text-xs text-neutral-400 hover:text-neutral-200"
                  >
                    Open
                  </button>
                )}
                {confirmingRemove === b.bookKey ? (
                  <>
                    <span className="text-xs text-neutral-500">Remove?</span>
                    <button
                      type="button"
                      onClick={() => void runRemoveImported(b.bookKey)}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(null)}
                      className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runRemoveImported(b.bookKey)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-semibold text-neutral-100 mb-1">Prabhupāda Connect v3</h3>
        <p className="text-xs text-neutral-500 leading-relaxed">
          App version {appVersion || '…'} · Tauri {tauriVersion || '…'}
          <br />
          Corpus: {books.length || '—'} books, {totalRecords ? totalRecords.toLocaleString() : '—'} scripture records
        </p>
      </section>
    </div>
  )
}

// --- Container -----------------------------------------------------------------

export function SettingsTab() {
  const [category, setCategory] = useState<SettingsCategory>('appearance')
  const openHelpTab = useTabStore((s) => s.openHelpTab)

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto scrollbar-thin py-3">
        {CATEGORIES.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                category === c.value
                  ? 'bg-amber-500/10 text-amber-300 border-r-2 border-amber-500'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{c.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between p-4 mb-6 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <BookOpen size={15} /> Documentation &amp; User Manual
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Learn Zen Focus mode, Split View, Sanskrit chanting guides, Folio Advanced Search, Notes
                sync, and the full keyboard shortcuts reference.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openHelpTab()}
              className="text-sm px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 whitespace-nowrap"
            >
              Open User Manual (F1)
            </button>
          </div>
          <SectionHeading>{CATEGORIES.find((c) => c.value === category)?.label}</SectionHeading>
          {category === 'appearance' && <AppearanceSection />}
          {category === 'reading' && <ReadingPreferencesSection />}
          {category === 'brightness' && <BrightnessSection />}
          {category === 'toggles' && <ContentTogglesSection />}
          {category === 'highlights' && <HighlightManagerSection />}
          {category === 'backup' && <DataBackupSection />}
          {category === 'sync' && <CloudSyncSection />}
          {category === 'corpus' && <CorpusManagementSection />}
          {category === 'updates' && <UpdatesSection />}
        </div>
      </div>
    </div>
  )
}
