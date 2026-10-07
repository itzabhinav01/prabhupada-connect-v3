# 📖 Prabhupāda Connect v3 — Comprehensive User Manual & Study Guide

Welcome to the official User Manual for **Prabhupāda Connect v3** (*Bhaktivedanta VedaBase Modern*). This guide walks you through every capability of the application, from everyday reading and chanting to in-depth research, Sanskrit meter recitation, note-taking, and cloud synchronization across multiple computers.

---

## Table of Contents
1. [Overview & Highlights](#1-overview--highlights)
2. [Installation & First Launch](#2-installation--first-launch)
3. [Library & Navigation](#3-library--navigation)
4. [Scriptural Reading View & Typography](#4-scriptural-reading-view--typography)
   - [Native Document Flow (Zero Text Collision)](#native-document-flow-zero-text-collision)
   - [Visible Layers & Translation Toggle (Recitation Mode)](#visible-layers--translation-toggle-recitation-mode)
   - [Dialogue Speaker Highlighting](#dialogue-speaker-highlighting)
   - [Clean Scripture Hierarchy & Headings](#clean-scripture-hierarchy--headings)
   - [Clickable Citations & 4-Line Śloka Stanzas](#clickable-citations--4-line-śloka-stanzas)
5. [Search Studio & In-Page Find](#5-search-studio--in-page-find)
   - [Quick Search (`Ctrl + K`)](#quick-search-ctrl--k)
   - [Advanced Search Studio & Word Wheel (`Ctrl + Shift + S`)](#advanced-search-studio--word-wheel-ctrl--shift--s)
   - [Search Match Auto-Scroll & Highlighting](#search-match-auto-scroll--highlighting)
   - [In-Page Find (`Ctrl + F`)](#in-page-find-ctrl--f)
6. [Sanskrit Prosody, Meters & Chanting Pulse](#6-sanskrit-prosody-meters--chanting-pulse)
7. [Personal Study Tools](#7-personal-study-tools)
   - [8-Color Highlighting](#8-color-highlighting)
   - [Realization Notes with Wiki-Links & Tags](#realization-notes-with-wiki-links--tags)
   - [Obsidian Vault & Markdown Export](#obsidian-vault--markdown-export)
   - [Bookmarks & Bookmark Collections](#bookmarks--bookmark-collections)
   - [Reading History](#reading-history)
8. [Comparative Study: Split View (`Alt + S`)](#8-comparative-study-split-view-alt--s)
9. [In-App PDF Reader](#9-in-app-pdf-reader)
10. [Cloud Sync & Multi-Device Support](#10-cloud-sync--multi-device-support)
11. [Data Backups & Offline Safety](#11-data-backups--offline-safety)
12. [Keyboard Shortcuts Cheatsheet](#12-keyboard-shortcuts-cheatsheet)

---

## 1. Overview & Highlights

Prabhupāda Connect v3 is an ultra-fast, offline-first research and reading workstation designed for the complete canonical works of **His Divine Grace A.C. Bhaktivedanta Swami Prabhupāda** and the Gauḍīya Vaiṣṇava Ācāryas.

- **100% Offline Scripture Corpus**: Contains all 55+ books, letters, conversations, lectures, and Vaiṣṇava songs locally in an indexed SQLite database (~261 MB).
- **Native Document Flow Engine**: Continuous reading renders smoothly with zero verse overlapping, even at maximum typography sizes (12px–32px+).
- **Layer Controls**: Independent visibility toggles for Devanāgarī, IAST transliteration, word synonyms, translations, and purports.
- **Dialogue Highlighting**: Dynamic speaker labeling in conversations (*Life Comes From Life*, *Dialectic Spiritualism*, etc.) with night-friendly matched opacity.
- **Search Auto-Scroll**: Instantly jump from search results directly to the highlighted match in the text.
- **Zero-Setup Cloud Sync**: Automatic bidirectional synchronization of highlights, notes, bookmarks, and reading history across Windows PCs via Supabase.
- **Local Snapshots**: Automatic rolling 7-day backups on app startup with manual JSON and Obsidian vault export options.

---

## 2. Installation & First Launch

### System Requirements
- **Operating System**: Windows 10 (64-bit) or Windows 11
- **Disk Space**: ~450 MB free space
- **Runtime**: Microsoft WebView2 (included with Windows 10/11 updates)

### Installing on Windows
1. Download `Prabhupada Connect_0.2.0_x64-setup.exe` from the GitHub Releases page.
2. Double-click the setup file.
3. *If Windows Defender SmartScreen displays a blue alert*: Click **More info** → **Run anyway** (this standard warning occurs on community-built software without expensive commercial signing certificates).
4. Follow the setup wizard to complete installation. A shortcut is placed on your Desktop and Start Menu.
5. Launch the app. The library opens maximized and is ready to use immediately without requiring any internet connection.

---

## 3. Library & Navigation

### Left Sidebar & Book Selector
- **Collapsible Sidebar**: Click the sidebar toggle icon in the top-left corner to show or hide the book navigation bar.
- **Book Filter**: Type any title or keyword in the sidebar filter box (e.g., `gita`, `canto 1`, `science`, `songs`, `letters`).
- **Direct Verse Jump (`@`)**: Type `@` followed by a canonical scripture reference in the filter box and hit `Enter`:
  - `@bg 2.13` → Opens *Bhagavad-gītā* 2.13 in a dedicated tab
  - `@sb 1.1.1` → Opens *Śrīmad-Bhāgavatam* Canto 1, Chapter 1, Text 1
  - `@cc adi 1.1` → Opens *Śrī Caitanya-caritāmṛta* Ādi-līlā 1.1
  - `@nod 1` → Opens *The Nectar of Devotion* Chapter 1
  - `@iso 1` → Opens *Śrī Īśopaniṣad* Mantra 1

### Breadcrumb Navigation
Above every reading tab is an interactive breadcrumb trail:
`Book Title › Canto / Section › Chapter › Verse`
Click any segment in the breadcrumb to open a quick-jump dropdown menu.

---

## 4. Scriptural Reading View & Typography

### Native Document Flow (Zero Text Collision)
Unlike virtualized list renderers that estimate element heights and cause text overlap when zooming, Prabhupāda Connect v3 utilizes a **native document flow layout engine**.
- Verses flow in natural sequence as a single continuous document.
- Fully supports font scaling from **12px up to 32px+** without text clipping or overlapping.
- Line heights, margins, and purports scale proportionally and dynamically.

### Visible Layers & Translation Toggle (Recitation Mode)
Click the **`T 14px`** button in the reader header to access the **Typography & Layers popover**:
- **Font Size**: Increase or decrease reader text size (`A-` / `A+`).
- **Line Spacing & Width**: Choose compact, normal, or relaxed line spacing and narrow, standard, or wide reading widths.
- **Visible Layers Toggles**:
  - `Devanāgarī`: Original Sanskrit / Bengali script
  - `Transliteration`: Roman script with diacritical marks (IAST)
  - `Synonyms`: Word-by-word Sanskrit-English vocabulary meanings
  - `Translation`: English verse translation
  - `Purport`: Elaborate Bhaktivedanta purports

> [!TIP]
> **Vaiṣṇava Song Recitation Mode**: Turn off the **Translation** layer when singing or reciting songs from *Prārthanā*, *Śaraṇāgati*, or *Gītāvalī*. This gives you a clean view of the Bengali verses and synonyms without English prose interrupting your chanting rhythm!

### Dialogue Speaker Highlighting
In philosophical dialogue books (such as *Life Comes From Life*, *Dialectic Spiritualism*, *Perfect Questions Perfect Answers*, and recorded room conversations), speakers are prominently styled:
- **Dark Themes**: Warm golden accent with matched luminance and text opacity to prevent eye fatigue during nighttime study.
- **Light Themes**: Deep earthy brown for high contrast against light parchment backgrounds.
- Dialogues preserve conversational turns clearly, making long philosophical debates effortless to follow.

### Clean Scripture Hierarchy & Headings
- Section titles and sūtra numbers in *Nārada-bhakti-sūtra*, *The Science of Self-Realization*, *The Quest for Enlightenment*, and *The Nectar of Devotion* are formatted cleanly as typographic subheadings rather than noisy pill badges.
- Duplicate and repetitive section headings have been removed.

### Clickable Citations & 4-Line Śloka Stanzas
- Quoted Sanskrit verses inside purports are automatically reformatted into traditional 4-line metered stanzas (*śloka pādas*).
- Cross-references such as `Bg. 2.13`, `SB 1.2.6`, and `[Brs. 1.2.187]` (*Bhakti-rasāmṛta-sindhu* mapped to *The Nectar of Devotion*) are live clickable links. Clicking opens the referenced verse in a new tab; hovering displays a translation preview.

---

## 5. Search Studio & In-Page Find

### Quick Search (`Ctrl + K`)
Press **`Ctrl + K`** anywhere in the app to open the Quick Search palette. Type keywords to get instant top results across all titles. Press `Enter` to jump directly to the verse.

### Advanced Search Studio & Word Wheel (`Ctrl + Shift + S`)
Press **`Ctrl + Shift + S`** or click the **Magnifying Glass (`🔍`)** icon in the header:
- **Word Wheel**: View real-time indexed vocabulary counts as you type.
- **Search Operators**:
  - `word1 word2` — Implicit AND (both terms must appear)
  - `"exact phrase"` — Exact consecutive word match
  - `word*` — Prefix wildcard search (e.g., `surrend*`)
  - `AND`, `OR`, `NOT` — Boolean expressions
  - `NEAR(a b, 5)` — Terms within 5 words of each other
- **Diacritic Tolerance**: Typing `krishna` or `sankirtan` automatically matches `Kṛṣṇa` and `saṅkīrtana`.

### Search Match Auto-Scroll & Highlighting
When opening any search result from the search panel, the reader automatically loads the chapter, **smoothly scrolls directly to the target verse**, and illuminates the matching keywords with an amber highlight glow.

### In-Page Find (`Ctrl + F`)
Press **`Ctrl + F`** in the reader to search within the current chapter:
- Type your search string.
- Press **`Enter`** or **`F3`** to jump to the next occurrence.
- Press **`Shift + F3`** to jump to the previous occurrence.
- The reader automatically scrolls each match into view with distinct active highlights.

---

## 6. Sanskrit Prosody, Meters & Chanting Pulse

Prabhupāda Connect includes a complete classical Sanskrit meter engine:
- Every verse with IAST transliteration is prosodically analyzed into **laghu** (short, ˘) and **guru** (long, ¯) syllables.
- Recognizes classical meters including:
  - **Anuṣṭubh (Śloka)**: 4 × 8 syllables
  - **Triṣṭubh**: 4 × 11 syllables (Indravajrā, Upendravajrā, etc.)
  - **Jagatī**: 4 × 12 syllables
  - **Payāra**: 4 × 14 Bengali poetic meter
- **Chanting Pulse Metronome**: Click **▶ Chant Pulse** under the meter badge to open the interactive recitation coach with an adjustable tempo metronome (50–90 BPM) that pulses on each syllable weight.

---

## 7. Personal Study Tools

### 8-Color Highlighting
1. Select any sentence or paragraph in a verse or purport with your mouse.
2. The selection toolbar appears with 8 distinct highlight swatches (*Gold*, *Amber*, *Emerald*, *Cyan*, *Sapphire*, *Amethyst*, *Rose*, *Coral*).
3. Click any swatch to highlight the text.
4. Highlights sync to your local database and the cloud immediately.

### Realization Notes with Wiki-Links & Tags
- Select text and click **`+ Note`**, or click the **`✎ Note`** button in the reader header to open the note editor for that verse.
- **Wiki-Links**: Type `[[BG 18.66]]` or `@bg 18.66` inside your note to insert an interactive scriptural link with hover preview.
- **Tags**: Use `#tag-name` (e.g., `#surrender`, `#guru`, `#sadhana`) to organize your realizations into a searchable tag cloud in the Notes tab.

### Obsidian Vault & Markdown Export
In the **Notes Tab** (`⋯` → **Notes**):
- **Export to Obsidian Vault**: Click **Export Obsidian (.zip)** to generate an organized `.zip` archive containing individual Markdown files for every note with YAML frontmatter, backlinks, and tags.
- **Export Single Markdown File**: Click **Export All (.md)** to compile all your realization notes into a single portable research document.

### Bookmarks & Bookmark Collections
- Click the **Star (`★`)** button in the reader toolbar or press **`Ctrl + Shift + B`** to bookmark the current verse.
- Group bookmarks into custom collections (e.g., *Daily Ślokas*, *Seminar Research*, *Memorization List*) in the Bookmarks tab.

### Reading History
Access your chronologically sorted reading timeline via **`Ctrl + H`** or the `⋯` menu to jump back to any recently studied verse.

---

## 8. Comparative Study: Split View (`Alt + S`)

Press **`Alt + S`** to cycle through comparative study modes:
1. **Standard Mode**: Single active book reading canvas.
2. **Parallel Scripture**: Splits the screen vertically to display a secondary independent scripture pane (e.g., read *Bhagavad-gītā* alongside a corroborating *Śrīmad-Bhāgavatam* chapter).
3. **Realization Notebook**: Displays your personal notes panel alongside the scripture for simultaneous reading and writing.

---

## 9. In-App PDF Reader

For scanned historical manuscripts and commentaries (such as *Bhakti-rasāmṛta-sindhu Subhodinī* or user-imported PDF documents):
- **Vector Canvas Rendering**: Crystal-clear high-DPI text and illustrations.
- **Page Jump**: Type any page number into the `[ 1 ] / N` box and hit `Enter`.
- **Zoom Modes**: Fit Width, Fit Page, 50%–200% scale presets, or `Ctrl + MouseWheel`.
- **Continuous vs. Single Page**: Choose between vertical infinite scroll with lazy loading or focused single-page presentation.
- **System Viewer**: Click the system viewer button to open the document in Adobe Acrobat or external tools for printing.

---

## 10. Cloud Sync & Multi-Device Support

### Pre-Configured Cloud Sync (Zero Setup)
Prabhupāda Connect comes pre-configured with the official Supabase cloud synchronization backend:
1. Open **Settings (`⚙`) → Cloud Sync**.
2. Enter your **Email** and **Password** (minimum 6 characters).
3. Click **Create Account (Sign Up)** on your first computer, or **Sign In & Sync** on any subsequent computer.
4. **Automatic Bidirectional Sync**:
   - Synchronizes immediately on login.
   - Pushes local updates automatically 2 seconds after any edit.
   - Runs background sync every 5 minutes.
   - Synchronizes on every app launch.

### Forgot Password & Recovery
If you forget your password:
1. Click **Forgot Password?** in **Settings → Cloud Sync**.
2. Enter your registered email to receive a **6-digit recovery code**.
3. Enter the 6-digit code along with your new password to reset it and log in immediately.

### Free-Tier Keep-Alive
An automated GitHub Actions workflow pings the cloud database every 3 days, ensuring the free-tier backend never pauses due to inactivity even when your computer is shut down.

---

## 11. Data Backups & Offline Safety

Your personal study data is fully protected locally:
- **Rolling Automatic Snapshots**: A timestamped SQLite snapshot of your user database is taken every time the application launches, retaining the last 7 days of rolling backups.
- **Manual Backups**: Go to **Settings → Data & Backup** to create on-demand backups or restore from any previous snapshot.
- **JSON Export / Import**: Full export of your notes, bookmarks, and highlights in human-readable JSON format for maximum portability and data ownership.

---

## 12. Keyboard Shortcuts Cheatsheet

| Shortcut | Description |
| :--- | :--- |
| **`F1`** | Open the in-app User Manual |
| **`←`** / **`→`** (or **`J`** / **`K`**) | Previous / Next verse in reader or page in PDF |
| **`Alt + ←`** / **`Alt + →`** | Alternate verse navigation |
| **`PageUp`** / **`PageDown`** | Jump page up / page down |
| **`Home`** / **`End`** | Jump to first / last page in PDF |
| **`Ctrl + K`** | Open Quick Search dialog |
| **`Ctrl + Shift + S`** | Open Full-Text Advanced Search & Word Wheel |
| **`Ctrl + F`** | In-page Find (reader) or focus sidebar search |
| **`F3`** / **`Shift + F3`** | Jump to next / previous search hit |
| **`Alt + S`** | Cycle Split View (*Off* → *Parallel Scripture* → *Notebook*) |
| **`F11`** / **`Ctrl + Shift + F`** | Toggle distraction-free Zen Fullscreen mode |
| **`Ctrl + Shift + B`** | Bookmark current verse |
| **`Ctrl + Shift + L`** | Toggle theme color palette |
| **`Ctrl + =`** / **`Ctrl + -`** / **`Ctrl + 0`** | Zoom text or PDF in / out / reset |
| **`Ctrl + T`** / **`Ctrl + W`** | Open new Library tab / Close active tab |
| **`Ctrl + Tab`** / **`Ctrl + Shift + Tab`** | Cycle between open tabs |
| **`Ctrl + B`** | Open Bookmarks tab |
| **`Ctrl + H`** | Open Reading History tab |
| **`Escape`** | Close Find bar, dismiss search highlights, or exit Zen mode |

---

*Dedicated to His Divine Grace A.C. Bhaktivedanta Swami Prabhupāda.*
