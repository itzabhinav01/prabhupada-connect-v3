# Prabhupāda Connect v3 (Bhaktivedanta VedaBase Modern)

A fast, offline-first desktop scripture study and research application for the complete works of **His Divine Grace A.C. Bhaktivedanta Swami Prabhupāda** and the Gauḍīya Vaiṣṇava ācāryas. Built with **Tauri v2 (Rust + SQLite FTS5)** and **React 19 + TypeScript + Tailwind CSS v4**, with optional **Supabase Cloud Sync** for cross-device bookmarks, 8-color highlights, realization notes, and reading history.

---

## ✨ Key Features

- **Complete Bundled Offline Corpus (`database/prabhupada_corpus.db`)**:
  - **Major Scriptures**: *Bhagavad-gītā As It Is*, *Śrīmad-Bhāgavatam* (Cantos 1–12), *Śrī Caitanya-caritāmṛta* (*Ādi*, *Madhya*, and *Antya-līlā*), *Śrī Īśopaniṣad*, *The Nectar of Devotion*, *The Nectar of Instruction*, and *Teachings of Lord Caitanya*.
  - **50+ Small Books & Compilations**: Including *The Science of Self-Realization*, *Journey of Self-Discovery*, *The Search for Liberation*, *Coming Back: The Science of Reincarnation*, *Kṛṣṇa, the Supreme Personality of Godhead*, *Rāja-vidyā*, *Perfect Questions, Perfect Answers*, *Jaladuta Diary*, and more.
  - **Archival Correspondence & Songs**: 6,000+ historical letters (1947–1977) and the complete **Songs of the Vaiṣṇava Ācāryas** (*More Songs of the Vaiṣṇava Ācāryas*, *Śaraṇāgati*, *Gītāvalī*, *Kalyāṇa-kalpataru*) rendered stanza-by-stanza with word-for-word synonyms and translations.
- **Clutter-Free, Customizable Reader**:
  - Classical **4-line *śloka* (*pāda*) stanza formatting** for both main verses and Sanskrit verses quoted inside purports.
  - **Interactive Scriptural Citations**: Automatic detection and linking of inline citations (e.g., `Bg. 2.13`, `SB 1.2.6`, `CC Madhya 8.128`, or chapter-level references in *Jaladuta Diary*) with hover/click preview popovers and 1-click navigation.
  - **Single-Line Reader Toolbar & Appearance Popover (`T 14px`)**: Instant adjustment of font size, line spacing, reading width, Continuous vs. Focus reading mode, and independent toggles for Devanāgarī, IAST Transliteration, Synonyms, Translation, Purport, and Sanskrit Meter guides.
  - **Split-View Comparative Study (`Alt+S`)**: Read two scriptures side-by-side (**Parallel Scripture**) or write realizations beside the active verse (**Realization Notebook**).
  - **Classical Sanskrit Prosody & Chanting Pulse**: Automatic *laghu/guru* syllable weight analysis for *Anuṣṭubh*, *Triṣṭubh*, *Jagatī*, and *Payāra* meters with an adjustable BPM audio metronome.
- **Dual Search Architecture**:
  - **Left-Sidebar Fuzzy Book Filter & `@` Direct Verse Jump**: Filter the book tree by title/abbreviation (`gita`, `bhagavatam`, `jsd`, `coming back`) or prefix with `@` (`@bg 2.13`, `@sb 1.1.1`, `@cc adi 1.1`) to jump straight to any verse in a new tab.
  - **Folio Full-Text Search Studio (`🔍` / `Ctrl+Shift+S` / `Ctrl+K`)**: Powered by SQLite FTS5 with Unicode diacritic folding and popular spelling expansion (`krishna` ↔ `kṛṣṇa`, `sankirtan` ↔ `saṅkīrtana`), boolean operators (`AND`, `OR`, `NOT`, `NEAR`), phrase matching, prefix wildcards, and a live Word Wheel dictionary. Every clicked result opens in a **new reader tab** with search hits highlighted (`F3` / `Shift+F3`).
- **Personal Research & Study Suite**:
  - **8-Color Text Highlighting** with customizable hex palettes.
  - **Rich Study Notes** supporting `[[BG 18.66]]` wiki-links, `#tags`, standalone or verse-attached notes, Markdown export, and **Obsidian Vault (`.zip`)** export.
  - **Bookmark Collections**, **Custom Book Folders**, **JSON & PDF Book Import**, and **Automatic Rolling Local Backups** (plus `.vdbbackup` v2 import).
