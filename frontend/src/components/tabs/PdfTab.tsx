import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns,
  ExternalLink,
  FileText,
  Loader2,
  RotateCw,
  Rows,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { openPath } from '@tauri-apps/plugin-opener'

import { loadPdfBytes } from '../../services/api'
import { useTabStore, type PdfTabPayload } from '../../stores/useTabStore'

// Set worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

interface PdfTabProps {
  title: string
  pdfPath: string
  tabId?: string
}

type ZoomPreset = 'fit-width' | 'fit-page' | number

interface PersistedPdfState {
  rotation: number
  currentPage: number
  viewMode: 'single' | 'continuous'
  scale: ZoomPreset
}

function getStorageKey(path: string): string {
  return `vedabase:pdf_state:${path.replace(/\\/g, '/').toLowerCase()}`
}

function getSavedPdfState(path: string): PersistedPdfState {
  try {
    const raw = localStorage.getItem(getStorageKey(path))
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        rotation: typeof parsed.rotation === 'number' ? parsed.rotation : 0,
        currentPage: typeof parsed.currentPage === 'number' && parsed.currentPage > 0 ? parsed.currentPage : 1,
        viewMode: parsed.viewMode === 'single' ? 'single' : 'continuous',
        scale: parsed.scale ?? 'fit-width',
      }
    }
  } catch {}
  return { rotation: 0, currentPage: 1, viewMode: 'continuous', scale: 'fit-width' }
}

function savePdfState(path: string, partial: Partial<PersistedPdfState>) {
  try {
    const key = getStorageKey(path)
    const current = getSavedPdfState(path)
    const next = { ...current, ...partial }
    localStorage.setItem(key, JSON.stringify(next))
  } catch {}
}

