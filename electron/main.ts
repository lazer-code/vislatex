import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile, mkdir, readFile, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

/** Validate that a relative path stays within the project root (no traversal). */
function isSafeRelativePath(p: string): boolean {
  if (path.isAbsolute(p)) return false
  const normalized = path.normalize(p)
  return !normalized.startsWith('..')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'VisLaTeX',
    backgroundColor: '#09090b',
  })

  // In dev mode electron-vite sets ELECTRON_RENDERER_URL to the Vite dev server
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── LaTeX compilation IPC handler ─────────────────────────────────────────────

interface FileEntry {
  path: string
  name: string
  /** UTF-8 text content for text files */
  data: string
  /** true = data is UTF-8 text; false = data is base64-encoded binary */
  isText: boolean
}

interface CompileRequest {
  compiler: string
  /** Single-file mode */
  mainTex?: string
  assets?: Array<{ name: string; data: string }>
  /** Workspace mode */
  mainPath?: string
  files?: FileEntry[]
}

ipcMain.handle('compile', async (_event, payload: CompileRequest) => {
  const tmpDir = join(tmpdir(), 'vislatex-' + uuidv4())
  try {
    await mkdir(tmpDir, { recursive: true })

    const compiler = payload.compiler === 'pdflatex' ? 'pdflatex' : 'xelatex'

    // ── Workspace / project-aware mode ────────────────────────────────────
    if (payload.mainPath && payload.files) {
      if (!isSafeRelativePath(payload.mainPath)) {
        return { success: false, log: 'Invalid mainPath', pdf: null }
      }

      for (const file of payload.files) {
        const relPath = file.path
        if (!relPath || !isSafeRelativePath(relPath)) continue

        const destPath = join(tmpDir, relPath)
        const rel = path.relative(tmpDir, destPath)
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue

        await mkdir(path.dirname(destPath), { recursive: true })
        if (file.isText) {
          await writeFile(destPath, file.data, 'utf8')
        } else {
          await writeFile(destPath, Buffer.from(file.data, 'base64'))
        }
      }

      // Run compiler from the directory that contains the main .tex file so
      // that relative \includegraphics paths resolve correctly.
      const mainTexDir = join(tmpDir, path.dirname(payload.mainPath))
      const mainTexBasename = path.basename(payload.mainPath)
      const baseNameNoExt = path.basename(payload.mainPath, path.extname(payload.mainPath))

      const args = [
        '-interaction=nonstopmode',
        '-no-shell-escape',
        `-output-directory=${tmpDir}`,
        mainTexBasename,
      ]

      let log = ''
      let success = false

      try {
        for (let i = 0; i < 2; i++) {
          const result = await execFileAsync(compiler, args, {
            cwd: mainTexDir,
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024,
          })
          log = result.stdout + result.stderr
        }
        success = true
      } catch (err: unknown) {
        const error = err as { code?: string; stdout?: string; message?: string }
        if (error.code === 'ENOENT') {
          return {
            success: false,
            pdf: null,
            log: `${compiler} not found. Please install MiKTeX or TeX Live and ensure it is on your PATH.`,
          }
        }
        log = error.stdout || error.message || 'Compilation failed'
        success = false
      }

      try {
        log = await readFile(join(tmpDir, baseNameNoExt + '.log'), 'utf8')
      } catch {
        // log file may not exist
      }

      let pdfBase64: string | null = null
      try {
        const pdfBytes = await readFile(join(tmpDir, baseNameNoExt + '.pdf'))
        pdfBase64 = pdfBytes.toString('base64')
        success = true
      } catch {
        success = false
      }

      return { success, pdf: pdfBase64, log }
    }

    // ── Single-file mode ──────────────────────────────────────────────────
    if (!payload.mainTex) {
      return { success: false, log: 'No LaTeX source provided', pdf: null }
    }

    await writeFile(join(tmpDir, 'main.tex'), payload.mainTex, 'utf8')

    if (payload.assets) {
      for (const asset of payload.assets) {
        await writeFile(join(tmpDir, asset.name), Buffer.from(asset.data, 'base64'))
      }
    }

    const args = [
      '-interaction=nonstopmode',
      '-no-shell-escape',
      `-output-directory=${tmpDir}`,
      'main.tex',
    ]
    let log = ''
    let success = false

    try {
      for (let i = 0; i < 2; i++) {
        const result = await execFileAsync(compiler, args, {
          cwd: tmpDir,
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        })
        log = result.stdout + result.stderr
      }
      success = true
    } catch (err: unknown) {
      const error = err as { code?: string; stdout?: string; message?: string }
      if (error.code === 'ENOENT') {
        return {
          success: false,
          pdf: null,
          log: `${compiler} not found. Please install MiKTeX or TeX Live and ensure it is on your PATH.`,
        }
      }
      log = error.stdout || error.message || 'Compilation failed'
      success = false
    }

    try {
      log = await readFile(join(tmpDir, 'main.log'), 'utf8')
    } catch {
      // .log file may not exist if the compiler was not found
    }

    let pdfBase64: string | null = null
    try {
      const pdfBytes = await readFile(join(tmpDir, 'main.pdf'))
      pdfBase64 = pdfBytes.toString('base64')
      success = true
    } catch {
      success = false
    }

    return { success, pdf: pdfBase64, log }
  } catch (err: unknown) {
    const error = err as { message?: string }
    return { success: false, pdf: null, log: error.message || 'Internal error' }
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true })
    } catch {
      // cleanup errors are non-fatal
    }
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
