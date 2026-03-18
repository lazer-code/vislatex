'use client'

interface PDFViewerProps {
  pdfUrl: string | null
  onReload?: () => void
  driveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

export default function PDFViewer({ pdfUrl, onReload, driveStatus }: PDFViewerProps) {
  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 gap-4 text-zinc-500">
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
        <p className="text-sm">Compile to see preview</p>
        {onReload && (
          <button
            onClick={onReload}
            className="text-xs px-3 py-1.5 rounded border border-zinc-600 text-zinc-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
          >
            ↺ Reload
          </button>
        )}
      </div>
    )
  }

  const driveStatusLabel: Record<string, string> = {
    saving: '↑ Saving to Drive…',
    saved: '✓ Saved to Drive',
    error: '✗ Drive save failed',
  }
  const driveStatusColor: Record<string, string> = {
    saving: 'text-zinc-400',
    saved: 'text-emerald-400',
    error: 'text-red-400',
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Toolbar row */}
      <div className="flex items-center justify-end gap-3 px-3 py-1.5 border-b border-zinc-800 shrink-0">
        {driveStatus && driveStatus !== 'idle' && (
          <span className={`text-xs ${driveStatusColor[driveStatus] ?? 'text-zinc-400'}`}>
            {driveStatusLabel[driveStatus]}
          </span>
        )}
        {onReload && (
          <button
            onClick={onReload}
            title="Re-run compilation"
            className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors"
          >
            ↺ Reload
          </button>
        )}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src={pdfUrl}
        className="w-full flex-1 border-0"
        title="PDF Preview"
      />
    </div>
  )
}
