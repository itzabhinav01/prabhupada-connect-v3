import { FileText } from 'lucide-react'
import { openPath } from '@tauri-apps/plugin-opener'

/** A PDF-based book has no corpus records to render (no TOC, no verses) —
 * `isPdf`/`pdfPath` exist on `Book` for exactly this case (see
 * `types/scripture.ts`, `corpus.rs`'s `row_to_book`), but nothing in the
 * corpus or the import pipeline sets them yet (`import_records` always
 * writes `is_pdf: false`), so this tab currently has no way to be reached.
 * It deliberately doesn't try to render the PDF inline: a `file://` iframe
 * needs Tauri's asset-protocol scope enabled (off by default here) and may
 * still be blocked by the WebView's cross-origin iframe policy even then —
 * unverifiable without a real PDF to test against. `openPath` (not
 * `openUrl`) is the right primitive for a native OS path like this; it's
 * the same one notes export already uses successfully. */
export function PdfTab({ title, pdfPath }: { title: string; pdfPath: string }) {
  const handleOpen = () => {
    void openPath(pdfPath)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <FileText size={40} className="text-neutral-600" />
      <div>
        <h2 className="text-lg font-medium text-neutral-200">{title}</h2>
        <p className="text-sm text-neutral-500 mt-1">This book is a PDF scan, not corpus text — open it in your system PDF viewer.</p>
      </div>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
      >
        Open in system PDF viewer
      </button>
    </div>
  )
}
