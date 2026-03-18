'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import TopBar from './TopBar'
import Editor from './Editor'
import PDFViewer from './PDFViewer'
import LogPanel from './LogPanel'
import DropZone from './DropZone'

const DEFAULT_LATEX = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}

\\title{Hello, VisLaTeX!}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to \\textbf{VisLaTeX} — a modern LaTeX previewer.

\\section{Mathematics}
Here is a famous equation:
\\[
  E = mc^2
\\]

And the quadratic formula:
\\[
  x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\\]

\\section{Lists}
\\begin{itemize}
  \\item Type LaTeX in the left panel
  \\item See the PDF update automatically
  \\item Download your compiled PDF
\\end{itemize}

\\end{document}
`

export default function VisLatexApp() {
  const [latexSource, setLatexSource] = useState(DEFAULT_LATEX)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileError, setCompileError] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const mainFileName = 'main.tex'
  const [assets, setAssets] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const pdfUrlRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const compile = useCallback(async (source: string, assetFiles: File[]) => {
    if (!source.trim()) return
    setIsCompiling(true)

    try {
      const formData = new FormData()
      formData.append('mainTex', source)
      for (const asset of assetFiles) {
        formData.append('assets', asset)
      }

      const res = await fetch('/api/compile', {
        method: 'POST',
        body: formData,
      })

      const data: { success: boolean; pdf: string | null; log: string } = await res.json()

      setCompileLog(data.log ?? '')
      setCompileError(!data.success)

      if (data.pdf) {
        const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)

        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current)
        }
        pdfUrlRef.current = url
        setPdfUrl(url)
      } else {
        setPdfUrl(null)
        pdfUrlRef.current = null
        setLogOpen(true)
      }
    } catch (err) {
      setCompileLog(err instanceof Error ? err.message : 'Network error')
      setCompileError(true)
      setLogOpen(true)
    } finally {
      setIsCompiling(false)
    }
  }, [])

  // Debounced auto-compile
  useEffect(() => {
    if (!latexSource.trim()) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      compile(latexSource, assets)
    }, 800)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [latexSource, assets, compile])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  const handleFilesSelected = (files: FileList) => {
    const fileArray = Array.from(files)
    const texFile = fileArray.find((f) => f.name.endsWith('.tex'))
    const otherFiles = fileArray.filter((f) => !f.name.endsWith('.tex'))

    if (texFile) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setLatexSource(content)
      }
      reader.readAsText(texFile)
    }

    if (otherFiles.length > 0) {
      setAssets((prev) => {
        const names = new Set(otherFiles.map((f) => f.name))
        const filtered = prev.filter((f) => !names.has(f.name))
        return [...filtered, ...otherFiles]
      })
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files)
    }
  }

  const handleDropZoneDrop = (files: FileList) => {
    setIsDragging(false)
    handleFilesSelected(files)
  }

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopBar
        fileName={mainFileName}
        pdfUrl={pdfUrl}
        isCompiling={isCompiling}
        compileError={compileError}
        onCompile={() => compile(latexSource, assets)}
        onFilesSelected={handleFilesSelected}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className="w-1/2 flex flex-col border-r border-zinc-700 overflow-hidden">
          <Editor value={latexSource} onChange={setLatexSource} />
        </div>

        {/* PDF preview panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <PDFViewer pdfUrl={pdfUrl} />
        </div>
      </div>

      <LogPanel
        log={compileLog}
        isOpen={logOpen}
        onToggle={() => setLogOpen((v) => !v)}
        hasError={compileError}
      />

      <DropZone isDragging={isDragging} onDrop={handleDropZoneDrop} />
    </div>
  )
}
