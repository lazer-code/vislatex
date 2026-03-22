import { useState, useEffect, useRef, useCallback } from 'react'
import { WorkspaceFile, WorkspaceFolderNode, WorkspaceNode, buildTree } from '../types/workspace'

interface FileExplorerProps {
  workspaceName: string
  files: WorkspaceFile[]
  extraFolders: string[]
  activeFilePath: string | null
  mainTexPath: string | null
  onFileClick: (path: string) => void
  onNewFile: (parentPath: string | null, name: string) => void
  onNewFolder: (parentPath: string | null, name: string) => void
  onRename: (path: string, newName: string, type: 'file' | 'folder') => void
  onDelete: (path: string, type: 'file' | 'folder') => void | Promise<void>
  onSetMainTex: (path: string) => void
}

type PendingCreate = {
  type: 'file' | 'folder'
  parentPath: string | null
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'tex') return '📄'
  if (ext === 'bib') return '📚'
  if (['cls', 'sty'].includes(ext)) return '🔧'
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return '🖼'
  if (ext === 'pdf') return '📑'
  if (['txt', 'md'].includes(ext)) return '📝'
  return '📎'
}

// ─── Icons ──────────────────────────────────────────────────────────────────

/** File-plus icon (heroicons mini) */
function IconFilePlus({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V15.5A1.5 1.5 0 0 1 13.5 17h-9A1.5 1.5 0 0 1 3 15.5v-12ZM10 6a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 10 6Z" />
    </svg>
  )
}

/** Folder-plus icon (heroicons mini) */
function IconFolderPlus({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5C2 16.216 2.784 17 3.75 17h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM10 8a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 10 8Z" />
    </svg>
  )
}

// ─── CreateInput ────────────────────────────────────────────────────────────

interface CreateInputProps {
  type: 'file' | 'folder'
  depth: number
  onConfirm: (name: string) => void
  onCancel: () => void
}

function CreateInput({ type, depth, onConfirm, onCancel }: CreateInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5"
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      <span className="text-sm flex-shrink-0">
        {type === 'folder' ? '📁' : '📄'}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim()) onConfirm(value.trim())
          else onCancel()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onConfirm(value.trim())
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        placeholder={type === 'file' ? 'filename.tex' : 'folder name'}
        className="flex-1 text-sm bg-zinc-700 text-zinc-100 px-1 rounded outline-none min-w-0"
      />
    </div>
  )
}

// ─── TreeNode ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: WorkspaceNode
  depth: number
  activeFilePath: string | null
  mainTexPath: string | null
  pendingCreate: PendingCreate | null
  selectedPath: string | null
  renamingPath: string | null
  onFileClick: (path: string) => void
  onRename: (path: string, newName: string, type: 'file' | 'folder') => void
  onDelete: (path: string, type: 'file' | 'folder') => void | Promise<void>
  onSetMainTex: (path: string) => void
  onNewFile: (folderPath: string) => void
  onNewFolder: (folderPath: string) => void
  onCreateConfirm: (name: string) => void
  onCreateCancel: () => void
  onSelect: (path: string, type: 'file' | 'folder') => void
  onRenamingDone: () => void
}

