import { useEffect, useRef, useState, useCallback } from 'react'

interface PDFCanvasProps {
  /** Blob/object URL pointing to the compiled PDF. */
  pdfUrl: string
  /**
   * Called when the user clicks a position in the PDF.
   * Receives the extracted text string surrounding the click point.
   * The caller uses this to locate the matching line in the source editor.
   */
  onSourceJump?: (nearbyText: string) => void
}

/**
 * Renders a PDF document page-by-page using pdfjs-dist.
 *
 * Each page is drawn on its own <canvas> element inside a scrollable
 * container.  When the user clicks on a rendered page, the component
 * finds the text item nearest to the click point (using pdfjs's text
 * content API) and calls `onSourceJump` with that text so the parent
 * can locate the corresponding source line.
 */
export default function PDFCanvas({ pdfUrl, onSourceJump }: PDFCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Ref to the loaded pdfjs document so click handlers can access it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null)
  // Abort controller to cancel in-flight renders on prop changes
  const renderAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  /** Scale applied to each page canvas (device-pixel-ratio aware). */
  const SCALE = 1.5

  const renderPages = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (pdfDoc: any, signal: { cancelled: boolean }) => {
      const container = containerRef.current
      if (!container) return

      // Remove any previously rendered pages
      while (container.firstChild) container.removeChild(container.firstChild)

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (signal.cancelled) return
        const page = await pdfDoc.getPage(i)
        if (signal.cancelled) return

        const viewport = page.getViewport({ scale: SCALE })

        const wrapper = document.createElement('div')
        wrapper.style.position = 'relative'
        wrapper.style.margin = '0 auto 12px'
        wrapper.style.width = `${viewport.width}px`
        wrapper.dataset.pageIndex = String(i)

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.cursor = onSourceJump ? 'crosshair' : 'default'
        wrapper.appendChild(canvas)
        container.appendChild(wrapper)

        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        await page.render({ canvasContext: ctx, viewport }).promise
        if (signal.cancelled) return
      }
    },
    [onSourceJump]
  )

  // Load and render the PDF whenever the URL changes
  useEffect(() => {
    if (!pdfUrl) return

    // Cancel any previous render in progress
    renderAbortRef.current.cancelled = true
    const signal = { cancelled: false }
    renderAbortRef.current = signal

    let didCleanup = false

    async function load() {
      try {
        const pdfjsLib = await import('pdfjs-dist')

        // Point the worker at the bundled worker script.
        // Vite will serve the file from node_modules via ?url.
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          // Use the inline worker (no separate file needed in Electron)
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).href
        }

        if (signal.cancelled || didCleanup) return

        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const pdfDoc = await loadingTask.promise
        if (signal.cancelled || didCleanup) {
          pdfDoc.destroy()
          return
        }

        pdfDocRef.current = pdfDoc
        setPageCount(pdfDoc.numPages)
        setLoadError(null)
        await renderPages(pdfDoc, signal)
      } catch (err) {
        if (!signal.cancelled && !didCleanup) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load PDF')
        }
      }
    }

    load()

    return () => {
      didCleanup = true
      signal.cancelled = true
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy()
        pdfDocRef.current = null
      }
    }
  }, [pdfUrl, renderPages])

  // Click handler: find the text nearest to the click and call onSourceJump
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSourceJump || !pdfDocRef.current) return

      // Walk up the click target to find the canvas wrapper
      const target = e.target as HTMLElement
      const wrapper = target.closest<HTMLElement>('[data-page-index]')
      if (!wrapper) return
      const pageIndex = parseInt(wrapper.dataset.pageIndex ?? '1', 10)

      const canvas = wrapper.querySelector('canvas')
      if (!canvas) return

      const canvasRect = canvas.getBoundingClientRect()
      const canvasX = e.clientX - canvasRect.left
      const canvasY = e.clientY - canvasRect.top

      // Convert canvas coordinates to PDF user-space coordinates
      const page = await pdfDocRef.current.getPage(pageIndex)
      const viewport = page.getViewport({ scale: SCALE })
      // viewport.convertToPdfPoint maps [canvasX, canvasY] → [pdfX, pdfY]
      const [pdfX, pdfY] = viewport.convertToPdfPoint(canvasX, canvasY)

      // Retrieve the text layer for this page
      const textContent = await page.getTextContent()

      // Find the text item whose bounding box is closest to the click point.
      // Each item has a `transform` (6-element matrix) and `width`/`height`.
      let bestText = ''
      let bestDist = Infinity

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of textContent.items as any[]) {
        if (!item.str) continue
        const [, , , , tx, ty] = item.transform as number[]
        // Use the bottom-left corner of the text item as the reference point
        const dx = pdfX - tx
        const dy = pdfY - ty
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < bestDist) {
          bestDist = dist
          bestText = item.str
        }
      }

      if (bestText.trim()) {
        onSourceJump(bestText.trim())
      }
    },
    [onSourceJump]
  )

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm px-4 text-center">
        {loadError}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-y-auto bg-zinc-800 py-3 px-2"
      onClick={handleClick}
      title={onSourceJump ? 'Click to jump to source' : undefined}
      data-testid="pdf-canvas"
    >
      {pageCount === 0 && (
        <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
          Loading PDF…
        </div>
      )}
    </div>
  )
}
