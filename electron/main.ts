import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile, mkdir, readFile, rm, readdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { isSafeRelativePath, injectHebrewBidi } from './latexUtils'

const execFileAsync = promisify(execFile)

// ── MiKTeX / LaTeX presence check ────────────────────────────────────────────

/**
 * Returns true if any supported LaTeX compiler is found on the system PATH.
 * Uses a short timeout so the check never blocks app startup.
 */
async function isLatexInstalled(): Promise<boolean> {
  const candidates = ['pdflatex', 'xelatex', 'miktex']
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ['--version'], { timeout: 5000 })
      return true
    } catch (err: unknown) {
      const error = err as { code?: string; killed?: boolean }
      if (error.killed) {
        // Command timed out — it exists but is slow to respond; treat as present.
        console.warn(`[vislatex] '${cmd} --version' timed out; assuming LaTeX is installed.`)
        return true
      }
      // ENOENT means the executable was not found; any other exit code means it
      // IS present (e.g. --version returned a non-zero code on some distros).
      if (error.code !== 'ENOENT') return true
    }
  }
  return false
}

ipcMain.handle('check-latex', async () => {
  return isLatexInstalled()
})

ipcMain.on('open-external', (_event, url: string) => {
  // Only allow https URLs to the MiKTeX website to be opened externally.
  if (typeof url === 'string' && /^https:\/\/miktex\.org(\/|$)/.test(url)) {
    shell.openExternal(url)
  } else {
    console.warn(`[vislatex] open-external: rejected URL '${url}'`)
  }
})


// ── File-system helpers ───────────────────────────────────────────────────────

const TEXT_EXTENSIONS_MAIN = ['.tex', '.bib', '.sty', '.cls', '.txt', '.md']

interface ScannedFile {
  path: string
  name: string
  data: string
  isText: boolean
}

