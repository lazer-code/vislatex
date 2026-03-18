'use client'

/**
 * DriveFilePicker — browse Google Drive and import files/folders into the
 * workspace.
 *
 * Only files & folders accessible via the drive.file scope (files opened or
 * created by this app) are shown when only that scope was granted.  If the
 * broader drive.readonly scope was also granted, all Drive files are visible.
 */

import { useState, useEffect, useCallback } from 'react'
import { DriveFile, DRIVE_FOLDER_MIME, listDriveFolder, downloadDriveFile } from '../services/googleDrive'
import { WorkspaceFile, isTextFile } from '../types/workspace'

interface DriveFilePickerProps {
  accessToken: string
  onImport: (files: WorkspaceFile[], folderName: string) => void
  onClose: () => void
}

interface BreadcrumbEntry {
  id: string | null
  name: string
}

export default function DriveFilePicker({ accessToken, onImport, onClose }: DriveFilePickerProps) {
  const [items, setItems] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: null, name: 'My Drive' },
  ])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

  const loadFolder = useCallback(
    async (folderId: string | null) => {
      setLoading(true)
      setError(null)
      setSelected(new Set())
      try {
        const files = await listDriveFolder(accessToken, folderId)
        setItems(files)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Drive folder')
      } finally {
        setLoading(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    loadFolder(currentFolderId)
  }, [currentFolderId, loadFolder])

  const handleFolderOpen = (folder: DriveFile) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleImport = async () => {
    const selectedItems = items.filter((f) => selected.has(f.id))
    if (selectedItems.length === 0) return

    setImporting(true)
    setError(null)
    try {
      const workspaceFiles: WorkspaceFile[] = []
      const folderName =
        selectedItems.length === 1 && selectedItems[0].mimeType === DRIVE_FOLDER_MIME
          ? selectedItems[0].name
          : breadcrumbs[breadcrumbs.length - 1].name

      // Recursively collect files from selected items
      async function collectFiles(driveId: string, name: string, prefix: string) {
        const file = items.find((f) => f.id === driveId)
        if (file?.mimeType === DRIVE_FOLDER_MIME) {
          // Recurse into folder
          const children = await listDriveFolder(accessToken, driveId)
          for (const child of children) {
            await collectFiles(child.id, child.name, prefix ? `${prefix}/${name}` : name)
          }
        } else {
          const relPath = prefix ? `${prefix}/${name}` : name
          const blob = await downloadDriveFile(accessToken, driveId)
          const wsFile: WorkspaceFile = {
            type: 'file',
            path: relPath,
            name,
            driveId,
          }
          if (isTextFile(name)) {
            wsFile.content = await blob.text()
          } else {
            wsFile.blob = blob
          }
          workspaceFiles.push(wsFile)
        }
      }

      for (const item of selectedItems) {
        await collectFiles(item.id, item.name, '')
      }

      onImport(workspaceFiles, folderName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-[520px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-200">Import from Google Drive</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-600">/</span>}
              <button
                onClick={() => handleBreadcrumbClick(i)}
                className={`hover:text-cyan-400 transition-colors ${
                  i === breadcrumbs.length - 1 ? 'text-zinc-200' : ''
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              This folder is empty
            </div>
          )}
          {!loading &&
            items.map((item) => {
              const isFolder = item.mimeType === DRIVE_FOLDER_MIME
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-zinc-800 transition-colors ${
                    selected.has(item.id) ? 'bg-zinc-800 text-cyan-300' : 'text-zinc-300'
                  }`}
                  onClick={() => (isFolder ? handleFolderOpen(item) : toggleSelect(item.id))}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-cyan-400"
                  />
                  <span className="text-base">{isFolder ? '📁' : '📄'}</span>
                  <span className="text-sm flex-1 truncate">{item.name}</span>
                  {isFolder && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFolderOpen(item)
                      }}
                      className="text-xs text-zinc-500 hover:text-cyan-400"
                    >
                      Open →
                    </button>
                  )}
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-700">
          <span className="text-xs text-zinc-500">
            {selected.size > 0 ? `${selected.size} item(s) selected` : 'Select files to import'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="text-sm px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
