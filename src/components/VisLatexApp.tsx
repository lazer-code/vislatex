import { useState, useEffect, useRef, useCallback } from 'react'
import TopBar from './TopBar'
import Editor from './Editor'
import LogPanel from './LogPanel'
import DropZone from './DropZone'
import AssetPanel from './AssetPanel'
import FileExplorer from './FileExplorer'
import MiKTeXWarningModal from './MiKTeXWarningModal'
import { WorkspaceState, WorkspaceFile, isTextFile } from '../types/workspace'
import { computeSidebarWidth } from '../utils/splitterResize'

// Minimal local types for the File System Access API (not yet in @types/lib)
interface FSFileHandle {
  kind: 'file'
  getFile(): Promise<File>
}
interface FSWritableStream {
  write(data: string | ArrayBuffer | Blob): Promise<void>
  close(): Promise<void>
}
interface FSFileHandleWritable {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FSWritableStream>
}
interface FSDirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FSFileHandle | FSDirHandle]>
}
interface FSDirHandleWritable extends FSDirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandleWritable>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSDirHandleWritable>
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
}
interface WindowWithFSA {
  showDirectoryPicker(): Promise<FSDirHandleWritable>
  showSaveFilePicker(opts?: {
    suggestedName?: string
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }): Promise<FSFileHandleWritable>
}

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

const LS_SOURCE_KEY = 'vislatex_source'
const LS_COMPILER_KEY = 'vislatex_compiler'
const LS_AUTO_COMPILE_KEY = 'vislatex_auto_compile'

function parseCompileLog(log: string): Array<{ line: number; message: string; severity: 'error' | 'warning' }> {
  const diags: Array<{ line: number; message: string; severity: 'error' | 'warning' }> = []
  const lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const errMatch = lines[i].match(/^!\s+(.+)/)
    if (errMatch) {
      const msg = errMatch[1]
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const lineMatch = lines[j].match(/^l\.(\d+)\s/)
        if (lineMatch) {
          diags.push({ line: parseInt(lineMatch[1], 10), message: msg, severity: 'error' })
          break
        }
      }
    }
    const warnMatch = lines[i].match(/LaTeX Warning:\s+(.+?)(?:\s+on input line (\d+))?\.?\s*$/)
    if (warnMatch && warnMatch[2]) {
      diags.push({ line: parseInt(warnMatch[2], 10), message: warnMatch[1], severity: 'warning' })
    }
  }
  return diags
}

