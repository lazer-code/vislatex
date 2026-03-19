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

interface ElectronAPI {
  compile(payload: ElectronCompileRequest): Promise<ElectronCompileResult>
  checkLatex(): Promise<boolean>
  openExternal(url: string): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
