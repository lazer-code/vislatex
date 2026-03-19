import { useState, useEffect, useRef } from 'react'
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
  onDelete: (path: string, type: 'file' | 'folder') => void
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
  onFileClick: (path: string) => void
  onRename: (path: string, newName: string, type: 'file' | 'folder') => void
  onDelete: (path: string, type: 'file' | 'folder') => void
  onSetMainTex: (path: string) => void
  onNewFile: (folderPath: string) => void
  onNewFolder: (folderPath: string) => void
  onCreateConfirm: (name: string) => void
  onCreateCancel: () => void
}

function TreeNode({
  node,
  depth,
  activeFilePath,
  mainTexPath,
  pendingCreate,
  onFileClick,
  onRename,
  onDelete,
  onSetMainTex,
  onNewFile,
  onNewFolder,
  onCreateConfirm,
  onCreateCancel,
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

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      onRename(node.path, trimmed, node.type)
    }
    setIsRenaming(false)
  }

  const indent = depth * 12

  if (node.type === 'folder') {
    const folder = node as WorkspaceFolderNode
    const showPendingCreate =
      pendingCreate !== null && pendingCreate.parentPath === folder.path

    return (
      <div>
        <div
          className="group flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-800 cursor-pointer select-none rounded mx-1"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => setExpanded((v) => !v)}
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
                if (e.key === 'Escape') setIsRenaming(false)
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
                className="text-zinc-500 hover:text-cyan-400 text-xs px-0.5 leading-none"
                title="New File in folder"
              >
                +f
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onNewFolder(folder.path)
                }}
                className="text-zinc-500 hover:text-cyan-400 text-xs px-0.5 leading-none"
                title="New Folder inside"
              >
                +d
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
                onFileClick={onFileClick}
                onRename={onRename}
                onDelete={onDelete}
                onSetMainTex={onSetMainTex}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onCreateConfirm={onCreateConfirm}
                onCreateCancel={onCreateCancel}
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

  return (
    <div
      className={`group flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none rounded mx-1 ${
        isActive ? 'bg-zinc-700' : 'hover:bg-zinc-800'
      }`}
      style={{ paddingLeft: `${8 + indent + 16}px` }}
      onClick={() => onFileClick(file.path)}
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
            if (e.key === 'Escape') setIsRenaming(false)
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

  const showRootPendingCreate =
    pendingCreate !== null && pendingCreate.parentPath === null

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 overflow-hidden">
      {/* Explorer header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
          Explorer
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => handleNewFile(null)}
            className="text-zinc-500 hover:text-cyan-400 text-xs px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
            title="New File"
          >
            +f
          </button>
          <button
            onClick={() => handleNewFolder(null)}
            className="text-zinc-500 hover:text-cyan-400 text-xs px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
            title="New Folder"
          >
            +d
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
            onFileClick={onFileClick}
            onRename={onRename}
            onDelete={onDelete}
            onSetMainTex={onSetMainTex}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onCreateConfirm={handleCreateConfirm}
            onCreateCancel={handleCreateCancel}
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
