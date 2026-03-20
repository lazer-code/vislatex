/**
 * Types for the Electron preload API exposed to the renderer via contextBridge.
 * See electron/preload.ts for the implementation.
 */

interface ElectronFileEntry {
  path: string
  name: string
  /** UTF-8 text (isText=true) or base64-encoded binary (isText=false) */
  data: string
  isText: boolean
}

interface ElectronCompileRequest {
  compiler: string
  /** Single-file mode: LaTeX source */
  mainTex?: string
  /** Single-file mode: binary assets as base64 */
  assets?: Array<{ name: string; data: string }>
  /** Workspace mode: relative path to main .tex file */
  mainPath?: string
  /** Workspace mode: all workspace files */
  files?: ElectronFileEntry[]
}

interface ElectronCompileResult {
  success: boolean
  pdf: string | null
  log: string
}

interface ElectronOpenDirectoryResult {
  /** Absolute path to the opened directory on disk */
  rootPath: string
  /** Display name (folder base name) */
  name: string
  /** All files found under the directory */
  files: ElectronFileEntry[]
}

interface ElectronDeletePathPayload {
  /** Absolute path to the workspace root (used for path-traversal protection) */
  rootPath: string
  /** Path of the item to delete, relative to rootPath */
  relativePath: string
}

interface ElectronDeletePathResult {
  success: boolean
  error?: string
}

interface ElectronAPI {
  compile(payload: ElectronCompileRequest): Promise<ElectronCompileResult>
  checkLatex(): Promise<boolean>
  openExternal(url: string): void
  /** Opens a native folder picker and returns the selected directory + files. */
  openDirectory(): Promise<ElectronOpenDirectoryResult | null>
  /** Deletes a file or folder at relativePath inside rootPath on the real filesystem. */
  deletePath(payload: ElectronDeletePathPayload): Promise<ElectronDeletePathResult>
  /** Opens (or focuses) the PDF preview window. */
  openPreviewWindow(): Promise<void>
  /** Sends the latest compiled PDF (base64) to the preview window.  Pass null to clear. */
  pushPdf(pdfBase64: string | null): void
  /** Registers a callback invoked whenever a new PDF is pushed to this window.
   *  Returns a cleanup function that removes the listener. */
  onPdfUpdate(callback: (pdfBase64: string | null) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
