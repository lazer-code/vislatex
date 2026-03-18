'use client'

import { useEffect, useRef, useState } from 'react'
import { getLineDirection } from '@/utils/lineDirection'

interface EditorProps {
  value: string
  onChange: (value: string) => void
}

export default function Editor({ value, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const [isLoaded, setIsLoaded] = useState(false)
  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    async function init() {
      const { loader } = await import('@monaco-editor/react')
      const monaco = await import('monaco-editor')
      loader.config({ monaco })

      if (cancelled || !containerRef.current) return

      const monacoInstance = await loader.init()

      if (cancelled || !containerRef.current) return

      const editor = monacoInstance.editor.create(containerRef.current, {
        value: valueRef.current,
        language: 'latex',
        theme: 'vs-dark',
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on' as const,
        wordWrap: 'on' as const,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        padding: { top: 12, bottom: 12 },
      })

      editorRef.current = editor
      setIsLoaded(true)

      // --- Per-line RTL/LTR alignment ---
      // Tracks which logical line numbers (1-based) should be RTL.
      const rtlLines = new Set<number>()

      /**
       * Returns the logical line number for a given pixel-top value reported by
       * a .view-line element.  Handles word-wrapped lines by finding the logical
       * line whose visual span [topForLine(i), topForLine(i+1)) contains `top`.
       */
      function logicalLineForTop(top: number): number | undefined {
        const model = editor.getModel()
        if (!model) return undefined
        const count = model.getLineCount()
        for (let i = 1; i <= count; i++) {
          const lineTop = editor.getTopForLineNumber(i)
          const nextTop =
            i < count ? editor.getTopForLineNumber(i + 1) : Infinity
          if (top >= lineTop && top < nextTop) return i
        }
        return undefined
      }

      /**
       * Walks every rendered .view-line DOM element and applies the appropriate
       * direction class based on the rtlLines set.  Called after any event that
       * may have caused Monaco to create or recycle view-line elements.
       */
      function applyLineDirections() {
        const dom = editor.getDomNode()
        if (!dom) return
        const elements = dom.querySelectorAll<HTMLElement>('.view-line')
        elements.forEach((el) => {
          const top = parseInt(el.style.top || '0', 10)
          const lineNumber = logicalLineForTop(top)
          if (lineNumber === undefined) return
          if (rtlLines.has(lineNumber)) {
            el.classList.add('monaco-rtl-line')
            el.classList.remove('monaco-ltr-line')
          } else {
            el.classList.remove('monaco-rtl-line')
            el.classList.add('monaco-ltr-line')
          }
        })
      }

      /** Updates the direction state for a single logical line. */
      function updateLine(lineNumber: number) {
        const model = editor.getModel()
        if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) return
        const content = model.getLineContent(lineNumber)
        if (getLineDirection(content) === 'rtl') {
          rtlLines.add(lineNumber)
        } else {
          rtlLines.delete(lineNumber)
        }
      }

      /** Scans every line in the model and rebuilds the rtlLines set. */
      function scanAllLines() {
        const model = editor.getModel()
        if (!model) return
        rtlLines.clear()
        for (let i = 1; i <= model.getLineCount(); i++) {
          const content = model.getLineContent(i)
          if (getLineDirection(content) === 'rtl') rtlLines.add(i)
        }
      }

      // Initial scan so existing content is aligned on load.
      scanAllLines()
      // Apply after a short delay to let Monaco finish the first render.
      setTimeout(applyLineDirections, 0)

      // Re-apply when the cursor moves to a DIFFERENT line.
      let lastCursorLine = -1
      editor.onDidChangeCursorPosition((e) => {
        const line = e.position.lineNumber
        if (line === lastCursorLine) return
        lastCursorLine = line
        updateLine(line)
        applyLineDirections()
      })

      // Re-apply when content changes (handles typing, paste, etc.).
      editor.onDidChangeModelContent((e) => {
        e.changes.forEach((change) => {
          const start = change.range.startLineNumber
          const end = change.range.endLineNumber
          for (let i = start; i <= end; i++) updateLine(i)
          // When newlines are inserted or deleted line numbers shift; only
          // re-scan the lines that could have shifted (from the change point
          // to the end of the range, capped to avoid scanning huge documents).
          if (change.text.includes('\n') || change.rangeLength > 0) {
            const model = editor.getModel()
            if (model) {
              const limit = Math.min(end + 50, model.getLineCount())
              for (let i = end + 1; i <= limit; i++) updateLine(i)
            }
          }
        })
        onChangeRef.current(editor.getValue())
        applyLineDirections()
      })

      // Re-apply direction classes whenever Monaco recycles view-line elements
      // (scroll, resize, etc.).
      editor.onDidScrollChange(applyLineDirections)
      editor.onDidLayoutChange(applyLineDirections)
      // -----------------------------------
    }

    init()

    return () => {
      cancelled = true
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  // Sync external value changes (e.g. file upload) without re-mounting
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.getValue() !== value) {
      const model = editor.getModel()
      if (model) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: value }],
          () => null
        )
      }
    }
  }, [value])

  return (
    <div className="flex-1 h-full bg-zinc-900 overflow-hidden relative">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm z-10 pointer-events-none">
          Loading editor…
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
