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

export async function POST(request: NextRequest) {
  const tmpDir = path.join(os.tmpdir(), 'vislatex-' + uuidv4())
  try {
    await fs.mkdir(tmpDir, { recursive: true })

    const formData = await request.formData()
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
        const result = await execFileAsync('pdflatex', args, {
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
        return NextResponse.json({ success: false, pdf: null, log: 'pdflatex not found. Please install TeX Live or run inside Docker.' })
      }
      log = error.stdout || error.message || 'Compilation failed'
      success = false
    }

    try {
      log = await fs.readFile(path.join(tmpDir, 'main.log'), 'utf8')
    } catch {}

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
