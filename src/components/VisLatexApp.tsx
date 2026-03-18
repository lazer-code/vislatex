'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import TopBar from './TopBar'
import type { GoogleUser } from './TopBar'
import Editor from './Editor'
import PDFViewer from './PDFViewer'
import LogPanel from './LogPanel'
import DropZone from './DropZone'
import AssetPanel from './AssetPanel'
import FileExplorer from './FileExplorer'
import GoogleDrivePanel from './GoogleDrivePanel'
import type { DriveFile } from './GoogleDrivePanel'
import GoogleSignInModal from './GoogleSignInModal'
import { WorkspaceState, WorkspaceFile, isTextFile } from '../types/workspace'

// Minimal local types for the File System Access API (not yet in @types/lib)
interface FSFileHandle {
  kind: 'file'
  getFile(): Promise<File>
}
interface FSDirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FSFileHandle | FSDirHandle]>
}
interface WindowWithFSA {
  showDirectoryPicker(): Promise<FSDirHandle>
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
const LS_GOOGLE_CLIENT_ID = 'vislatex_google_client_id'

// ── Google OAuth helpers ─────────────────────────────────────────────────────
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive'

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string }) => void
          }): TokenClient
        }
        id: {
          initialize(config: {
            client_id: string
            callback: (resp: { credential: string }) => void
          }): void
          prompt(): void
          revoke(hint: string, done: () => void): void
        }
      }
    }
  }
}

function parseJwt(token: string): Record<string, string> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

