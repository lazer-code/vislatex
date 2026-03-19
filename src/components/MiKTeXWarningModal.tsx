const MIKTEX_DOWNLOAD_URL = 'https://miktex.org/download'

interface MiKTeXWarningModalProps {
  onDismiss: () => void
}

export default function MiKTeXWarningModal({ onDismiss }: MiKTeXWarningModalProps) {
  const handleDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(MIKTEX_DOWNLOAD_URL)
    } else {
      window.open(MIKTEX_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl select-none" aria-hidden="true">⚠️</span>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">MiKTeX Not Found</h2>
            <p className="text-sm text-zinc-400">
              No LaTeX installation was detected on your system. VisLaTeX requires{' '}
              <strong className="text-zinc-200">MiKTeX</strong> (or another TeX distribution such as
              TeX Live) to compile documents.
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 mb-5">
          Please install MiKTeX and make sure it is on your system{' '}
          <span className="font-mono text-zinc-300">PATH</span>, then restart VisLaTeX.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={MIKTEX_DOWNLOAD_URL}
            onClick={handleDownloadClick}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download MiKTeX
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 px-4 py-2 text-sm rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  )
}
