import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadInitialSettings } from './services/settings'
import { hydrateHighlightPalette } from './stores/useHighlightPaletteStore'
import { hydrateCustomBookOrder, hydrateReadingMode } from './stores/useNavigationStore'
import { hydrateReaderSettings, useReaderStore } from './stores/useReaderStore'
import { hydrateSyncSettings } from './stores/useSyncSettingsStore'
import { hydrateTheme } from './stores/useThemeStore'
import { useStudyStore } from './stores/useStudyStore'

async function bootstrap() {
  // Applied to the DOM before the first paint so there is never a flash of
  // the default (dark) theme before the user's saved one takes over.
  const settings = await loadInitialSettings()
  hydrateTheme(settings.theme, settings.textBrightness, settings.customPalette)
  hydrateReaderSettings(settings.fontSize, settings.readingWidth, settings.lineSpacing)
  // "Start Reading View in Focus Mode" overrides the remembered mode at
  // startup only when the user has opted into it; otherwise the last
  // session's mode (persisted separately) carries over as before.
  hydrateReadingMode(settings.focusModeDefault ? 'focus' : settings.readingMode)
  useReaderStore.setState({
    showSanskrit: settings.showSanskrit ?? true,
    showTransliteration: settings.showTransliteration,
    showSynonyms: settings.showSynonyms ?? true,
    showPurport: settings.showPurport ?? true,
    showPronunciationGuide: settings.showPronunciationGuide,
    showBacklinks: settings.showBacklinks ?? false,
    focusModeDefault: settings.focusModeDefault,
  })
  hydrateHighlightPalette(settings.highlightPalette)
  hydrateSyncSettings(settings.supabaseUrl, settings.supabaseAnonKey, settings.syncIntervalMinutes)
  hydrateCustomBookOrder(settings.customBookOrder)
  useStudyStore.getState().hydrateCustomCollections(settings.customBookmarkCollections ?? [])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
