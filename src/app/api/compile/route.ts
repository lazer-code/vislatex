import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Validate that a relative path stays within the project root (no traversal). */
function isSafeRelativePath(p: string): boolean {
  if (path.isAbsolute(p)) return false
  const normalized = path.normalize(p)
  return !normalized.startsWith('..')
}

export async function POST(request: NextRequest) {
  const tmpDir = path.join(os.tmpdir(), 'vislatex-' + uuidv4())
  try {
    await fs.mkdir(tmpDir, { recursive: true })

    const formData = await request.formData()
    const compilerField = formData.get('compiler') as string | null
    const compiler = compilerField === 'pdflatex' ? 'pdflatex' : 'xelatex'

    // ── Workspace / project-aware mode ────────────────────────────────────
    const mainPathField = formData.get('mainPath') as string | null

    if (mainPathField) {
      // Validate mainPath
      if (!isSafeRelativePath(mainPathField)) {
        return NextResponse.json({ success: false, log: 'Invalid mainPath', pdf: null })
      }

      // Write all workspace files preserving their relative paths
      const files = formData.getAll('files') as File[]
      const paths = formData.getAll('paths') as string[]

      for (let i = 0; i < files.length; i++) {
        const relPath = paths[i]
        if (!relPath || !isSafeRelativePath(relPath)) continue

        const destPath = path.join(tmpDir, relPath)
        // Use path.relative to robustly detect any traversal attempt
        const rel = path.relative(tmpDir, destPath)
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue

        await fs.mkdir(path.dirname(destPath), { recursive: true })
        const bytes = await files[i].arrayBuffer()
        await fs.writeFile(destPath, Buffer.from(bytes))
      }

      // Run compiler from the directory that contains the main .tex file so
      // that relative \includegraphics paths (e.g. ../../images/…) resolve
      // correctly against the .tex file's location.
      const mainTexDir = path.join(tmpDir, path.dirname(mainPathField))
      const mainTexBasename = path.basename(mainPathField)
      const baseNameNoExt = path.basename(mainPathField, path.extname(mainPathField))

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
          return NextResponse.json({
            success: false,
            pdf: null,
            log: `${compiler} not found. Please install TeX Live or run inside Docker.`,
          })
        }
        log = error.stdout || error.message || 'Compilation failed'
        success = false
      }

      try {
        log = await fs.readFile(path.join(tmpDir, baseNameNoExt + '.log'), 'utf8')
      } catch {
        // log file may not exist
      }

      let pdfBase64: string | null = null
      try {
        const pdfBytes = await fs.readFile(path.join(tmpDir, baseNameNoExt + '.pdf'))
        pdfBase64 = pdfBytes.toString('base64')
        success = true
      } catch {
        success = false
      }

      return NextResponse.json({ success, pdf: pdfBase64, log })
    }

    // ── Legacy single-file mode ───────────────────────────────────────────
    const mainTex = formData.get('mainTex') as string

    if (!mainTex) {
      return NextResponse.json({ success: false, log: 'No LaTeX source provided', pdf: null })
    }

    await fs.writeFile(path.join(tmpDir, 'main.tex'), mainTex, 'utf8')

    const assets = formData.getAll('assets') as File[]
    for (const asset of assets) {
      const bytes = await asset.arrayBuffer()
      await fs.writeFile(path.join(tmpDir, asset.name), Buffer.from(bytes))
    }

    const args = ['-interaction=nonstopmode', '-no-shell-escape', `-output-directory=${tmpDir}`, 'main.tex']
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
        return NextResponse.json({ success: false, pdf: null, log: `${compiler} not found. Please install TeX Live or run inside Docker.` })
      }
      log = error.stdout || error.message || 'Compilation failed'
      success = false
    }

    try {
      log = await fs.readFile(path.join(tmpDir, 'main.log'), 'utf8')
    } catch {
      // .log file may not exist if pdflatex wasn't invoked (e.g. ENOENT before compile)
    }

    let pdfBase64: string | null = null
    try {
      const pdfBytes = await fs.readFile(path.join(tmpDir, 'main.pdf'))
      pdfBase64 = pdfBytes.toString('base64')
      success = true
    } catch {
      success = false
    }

    return NextResponse.json({ success, pdf: pdfBase64, log })
  } catch (err: unknown) {
    const error = err as { message?: string }
    return NextResponse.json({ success: false, pdf: null, log: error.message || 'Internal error' })
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch {}
  }
}