- **8 Built-in Themes + Custom Theme Builder**:
  - *Dark (Sacred Gold)*, *OLED Pure Black*, *Light (Parchment)*, *Sepia (Manuscript)*, *Sandalwood*, *Vrindavan Forest*, *Midnight Nectar*, and *Custom Palette*.
- **Built-in Interactive User Guide (`?` / `F1`)**:
  - Accessible anytime from the top-right `?` icon, the bottom of the left sidebar, the Library home banner, or by pressing `F1`.

---

## 🏗️ Tech Stack & Architecture

```text
prabhupada-connect-v3/
├── database/
│   ├── prabhupada_corpus.db      # Read-only SQLite + FTS5 scripture corpus
│   └── supabase_schema_v3.sql    # Self-contained PostgreSQL + RLS schema for Supabase Cloud Sync
├── frontend/                     # React 19 + TypeScript + Vite 8 + Tailwind CSS v4
│   ├── .env.example              # Optional build-time defaults for Supabase URL & Anon Key
│   └── src/
│       ├── components/
│       │   ├── layout/           # AppLayout, Header, Sidebar, ReaderMoreMenu, bookGroups
│       │   ├── library/          # BookOverviewTab (Library home & multi-level Canto/Līlā TOC)
│       │   ├── reader/           # ReaderCanvas, VerseView, PurportView, CitationLink, SplitView
│       │   ├── search/           # SearchModal (Ctrl+K), AdvancedSearchModal (Word Wheel)
│       │   ├── study/            # SelectionToolbar, NotesDrawer, ConcordanceDrawer
│       │   └── tabs/             # TabBar, SearchTab, NotesTab, BookmarksTab, HelpTab, SettingsTab
│       ├── services/             # Typed Tauri IPC wrappers (api.ts), supabaseSync.ts, directReference.ts
│       ├── stores/               # Zustand stores (tabs, navigation, reader, theme, study, sync)
│       └── utils/                # Sanskrit prosody/meters, citation parser, 4-line śloka formatter
└── src-tauri/                    # Tauri v2 Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── lib.rs                # App initialization, window state, Tauri command registration
        ├── commands/             # IPC handlers: corpus.rs, search.rs, user_data.rs
        └── db/                   # SQLite connections: corpus.rs (read-only) & user_store.rs (read-write)
```

### Dual-Database Design
1. **Read-Only Scripture Corpus (`database/prabhupada_corpus.db`)**:
   - Bundled with the application and opened in read-only mode by `src-tauri/src/db/corpus.rs`.
   - Contains `Books`, `Chapters`, `Records`, `BookDivisions`, `CrossReferences`, `SanskritLexicon`, and the `RecordsFts` FTS5 virtual table.
2. **Read-Write User Store (`user_data.db` in OS AppData)**:
   - Managed automatically by `src-tauri/src/db/user_store.rs` in the platform's local application data folder (`%APPDATA%\com.prabhupadaconnect.v3\`).
   - Stores bookmarks, bookmark collections, 8-color highlights, study notes, reading history, custom book folders, imported books, and automatic rolling startup snapshots.

---

## 🚀 Getting Started for Developers

### 1. Prerequisites
- **Node.js** `>= 20.x` and `npm`
- **Rust Toolchain** (`rustup`, `cargo` `>= 1.77.2`)
- **Platform Build Dependencies** (for Tauri v2):
  - **Windows**: Microsoft Visual Studio C++ Build Tools & WebView2 Runtime (pre-installed on Windows 10/11).
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  - **Linux**: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.
- **Git LFS** (`git lfs install`) — used to pull the `database/prabhupada_corpus.db` SQLite database (`~249 MB`).

### 2. Clone the Repository
```bash
git lfs install
git clone https://github.com/itzabhinav01/prabhupada-connect-v3.git
cd prabhupada-connect-v3
git lfs pull
```

> **Note on `database/prabhupada_corpus.db`**: Make sure `database/prabhupada_corpus.db` is ~249 MB (not a 130-byte Git LFS pointer file). Running `git lfs pull` downloads the full SQLite corpus database.

### 3. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 4. Run in Development Mode
From the `src-tauri` directory (or via Tauri CLI):
```bash
# Terminal 1: Start the Vite dev server on http://localhost:5173
cd frontend
npm run dev

# Terminal 2: Launch the Tauri desktop shell
cd ../src-tauri
cargo run
```

### 5. Build Optimized Production Release
```bash
# 1. Build the frontend bundle into frontend/dist
cd frontend
npm run build

# 2. Compile the standalone release binary with embedded assets
cd ../src-tauri
cargo build --release --features tauri/custom-protocol
```
The compiled executable will be located at:
- **Windows**: `src-tauri/target/release/prabhupadaconnectv3.exe`
- **macOS / Linux**: `src-tauri/target/release/prabhupadaconnectv3`

