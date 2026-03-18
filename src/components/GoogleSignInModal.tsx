'use client'

import { useState } from 'react'

const LS_CLIENT_ID_KEY = 'vislatex_google_client_id'

interface GoogleSignInModalProps {
  onConfirm: (clientId: string) => void
  onCancel: () => void
}

export default function GoogleSignInModal({ onConfirm, onCancel }: GoogleSignInModalProps) {
  const [clientId, setClientId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_CLIENT_ID_KEY) ?? '' : ''
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = clientId.trim()
    if (!trimmed) return
    localStorage.setItem(LS_CLIENT_ID_KEY, trimmed)
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Google Sign-In Setup</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Enter your Google OAuth 2.0 Client ID to enable Google Drive integration.
          You can create one at{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            Google Cloud Console
          </a>
          . Make sure to add your site&apos;s URL as an authorised JavaScript origin.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="client-id-input">
              Client ID
            </label>
            <input
              id="client-id-input"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
              className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-600 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!clientId.trim()}
              className="px-4 py-2 text-sm rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
