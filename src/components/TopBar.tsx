import { useRef } from 'react'

export interface GoogleUser {
  name: string
  email: string
  picture: string
}

interface TopBarProps {
  fileName: string
  pdfUrl: string | null
  isCompiling: boolean
  compileError: boolean
  compiler: 'pdflatex' | 'xelatex'
  googleUser: GoogleUser | null
  driveAutoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onCompile: () => void
  onFilesSelected: (files: FileList) => void
  onCompilerChange: (compiler: 'pdflatex' | 'xelatex') => void
  onOpenFolder: () => void
  onGoogleSignIn: () => void
  onGoogleSignOut: () => void
  onOpenDrive: () => void
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-cyan-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export default function TopBar({
  fileName,
  pdfUrl,
  isCompiling,
  compileError,
  compiler,
  googleUser,
  driveAutoSaveStatus,
  onCompile,
  onFilesSelected,
  onCompilerChange,
  onOpenFolder,
  onGoogleSignIn,
  onGoogleSignOut,
  onOpenDrive,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files)
      e.target.value = ''
    }
  }

  const handleDownload = () => {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = 'document.pdf'
    a.click()
  }

  const statusIndicator = () => {
    if (isCompiling) return <SpinnerIcon />
    if (compileError) return <span className="text-red-400 text-lg leading-none">✗</span>
    if (pdfUrl) return <span className="text-emerald-400 text-lg leading-none">✓</span>
    return null
  }

  return (
    <header dir="ltr" className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-0.5 mr-2 select-none">
        <span className="text-xl font-bold text-zinc-400">VIS</span>
        <span className="text-xl font-bold text-cyan-400">LATEX</span>
      </div>

      {/* File name */}
      <span className="text-sm text-zinc-400 font-mono bg-zinc-800 px-2 py-1 rounded max-w-[180px] truncate">
        {fileName}
      </span>

      <div className="flex-1" />

      {/* Status indicator */}
      <div className="w-5 flex items-center justify-center">{statusIndicator()}</div>

      {/* Compiler selector */}
      <select
        value={compiler}
        onChange={(e) => onCompilerChange(e.target.value as 'pdflatex' | 'xelatex')}
        disabled={isCompiling}
        className="shrink-0 text-sm px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        title="Select LaTeX compiler"
      >
        <option value="xelatex">XeLaTeX</option>
        <option value="pdflatex">pdfLaTeX</option>
      </select>

      {/* Open Folder button */}
      <button
        onClick={onOpenFolder}
        className="shrink-0 text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
        title="Open a project folder"
      >
        📂 Open Folder
      </button>

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="shrink-0 text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
      >
        Upload Files
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.bib,.cls,.sty,.png,.jpg,.jpeg,.svg,.pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Compile button */}
      <button
        onClick={onCompile}
        disabled={isCompiling}
        className="shrink-0 text-sm px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Compile ▶
      </button>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!pdfUrl}
        className="shrink-0 text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Download PDF
      </button>

      {/* Google Drive section */}
      {googleUser ? (
        <div className="flex items-center gap-2">
          {/* Auto-save indicator */}
          {driveAutoSaveStatus === 'saving' && (
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </span>
          )}
          {driveAutoSaveStatus === 'saved' && (
            <span className="text-xs text-emerald-400">✓ Saved</span>
          )}
          {driveAutoSaveStatus === 'error' && (
            <span className="text-xs text-red-400">✗ Save failed</span>
          )}
          <button
            onClick={onOpenDrive}
            className="shrink-0 text-sm px-2.5 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
            title="Browse Google Drive"
          >
            {/* Small Drive icon */}
            <svg className="h-3.5 w-3.5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.6 66.85L21.9 78.9l14.28-24.72H0z" fill="#0066da" />
              <path d="M43.18 0 28.9 24.28h43.56L87.3 0z" fill="#00ac47" />
              <path d="M73.56 55.54H29.43l-7.53 12.86 8.26 9.5 43.4.1z" fill="#ea4335" />
              <path d="M43.18 0 0 0 21.9 36.5l21.28-12.22z" fill="#00832d" />
              <path d="M87.3 0 65.4 36.5l-29.13.78 7 12.72 43.8-24.56z" fill="#2684fc" />
              <path d="M43.3 50l-7 12.72 7.53-12.86H29.43L43.3 50z" fill="#ffba00" />
            </svg>
            Drive
          </button>
          {/* User avatar */}
          <div className="relative group">
            {googleUser.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="h-7 w-7 rounded-full cursor-pointer border border-zinc-600 hover:border-cyan-500 transition-colors"
                title={`${googleUser.name} (${googleUser.email})\nClick to sign out`}
                onClick={onGoogleSignOut}
              />
            ) : (
              <button
                onClick={onGoogleSignOut}
                className="h-7 w-7 rounded-full bg-zinc-700 border border-zinc-600 hover:border-cyan-500 text-xs text-zinc-300 flex items-center justify-center transition-colors"
                title={`${googleUser.name}\nClick to sign out`}
              >
                {googleUser.name[0]?.toUpperCase() ?? 'G'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={onGoogleSignIn}
          className="shrink-0 text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
          title="Sign in with Google for Drive integration"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in
        </button>
      )}
    </header>
  )
}
