import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  FileText,
  Loader2,
  AlertCircle,
  Columns,
  Rows,
} from 'lucide-react'
import { openPath } from '@tauri-apps/plugin-opener'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { loadPdfBytes } from '../../services/api'

// Set worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

interface PdfTabProps {
  title: string
  pdfPath: string
}

type ZoomPreset = 'fit-width' | 'fit-page' | number

export function PdfTab({ title, pdfPath }: PdfTabProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageInput, setPageInput] = useState<string>('1')
  const [scale, setScale] = useState<ZoomPreset>('fit-width')
  const [computedScale, setComputedScale] = useState<number>(1.0)
  const [rotation, setRotation] = useState<number>(0)
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('continuous')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load the PDF document
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function loadPdf() {
      try {
        const bytes = await loadPdfBytes(pdfPath)
        if (!active) return

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        })

        const pdf = await loadingTask.promise
        if (!active) return

        setDoc(pdf)
        setNumPages(pdf.numPages)
        setCurrentPage(1)
        setPageInput('1')
        setLoading(false)
      } catch (err) {
        if (!active) return
        console.error('Failed to load PDF:', err)
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }

    void loadPdf()

    return () => {
      active = false
    }
  }, [pdfPath])

  // Compute actual scale based on container width/height or preset
  const updateComputedScale = useCallback(
    async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number, currentScale: ZoomPreset) => {
      if (typeof currentScale === 'number') {
        setComputedScale(currentScale)
        return
      }

      if (!containerRef.current) return

      try {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0, rotation })
        const containerWidth = containerRef.current.clientWidth - 48 // margin/padding
        const containerHeight = containerRef.current.clientHeight - 48

        if (currentScale === 'fit-width') {
          const s = containerWidth / viewport.width
          setComputedScale(Math.max(0.25, Math.min(s, 3.5)))
        } else if (currentScale === 'fit-page') {
          const sW = containerWidth / viewport.width
          const sH = containerHeight / viewport.height
          setComputedScale(Math.max(0.25, Math.min(Math.min(sW, sH), 3.5)))
        }
      } catch (e) {
        console.warn('Could not compute scale:', e)
      }
    },
    [rotation],
  )

  useEffect(() => {
    if (doc && numPages > 0) {
      void updateComputedScale(doc, currentPage, scale)
    }
  }, [doc, numPages, currentPage, scale, rotation, updateComputedScale])

  // Re-compute scale on container resize if using fit preset
  useEffect(() => {
    if (typeof scale !== 'string') return
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => {
      if (doc) void updateComputedScale(doc, currentPage, scale)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [doc, currentPage, scale, updateComputedScale])

  const handleOpenExternal = () => {
    void openPath(pdfPath)
  }

  const goToPage = (p: number) => {
    const target = Math.max(1, Math.min(p, numPages))
    setCurrentPage(target)
    setPageInput(String(target))
    if (viewMode === 'continuous') {
      const el = document.getElementById(`pdf-page-${target}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const p = parseInt(pageInput, 10)
    if (!isNaN(p)) {
      goToPage(p)
    } else {
      setPageInput(String(currentPage))
    }
  }

  const zoomIn = () => {
    setScale((prev) => {
      const cur = typeof prev === 'number' ? prev : computedScale
      return Math.min(cur + 0.25, 4.0)
    })
  }

  const zoomOut = () => {
    setScale((prev) => {
      const cur = typeof prev === 'number' ? prev : computedScale
      return Math.max(cur - 0.25, 0.4)
    })
  }

  const rotateClockwise = () => {
    setRotation((r) => (r + 90) % 360)
  }

  // Keyboard navigation for PDF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        goToPage(currentPage + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        goToPage(currentPage - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToPage(1)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToPage(numPages)
      } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn()
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        zoomOut()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPage, numPages, computedScale])

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-200 select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0 gap-3 z-10 shadow-sm">
        {/* Left: Title & External Link */}
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={18} className="text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-neutral-200 truncate max-w-[240px]" title={title}>
            {title}
          </span>
          <button
            type="button"
            onClick={handleOpenExternal}
            title="Open in default system PDF viewer"
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">System Viewer</span>
          </button>
        </div>

        {/* Center: Pagination */}
        {numPages > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={currentPage <= 1}
              title="First Page"
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              title="Previous Page (Left / PageUp / k)"
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} />
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(String(currentPage))}
                className="w-12 text-center py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
              <span>/ {numPages}</span>
            </form>

            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
              title="Next Page (Right / PageDown / j)"
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(numPages)}
              disabled={currentPage >= numPages}
              title="Last Page"
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        )}

        {/* Right: Zoom & View Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-neutral-800/80 rounded border border-neutral-700/80 p-0.5">
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom Out (Ctrl -)"
              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              <ZoomOut size={15} />
            </button>
            <select
              value={typeof scale === 'string' ? scale : String(Math.round(computedScale * 100))}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'fit-width' || val === 'fit-page') {
                  setScale(val)
                } else {
                  setScale(parseInt(val, 10) / 100)
                }
              }}
              className="bg-transparent text-xs text-neutral-300 font-medium px-1.5 py-0.5 focus:outline-none cursor-pointer"
            >
              <option value="fit-width" className="bg-neutral-900 text-neutral-200">
                Fit Width
              </option>
              <option value="fit-page" className="bg-neutral-900 text-neutral-200">
                Fit Page
              </option>
              <option value="50" className="bg-neutral-900 text-neutral-200">
                50%
              </option>
              <option value="75" className="bg-neutral-900 text-neutral-200">
                75%
              </option>
              <option value="100" className="bg-neutral-900 text-neutral-200">
                100%
              </option>
              <option value="125" className="bg-neutral-900 text-neutral-200">
                125%
              </option>
              <option value="150" className="bg-neutral-900 text-neutral-200">
                150%
              </option>
              <option value="200" className="bg-neutral-900 text-neutral-200">
                200%
              </option>
            </select>
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom In (Ctrl +)"
              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              <ZoomIn size={15} />
            </button>
          </div>

          {/* Rotate */}
          <button
            type="button"
            onClick={rotateClockwise}
            title="Rotate 90° Clockwise"
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/80"
          >
            <RotateCw size={15} />
          </button>

          {/* View Mode Toggle: Continuous vs Single */}
          <div className="flex items-center bg-neutral-800/80 rounded border border-neutral-700/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('continuous')}
              title="Continuous Scroll"
              className={`p-1 rounded transition-colors ${
                viewMode === 'continuous' ? 'bg-neutral-700 text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Rows size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('single')}
              title="Single Page"
              className={`p-1 rounded transition-colors ${
                viewMode === 'single' ? 'bg-neutral-700 text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Columns size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Reader Canvas / Scroll View */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-neutral-950 p-6 flex flex-col items-center"
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault()
            if (e.deltaY < 0) zoomIn()
            else zoomOut()
          }
        }}
      >
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Loader2 size={28} className="animate-spin text-amber-400" />
            <p className="text-sm">Loading PDF document…</p>
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center max-w-md">
            <AlertCircle size={36} className="text-red-400" />
            <div>
              <h3 className="text-base font-semibold text-neutral-200">Unable to load PDF</h3>
              <p className="text-sm text-neutral-400 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleOpenExternal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm border border-amber-500/30 transition-colors"
            >
              <ExternalLink size={15} />
              Open in system viewer
            </button>
          </div>
        )}

        {!loading && !error && doc && (
          <>
            {viewMode === 'single' ? (
              <SinglePageView
                doc={doc}
                pageNum={currentPage}
                scale={computedScale}
                rotation={rotation}
              />
            ) : (
              <ContinuousPdfView
                doc={doc}
                numPages={numPages}
                scale={computedScale}
                rotation={rotation}
                currentPage={currentPage}
                onPageVisible={(p) => {
                  setCurrentPage(p)
                  setPageInput(String(p))
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Single Page PDF Renderer */
function SinglePageView({
  doc,
  pageNum,
  scale,
  rotation,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  scale: number
  rotation: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [renderLoading, setRenderLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancel = false
    let renderTask: pdfjsLib.RenderTask | null = null

    async function renderPage() {
      setRenderLoading(true)
      try {
        const page = await doc.getPage(pageNum)
        if (cancel) return

        const canvas = canvasRef.current
        if (!canvas) return

        const viewport = page.getViewport({ scale, rotation })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        })

        await renderTask.promise
        if (!cancel) setRenderLoading(false)
      } catch (err: unknown) {
        if (!cancel && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
          setRenderLoading(false)
        }
      }
    }

    void renderPage()

    return () => {
      cancel = true
      if (renderTask) renderTask.cancel()
    }
  }, [doc, pageNum, scale, rotation])

  return (
    <div className="relative shadow-2xl rounded bg-white flex items-center justify-center">
      {renderLoading && (
        <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-amber-400" />
        </div>
      )}
      <canvas ref={canvasRef} className="block rounded" />
    </div>
  )
}

/** Continuous Scroll PDF View with Lazy Page Mounting */
function ContinuousPdfView({
  doc,
  numPages,
  scale,
  rotation,
  onPageVisible,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  numPages: number
  scale: number
  rotation: number
  currentPage: number
  onPageVisible: (p: number) => void
}) {
  const pages = Array.from({ length: numPages }, (_, i) => i + 1)

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-full">
      {pages.map((p) => (
        <PdfPageItem
          key={p}
          doc={doc}
          pageNum={p}
          scale={scale}
          rotation={rotation}
          onVisible={() => onPageVisible(p)}
        />
      ))}
    </div>
  )
}

function PdfPageItem({
  doc,
  pageNum,
  scale,
  rotation,
  onVisible,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  scale: number
  rotation: number
  onVisible: () => void
}) {
  const itemRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [dims, setDims] = useState<{ width: number; height: number }>({ width: 600, height: 850 })

  // Observe visibility to lazy-render pages only when near the viewport
  useEffect(() => {
    const el = itemRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsVisible(true)
          onVisible()
        } else {
          // Keep mounted if within 800px margin
          const rect = entry.boundingClientRect
          const windowHeight = window.innerHeight
          if (rect.bottom < -800 || rect.top > windowHeight + 800) {
            setIsVisible(false)
          }
        }
      },
      { rootMargin: '600px 0px 600px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible])

  // Get initial page dimensions for smooth layout placeholder
  useEffect(() => {
    let active = true
    async function loadDims() {
      try {
        const page = await doc.getPage(pageNum)
        if (!active) return
        const viewport = page.getViewport({ scale, rotation })
        setDims({ width: viewport.width, height: viewport.height })
      } catch (e) {
        console.warn('Could not load dims for page', pageNum, e)
      }
    }
    void loadDims()
    return () => {
      active = false
    }
  }, [doc, pageNum, scale, rotation])

  // Render canvas when visible
  useEffect(() => {
    if (!isVisible) return

    let cancel = false
    let renderTask: pdfjsLib.RenderTask | null = null

    async function renderPage() {
      try {
        const page = await doc.getPage(pageNum)
        if (cancel) return

        const canvas = canvasRef.current
        if (!canvas) return

        const viewport = page.getViewport({ scale, rotation })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        })

        await renderTask.promise
        if (!cancel) setRendered(true)
      } catch (err: unknown) {
        if (!cancel && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
        }
      }
    }

    void renderPage()

    return () => {
      cancel = true
      if (renderTask) renderTask.cancel()
    }
  }, [doc, pageNum, scale, rotation, isVisible])

  return (
    <div
      id={`pdf-page-${pageNum}`}
      ref={itemRef}
      style={{
        width: `${dims.width}px`,
        minHeight: `${dims.height}px`,
      }}
      className="relative shadow-2xl rounded bg-white flex items-center justify-center transition-opacity"
    >
      {isVisible ? (
        <canvas ref={canvasRef} className="block rounded" />
      ) : (
        <div className="flex flex-col items-center justify-center text-neutral-400 gap-2 p-12">
          <span className="text-xs font-mono">Page {pageNum}</span>
        </div>
      )}
      {!rendered && isVisible && (
        <div className="absolute inset-0 bg-neutral-900/20 backdrop-blur-xs flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-amber-500" />
        </div>
      )}
    </div>
  )
}
