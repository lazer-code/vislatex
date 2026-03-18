'use client'

import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface EditorProps {
  value: string
  onChange: (value: string) => void
}

export default function Editor({ value, onChange }: EditorProps) {
  return (
    <div className="flex-1 overflow-hidden bg-zinc-900 h-full">
      <MonacoEditor
        height="100%"
        language="plaintext"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val ?? '')}
        loading={
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Loading editor…
          </div>
        }
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  )
}
