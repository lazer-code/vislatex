'use client'

import { useRef } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import type { CredentialResponse } from '@react-oauth/google'
import { useAuth, GoogleUser } from '../contexts/AuthContext'

interface TopBarProps {
  fileName: string
  pdfUrl: string | null
  isCompiling: boolean
  compileError: boolean
  compiler: 'pdflatex' | 'xelatex'
  onCompile: () => void
  onFilesSelected: (files: FileList) => void
  onCompilerChange: (compiler: 'pdflatex' | 'xelatex') => void
  onOpenFolder: () => void
  onOpenDrivePicker: () => void
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

/**
 * Decode the JWT id_token returned by Google One Tap / OAuth to extract basic
 * user profile info (name, email, picture).  We only use the payload – no
 * signature verification is needed here because the token came directly from
 * Google's OAuth endpoint over HTTPS.
 */
function decodeGoogleJwt(idToken: string): GoogleUser | null {
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]))
    return {
      name: payload.name ?? '',
      email: payload.email ?? '',
      picture: payload.picture ?? '',
    }
  } catch {
    return null
  }
}

export default function TopBar({
  fileName,
  pdfUrl,
  isCompiling,
  compileError,
  compiler,
  onCompile,
  onFilesSelected,
  onCompilerChange,
  onOpenFolder,
  onOpenDrivePicker,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isSignedIn, user, signIn, signOut } = useAuth()

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

  const handleGoogleSuccess = (response: CredentialResponse) => {
    if (!response.credential) return
    const userInfo = decodeGoogleJwt(response.credential)
    if (!userInfo) return
    // credential is an id_token; we need an access token for Drive API.
    // GoogleLogin provides id_token; for Drive we use the implicit token flow
    // triggered separately via window.google.accounts.oauth2.initTokenClient.
    // We start the token request here after the user consents to identity.
    requestDriveToken(userInfo)
  }

  const requestDriveToken = (userInfo: GoogleUser) => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    if (!google?.accounts?.oauth2) return

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse: { access_token?: string; error?: string }) => {
        if (tokenResponse.access_token) {
          signIn(tokenResponse.access_token, userInfo)
        }
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  }

  const statusIndicator = () => {
    if (isCompiling) return <SpinnerIcon />
    if (compileError) return <span className="text-red-400 text-lg leading-none">✗</span>
    if (pdfUrl) return <span className="text-emerald-400 text-lg leading-none">✓</span>
    return null
  }

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-0.5 mr-2 select-none">
        <span className="text-xl font-bold text-zinc-400">VIS</span>
        <span className="text-xl font-bold text-cyan-400">LATEX</span>
      </div>

      {/* File name */}
      <span className="text-sm text-zinc-400 font-mono bg-zinc-800 px-2 py-1 rounded">
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
        className="text-sm px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        title="Select LaTeX compiler"
      >
        <option value="xelatex">XeLaTeX</option>
        <option value="pdflatex">pdfLaTeX</option>
      </select>

      {/* Open Folder button */}
      <button
        onClick={onOpenFolder}
        className="text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
        title="Open a project folder"
      >
        📂 Open Folder
      </button>

      {/* Google Drive button — only shown when signed in */}
      {isSignedIn && (
        <button
          onClick={onOpenDrivePicker}
          className="text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
          title="Import from Google Drive"
        >
          ☁ Drive
        </button>
      )}

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
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
        className="text-sm px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Compile ▶
      </button>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!pdfUrl}
        className="text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Download PDF
      </button>

      {/* Google Sign-in / user badge */}
      {isSignedIn && user ? (
        <div className="flex items-center gap-2">
          {user.picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
          )}
          <button
            onClick={signOut}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            title={`Signed in as ${user.email}`}
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="shrink-0">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => console.error('Google sign-in failed')}
            useOneTap={false}
            type="standard"
            theme="filled_black"
            size="medium"
            text="signin_with"
            shape="rectangular"
          />
        </div>
      )}
    </header>
  )
}
