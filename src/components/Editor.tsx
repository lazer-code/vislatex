'use client'

import { useEffect, useRef, useState } from 'react'

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

      editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue())
      })
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
