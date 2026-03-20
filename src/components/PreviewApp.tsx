import { useState, useEffect, useRef } from 'react'

/**
 * Rendered in the detached PDF preview window (loaded at `?mode=preview`).
 * Listens for `pdf-update` IPC messages pushed by the main renderer after
 * each successful compilation and reloads the <iframe> automatically.
 */
export default function PreviewApp() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const pdfUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.onPdfUpdate) return

    const unsub = window.electronAPI.onPdfUpdate((pdfBase64) => {
      // Revoke the previous object URL to avoid memory leaks.
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
      }
      if (pdfBase64) {
        const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        pdfUrlRef.current = url
        setPdfUrl(url)
      } else {
        setPdfUrl(null)
      }
    })

    return () => {
      unsub()
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
      }
    }
  }, [])

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 gap-3 text-zinc-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-16 w-16 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <p className="text-sm">Waiting for compilation…</p>
        <p className="text-xs text-zinc-600">The PDF will appear here automatically after you compile.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      <iframe
        key={pdfUrl}
        src={pdfUrl}
        className="w-full flex-1 border-0"
        title="PDF Preview"
      />
    </div>
  )
}