---

## ☁️ Connecting to a New Supabase Project (Step-by-Step)

Prabhupāda Connect v3 is 100% self-hostable with any free **Supabase** account. You can connect or switch Supabase projects at any time without rebuilding the app, or set default credentials via `frontend/.env`.

### Step 1: Create a New Supabase Project
1. Sign in at [https://supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Choose an organization, give your project a name (e.g., `prabhupada-connect-sync`), set a database password, pick a region close to you, and click **Create new project**.

### Step 2: Run the Database Schema SQL
1. Once your project finishes provisioning, open **SQL Editor** in the left sidebar of your Supabase Dashboard and click **New query**.
2. Open [`database/supabase_schema_v3.sql`](./database/supabase_schema_v3.sql) from this repository (or click **Copy Complete SQL Schema** directly inside the app under **Settings → Cloud Sync** or **User Guide → 9. Supabase Cloud Sync Setup Guide**).
3. Paste the entire SQL script into the Supabase SQL Editor and click **Run** (`Ctrl+Enter`).
4. Verify it returns `Success. No rows returned`. This creates all 6 tables (`vb_schema_info`, `vb_bookmark_collections`, `vb_bookmarks`, `vb_highlights`, `vb_notes`, `vb_reading_history`) with Row-Level Security (`auth.uid() = user_id`) enabled so every user can only read/write their own data.

### Step 3: Configure Authentication (Optional Recommended Tweak)
1. In your Supabase Dashboard, go to **Authentication → Providers → Email**.
2. Ensure **Enable Email provider** is turned **ON**.
3. *(Optional for instant sign-up without email verification)*: Toggle **Confirm email** to **OFF** if you want new accounts to sign in immediately without clicking a confirmation link first.

### Step 4: Get Your Project URL & Anon Public Key
1. In your Supabase Dashboard, go to **Project Settings (⚙) → API** (or **Data API**).
2. Copy two values:
   - **Project URL**: `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`
   - **Project API Keys → `anon` `public`**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` *(Never use the `service_role` secret key in the client app)*.

### Step 5: Connect Inside Prabhupāda Connect v3
You have two ways to supply these credentials:

#### Option A: Directly Inside the Running App (No Rebuild Needed)
1. Open Prabhupāda Connect v3 and click **Settings (⚙) → Cloud Sync**.
2. *(If switching from an older project)* Click **Switch / Clear Project**.
3. Paste your **Project URL** and **Anon public key**.
4. Click **Test Connection** — you should see `Connected (schema v1)`.
5. Enter your email & password and click **Sign Up** (first time on the new project) or **Sign In**, then click **Sync Now**!

#### Option B: Pre-Configure Default Credentials for Developers (`frontend/.env`)
If you are building the app for distribution and want your Supabase project pre-filled by default:
1. Copy `frontend/.env.example` to `frontend/.env`:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
2. Fill in your values in `frontend/.env`:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. Rebuild the frontend (`npm run build`) and Tauri binary.

---

## ⌨️ Essential Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `F1` | Open the built-in interactive **User Guide & Manual** |
| `←` / `→` or `J` / `K` | Previous / Next verse in the reader |
| `Ctrl + K` | Quick Search popup |
| `Ctrl + Shift + S` | Open Full Search Studio & Word Wheel |
| `Ctrl + F` | In-page Find (in reader) or focus left-sidebar book/verse filter |
| `F3` / `Shift + F3` | Jump to Next / Previous search hit in the reader |
| `Alt + S` | Cycle Split View (`Off` → `Parallel Scripture` → `Realization Notebook`) |
| `F11` / `Ctrl + Shift + F` | Toggle distraction-free **Zen Focus Mode** |
| `Ctrl + Shift + B` | Toggle Bookmark on current verse |
| `Ctrl + Shift + L` | Cycle through the 8 visual themes |
| `Ctrl + =` / `-` / `0` | Zoom reader typography in / out / reset |
| `Ctrl + T` / `Ctrl + W` | Open new Library tab / Close active tab |

---

## 📜 License & Acknowledgments

Dedicated to **His Divine Grace A.C. Bhaktivedanta Swami Prabhupāda**, Founder-Ācārya of the International Society for Krishna Consciousness (ISKCON). All scriptural texts and purports are copyright © The Bhaktivedanta Book Trust International, Inc. All rights reserved.
