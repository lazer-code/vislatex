import { useEffect, useRef, useState } from 'react'
import { getLineDirection } from '@/utils/lineDirection'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  diagnostics?: Array<{ line: number; message: string; severity: 'error' | 'warning' }>
}

export default function Editor({ value, onChange, diagnostics }: EditorProps) {
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

      monacoInstance.languages.register({ id: 'latex' })
      monacoInstance.languages.setMonarchTokensProvider('latex', {
        defaultToken: '',
        tokenizer: {
          root: [
            [/%.*$/, 'comment'],
            [/\\(?:begin|end)\b/, 'keyword.control'],
            [/\\[a-zA-Z@]+\*?/, 'keyword'],
            [/\$\$/, { token: 'string.math', next: '@mathblock' }],
            [/\$/, { token: 'string.math', next: '@mathinline' }],
            [/[{}]/, 'delimiter.curly'],
            [/[\[\]]/, 'delimiter.bracket'],
            [/[0-9]+/, 'number'],
            [/[&]/, 'operator'],
          ],
          mathblock: [
            [/\$\$/, { token: 'string.math', next: '@pop' }],
            [/./, 'string.math'],
          ],
          mathinline: [
            [/\$/, { token: 'string.math', next: '@pop' }],
            [/./, 'string.math'],
          ],
        },
      })

      // --- LaTeX completion provider ---
      monacoInstance.languages.registerCompletionItemProvider('latex', {
        triggerCharacters: ['\\'],
        provideCompletionItems(model, position) {
          const linePrefix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          const backslashIdx = linePrefix.lastIndexOf('\\')
          if (backslashIdx === -1) return { suggestions: [] }

          // Replace from the '\' character up to the current cursor position.
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: backslashIdx + 1, // 1-based column of '\'
            endColumn: position.column,
          }

          const Snippet =
            monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
          const Kind = monacoInstance.languages.CompletionItemKind

          /** Build a \begin{env}…\end{env} snippet. */
          const envSnippet = (env: string, body = '\t$1') =>
            `\\begin{${env}}\n${body}\n\\end{${env}}$0`

          return {
            suggestions: [
              // ── Environments ────────────────────────────────────────────
              {
                label: '\\begin{enumerate}',
                kind: Kind.Snippet,
                insertText: envSnippet('enumerate', '\t\\item $1'),
                insertTextRules: Snippet,
                documentation: 'Numbered list environment',
                range,
              },
              {
                label: '\\begin{itemize}',
                kind: Kind.Snippet,
                insertText: envSnippet('itemize', '\t\\item $1'),
                insertTextRules: Snippet,
                documentation: 'Bullet list environment',
                range,
              },
              {
                label: '\\begin{figure}',
                kind: Kind.Snippet,
                insertText: envSnippet(
                  'figure',
                  '\t\\centering\n\t\\includegraphics[width=\\linewidth]{$1}\n\t\\caption{$2}\n\t\\label{fig:$3}',
                ),
                insertTextRules: Snippet,
                documentation: 'Figure environment',
                range,
              },
              {
                label: '\\begin{table}',
                kind: Kind.Snippet,
                insertText: envSnippet(
                  'table',
                  '\t\\centering\n\t\\begin{tabular}{$1}\n\t\t$2\n\t\\end{tabular}\n\t\\caption{$3}\n\t\\label{tab:$4}',
                ),
                insertTextRules: Snippet,
                documentation: 'Table environment',
                range,
              },
              {
                label: '\\begin{tabular}',
                kind: Kind.Snippet,
                insertText: '\\begin{tabular}{$1}\n\t$2\n\\end{tabular}$0',
                insertTextRules: Snippet,
                documentation: 'Tabular environment',
                range,
              },
              {
                label: '\\begin{equation}',
                kind: Kind.Snippet,
                insertText: envSnippet('equation', '\t$1'),
                insertTextRules: Snippet,
                documentation: 'Numbered equation',
                range,
              },
              {
                label: '\\begin{align}',
                kind: Kind.Snippet,
                insertText: envSnippet('align', '\t$1 &= $2 \\\\'),
                insertTextRules: Snippet,
                documentation: 'Aligned equations',
                range,
              },
              {
                label: '\\begin{document}',
                kind: Kind.Snippet,
                insertText: envSnippet('document', '$1'),
                insertTextRules: Snippet,
                documentation: 'Document environment',
                range,
              },
              {
                label: '\\begin{abstract}',
                kind: Kind.Snippet,
                insertText: envSnippet('abstract', '$1'),
                insertTextRules: Snippet,
                documentation: 'Abstract environment',
                range,
              },
              {
                label: '\\begin{verbatim}',
                kind: Kind.Snippet,
                insertText: envSnippet('verbatim', '$1'),
                insertTextRules: Snippet,
                documentation: 'Verbatim text',
                range,
              },
              {
                label: '\\begin{center}',
                kind: Kind.Snippet,
                insertText: envSnippet('center', '\t$1'),
                insertTextRules: Snippet,
                documentation: 'Centered content',
                range,
              },
              // ── Math commands ──────────────────────────────────────────
              {
                label: '\\frac',
                kind: Kind.Snippet,
                insertText: '\\frac{$1}{$2}$0',
                insertTextRules: Snippet,
                documentation: 'Fraction: \\frac{numerator}{denominator}',
                range,
              },
              {
                label: '\\sqrt',
                kind: Kind.Snippet,
                insertText: '\\sqrt{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Square root',
                range,
              },
              {
                label: '\\sum',
                kind: Kind.Snippet,
                insertText: '\\sum_{$1}^{$2}$0',
                insertTextRules: Snippet,
                documentation: 'Summation',
                range,
              },
              {
                label: '\\int',
                kind: Kind.Snippet,
                insertText: '\\int_{$1}^{$2}$0',
                insertTextRules: Snippet,
                documentation: 'Integral',
                range,
              },
              {
                label: '\\lim',
                kind: Kind.Snippet,
                insertText: '\\lim_{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Limit',
                range,
              },
              // ── Text formatting ────────────────────────────────────────
              {
                label: '\\textbf',
                kind: Kind.Snippet,
                insertText: '\\textbf{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Bold text',
                range,
              },
              {
                label: '\\textit',
                kind: Kind.Snippet,
                insertText: '\\textit{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Italic text',
                range,
              },
              {
                label: '\\underline',
                kind: Kind.Snippet,
                insertText: '\\underline{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Underlined text',
                range,
              },
              {
                label: '\\emph',
                kind: Kind.Snippet,
                insertText: '\\emph{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Emphasized text',
                range,
              },
              {
                label: '\\texttt',
                kind: Kind.Snippet,
                insertText: '\\texttt{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Typewriter (monospace) text',
                range,
              },
              // ── Sectioning ─────────────────────────────────────────────
              {
                label: '\\section',
                kind: Kind.Snippet,
                insertText: '\\section{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Section',
                range,
              },
              {
                label: '\\subsection',
                kind: Kind.Snippet,
                insertText: '\\subsection{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Subsection',
                range,
              },
              {
                label: '\\subsubsection',
                kind: Kind.Snippet,
                insertText: '\\subsubsection{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Subsubsection',
                range,
              },
              // ── Cross-references ───────────────────────────────────────
              {
                label: '\\caption',
                kind: Kind.Snippet,
                insertText: '\\caption{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Caption',
                range,
              },
              {
                label: '\\label',
                kind: Kind.Snippet,
                insertText: '\\label{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Label',
                range,
              },
              {
                label: '\\ref',
                kind: Kind.Snippet,
                insertText: '\\ref{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Reference',
                range,
              },
              {
                label: '\\cite',
                kind: Kind.Snippet,
                insertText: '\\cite{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Citation',
                range,
              },
              // ── Preamble ───────────────────────────────────────────────
              {
                label: '\\usepackage',
                kind: Kind.Snippet,
                insertText: '\\usepackage{$1}$0',
                insertTextRules: Snippet,
                documentation: 'Use package',
                range,
              },
              {
                label: '\\documentclass',
                kind: Kind.Snippet,
                insertText: '\\documentclass[$1]{$2}$0',
                insertTextRules: Snippet,
                documentation: 'Document class',
                range,
              },
              {
                label: '\\includegraphics',
                kind: Kind.Snippet,
                insertText: '\\includegraphics[width=$1\\linewidth]{$2}$0',
                insertTextRules: Snippet,
                documentation: 'Include graphics',
                range,
              },
              // ── Common keywords ────────────────────────────────────────
              {
                label: '\\item',
                kind: Kind.Keyword,
                insertText: '\\item $1',
                insertTextRules: Snippet,
                documentation: 'List item',
                range,
              },
              {
                label: '\\newline',
                kind: Kind.Keyword,
                insertText: '\\newline',
                insertTextRules: Snippet,
                documentation: 'New line',
                range,
              },
              {
                label: '\\noindent',
                kind: Kind.Keyword,
                insertText: '\\noindent',
                insertTextRules: Snippet,
                documentation: 'No paragraph indent',
                range,
              },
              {
                label: '\\maketitle',
                kind: Kind.Keyword,
                insertText: '\\maketitle',
                insertTextRules: Snippet,
                documentation: 'Generate title',
                range,
              },
              {
                label: '\\tableofcontents',
                kind: Kind.Keyword,
                insertText: '\\tableofcontents',
                insertTextRules: Snippet,
                documentation: 'Table of contents',
                range,
              },
            ],
          }
        },
      })
      // ---------------------------------

      monacoInstance.editor.defineTheme('latex-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'keyword.control', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'keyword', foreground: '569CD6' },
          { token: 'string.math', foreground: 'CE9178' },
          { token: 'delimiter.curly', foreground: 'FFD700' },
          { token: 'delimiter.bracket', foreground: 'DA70D6' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'operator', foreground: 'D4D4D4' },
        ],
        colors: {},
      })

      const editor = monacoInstance.editor.create(containerRef.current, {
        value: valueRef.current,
        language: 'latex',
        theme: 'latex-dark',
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
            el.setAttribute('data-direction', 'rtl')
          } else {
            el.setAttribute('data-direction', 'ltr')
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

  // Apply diagnostics as Monaco markers
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    import('@monaco-editor/react').then(({ loader }) => {
      loader.init().then((monacoInst) => {
        const model = editor.getModel()
        if (!model) return
        const markers = (diagnostics ?? []).map((d) => ({
          severity: d.severity === 'error' ? monacoInst.MarkerSeverity.Error : monacoInst.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: d.line,
          startColumn: 1,
          endLineNumber: d.line,
          endColumn: 999,
        }))
        monacoInst.editor.setModelMarkers(model, 'latex', markers)
      })
    })
  }, [diagnostics])

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
