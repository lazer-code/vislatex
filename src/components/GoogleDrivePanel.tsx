'use client'

import { useState, useEffect, useCallback } from 'react'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
}

interface GoogleDrivePanelProps {
  accessToken: string
  onSelectFile: (file: DriveFile, content: string) => void
  onSelectFolder: (files: DriveFile[], contents: Record<string, string>) => void
  onClose: () => void
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SUPPORTED_EXTENSIONS = ['.tex', '.bib', '.cls', '.sty', '.png', '.jpg', '.jpeg', '.svg', '.pdf']

function isSupportedFile(name: string) {
  return SUPPORTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
}

function isTextFile(name: string) {
  return ['.tex', '.bib', '.cls', '.sty'].some((ext) => name.toLowerCase().endsWith(ext))
}

async function driveListFiles(
  accessToken: string,
  parentId: string | null
): Promise<DriveFile[]> {
  const query = parentId
    ? `'${parentId}' in parents and trashed = false`
    : `'root' in parents and trashed = false`
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    orderBy: 'folder,name',
    pageSize: '200',
  })
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`)
  const data = await res.json()
  return (data.files as DriveFile[]).filter(
    (f) => f.mimeType === FOLDER_MIME || isSupportedFile(f.name)
  )
}

async function driveDownloadText(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Download error: ${res.status}`)
  return res.text()
}

async function driveFetchFolderContents(
  accessToken: string,
  folderId: string
): Promise<{ files: DriveFile[]; contents: Record<string, string> }> {
  const allFiles: DriveFile[] = []
  const contents: Record<string, string> = {}

  async function walk(parentId: string, prefix: string) {
    const entries = await driveListFiles(accessToken, parentId)
    for (const entry of entries) {
      if (entry.mimeType === FOLDER_MIME) {
        await walk(entry.id, prefix ? `${prefix}/${entry.name}` : entry.name)
      } else {
        allFiles.push({ ...entry, name: prefix ? `${prefix}/${entry.name}` : entry.name })
        if (isTextFile(entry.name)) {
          try {
            contents[entry.name] = await driveDownloadText(accessToken, entry.id)
          } catch {
            contents[entry.name] = ''
          }
        }
      }
    }
  }

  await walk(folderId, '')
  return { files: allFiles, contents }
}

export default function GoogleDrivePanel({
  accessToken,
  onSelectFile,
  onSelectFolder,
  onClose,
}: GoogleDrivePanelProps) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'My Drive' },
  ])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  const loadFiles = useCallback(
    async (folderId: string | null) => {
      setLoading(true)
      setError(null)
      try {
        const result = await driveListFiles(accessToken, folderId)
        setFiles(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load files')
      } finally {
        setLoading(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    loadFiles(currentFolderId)
  }, [currentFolderId, loadFiles])

  const handleFolderClick = (folder: DriveFile) => {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  const handleSelectFile = async (file: DriveFile) => {
    if (!isTextFile(file.name)) return
    setActionLoading(file.id)
    try {
      const content = await driveDownloadText(accessToken, file.id)
      onSelectFile(file, content)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSelectFolder = async (folder: DriveFile) => {
    setActionLoading(folder.id)
    try {
      const { files: folderFiles, contents } = await driveFetchFolderContents(
        accessToken,
        folder.id
      )
      onSelectFolder(folderFiles, contents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folder')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[70vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 shrink-0">
          <div className="flex items-center gap-2">
            {/* Google Drive icon */}
            <svg className="h-5 w-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.6 66.85L21.9 78.9l14.28-24.72H0z" fill="#0066da" />
              <path d="M43.18 0 28.9 24.28h43.56L87.3 0z" fill="#00ac47" />
              <path d="M73.56 55.54H29.43l-7.53 12.86 8.26 9.5 43.4.1z" fill="#ea4335" />
              <path d="M43.18 0 0 0 21.9 36.5l21.28-12.22z" fill="#00832d" />
              <path d="M87.3 0 65.4 36.5l-29.13.78 7 12.72 43.8-24.56z" fill="#2684fc" />
              <path d="M43.3 50l-7 12.72 7.53-12.86H29.43L43.3 50z" fill="#ffba00" />
            </svg>
            <span className="text-sm font-semibold text-zinc-100">Google Drive</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-700 shrink-0 flex-wrap">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-600 text-xs">›</span>}
              <button
                onClick={() => handleBreadcrumbClick(i)}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  i === breadcrumb.length - 1
                    ? 'text-zinc-200 font-medium'
                    : 'text-zinc-400 hover:text-cyan-400'
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-zinc-400 text-sm gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading…
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && files.length === 0 && (
            <div className="px-4 py-8 text-zinc-500 text-sm text-center">No supported files found</div>
          )}
          {!loading && !error && files.map((file) => {
            const isFolder = file.mimeType === FOLDER_MIME
            const isSelectableFile = isTextFile(file.name)
            const isLoading = actionLoading === file.id
            return (
              <div
                key={file.id}
                className="flex items-center px-4 py-2.5 hover:bg-zinc-800 transition-colors group"
              >
                <span className="mr-3 text-base">
                  {isFolder ? '📁' : file.name.endsWith('.tex') ? '📄' : '📎'}
                </span>
                <button
                  onClick={() => isFolder ? handleFolderClick(file) : undefined}
                  className={`flex-1 text-left text-sm truncate ${
                    isFolder ? 'text-zinc-200 hover:text-cyan-400 cursor-pointer' : 'text-zinc-300 cursor-default'
                  }`}
                >
                  {file.name}
                </button>
                <div className="flex gap-1.5 shrink-0 ml-2">
                  {isFolder && (
                    <button
                      onClick={() => handleSelectFolder(file)}
                      disabled={isLoading}
                      className="text-xs px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isLoading ? (
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : 'Open as Project'}
                    </button>
                  )}
                  {isSelectableFile && (
                    <button
                      onClick={() => handleSelectFile(file)}
                      disabled={isLoading}
                      className="text-xs px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isLoading ? (
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : 'Open'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-zinc-700 shrink-0 text-xs text-zinc-500 text-center">
          Select a .tex file to open it, or open a folder as a project
        </div>
      </div>
    </div>
  )
}
