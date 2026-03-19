import { useEffect, useRef, useState, forwardRef, useImperativeHandle, type ForwardedRef } from 'react'
import { getLineDirection, getBraceBlocksOutsideMath } from '@/utils/lineDirection'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  diagnostics?: Array<{ line: number; message: string; severity: 'error' | 'warning' }>
}

/** Methods exposed via the Editor's forwarded ref. */
export interface EditorHandle {
  /**
   * Scrolls the editor to the given 1-based line number and highlights it
   * briefly so the user can see where the PDF click landed.
   */
  jumpToLine(line: number): void
}

const Editor = forwardRef(function Editor(
  { value, onChange, diagnostics }: EditorProps,
  ref: ForwardedRef<EditorHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const [isLoaded, setIsLoaded] = useState(false)
  valueRef.current = value
  onChangeRef.current = onChange

  // Expose jumpToLine to the parent via forwarded ref
  useImperativeHandle(ref, () => ({
    jumpToLine(line: number) {
      const editor = editorRef.current
      if (!editor) return
      editor.revealLineInCenter(line)
      editor.setPosition({ lineNumber: line, column: 1 })
      // Flash the line with a decoration that auto-clears after 1.5 s
      import('@monaco-editor/react').then(({ loader }) => {
        loader.init().then((monacoInst) => {
          const ids = editor.deltaDecorations([], [
            {
              range: new monacoInst.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'source-jump-highlight',
              },
            },
          ])
          setTimeout(() => {
            editor.deltaDecorations(ids, [])
          }, 1500)
        })
      })
    },
  }))

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
       * direction attribute based on the rtlLines set.  Called after any event
       * that may have caused Monaco to create or recycle view-line elements.
       *
       * NOTE: We intentionally do NOT set `direction: rtl` on .view-line
       * elements (see globals.css for the full rationale).  Instead we use
       * `text-align: right` via the data-direction attribute so that RTL lines
       * are visually right-anchored without breaking Monaco's LTR hit-testing.
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

      // Debounced version that coalesces rapid calls into a single
      // requestAnimationFrame tick.  This is used by the MutationObserver so
      // that typing / scrolling doesn't produce dozens of redundant passes.
      let rafId: ReturnType<typeof requestAnimationFrame> | undefined
      function scheduleApplyDirections() {
        if (rafId !== undefined) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          rafId = undefined
          applyLineDirections()
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

      // ---- Brace-block RTL decoration ----
      // We use Monaco inline decorations to attach CSS classes to the `{` and
      // `}` characters that delimit RTL brace groups (outside math).  The
      // corresponding CSS rules insert Unicode RLI (U+2067) / PDI (U+2069)
      // bidi control characters via ::after / ::before pseudo-elements.  These
      // invisible markers instruct the browser's bidi algorithm to treat the
      // content between them as an isolated RTL run, so Hebrew text inside {}
      // renders right-to-left with its visual start next to `}` and end next
      // to `{`, regardless of the surrounding line direction.
      //
      // We deliberately do NOT apply `direction: rtl` as an inline style (see
      // globals.css) because that would diverge Monaco's visual positions from
      // its internal LTR glyph-metric hit-testing, breaking click-to-caret.
      let braceDecorationIds: string[] = []

      function applyBraceDecorations() {
        const model = editor.getModel()
        if (!model) return

        const newDecorations: import('monaco-editor').editor.IModelDeltaDecoration[] = []

        for (let lineNum = 1; lineNum <= model.getLineCount(); lineNum++) {
          const lineText = model.getLineContent(lineNum)
          const blocks = getBraceBlocksOutsideMath(lineText)
          for (const { braceOpen, braceClose } of blocks) {
            // Monaco columns are 1-based.
            const openCol = braceOpen + 1
            const closeCol = braceClose + 1
            newDecorations.push({
              range: new monacoInstance.Range(lineNum, openCol, lineNum, openCol + 1),
              options: { inlineClassName: 'brace-rtl-start', stickiness: 1 },
            })
            newDecorations.push({
              range: new monacoInstance.Range(lineNum, closeCol, lineNum, closeCol + 1),
              options: { inlineClassName: 'brace-rtl-end', stickiness: 1 },
            })
          }
        }

        braceDecorationIds = editor.deltaDecorations(braceDecorationIds, newDecorations)
      }

      // Initial scan so existing content is aligned on load.
      scanAllLines()
      applyBraceDecorations()
      // Apply after a short delay to let Monaco finish the first render.
      setTimeout(applyLineDirections, 0)

      // ---- MutationObserver fix for "line disappears on click" ----
      // Monaco recycles / recreates .view-line DOM elements on every cursor
      // move, scroll, or resize.  When an element is recreated our
      // data-direction attribute is lost, causing the CSS text-align to revert
      // and the line to "disappear" (or misalign) until the file is reopened.
      //
      // A MutationObserver on the .view-lines container fires whenever Monaco
      // touches those elements; we respond by re-stamping the attributes in the
      // next animation frame.
      const editorDom = editor.getDomNode()
      let mutationObserver: MutationObserver | undefined
      if (editorDom) {
        const viewLinesEl = editorDom.querySelector('.view-lines')
        if (viewLinesEl) {
          mutationObserver = new MutationObserver(scheduleApplyDirections)
          mutationObserver.observe(viewLinesEl, {
            childList: true,   // element added / removed
            subtree: true,     // catches content recycling inside each .view-line
          })
        }
      }

      // Re-apply on every cursor position change (including same-line clicks).
      // The previous implementation skipped same-line moves to save work, but
      // Monaco re-renders the cursor decoration on every click which can
      // discard our data-direction attribute.
      editor.onDidChangeCursorPosition((e) => {
        const line = e.position.lineNumber
        updateLine(line)
        scheduleApplyDirections()
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
        applyBraceDecorations()
        scheduleApplyDirections()
      })

      // Re-apply direction classes whenever Monaco recycles view-line elements
      // (scroll, resize, etc.).
      editor.onDidScrollChange(scheduleApplyDirections)
      editor.onDidLayoutChange(scheduleApplyDirections)
      // -----------------------------------

      return () => {
        mutationObserver?.disconnect()
        if (rafId !== undefined) cancelAnimationFrame(rafId)
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
})

export default Editor