export default function VisLatexApp() {
  const [latexSource, setLatexSource] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LATEX
    return localStorage.getItem(LS_SOURCE_KEY) ?? DEFAULT_LATEX
  })
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileError, setCompileError] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [compiler, setCompiler] = useState<'pdflatex' | 'xelatex'>(() => {
    if (typeof window === 'undefined') return 'xelatex'
    const saved = localStorage.getItem(LS_COMPILER_KEY)
    return saved === 'pdflatex' ? 'pdflatex' : 'xelatex'
  })
  const [autoCompile, setAutoCompile] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(LS_AUTO_COMPILE_KEY) === 'true'
  })
  const [assets, setAssets] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // ── Workspace state ────────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [mainTexPath, setMainTexPath] = useState<string | null>(null)

  // Refs so compile() can always read the latest values without restarts
  const workspaceRef = useRef<WorkspaceState | null>(null)
  const mainTexPathRef = useRef<string | null>(null)
  workspaceRef.current = workspace
  mainTexPathRef.current = mainTexPath

  /**
   * Tracks the most recently focused .tex file so that compile() always
   * targets the last document the user was actively editing.
   */
  const lastTexPathRef = useRef<string | null>(null)

  /**
   * Absolute filesystem path of the opened workspace root (set when the
   * folder was opened via Electron's native dialog).  Used for real-FS
   * deletion.
   */
  const workspaceRootRef = useRef<string | null>(null)

  const pdfUrlRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // ── Resizable pane state ─────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const mainAreaRef = useRef<HTMLDivElement>(null)

  const [showMiKTeXWarning, setShowMiKTeXWarning] = useState(false)

  // ── Directory handle for save-back ───────────────────────────────────────
  const dirHandleRef = useRef<FSDirHandleWritable | null>(null)

  const compile = useCallback(
    async (
      source: string,
      assetFiles: File[],
      selectedCompiler: 'pdflatex' | 'xelatex'
    ) => {
      const ws = workspaceRef.current

      if (ws) {
        // ── Project-aware compile ──────────────────────────────────────
        // Compile target: last focused .tex > mainTexPath > first .tex in workspace
        const compilePath =
          lastTexPathRef.current ??
          mainTexPathRef.current ??
          ws.files.find((f) => f.path.endsWith('.tex'))?.path ??
          null

        if (!compilePath) {
          setCompileLog(
            'No .tex file found in the workspace. Please create or open a .tex file.'
          )
          setCompileError(true)
          setLogOpen(true)
          return
        }

        const mainContent = ws.files.find((f) => f.path === compilePath)?.content ?? ''
        if (!mainContent.trim()) return
        setIsCompiling(true)
        try {
          const filesPayload = await Promise.all(
            ws.files.map(async (file) => {
              if (file.blob) {
                const ab = await file.blob.arrayBuffer()
                const bytes = new Uint8Array(ab)
                let binary = ''
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
                return { path: file.path, name: file.name, data: btoa(binary), isText: false }
              }
              return { path: file.path, name: file.name, data: file.content ?? '', isText: true }
            })
          )
          const data = await window.electronAPI.compile({
            compiler: selectedCompiler,
            mainPath: compilePath,
            files: filesPayload,
          })
          setCompileLog(data.log ?? '')
          setCompileError(!data.success)
          if (data.pdf) {
            const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
            const blob = new Blob([bytes], { type: 'application/pdf' })
            const url = URL.createObjectURL(blob)
            if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
            pdfUrlRef.current = url
            setPdfUrl(url)
            // Push the PDF to the detached preview window (auto-opens it).
            window.electronAPI?.pushPdf?.(data.pdf)
          } else {
            setPdfUrl(null)
            pdfUrlRef.current = null
            window.electronAPI?.pushPdf?.(null)
            setLogOpen(true)
          }
        } catch (err) {
          setCompileLog(err instanceof Error ? err.message : 'Compilation error')
          setCompileError(true)
          setLogOpen(true)
        } finally {
          setIsCompiling(false)
        }
        return
      }

      // ── Single-file compile (legacy) ───────────────────────────────────
      if (!source.trim()) return
      setIsCompiling(true)
      try {
        const assetsPayload = await Promise.all(
          assetFiles.map(async (asset) => {
            const ab = await asset.arrayBuffer()
            const bytes = new Uint8Array(ab)
            let binary = ''
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
            return { name: asset.name, data: btoa(binary) }
          })
        )
        const data = await window.electronAPI.compile({
          mainTex: source,
          compiler: selectedCompiler,
          assets: assetsPayload,
        })
        setCompileLog(data.log ?? '')
        setCompileError(!data.success)
        if (data.pdf) {
          const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
          const blob = new Blob([bytes], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
          pdfUrlRef.current = url
          setPdfUrl(url)
          // Push the PDF to the detached preview window (auto-opens it).
          window.electronAPI?.pushPdf?.(data.pdf)
        } else {
          setPdfUrl(null)
          pdfUrlRef.current = null
          window.electronAPI?.pushPdf?.(null)
          setLogOpen(true)
        }
      } catch (err) {
        setCompileLog(err instanceof Error ? err.message : 'Compilation error')
        setCompileError(true)
        setLogOpen(true)
      } finally {
        setIsCompiling(false)
      }
    },
    []
  )

  // Debounced auto-compile — only triggers when autoCompile is enabled
  useEffect(() => {
    if (!autoCompile) return
    if (workspace) {
      if (!mainTexPath) return
      const src = workspace.files.find((f) => f.path === mainTexPath)?.content ?? ''
      if (!src.trim()) return
    } else {
      if (!latexSource.trim()) return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      compile(latexSource, assets, compiler)
    }, 800)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [autoCompile, latexSource, assets, compiler, workspace, mainTexPath, compile])

  // Auto-save source to localStorage (single-file mode only)
  useEffect(() => {
    if (workspace) return
    const timer = setTimeout(() => {
      localStorage.setItem(LS_SOURCE_KEY, latexSource)
    }, 1000)
    return () => clearTimeout(timer)
  }, [latexSource, workspace])

  // Persist compiler preference
  useEffect(() => {
    localStorage.setItem(LS_COMPILER_KEY, compiler)
  }, [compiler])

  // Persist auto-compile preference
  useEffect(() => {
    localStorage.setItem(LS_AUTO_COMPILE_KEY, String(autoCompile))
  }, [autoCompile])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  // Check for MiKTeX / LaTeX installation on startup (Electron only)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.checkLatex) return
    window.electronAPI.checkLatex().then((found) => {
      if (!found) setShowMiKTeXWarning(true)
    }).catch((err) => {
      console.error('[vislatex] LaTeX detection failed:', err)
    })
  }, [])

  // ── Workspace helpers ────────────────────────────────────────────────────

  /** Initialise workspace state from an array of WorkspaceFile entries. */
  const initWorkspace = useCallback((name: string, files: WorkspaceFile[]) => {
    const mainTex =
      files.find((f) => f.name === 'main.tex') ??
      files.find((f) => f.name.endsWith('.tex'))
    setWorkspace({ name, files, extraFolders: [] })
    setMainTexPath(mainTex?.path ?? null)
    setActiveFilePath(mainTex?.path ?? null)
    // Seed the last-focused .tex tracker with the initial main file
    lastTexPathRef.current = mainTex?.path ?? null
    setPdfUrl(null)
    pdfUrlRef.current = null
    setCompileLog('')
    setCompileError(false)
  }, [])

  /** Load workspace from File System Access API directory handle. */
  const loadFromDirectoryHandle = useCallback(
    async (dirHandle: FSDirHandleWritable) => {
      const files: WorkspaceFile[] = []

      async function walk(handle: FSDirHandle, prefix: string) {
        for await (const [name, entry] of handle.entries()) {
          const relPath = prefix ? `${prefix}/${name}` : name
          if (entry.kind === 'file') {
            const file = await (entry as FSFileHandle).getFile()
            const wsFile: WorkspaceFile = {
              type: 'file',
              path: relPath,
              name: file.name,
            }
            if (isTextFile(file.name)) {
              wsFile.content = await file.text()
            } else {
              wsFile.blob = file
            }
            files.push(wsFile)
          } else if (entry.kind === 'directory') {
            await walk(entry as FSDirHandle, relPath)
          }
        }
      }

      await walk(dirHandle, '')
      dirHandleRef.current = dirHandle
      initWorkspace(dirHandle.name, files)
    },
    [initWorkspace]
  )

  /** Load workspace from a webkitdirectory FileList. */
  const loadFromFileList = useCallback(
    async (fileList: FileList) => {
      const fileArray = Array.from(fileList)
      if (fileArray.length === 0) return

      // webkitRelativePath = "rootFolder/sub/file.tex"
      const firstRelPath = fileArray[0].webkitRelativePath
      const rootFolderName = firstRelPath.split('/')[0]

      const files: WorkspaceFile[] = []
      for (const file of fileArray) {
        const fullRel = file.webkitRelativePath
        const relPath = fullRel.startsWith(rootFolderName + '/')
          ? fullRel.slice(rootFolderName.length + 1)
          : fullRel
        if (!relPath) continue

        const wsFile: WorkspaceFile = { type: 'file', path: relPath, name: file.name }
        if (isTextFile(file.name)) {
          wsFile.content = await file.text()
        } else {
          wsFile.blob = file
        }
        files.push(wsFile)
      }
      // webkitdirectory fallback has no write-back handle or root path
      dirHandleRef.current = null
      workspaceRootRef.current = null
      initWorkspace(rootFolderName, files)
    },
    [initWorkspace]
  )

  /** Called by the "Open Folder" button. */
  const handleOpenFolder = useCallback(async () => {
    // Prefer the Electron native dialog (gives us the absolute path for real-FS ops)
    if (typeof window !== 'undefined' && window.electronAPI?.openDirectory) {
      try {
        const result = await window.electronAPI.openDirectory()
        if (!result) return
        workspaceRootRef.current = result.rootPath
        dirHandleRef.current = null
        const files: WorkspaceFile[] = result.files.map((f) => {
          const wsFile: WorkspaceFile = { type: 'file', path: f.path, name: f.name }
          if (f.isText) {
            wsFile.content = f.data
          } else {
            const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
            wsFile.blob = new Blob([bytes])
          }
          return wsFile
        })
        initWorkspace(result.name, files)
        return
      } catch (err) {
        console.error('[vislatex] openDirectory failed:', err)
        // Fall through to FSA / input fallback
      }
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as unknown as WindowWithFSA).showDirectoryPicker()
        workspaceRootRef.current = null
        await loadFromDirectoryHandle(dirHandle)
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // Fall through to webkitdirectory fallback
      }
    }
    folderInputRef.current?.click()
  }, [loadFromDirectoryHandle, initWorkspace])

  const handleFolderInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      await loadFromFileList(e.target.files)
    }
    e.target.value = ''
  }

  // ── Save file / folder handlers ──────────────────────────────────────────

  /** Save the currently active file (single-file or workspace mode). */
  const handleSaveFile = useCallback(async () => {
    // Determine what content to save and the default file name
    let content: string
    let defaultName: string

    if (workspace && activeFilePath) {
      const file = workspace.files.find((f) => f.path === activeFilePath)
      if (!file) return
      content = file.content ?? ''
      defaultName = file.name
    } else {
      content = latexSource
      defaultName = 'main.tex'
    }

    if ('showSaveFilePicker' in window) {
      try {
        const fsa = window as unknown as WindowWithFSA
        const fileHandle = await fsa.showSaveFilePicker({
          suggestedName: defaultName,
          types: [
            { description: 'LaTeX files', accept: { 'text/x-tex': ['.tex'] } },
            { description: 'All files', accept: { '*/*': [] } },
          ],
        })
        const writable = await fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // Fall through to download fallback
      }
    }

    // Fallback: trigger a browser download
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }, [workspace, activeFilePath, latexSource])

  /** Save all workspace files to disk (write-back to the opened directory or pick a new one). */
  const handleSaveFolder = useCallback(async () => {
    if (!workspace) return

    const fsa = window as unknown as WindowWithFSA

    // Try to reuse the directory handle we opened from, requesting write access
    let rootHandle = dirHandleRef.current
    if (rootHandle) {
      try {
        const perm = await rootHandle.requestPermission({ mode: 'readwrite' })
        if (perm !== 'granted') rootHandle = null
      } catch {
        rootHandle = null
      }
    }

    // No usable handle — ask the user to pick a destination folder
    if (!rootHandle) {
      if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support folder save. Please use "Save" or update your browser.')
        return
      }
      try {
        rootHandle = await fsa.showDirectoryPicker()
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('[vislatex] showDirectoryPicker failed:', err)
        return
      }
    }

    // Write every workspace text file to the destination directory
    for (const file of workspace.files) {
      if (!file.content) continue
      try {
        const parts = file.path.split('/')
        let dir: FSDirHandleWritable = rootHandle
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part, { create: true })
        }
        const fileName = parts[parts.length - 1]
        const fileHandle = await dir.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(file.content)
        await writable.close()
      } catch (err) {
        console.error(`[vislatex] Failed to save ${file.path}:`, err)
      }
    }
  }, [workspace])

  // ── Editor value ──────────────────────────────────────────────────────────
  const editorValue =
    workspace && activeFilePath
      ? workspace.files.find((f) => f.path === activeFilePath)?.content ?? ''
      : latexSource

  const handleEditorChange = (value: string) => {
    if (workspace && activeFilePath) {
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) =>
                f.path === activeFilePath ? { ...f, content: value } : f
              ),
            }
          : null
      )
    } else {
      setLatexSource(value)
    }
  }

  // ── File/folder management ────────────────────────────────────────────────

  const handleFileClick = (path: string) => {
    setActiveFilePath(path)
    // Keep track of the most recently focused .tex file for compile targeting
    if (path.endsWith('.tex')) {
      lastTexPathRef.current = path
    }
  }

  const handleNewFile = (parentPath: string | null, name: string) => {
    const filePath = parentPath ? `${parentPath}/${name}` : name
    const newFile: WorkspaceFile = { type: 'file', path: filePath, name, content: '' }
    setWorkspace((prev) =>
      prev ? { ...prev, files: [...prev.files, newFile] } : prev
    )
    setActiveFilePath(filePath)
    if (name.endsWith('.tex') && !mainTexPath) {
      setMainTexPath(filePath)
    }
  }

  const handleNewFolder = (parentPath: string | null, name: string) => {
    const folderPath = parentPath ? `${parentPath}/${name}` : name
    setWorkspace((prev) =>
      prev
        ? { ...prev, extraFolders: [...prev.extraFolders, folderPath] }
        : prev
    )
  }

  const handleRename = (
    oldPath: string,
    newName: string,
    type: 'file' | 'folder'
  ) => {
    if (!workspace) return

    if (type === 'file') {
      const parentDir = oldPath.includes('/')
        ? oldPath.substring(0, oldPath.lastIndexOf('/'))
        : null
      const newPath = parentDir ? `${parentDir}/${newName}` : newName
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) =>
                f.path === oldPath ? { ...f, path: newPath, name: newName } : f
              ),
            }
          : prev
      )
      if (activeFilePath === oldPath) setActiveFilePath(newPath)
      if (mainTexPath === oldPath) setMainTexPath(newPath)
    } else {
      // Rename folder: update all paths that start with oldPath
      const parentDir = oldPath.includes('/')
        ? oldPath.substring(0, oldPath.lastIndexOf('/'))
        : null
      const newPath = parentDir ? `${parentDir}/${newName}` : newName

      const rewritePath = (p: string) => {
        if (p === oldPath) return newPath
        if (p.startsWith(oldPath + '/')) return newPath + p.slice(oldPath.length)
        return p
      }
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) => ({
                ...f,
                path: rewritePath(f.path),
              })),
              extraFolders: prev.extraFolders.map(rewritePath),
            }
          : prev
      )
      if (activeFilePath) setActiveFilePath(rewritePath(activeFilePath))
      if (mainTexPath) setMainTexPath(rewritePath(mainTexPath))
    }
  }

  const handleDelete = async (targetPath: string, type: 'file' | 'folder') => {
    if (!workspace) return
    if (!confirm(`Delete ${type} "${targetPath}"?`)) return

    // Attempt real filesystem deletion when we have the workspace root path
    const rootPath = workspaceRootRef.current
    if (rootPath && window.electronAPI?.deletePath) {
      const result = await window.electronAPI.deletePath({ rootPath, relativePath: targetPath })
      if (!result.success) {
        alert(`Failed to delete "${targetPath}": ${result.error ?? 'Unknown error'}`)
        return
      }
    }

    // Update in-app state to reflect the deletion
    if (type === 'file') {
      setWorkspace((prev) =>
        prev
          ? { ...prev, files: prev.files.filter((f) => f.path !== targetPath) }
          : prev
      )
      if (activeFilePath === targetPath) {
        const remaining = workspace.files.filter((f) => f.path !== targetPath)
        setActiveFilePath(remaining.length > 0 ? remaining[0].path : null)
      }
      if (mainTexPath === targetPath) setMainTexPath(null)
      if (lastTexPathRef.current === targetPath) lastTexPathRef.current = null
    } else {
      const prefix = targetPath + '/'
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.filter(
                (f) => f.path !== targetPath && !f.path.startsWith(prefix)
              ),
              extraFolders: prev.extraFolders.filter(
                (fp) => fp !== targetPath && !fp.startsWith(prefix)
              ),
            }
          : prev
      )
      if (
        activeFilePath &&
        (activeFilePath === targetPath || activeFilePath.startsWith(prefix))
      ) {
        setActiveFilePath(null)
      }
      if (
        mainTexPath &&
        (mainTexPath === targetPath || mainTexPath.startsWith(prefix))
      ) {
        setMainTexPath(null)
      }
      if (
        lastTexPathRef.current &&
        (lastTexPathRef.current === targetPath || lastTexPathRef.current.startsWith(prefix))
      ) {
        lastTexPathRef.current = null
      }
    }
  }

  const handleSetMainTex = (path: string) => {
    setMainTexPath(path)
    setActiveFilePath(path)
    lastTexPathRef.current = path
  }

  // ── Legacy file-upload handlers (single-file / drag-drop mode) ───────────

  const handleFilesSelected = (files: FileList) => {
    const fileArray = Array.from(files)

    if (workspace) {
      // In workspace mode: add dropped/uploaded files to workspace using
      // async file.text() to avoid FileReader callback race conditions.
      void (async () => {
        const newFiles: WorkspaceFile[] = []
        for (const f of fileArray) {
          const wsFile: WorkspaceFile = { type: 'file', path: f.name, name: f.name }
          if (isTextFile(f.name)) {
            wsFile.content = await f.text()
          } else {
            wsFile.blob = f
          }
          newFiles.push(wsFile)
        }
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                files: [
                  ...prev.files.filter(
                    (wf) => !newFiles.some((nf) => nf.path === wf.path)
                  ),
                  ...newFiles,
                ],
              }
            : prev
        )
      })()
      return
    }

    // Legacy single-file mode
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

  const handleRemoveAsset = (name: string) => {
    setAssets((prev) => prev.filter((f) => f.name !== name))
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

  // ── TopBar file name display ─────────────────────────────────────────────
  const displayFileName = workspace
    ? activeFilePath
      ? activeFilePath.split('/').pop() ?? 'main.tex'
      : mainTexPath
        ? mainTexPath.split('/').pop() ?? 'main.tex'
        : workspace.name
    : 'main.tex'

  const diagnostics = parseCompileLog(compileLog)

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopBar
        fileName={displayFileName}
        pdfUrl={pdfUrl}
        isCompiling={isCompiling}
        compileError={compileError}
        compiler={compiler}
        hasWorkspace={!!workspace}
        autoCompile={autoCompile}
        onCompile={() => compile(latexSource, assets, compiler)}
        onFilesSelected={handleFilesSelected}
        onCompilerChange={setCompiler}
        onAutoCompileChange={setAutoCompile}
        onOpenFolder={handleOpenFolder}
        onSaveFile={handleSaveFile}
        onSaveFolder={handleSaveFolder}
        onOpenPreview={() => window.electronAPI?.openPreviewWindow?.()}
      />

      {/* Hidden folder input for webkitdirectory fallback */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderInputChange}
      />

      {/* Asset panel only shown in single-file mode */}
      {!workspace && <AssetPanel assets={assets} onRemove={handleRemoveAsset} />}

      <div ref={mainAreaRef} className="flex flex-1 overflow-hidden">
        {/* File Explorer sidebar — shown when a workspace is open */}
        {workspace && (
          <>
            <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="shrink-0 overflow-hidden">
              <FileExplorer
                workspaceName={workspace.name}
                files={workspace.files}
                extraFolders={workspace.extraFolders}
                activeFilePath={activeFilePath}
                mainTexPath={mainTexPath}
                onFileClick={handleFileClick}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                onRename={handleRename}
                onDelete={handleDelete}
                onSetMainTex={handleSetMainTex}
              />
            </div>
            {/* Sidebar resize handle */}
            <div
              className="w-1 shrink-0 bg-zinc-700 hover:bg-cyan-500 cursor-col-resize flex flex-col items-center justify-center gap-0.5 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                document.body.style.userSelect = 'none'
                const startX = e.clientX
                const startW = sidebarWidth
                const onMove = (mv: MouseEvent) => {
                  setSidebarWidth(computeSidebarWidth(startW, startX, mv.clientX))
                }
                const onUp = () => {
                  document.body.style.userSelect = ''
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            >
              <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
              <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
            </div>
          </>
        )}

        {/* Editor — takes full remaining width now that PDF is in its own window */}
        <div className="flex flex-1 overflow-hidden">
          <Editor value={editorValue} onChange={handleEditorChange} diagnostics={diagnostics} />
        </div>
      </div>

      <LogPanel
        log={compileLog}
        isOpen={logOpen}
        onToggle={() => setLogOpen((v) => !v)}
        onClearLog={() => setCompileLog('')}
        hasError={compileError}
      />

      <DropZone isDragging={isDragging} onDrop={handleDropZoneDrop} />

      {/* MiKTeX / LaTeX not found warning */}
      {showMiKTeXWarning && (
        <MiKTeXWarningModal onDismiss={() => setShowMiKTeXWarning(false)} />
      )}
    </div>
  )
}

