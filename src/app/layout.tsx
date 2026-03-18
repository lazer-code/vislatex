import type { Metadata } from 'next'
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
      </body>
    </html>
  )
}
