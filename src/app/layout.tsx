import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'VisLaTeX',
  description: 'Modern LaTeX document viewer and previewer',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}>
      <body className="bg-zinc-950 text-zinc-100 h-screen overflow-hidden">
        {children}
        {/* Google Identity Services — loaded only when a client ID is configured */}
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <Script
            id="google-gsi-script"
            src="https://accounts.google.com/gsi/client"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  )
}
