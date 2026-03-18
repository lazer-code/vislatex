'use client'

interface PDFViewerProps {
  pdfUrl: string | null
  isCompiling: boolean
  compileError: boolean
  onReload: () => void
}

export default function PDFViewer({ pdfUrl, isCompiling, compileError, onReload }: PDFViewerProps) {
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
        {compileError ? (
          <>
            <p className="text-sm text-red-400">Compilation failed</p>
            <button
              onClick={onReload}
              disabled={isCompiling}
              className="text-sm px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCompiling ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Compiling…
                </>
              ) : (
                <>↺ Retry Compile</>
              )}
            </button>
          </>
        ) : (
          <p className="text-sm">Compile to see preview</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Toolbar: reload + open in new tab */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <button
          onClick={onReload}
          disabled={isCompiling}
          title="Recompile PDF"
          className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {isCompiling ? (
            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <span>↺</span>
          )}
          Reload PDF
        </button>
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
        key={pdfUrl}
        src={pdfUrl}
        className="w-full flex-1 border-0"
        title="PDF Preview"
      />
    </div>
  )
}
