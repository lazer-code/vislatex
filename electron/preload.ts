import { contextBridge, ipcRenderer } from 'electron'

interface FileEntry {
  path: string
  name: string
  data: string
  isText: boolean
}

interface CompileRequest {
  compiler: string
  mainTex?: string
  assets?: Array<{ name: string; data: string }>
  mainPath?: string
  files?: FileEntry[]
}

interface CompileResult {
  success: boolean
  pdf: string | null
  log: string
}

interface OpenDirectoryResult {
  rootPath: string
  name: string
  files: FileEntry[]
}

interface DeletePathPayload {
  rootPath: string
  relativePath: string
}

interface DeletePathResult {
  success: boolean
  error?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  compile: (payload: CompileRequest): Promise<CompileResult> =>
    ipcRenderer.invoke('compile', payload),
  checkLatex: (): Promise<boolean> =>
    ipcRenderer.invoke('check-latex'),
  openExternal: (url: string): void =>
    ipcRenderer.send('open-external', url),
  openDirectory: (): Promise<OpenDirectoryResult | null> =>
    ipcRenderer.invoke('open-directory'),
  deletePath: (payload: DeletePathPayload): Promise<DeletePathResult> =>
    ipcRenderer.invoke('delete-path', payload),
  /** Opens (or focuses) the PDF preview window. */
  openPreviewWindow: (): Promise<void> =>
    ipcRenderer.invoke('open-preview-window'),
  /** Sends the latest compiled PDF to the preview window.  Passing null
   *  clears the preview (e.g. on compile failure). */
  pushPdf: (pdfBase64: string | null): void =>
    ipcRenderer.send('push-pdf', pdfBase64),
  /** Registers a callback that fires whenever a new PDF is pushed to this
   *  window.  Returns a cleanup function that removes the listener. */
  onPdfUpdate: (callback: (pdfBase64: string | null) => void): (() => void) => {
    type IpcHandler = Parameters<typeof ipcRenderer.on>[1]
    const handler: IpcHandler = (_: unknown, pdfBase64: string | null) => callback(pdfBase64)
    ipcRenderer.on('pdf-update', handler)
    return () => ipcRenderer.removeListener('pdf-update', handler)
  },
  /** Start watching a workspace directory for external changes. */
  watchDirectory: (rootPath: string): void =>
    ipcRenderer.send('watch-directory', rootPath),
  /** Stop watching a previously watched directory. */
  stopWatchingDirectory: (rootPath: string): void =>
    ipcRenderer.send('stop-watching-directory', rootPath),
  /** Registers a callback invoked whenever a watched directory changes.
   *  The payload contains rootPath and the re-scanned file list.
   *  Returns a cleanup function that removes the listener. */
  onWorkspaceChanged: (
    callback: (payload: { rootPath: string; files: FileEntry[] }) => void
  ): (() => void) => {
    type IpcHandler = Parameters<typeof ipcRenderer.on>[1]
    const handler: IpcHandler = (_: unknown, payload: { rootPath: string; files: FileEntry[] }) =>
      callback(payload)
    ipcRenderer.on('workspace-changed', handler)
    return () => ipcRenderer.removeListener('workspace-changed', handler)
  },
})
