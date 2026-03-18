export const TEXT_EXTENSIONS = ['.tex', '.bib', '.sty', '.cls', '.txt', '.md']

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export interface WorkspaceFile {
  type: 'file'
  /** Relative path from workspace root, e.g. "lectures/Lecture2.tex" */
  path: string
  /** Filename only, e.g. "Lecture2.tex" */
  name: string
  /** Text content for .tex, .bib, .sty, .cls, .txt, .md files */
  content?: string
  /** Binary content for images, PDFs, etc. */
  blob?: Blob
  /**
   * If this file was imported from Google Drive, this is its Drive file ID.
   * Used to auto-save changes back to the same Drive file.
   */
  driveId?: string
}

export interface WorkspaceFolderNode {
  type: 'folder'
  path: string
  name: string
  children: WorkspaceNode[]
}

export type WorkspaceNode = WorkspaceFile | WorkspaceFolderNode

export interface WorkspaceState {
  /** Display name (the opened folder's name) */
  name: string
  /** Flat list of all workspace files */
  files: WorkspaceFile[]
  /** Paths of explicitly created empty folders */
  extraFolders: string[]
}

/** Build a display tree from a flat list of workspace files and optional empty folder paths */
export function buildTree(
  files: WorkspaceFile[],
  emptyFolders: string[] = []
): WorkspaceNode[] {
  const root: WorkspaceNode[] = []

  function ensureFolder(parts: string[]): WorkspaceNode[] {
    let nodes = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const folderPath = parts.slice(0, i + 1).join('/')
      let folder = nodes.find(
        (n): n is WorkspaceFolderNode => n.type === 'folder' && n.name === name
      )
      if (!folder) {
        folder = { type: 'folder', path: folderPath, name, children: [] }
        nodes.push(folder)
      }
      nodes = folder.children
    }
    return nodes
  }

  for (const folderPath of emptyFolders) {
    ensureFolder(folderPath.split('/'))
  }

  for (const file of files) {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      root.push(file)
    } else {
      const parentNodes = ensureFolder(parts.slice(0, -1))
      parentNodes.push(file)
    }
  }

  return sortNodes(root)
}

function sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes
    .map((n) => {
      if (n.type === 'folder') {
        return { ...n, children: sortNodes(n.children) }
      }
      return n
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}