function TreeNode({
  node,
  depth,
  activeFilePath,
  mainTexPath,
  pendingCreate,
  selectedPath,
  renamingPath,
  onFileClick,
  onRename,
  onDelete,
  onSetMainTex,
  onNewFile,
  onNewFolder,
  onCreateConfirm,
  onCreateCancel,
  onSelect,
  onRenamingDone,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [isRenaming])

  // Trigger rename from external source (e.g. F2 key)
  useEffect(() => {
    if (renamingPath === node.path) {
      setIsRenaming(true)
      setRenameValue(node.name)
    }
  }, [renamingPath, node.path, node.name])

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      onRename(node.path, trimmed, node.type)
    }
    setIsRenaming(false)
    onRenamingDone()
  }

  const indent = depth * 12

  if (node.type === 'folder') {
    const folder = node as WorkspaceFolderNode
    const showPendingCreate =
      pendingCreate !== null && pendingCreate.parentPath === folder.path
    const isSelected = selectedPath === folder.path

    return (
      <div>
        <div
          className={`group flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none rounded mx-1 ${
            isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-800'
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => {
            setExpanded((v) => !v)
            onSelect(folder.path, 'folder')
          }}
        >
          <span className="text-zinc-500 text-xs w-3 flex-shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="text-yellow-400 text-sm flex-shrink-0">📁</span>
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') {
                  setIsRenaming(false)
                  onRenamingDone()
                }
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm bg-zinc-700 text-zinc-100 px-1 rounded outline-none min-w-0"
            />
          ) : (
            <span className="flex-1 text-sm text-zinc-300 font-medium truncate min-w-0">
              {folder.name}
            </span>
          )}
          {!isRenaming && (
            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onNewFile(folder.path)
                }}
                className="text-zinc-500 hover:text-cyan-400 px-0.5 leading-none"
                title="New File in folder"
              >
                <IconFilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onNewFolder(folder.path)
                }}
                className="text-zinc-500 hover:text-cyan-400 px-0.5 leading-none"
                title="New Folder inside"
              >
                <IconFolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsRenaming(true)
                  setRenameValue(folder.name)
                }}
                className="text-zinc-500 hover:text-yellow-400 text-xs px-0.5 leading-none"
                title="Rename"
              >
                ✎
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(folder.path, 'folder')
                }}
                className="text-zinc-500 hover:text-red-400 text-xs px-0.5 leading-none"
                title="Delete folder"
              >
                ×
              </button>
            </div>
          )}
        </div>
        {expanded && (
          <div>
            {showPendingCreate && (
              <CreateInput
                type={pendingCreate!.type}
                depth={depth + 1}
                onConfirm={onCreateConfirm}
                onCancel={onCreateCancel}
              />
            )}
            {folder.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                mainTexPath={mainTexPath}
                pendingCreate={pendingCreate}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                onFileClick={onFileClick}
                onRename={onRename}
                onDelete={onDelete}
                onSetMainTex={onSetMainTex}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onCreateConfirm={onCreateConfirm}
                onCreateCancel={onCreateCancel}
                onSelect={onSelect}
                onRenamingDone={onRenamingDone}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── File node ───────────────────────────────────────────────────────────
  const file = node as WorkspaceFile
  const isActive = activeFilePath === file.path
  const isMain = mainTexPath === file.path
  const isTexFile = file.name.endsWith('.tex')
  const isSelected = selectedPath === file.path

  return (
    <div
      className={`group flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none rounded mx-1 ${
        isActive ? 'bg-zinc-700' : isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800'
      }`}
      style={{ paddingLeft: `${8 + indent + 16}px` }}
      onClick={() => {
        onFileClick(file.path)
        onSelect(file.path, 'file')
      }}
    >
      <span className="text-sm flex-shrink-0">{fileIcon(file.name)}</span>
      {isRenaming ? (
        <input
          ref={renameRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') {
              setIsRenaming(false)
              onRenamingDone()
            }
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm bg-zinc-700 text-zinc-100 px-1 rounded outline-none min-w-0"
        />
      ) : (
        <span
          className={`flex-1 text-sm truncate font-mono min-w-0 ${
            isActive ? 'text-zinc-100' : 'text-zinc-400'
          }`}
        >
          {file.name}
          {isMain && (
            <span
              className="ml-1 text-xs text-cyan-400"
              title="Main TeX file (compiled)"
            >
              ★
            </span>
          )}
        </span>
      )}
      {!isRenaming && (
        <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
          {isTexFile && !isMain && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSetMainTex(file.path)
              }}
              className="text-zinc-500 hover:text-cyan-400 text-xs px-0.5 leading-none"
              title="Set as main TeX file"
            >
              ★
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsRenaming(true)
              setRenameValue(file.name)
            }}
            className="text-zinc-500 hover:text-yellow-400 text-xs px-0.5 leading-none"
            title="Rename"
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(file.path, 'file')
            }}
            className="text-zinc-500 hover:text-red-400 text-xs px-0.5 leading-none"
            title="Delete file"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ─── FileExplorer ─────────────────────────────────────────────────────────────

export default function FileExplorer({
  workspaceName,
  files,
  extraFolders,
  activeFilePath,
  mainTexPath,
  onFileClick,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onSetMainTex,
}: FileExplorerProps) {
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'file' | 'folder' | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tree = buildTree(files, extraFolders)

  const handleNewFile = (folderPath: string | null) => {
    setPendingCreate({ type: 'file', parentPath: folderPath })
  }

  const handleNewFolder = (folderPath: string | null) => {
    setPendingCreate({ type: 'folder', parentPath: folderPath })
  }

  const handleCreateConfirm = (name: string) => {
    if (!pendingCreate) return
    if (pendingCreate.type === 'file') {
      onNewFile(pendingCreate.parentPath, name)
    } else {
      onNewFolder(pendingCreate.parentPath, name)
    }
    setPendingCreate(null)
  }

  const handleCreateCancel = () => {
    setPendingCreate(null)
  }

  const handleSelect = useCallback((path: string, type: 'file' | 'folder') => {
    setSelectedPath(path)
    setSelectedType(type)
  }, [])

  const handleRenamingDone = useCallback(() => {
    setRenamingPath(null)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedPath || !selectedType) return
    // Don't fire when focus is inside an input (rename/create)
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'Delete') {
      e.preventDefault()
      onDelete(selectedPath, selectedType)
    } else if (e.key === 'F2') {
      e.preventDefault()
      setRenamingPath(selectedPath)
    }
  }

  const showRootPendingCreate =
    pendingCreate !== null && pendingCreate.parentPath === null

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 overflow-hidden outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Explorer header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
          Explorer
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => handleNewFile(null)}
            className="text-zinc-500 hover:text-cyan-400 p-1 rounded hover:bg-zinc-800 transition-colors"
            title="New File"
          >
            <IconFilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFolder(null)}
            className="text-zinc-500 hover:text-cyan-400 p-1 rounded hover:bg-zinc-800 transition-colors"
            title="New Folder"
          >
            <IconFolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Workspace name */}
      <div className="px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider truncate flex items-center gap-1">
          <span>📂</span>
          <span className="truncate">{workspaceName}</span>
        </span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {showRootPendingCreate && (
          <CreateInput
            type={pendingCreate!.type}
            depth={0}
            onConfirm={handleCreateConfirm}
            onCancel={handleCreateCancel}
          />
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            mainTexPath={mainTexPath}
            pendingCreate={pendingCreate}
            selectedPath={selectedPath}
            renamingPath={renamingPath}
            onFileClick={onFileClick}
            onRename={onRename}
            onDelete={onDelete}
            onSetMainTex={onSetMainTex}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onCreateConfirm={handleCreateConfirm}
            onCreateCancel={handleCreateCancel}
            onSelect={handleSelect}
            onRenamingDone={handleRenamingDone}
          />
        ))}
        {tree.length === 0 && !showRootPendingCreate && (
          <p className="px-3 py-4 text-xs text-zinc-600 text-center">
            No files yet
          </p>
        )}
      </div>
    </div>
  )
}