async function scanDirectory(rootPath: string, relPrefix: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = []
  const targetDir = relPrefix ? join(rootPath, relPrefix) : rootPath
  let entries
  try {
    entries = await readdir(targetDir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    // Skip hidden files/folders (e.g. .git)
    if (entry.name.startsWith('.')) continue
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const sub = await scanDirectory(rootPath, relPath)
      files.push(...sub)
    } else if (entry.isFile()) {
      const isText = TEXT_EXTENSIONS_MAIN.some((ext) => entry.name.toLowerCase().endsWith(ext))
      try {
        if (isText) {
          const content = await readFile(join(rootPath, relPath), 'utf8')
          files.push({ path: relPath, name: entry.name, data: content, isText: true })
        } else {
          const buf = await readFile(join(rootPath, relPath))
          files.push({ path: relPath, name: entry.name, data: buf.toString('base64'), isText: false })
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return files
}

// ── open-directory IPC ────────────────────────────────────────────────────────

ipcMain.handle('open-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const rootPath = result.filePaths[0]
  const name = path.basename(rootPath)
  const files = await scanDirectory(rootPath, '')
  return { rootPath, name, files }
})

// ── delete-path IPC ───────────────────────────────────────────────────────────

interface DeletePathPayload {
  rootPath: string
  relativePath: string
}

ipcMain.handle('delete-path', async (_event, payload: DeletePathPayload) => {
  const { rootPath, relativePath } = payload

  if (
    typeof rootPath !== 'string' ||
    typeof relativePath !== 'string' ||
    !rootPath ||
    !relativePath
  ) {
    return { success: false, error: 'Invalid path arguments' }
  }

  if (!isSafeRelativePath(relativePath)) {
    return { success: false, error: 'Path traversal not allowed' }
  }

  const absolutePath = join(rootPath, relativePath)
  const rel = path.relative(rootPath, absolutePath)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { success: false, error: 'Path traversal not allowed' }
  }

  try {
    await rm(absolutePath, { recursive: true, force: true })
    return { success: true }
  } catch (err: unknown) {
    const error = err as { message?: string }
    return { success: false, error: error.message ?? 'Deletion failed' }
  }
})

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

/** Shape of the error thrown by `execFileAsync` on non-zero exit. */
interface ExecError {
  code?: string
  stdout?: string
  stderr?: string
  message?: string
}

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
          // For the main .tex file, inject Hebrew bidi preamble when needed
          const content =
            relPath === payload.mainPath && compiler === 'xelatex'
              ? injectHebrewBidi(file.data)
              : file.data
          await writeFile(destPath, content, 'utf8')
        } else {
          await writeFile(destPath, Buffer.from(file.data, 'base64'))
        }
      }

      // Run compiler from the directory that contains the main .tex file so
      // that relative \includegraphics paths resolve correctly.
      const mainTexDir = join(tmpDir, path.dirname(payload.mainPath))
      const mainTexBasename = path.basename(payload.mainPath)
      const baseNameNoExt = path.basename(payload.mainPath, path.extname(payload.mainPath))

      // Use forward slashes for the output-directory argument: some versions of
      // kpathsea/TeX on Windows do not handle backslash paths in this option.
      const outputDirArg = tmpDir.split(path.sep).join('/')

      const args = [
        '-interaction=nonstopmode',
        '-no-shell-escape',
        `-output-directory=${outputDirArg}`,
        mainTexBasename,
      ]

      let log = ''
      let success = false

      // Run each pass independently so a non-zero exit on the first pass
      // (e.g. unresolved references, LaTeX warnings, or MiKTeX auto-installs)
      // does not prevent the second pass from producing the PDF.
      for (let i = 0; i < 2; i++) {
        try {
          const result = await execFileAsync(compiler, args, {
            cwd: mainTexDir,
            timeout: 120000,
            maxBuffer: 10 * 1024 * 1024,
          })
          log = result.stdout + result.stderr
        } catch (err: unknown) {
          const error = err as ExecError
          if (error.code === 'ENOENT') {
            return {
              success: false,
              pdf: null,
              log: `${compiler} not found. Please install MiKTeX or TeX Live and ensure it is on your PATH.`,
            }
          }
          // Non-zero exit: capture output and continue to the next pass.
          // XeLaTeX/pdfLaTeX may exit with code 1 due to warnings yet still
          // produce a usable PDF on this or the next pass.
          log = ((error.stdout ?? '') + (error.stderr ?? '')) || error.message || ''
        }
      }

      try {
        log = await readFile(join(tmpDir, baseNameNoExt + '.log'), 'utf8')
      } catch {
        // log file may not exist
      }

      let pdfBase64: string | null = null
      // PDF candidate locations: the specified output-directory first, then the
      // directory that contains the main .tex file as a fallback (some TeX
      // engines ignore -output-directory and write to the working directory).
      const pdfCandidates = [
        join(tmpDir, baseNameNoExt + '.pdf'),
        join(mainTexDir, baseNameNoExt + '.pdf'),
      ]
      for (const pdfPath of pdfCandidates) {
        // Retry up to 3 times with a short delay to handle transient file locks
        // (e.g. Windows Defender scanning the newly-created PDF).
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const pdfBytes = await readFile(pdfPath)
            pdfBase64 = pdfBytes.toString('base64')
            success = true
            break
          } catch {
            if (attempt < 2) {
              await new Promise<void>((resolve) => setTimeout(resolve, 200))
            }
          }
        }
        if (pdfBase64 !== null) break
      }
      if (pdfBase64 === null) success = false

      return { success, pdf: pdfBase64, log }
    }

    // ── Single-file mode ──────────────────────────────────────────────────
    if (!payload.mainTex) {
      return { success: false, log: 'No LaTeX source provided', pdf: null }
    }

    await writeFile(
      join(tmpDir, 'main.tex'),
      compiler === 'xelatex' ? injectHebrewBidi(payload.mainTex) : payload.mainTex,
      'utf8'
    )

    if (payload.assets) {
      for (const asset of payload.assets) {
        await writeFile(join(tmpDir, asset.name), Buffer.from(asset.data, 'base64'))
      }
    }

    // Use forward slashes for the output-directory argument: some versions of
    // kpathsea/TeX on Windows do not handle backslash paths in this option.
    const singleOutputDirArg = tmpDir.split(path.sep).join('/')

    const args = [
      '-interaction=nonstopmode',
      '-no-shell-escape',
      `-output-directory=${singleOutputDirArg}`,
      'main.tex',
    ]
    let log = ''
    let success = false

    // Run each pass independently so a non-zero exit on the first pass
    // (e.g. unresolved references, LaTeX warnings, or MiKTeX auto-installs)
    // does not prevent the second pass from producing the PDF.
    for (let i = 0; i < 2; i++) {
      try {
        const result = await execFileAsync(compiler, args, {
          cwd: tmpDir,
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        })
        log = result.stdout + result.stderr
      } catch (err: unknown) {
        const error = err as ExecError
        if (error.code === 'ENOENT') {
          return {
            success: false,
            pdf: null,
            log: `${compiler} not found. Please install MiKTeX or TeX Live and ensure it is on your PATH.`,
          }
        }
        // Non-zero exit: capture output and continue to the next pass.
        // XeLaTeX/pdfLaTeX may exit with code 1 due to warnings yet still
        // produce a usable PDF on this or the next pass.
        log = ((error.stdout ?? '') + (error.stderr ?? '')) || error.message || ''
      }
    }

    try {
      log = await readFile(join(tmpDir, 'main.log'), 'utf8')
    } catch {
      // .log file may not exist if the compiler was not found
    }

    let pdfBase64: string | null = null
    // Retry up to 3 times with a short delay to handle transient file locks
    // (e.g. Windows Defender scanning the newly-created PDF).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const pdfBytes = await readFile(join(tmpDir, 'main.pdf'))
        pdfBase64 = pdfBytes.toString('base64')
        success = true
        break
      } catch {
        if (attempt < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 200))
        }
      }
    }
    if (pdfBase64 === null) success = false

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
