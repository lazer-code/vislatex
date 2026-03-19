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
})
