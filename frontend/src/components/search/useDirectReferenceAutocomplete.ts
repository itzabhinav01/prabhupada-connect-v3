import { useEffect, useRef, useState } from 'react'

import {
  getDirectReferenceSuggestions,
  isReferenceQuery,
  type ReferenceSuggestion,
} from '../../services/directReference'

/** Drives the "@" direct-reference autocomplete for any search input: not
 * active at all until the text starts with "@", then debounced IPC calls
 * into the Rust-side grammar (see `direct_reference.rs`) keep the
 * suggestion list current as the user types. */
export function useDirectReferenceAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<ReferenceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<number | null>(null)
  const active = isReferenceQuery(query)

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (!active) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = window.setTimeout(() => {
      getDirectReferenceSuggestions(query, 20)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, 80)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query, active])

  return { active, suggestions, loading }
}