const getGoogleClientId = () =>
  typeof window !== 'undefined' ? localStorage.getItem(LS_GOOGLE_CLIENT_ID) ?? '' : ''

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

  const pdfUrlRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // ── Resizable pane state ─────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const [editorPct, setEditorPct] = useState(50)
  const mainAreaRef = useRef<HTMLDivElement>(null)

  // ── Google auth & Drive state ────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null)
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null)
  const [driveFileId, setDriveFileId] = useState<string | null>(null)
  const [driveAutoSaveStatus, setDriveAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showDrivePanel, setShowDrivePanel] = useState(false)
  const [showGoogleSetupModal, setShowGoogleSetupModal] = useState(false)
  const tokenClientRef = useRef<TokenClient | null>(null)
  const driveAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const compile = useCallback(
    async (
      source: string,
      assetFiles: File[],
      selectedCompiler: 'pdflatex' | 'xelatex'
    ) => {
      const ws = workspaceRef.current
      const mtp = mainTexPathRef.current

      if (ws && mtp) {
        // ── Project-aware compile ──────────────────────────────────────
        const mainContent = ws.files.find((f) => f.path === mtp)?.content ?? ''
        if (!mainContent.trim()) return
        setIsCompiling(true)
        try {
          const formData = new FormData()
          formData.append('compiler', selectedCompiler)
          formData.append('mainPath', mtp)
          for (const file of ws.files) {
            const blob =
              file.blob ?? new Blob([file.content ?? ''], { type: 'text/plain' })
            formData.append('files', blob, file.name)
            formData.append('paths', file.path)
          }
          const res = await fetch('/api/compile', { method: 'POST', body: formData })
          const data: { success: boolean; pdf: string | null; log: string } =
            await res.json()
          setCompileLog(data.log ?? '')
          setCompileError(!data.success)
          if (data.pdf) {
            const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
            const blob = new Blob([bytes], { type: 'application/pdf' })
            const url = URL.createObjectURL(blob)
            if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
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
        return
      }

      // ── Single-file compile (legacy) ───────────────────────────────────
      if (!source.trim()) return
      setIsCompiling(true)
      try {
        const formData = new FormData()
        formData.append('mainTex', source)
        formData.append('compiler', selectedCompiler)
        for (const asset of assetFiles) {
          formData.append('assets', asset)
        }
        const res = await fetch('/api/compile', { method: 'POST', body: formData })
        const data: { success: boolean; pdf: string | null; log: string } =
          await res.json()
        setCompileLog(data.log ?? '')
        setCompileError(!data.success)
        if (data.pdf) {
          const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
          const blob = new Blob([bytes], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
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
    },
    []
  )

  // Debounced auto-compile — triggers on any content or workspace change
  useEffect(() => {
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
  }, [latexSource, assets, compiler, workspace, mainTexPath, compile])

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

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  // ── Google auth logic ─────────────────────────────────────────────────────

  /** Initialise the Google Identity Services token client once the script loads. */
  const initTokenClient = useCallback((clientId?: string) => {
    const cid = clientId ?? getGoogleClientId()
    if (!cid || !window.google) return
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) return
        setGoogleAccessToken(resp.access_token)
      },
    })
  }, [])

  // Wait for the GSI script to load, then initialise the token client.
  useEffect(() => {
    if (window.google) {
      const cid = getGoogleClientId()
      if (cid) initTokenClient(cid)
      return
    }
    const script = document.getElementById('google-gsi-script')
    if (script) {
      const handler = () => {
        const cid = getGoogleClientId()
        if (cid) initTokenClient(cid)
      }
      script.addEventListener('load', handler)
      return () => script.removeEventListener('load', handler)
    }
  }, [initTokenClient])

  const proceedWithGoogleSignIn = useCallback((clientId: string) => {
    if (!tokenClientRef.current) {
      initTokenClient(clientId)
    }
    // Use Google Identity Services one-tap for profile info
    if (window.google?.accounts.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          const payload = parseJwt(resp.credential)
          setGoogleUser({
            name: payload.name ?? 'Google User',
            email: payload.email ?? '',
            picture: payload.picture ?? '',
          })
        },
      })
      window.google.accounts.id.prompt()
    }
    // Request OAuth2 access token for Drive API
    tokenClientRef.current?.requestAccessToken({ prompt: 'consent' })
  }, [initTokenClient])

  const handleGoogleSignIn = useCallback(() => {
    const clientId = getGoogleClientId()
    if (!clientId) {
      setShowGoogleSetupModal(true)
      return
    }
    proceedWithGoogleSignIn(clientId)
  }, [proceedWithGoogleSignIn])

  const handleGoogleSetupConfirm = useCallback((clientId: string) => {
    setShowGoogleSetupModal(false)
    proceedWithGoogleSignIn(clientId)
  }, [proceedWithGoogleSignIn])

  const handleGoogleSignOut = useCallback(() => {
    if (googleUser?.email && window.google?.accounts.id) {
      window.google.accounts.id.revoke(googleUser.email, () => {})
    }
    setGoogleUser(null)
    setGoogleAccessToken(null)
    setDriveFileId(null)
    setDriveAutoSaveStatus('idle')
    setShowDrivePanel(false)
  }, [googleUser])

  /** Auto-save the current file to Google Drive. */
  const driveAutoSave = useCallback(
    async (content: string, fileId: string, token: string) => {
      setDriveAutoSaveStatus('saving')
      try {
        const res = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'text/plain',
            },
            body: content,
          }
        )
        if (!res.ok) throw new Error(`Drive save error: ${res.status}`)
        setDriveAutoSaveStatus('saved')
        // Reset to idle after 2 s so the indicator fades
        setTimeout(() => setDriveAutoSaveStatus('idle'), 2000)
      } catch {
        setDriveAutoSaveStatus('error')
      }
    },
    []
  )

  // Debounced auto-save to Drive (single-file mode, when a Drive file is open)
  useEffect(() => {
    if (!googleAccessToken || !driveFileId || workspace) return
    if (driveAutoSaveTimerRef.current) clearTimeout(driveAutoSaveTimerRef.current)
    driveAutoSaveTimerRef.current = setTimeout(() => {
      driveAutoSave(latexSource, driveFileId, googleAccessToken)
    }, 3000)
    return () => {
      if (driveAutoSaveTimerRef.current) clearTimeout(driveAutoSaveTimerRef.current)
    }
  }, [latexSource, googleAccessToken, driveFileId, workspace, driveAutoSave])

  // ── Workspace helpers ────────────────────────────────────────────────────

  /** Initialise workspace state from an array of WorkspaceFile entries. */
  const initWorkspace = useCallback((name: string, files: WorkspaceFile[]) => {
    const mainTex =
      files.find((f) => f.name === 'main.tex') ??
      files.find((f) => f.name.endsWith('.tex'))
    setWorkspace({ name, files, extraFolders: [] })
    setMainTexPath(mainTex?.path ?? null)
    setActiveFilePath(mainTex?.path ?? null)
    setPdfUrl(null)
    pdfUrlRef.current = null
    setCompileLog('')
    setCompileError(false)
  }, [])

  /** Load workspace from File System Access API directory handle. */
  const loadFromDirectoryHandle = useCallback(
    async (dirHandle: FSDirHandle) => {
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
      initWorkspace(rootFolderName, files)
    },
    [initWorkspace]
  )

  /** Called by the "Open Folder" button. */
  const handleOpenFolder = useCallback(async () => {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as unknown as WindowWithFSA).showDirectoryPicker()
        await loadFromDirectoryHandle(dirHandle)
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // Fall through to webkitdirectory fallback
      }
    }
    folderInputRef.current?.click()
  }, [loadFromDirectoryHandle])

  const handleFolderInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      await loadFromFileList(e.target.files)
    }
    e.target.value = ''
  }

  // ── Google Drive file / folder handlers ─────────────────────────────────

  /** User selected a single .tex file from Drive. */
  const handleDriveFileSelect = useCallback(
    (file: DriveFile, content: string) => {
      setLatexSource(content)
      setDriveFileId(file.id)
      setWorkspace(null)
      setActiveFilePath(null)
      setMainTexPath(null)
      setPdfUrl(null)
      pdfUrlRef.current = null
      setCompileLog('')
      setCompileError(false)
      setDriveAutoSaveStatus('idle')
      setShowDrivePanel(false)
    },
    []
  )

  /** User opened an entire Drive folder as a workspace. */
  const handleDriveFolderSelect = useCallback(
    (driveFiles: DriveFile[], contents: Record<string, string>) => {
      const wsFiles: WorkspaceFile[] = driveFiles.map((f) => ({
        type: 'file' as const,
        path: f.name,
        name: f.name.includes('/') ? f.name.split('/').pop()! : f.name,
        content: contents[f.name] ?? undefined,
      }))
      const folderName = driveFiles[0]?.name.split('/')[0] ?? 'Drive Project'
      initWorkspace(folderName, wsFiles)
      setDriveFileId(null)
      setShowDrivePanel(false)
    },
    [initWorkspace]
  )

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

  const handleDelete = (targetPath: string, type: 'file' | 'folder') => {
    if (!workspace) return
    if (!confirm(`Delete ${type} "${targetPath}"?`)) return

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
    }
  }

  const handleSetMainTex = (path: string) => {
    setMainTexPath(path)
    setActiveFilePath(path)
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
        googleUser={googleUser}
        driveAutoSaveStatus={driveAutoSaveStatus}
        onCompile={() => compile(latexSource, assets, compiler)}
        onFilesSelected={handleFilesSelected}
        onCompilerChange={setCompiler}
        onOpenFolder={handleOpenFolder}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onOpenDrive={() => setShowDrivePanel(true)}
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
                const startX = e.clientX
                const startW = sidebarWidth
                const onMove = (mv: MouseEvent) => {
                  const next = Math.min(480, Math.max(120, startW + mv.clientX - startX))
                  setSidebarWidth(next)
                }
                const onUp = () => {
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

        {/* Editor + PDF split */}
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: `${editorPct}%` }} className="flex flex-col overflow-hidden">
            <Editor value={editorValue} onChange={handleEditorChange} diagnostics={diagnostics} />
          </div>
          {/* Editor/PDF resize handle */}
          <div
            className="w-1 shrink-0 bg-zinc-700 hover:bg-cyan-500 cursor-col-resize flex flex-col items-center justify-center gap-0.5 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault()
              const container = mainAreaRef.current
              if (!container) return
              const rect = container.getBoundingClientRect()
              const onMove = (mv: MouseEvent) => {
                const relX = mv.clientX - rect.left - (workspace ? sidebarWidth + 4 : 0)
                const totalW = rect.width - (workspace ? sidebarWidth + 4 : 0) - 4
                const pct = Math.min(80, Math.max(20, (relX / totalW) * 100))
                setEditorPct(pct)
              }
              const onUp = () => {
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
          <div style={{ width: `${100 - editorPct}%` }} className="flex flex-col overflow-hidden">
            <PDFViewer
              pdfUrl={pdfUrl}
              isCompiling={isCompiling}
              compileError={compileError}
              onReload={() => compile(latexSource, assets, compiler)}
            />
          </div>
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

      {/* Google Drive file browser */}
      {showDrivePanel && googleAccessToken && (
        <GoogleDrivePanel
          accessToken={googleAccessToken}
          onSelectFile={handleDriveFileSelect}
          onSelectFolder={handleDriveFolderSelect}
          onClose={() => setShowDrivePanel(false)}
        />
      )}

      {/* Google Sign-In setup modal */}
      {showGoogleSetupModal && (
        <GoogleSignInModal
          onConfirm={handleGoogleSetupConfirm}
          onCancel={() => setShowGoogleSetupModal(false)}
        />
      )}
    </div>
  )
}