export function PdfTab({ title, pdfPath, tabId }: PdfTabProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isNavigatingRef = useRef(false)
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRafRef = useRef<number | null>(null)

  // Initial persisted state loaded once on mount
  const initialSaved = useMemo(() => {
    const s = getSavedPdfState(pdfPath)
    if (tabId) {
      const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)
      const p = tab?.payload as PdfTabPayload | undefined
      if (p?.rotation !== undefined) s.rotation = p.rotation
      if (p?.page !== undefined && p.page > 0) s.currentPage = p.page
    }
    return s
  }, [pdfPath, tabId])

  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(initialSaved.currentPage)
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

  const [pageInput, setPageInput] = useState<string>(String(initialSaved.currentPage))
  const [isEditingPage, setIsEditingPage] = useState<boolean>(false)

  const [scale, setScale] = useState<ZoomPreset>(initialSaved.scale)
  const [computedScale, setComputedScale] = useState<number>(1.0)
  const [rotation, setRotation] = useState<number>(initialSaved.rotation)
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>(initialSaved.viewMode)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load the PDF document ONCE per pdfPath. Never re-run on page changes!
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

        // Read stored state once
        const stored = getSavedPdfState(pdfPath)
        if (tabId) {
          const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)
          const p = tab?.payload as PdfTabPayload | undefined
          if (p?.rotation !== undefined) stored.rotation = p.rotation
          if (p?.page !== undefined && p.page > 0) stored.currentPage = p.page
        }

        const targetPage = Math.max(1, Math.min(stored.currentPage, pdf.numPages))
        setCurrentPage(targetPage)
        currentPageRef.current = targetPage
        setPageInput(String(targetPage))
        setRotation(stored.rotation)
        setViewMode(stored.viewMode)
        setScale(stored.scale)

        // Compute initial scale right away before displaying to prevent resize jitter
        if (typeof stored.scale === 'number') {
          setComputedScale(stored.scale)
        } else if (containerRef.current) {
          try {
            const page1 = await pdf.getPage(1)
            const vp = page1.getViewport({ scale: 1.0, rotation: stored.rotation })
            const cW = Math.max(100, containerRef.current.clientWidth - 48)
            const cH = Math.max(100, containerRef.current.clientHeight - 48)
            let s = 1.0
            if (stored.scale === 'fit-width') s = cW / vp.width
            else if (stored.scale === 'fit-page') s = Math.min(cW / vp.width, cH / vp.height)
            setComputedScale(Math.max(0.25, Math.min(s, 3.5)))
          } catch {}
        }

        setLoading(false)

        if (targetPage > 1 && stored.viewMode === 'continuous') {
          setTimeout(() => {
            if (containerRef.current) {
              const el = document.getElementById(`pdf-page-${targetPage}`)
              if (el) {
                const containerRect = containerRef.current.getBoundingClientRect()
                const elRect = el.getBoundingClientRect()
                const targetOffset = containerRef.current.scrollTop + (elRect.top - containerRect.top)
                containerRef.current.scrollTo({ top: Math.max(0, targetOffset), behavior: 'auto' })
              }
            }
          }, 200)
        }
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
  }, [pdfPath, tabId])

  // Compute actual scale based on container width/height or preset
  // Uses page 1 as stable reference to avoid jitter when scrolling
  const updateComputedScale = useCallback(
    async (pdfDoc: pdfjsLib.PDFDocumentProxy, currentScale: ZoomPreset) => {
      if (typeof currentScale === 'number') {
        setComputedScale(currentScale)
        return
      }

      if (!containerRef.current) return

      try {
        const page = await pdfDoc.getPage(1)
        const viewport = page.getViewport({ scale: 1.0, rotation })
        const containerWidth = Math.max(100, containerRef.current.clientWidth - 48)
        const containerHeight = Math.max(100, containerRef.current.clientHeight - 48)

        let targetScale = 1.0
        if (currentScale === 'fit-width') {
          targetScale = containerWidth / viewport.width
        } else if (currentScale === 'fit-page') {
          const sW = containerWidth / viewport.width
          const sH = containerHeight / viewport.height
          targetScale = Math.min(sW, sH)
        }
        targetScale = Math.max(0.25, Math.min(targetScale, 3.5))

        // Deadband: only update if scale difference exceeds 0.01 to eliminate micro-oscillations
        setComputedScale((prev) => {
          if (Math.abs(prev - targetScale) < 0.01) return prev
          return targetScale
        })
      } catch (e) {
        console.warn('Could not compute scale:', e)
      }
    },
    [rotation],
  )

  useEffect(() => {
    if (doc && numPages > 0) {
      void updateComputedScale(doc, scale)
    }
  }, [doc, numPages, scale, rotation, updateComputedScale])

  // Re-compute scale on container resize if using fit preset
  // Throttled with requestAnimationFrame; does NOT depend on currentPage
  useEffect(() => {
    if (typeof scale !== 'string') return
    const container = containerRef.current
    if (!container) return

    let rafId: number | null = null
    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (doc) void updateComputedScale(doc, scale)
      })
    })
    ro.observe(container)
    return () => {
      ro.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [doc, scale, updateComputedScale])

  const handleOpenExternal = () => {
    void openPath(pdfPath)
  }

  const goToPage = (p: number) => {
    if (numPages <= 0) return
    const target = Math.max(1, Math.min(p, numPages))

    isNavigatingRef.current = true
    if (navTimerRef.current) clearTimeout(navTimerRef.current)
    navTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false
    }, 700)

    currentPageRef.current = target
    setCurrentPage(target)
    setPageInput(String(target))
    savePdfState(pdfPath, { currentPage: target })
    if (tabId) {
      useTabStore.getState().updateTabPayload(tabId, { page: target })
    }

    if (viewMode === 'continuous') {
      const el = document.getElementById(`pdf-page-${target}`)
      if (el && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const targetOffset = containerRef.current.scrollTop + (elRect.top - containerRect.top)
        containerRef.current.scrollTo({ top: Math.max(0, targetOffset), behavior: 'smooth' })
      }
    } else {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0
      }
    }
  }

  const commitPageInput = () => {
    setIsEditingPage(false)
    const trimmed = pageInput.trim()
    const p = parseInt(trimmed, 10)
    if (!isNaN(p) && p >= 1 && p <= numPages) {
      goToPage(p)
    } else {
      setPageInput(String(currentPage))
    }
  }

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    commitPageInput()
  }

  const zoomIn = () => {
    setScale((prev) => {
      const cur = typeof prev === 'number' ? prev : computedScale
      const next = Math.min(cur + 0.25, 4.0)
      savePdfState(pdfPath, { scale: next })
      return next
    })
  }

  const zoomOut = () => {
    setScale((prev) => {
      const cur = typeof prev === 'number' ? prev : computedScale
      const next = Math.max(cur - 0.25, 0.4)
      savePdfState(pdfPath, { scale: next })
      return next
    })
  }

  const rotateClockwise = () => {
    setRotation((r) => {
      const next = (r + 90) % 360
      savePdfState(pdfPath, { rotation: next })
      if (tabId) {
        useTabStore.getState().updateTabPayload(tabId, { rotation: next })
      }
      return next
    })
  }

  const setViewModeAndSave = (mode: 'single' | 'continuous') => {
    setViewMode(mode)
    savePdfState(pdfPath, { viewMode: mode })
    if (mode === 'continuous') {
      setTimeout(() => {
        const el = document.getElementById(`pdf-page-${currentPage}`)
        if (el && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const targetOffset = containerRef.current.scrollTop + (elRect.top - containerRect.top)
          containerRef.current.scrollTo({ top: Math.max(0, targetOffset), behavior: 'auto' })
        }
      }, 50)
    }
  }

  // Active page detection via container scroll event (throttled with rAF)
  const handleScroll = useCallback(() => {
    if (isNavigatingRef.current || isEditingPage) return
    if (viewMode !== 'continuous') return

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return

      const pageElements = container.querySelectorAll<HTMLElement>('[data-page-num]')
      if (!pageElements.length) return

      const containerRect = container.getBoundingClientRect()
      const targetY = containerRect.top + containerRect.height * 0.35

      let activePage = 1
      for (const el of pageElements) {
        const rect = el.getBoundingClientRect()
        if (rect.top <= targetY && rect.bottom >= containerRect.top) {
          activePage = Number(el.dataset.pageNum)
        }
      }

      if (activePage && activePage !== currentPageRef.current) {
        currentPageRef.current = activePage
        setCurrentPage(activePage)
        setPageInput(String(activePage))
        savePdfState(pdfPath, { currentPage: activePage })
        if (tabId) {
          useTabStore.getState().updateTabPayload(tabId, { page: activePage })
        }
      }
    })
  }, [viewMode, isEditingPage, pdfPath, tabId])

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
      } else if (e.key === 'r' || e.key === 'R') {
        rotateClockwise()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPage, numPages, computedScale, rotation])

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-neutral-200 select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0 gap-3 z-10 shadow-sm">
        {/* Left: Title & External Link */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <FileText size={18} className="text-amber-400 shrink-0" />
          <span className="font-medium text-sm text-neutral-100 truncate" title={title}>
            {title}
          </span>
          <button
            type="button"
            onClick={handleOpenExternal}
            title="Open in default system PDF viewer"
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 shrink-0 transition-colors"
          >
            <ExternalLink size={15} />
          </button>
        </div>

        {/* Center: Page Navigation & Direct Input */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
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
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onFocus={(e) => {
                  setIsEditingPage(true)
                  e.target.select()
                }}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setPageInput(val)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    commitPageInput()
                    ;(e.target as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    setIsEditingPage(false)
                    setPageInput(String(currentPage))
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                onBlur={commitPageInput}
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
        </div>

        {/* Right: Zoom, Rotate & Layout Controls */}
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
                const newScale: ZoomPreset =
                  val === 'fit-width' || val === 'fit-page' ? val : parseInt(val, 10) / 100
                setScale(newScale)
                savePdfState(pdfPath, { scale: newScale })
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

          {/* Rotate (saved per-book automatically) */}
          <button
            type="button"
            onClick={rotateClockwise}
            title="Rotate 90° Clockwise (R)"
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/80 transition-colors"
          >
            <RotateCw size={15} />
          </button>

          {/* View Mode Toggle: Continuous vs Single */}
          <div className="flex items-center bg-neutral-800/80 rounded border border-neutral-700/80 p-0.5">
            <button
              type="button"
              onClick={() => setViewModeAndSave('continuous')}
              title="Continuous Scroll"
              className={`p-1 rounded transition-colors ${
                viewMode === 'continuous' ? 'bg-neutral-700 text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Rows size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewModeAndSave('single')}
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
        onScroll={handleScroll}
        style={{ scrollbarGutter: 'stable' }}
        className="flex-1 overflow-y-scroll overflow-x-auto bg-neutral-950 p-6 flex flex-col items-center relative"
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
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)

  useEffect(() => {
    let cancel = false

    async function renderPage() {
      setRenderLoading(true)
      try {
        const page = await doc.getPage(pageNum)
        if (cancel) return

        const canvas = canvasRef.current
        if (!canvas) return

        const viewport = page.getViewport({ scale, rotation })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch {}
        }

        const task = page.render({
          canvasContext: ctx,
          viewport,
        })
        renderTaskRef.current = task

        await task.promise
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
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {}
        renderTaskRef.current = null
      }
    }
  }, [doc, pageNum, scale, rotation])

  return (
    <div className="relative shadow-2xl rounded bg-white flex items-center justify-center shrink-0">
      {renderLoading && (
        <div className="absolute inset-0 bg-neutral-900/20 backdrop-blur-xs flex items-center justify-center rounded">
          <Loader2 size={24} className="animate-spin text-amber-400" />
        </div>
      )}
      <canvas ref={canvasRef} className="block rounded" />
    </div>
  )
}

/** Continuous Scroll PDF View */
function ContinuousPdfView({
  doc,
  numPages,
  scale,
  rotation,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  numPages: number
  scale: number
  rotation: number
}) {
  const [baseDims, setBaseDims] = useState<{ width: number; height: number }>({ width: 600, height: 850 })

  // Measure page 1 initially to establish uniform layout dimensions for placeholder shells
  useEffect(() => {
    let active = true
    async function loadInitialDims() {
      try {
        const page = await doc.getPage(1)
        if (!active) return
        const viewport = page.getViewport({ scale, rotation })
        setBaseDims({ width: viewport.width, height: viewport.height })
      } catch (e) {
        console.warn('Could not load initial dims:', e)
      }
    }
    void loadInitialDims()
    return () => {
      active = false
    }
  }, [doc, scale, rotation])

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-full pb-16">
      {pages.map((p) => (
        <PdfPageItem
          key={p}
          doc={doc}
          pageNum={p}
          scale={scale}
          rotation={rotation}
          baseDims={baseDims}
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
  baseDims,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  scale: number
  rotation: number
  baseDims: { width: number; height: number }
}) {
  const itemRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [rendered, setRendered] = useState(false)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)

  // Observe visibility to lazy-render pages only when near the viewport
  // Attached once with rootMargin to start rendering ahead of viewport
  useEffect(() => {
    const el = itemRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
        }
      },
      { rootMargin: '1000px 0px 1000px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Render canvas when visible
  useEffect(() => {
    if (!isVisible) return

    let cancel = false

    async function renderPage() {
      try {
        const page = await doc.getPage(pageNum)
        if (cancel) return

        const canvas = canvasRef.current
        if (!canvas) return

        const viewport = page.getViewport({ scale, rotation })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch {}
        }

        const task = page.render({
          canvasContext: ctx,
          viewport,
        })
        renderTaskRef.current = task

        await task.promise
        if (!cancel) {
          setRendered(true)
        }
      } catch (err: unknown) {
        if (!cancel && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err)
          setRendered(true)
        }
      }
    }

    void renderPage()

    return () => {
      cancel = true
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {}
        renderTaskRef.current = null
      }
    }
  }, [doc, pageNum, scale, rotation, isVisible])

  const viewportWidth = Math.round(baseDims.width)
  const viewportHeight = Math.round(baseDims.height)

  return (
    <div
      id={`pdf-page-${pageNum}`}
      data-page-num={pageNum}
      ref={itemRef}
      style={{
        width: `${viewportWidth}px`,
        height: `${viewportHeight}px`,
      }}
      className="relative shadow-2xl rounded bg-white flex items-center justify-center shrink-0"
    >
      <canvas
        ref={canvasRef}
        className={`block rounded transition-opacity duration-150 ${rendered ? 'opacity-100' : 'opacity-0'}`}
      />
      {!rendered && (
        <div className="absolute inset-0 bg-neutral-900/10 flex flex-col items-center justify-center text-neutral-400 gap-2 rounded">
          {isVisible ? (
            <Loader2 size={24} className="animate-spin text-amber-500" />
          ) : (
            <span className="text-xs font-mono">Page {pageNum}</span>
          )}
        </div>
      )}
    </div>
  )
}
