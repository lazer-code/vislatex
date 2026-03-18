'use client'

/**
 * AuthContext — provides Google OAuth state for the whole app.
 *
 * Access tokens are stored in React state only (never localStorage) so they
 * are discarded when the browser tab/session ends.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface GoogleUser {
  name: string
  email: string
  picture: string
}

export interface AuthState {
  isSignedIn: boolean
  accessToken: string | null
  user: GoogleUser | null
}

interface AuthContextValue extends AuthState {
  signIn: (accessToken: string, user: GoogleUser) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isSignedIn: false,
    accessToken: null,
    user: null,
  })

  const signIn = useCallback((accessToken: string, user: GoogleUser) => {
    setState({ isSignedIn: true, accessToken, user })
  }, [])

  const signOut = useCallback(() => {
    setState({ isSignedIn: false, accessToken: null, user: null })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
