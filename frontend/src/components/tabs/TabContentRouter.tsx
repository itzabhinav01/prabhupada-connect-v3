import { ReaderCanvas } from '../reader/ReaderCanvas'
import { BookOverviewTab } from '../library/BookOverviewTab'
import type { BrowserTabPayload, PdfTabPayload, Tab } from '../../stores/useTabStore'
import { BookmarksTab } from './BookmarksTab'
import { BrowserTab } from './BrowserTab'
import { HelpTab } from './HelpTab'
import { HighlightsTab } from './HighlightsTab'
import { HistoryTab } from './HistoryTab'
import { NotesTab } from './NotesTab'
import { PdfTab } from './PdfTab'
import { SearchTab } from './SearchTab'
import { SettingsTab } from './SettingsTab'

export function TabContentRouter({ tab }: { tab: Tab }) {
  switch (tab.type) {
    case 'toc':
      return <BookOverviewTab tabId={tab.id} />
    case 'reader':
      return <ReaderCanvas />
    case 'search':
      return <SearchTab tabId={tab.id} />
    case 'settings':
      return <SettingsTab />
    case 'notes':
      return <NotesTab />
    case 'bookmarks':
      return <BookmarksTab />
    case 'history':
      return <HistoryTab />
    case 'highlights':
      return <HighlightsTab />
    case 'help':
      return <HelpTab />
    case 'browser':
      return <BrowserTab initialUrl={(tab.payload as BrowserTabPayload).url} />
    case 'pdf': {
      const p = tab.payload as PdfTabPayload
      return <PdfTab title={p.title} pdfPath={p.pdfPath} />
    }
    default:
      return null
  }
}
