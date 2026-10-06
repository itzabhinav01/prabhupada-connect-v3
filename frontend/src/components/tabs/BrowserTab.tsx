import { Globe, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'

/** A minimal in-app browser via `<iframe>` — not a real second WebView, so
 * any site sending `X-Frame-Options`/`frame-ancestors` (most major sites:
 * Google, YouTube, GitHub, etc.) will refuse to render here and show a
 * blank frame instead. That's an inherent iframe limitation, not something
 * fixable from this side — `tauri.conf.json`'s `csp: null` only means *this*
 * app doesn't restrict what it embeds, not that embedded sites allow it. */
export function BrowserTab({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const navigate = (target: string) => {
    let resolved = target.trim()
    if (!resolved) return
    if (!/^https?:\/\//i.test(resolved)) resolved = `https://${resolved}`
    setUrl(resolved)
    setInputUrl(resolved)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl)
  }

  const handleRefresh = () => {
    if (iframeRef.current) iframeRef.current.src = url
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950">
        <Globe size={14} className="text-neutral-500 shrink-0" />
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-amber-500/50"
          placeholder="Enter URL…"
        />
        <button type="button" onClick={handleRefresh} className="p-1.5 text-neutral-500 hover:text-neutral-200" title="Reload">
          <RefreshCw size={14} />
        </button>
      </div>
      {/* No `onLoad` URL-bar sync: virtually every real destination is
          cross-origin, where reading `.contentWindow.location.href` always
          throws — so that attempt only ever fired for same-origin pages,
          never when the user actually clicks a link inside the frame. The
          bar instead always reflects the last URL the user explicitly
          navigated to, which is the one thing it can show reliably. */}
      <iframe key={url} ref={iframeRef} src={url} className="flex-1 border-0 bg-white" title="In-app browser" />
    </div>
  )
}
