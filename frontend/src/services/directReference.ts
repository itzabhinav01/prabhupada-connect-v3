import { invoke } from '@tauri-apps/api/core'

import { ApiError } from './api'

// Mirrors the serde camelCase wire format of `src-tauri/src/direct_reference.rs`.

export interface DirectRefResult {
  recordKey: string
  bookKey: string
  reference: string
}

export interface ReferenceSuggestion {
  displayText: string
  subText: string
  recordKey: string | null
  queryToComplete: string
  isWork: boolean
}

export function isReferenceQuery(raw: string): boolean {
  return raw.trimStart().startsWith('@')
}

export async function resolveDirectReference(query: string): Promise<DirectRefResult | null> {
  try {
    return await invoke<DirectRefResult | null>('resolve_direct_reference', { query })
  } catch (e) {
    throw new ApiError('resolveDirectReference', e)
  }
}

export async function getDirectReferenceSuggestions(
  query: string,
  maxResults = 20,
): Promise<ReferenceSuggestion[]> {
  try {
    return await invoke<ReferenceSuggestion[]>('get_direct_reference_suggestions', {
      query,
      maxResults,
    })
  } catch (e) {
    throw new ApiError('getDirectReferenceSuggestions', e)
  }
}

// --- Search Studio filters (Milestone 2) ------------------------------------
// Declared here (rather than in types/study.ts) so useTabStore's SearchTab
// payload can depend on this module without a circular import back into the
// search UI components.

export type SearchScope = 'all' | 'devanagari' | 'synonyms' | 'translation' | 'purport'
export type SearchSort = 'relevance' | 'canonical'
export type SearchSource = 'all' | 'scripture' | 'notes' | 'bookmarks' | 'highlights'

export interface SearchFilters {
  bookGroup: string
  source: SearchSource
  exactWord: boolean
  matchCase: boolean
  scope: SearchScope
  sort: SearchSort
  bookCodes?: string[]
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  bookGroup: 'all',
  source: 'all',
  exactWord: false,
  matchCase: false,
  scope: 'all',
  sort: 'relevance',
}
