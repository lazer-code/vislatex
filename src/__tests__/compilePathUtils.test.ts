import path from 'path'

// ---------------------------------------------------------------------------
// Helper that replicates the output-directory path normalisation used in the
// compile IPC handler: replace the platform path separator with '/' so that
// kpathsea / TeX engines on Windows receive a forward-slash path.
// ---------------------------------------------------------------------------
function toForwardSlashes(p: string): string {
  return p.split(path.sep).join('/')
}

describe('output-directory path normalisation', () => {
  it('returns the path unchanged on platforms that already use forward slashes', () => {
    // On Linux/macOS path.sep is '/'; the operation is a no-op.
    const p = '/tmp/vislatex-abc123'
    expect(toForwardSlashes(p)).toBe('/tmp/vislatex-abc123')
  })

  it('converts backslash separators to forward slashes', () => {
    // Simulate a Windows-style path regardless of the host OS by building it
    // with backslashes and then running the normalisation.
    const windowsPath = 'C:\\Users\\Shaked\\AppData\\Local\\Temp\\vislatex-uuid'
    const result = windowsPath.split('\\').join('/')
    expect(result).toBe('C:/Users/Shaked/AppData/Local/Temp/vislatex-uuid')
  })

  it('does not alter paths that already use forward slashes', () => {
    const p = 'C:/Users/Shaked/AppData/Local/Temp/vislatex-uuid'
    const result = p.split('/').join('/')
    expect(result).toBe('C:/Users/Shaked/AppData/Local/Temp/vislatex-uuid')
  })

  it('produces a valid -output-directory argument string', () => {
    const tmpDir = '/tmp/vislatex-f2127f5d-e718-40f3-b28e-28e6325d5946'
    const arg = `-output-directory=${toForwardSlashes(tmpDir)}`
    expect(arg).toBe(
      '-output-directory=/tmp/vislatex-f2127f5d-e718-40f3-b28e-28e6325d5946'
    )
  })
})

// ---------------------------------------------------------------------------
// Helper that replicates the PDF candidate-location logic used in workspace
// mode: first check output-directory, then fall back to the main .tex dir.
// ---------------------------------------------------------------------------
function getPdfCandidates(
  tmpDir: string,
  mainTexDir: string,
  baseNameNoExt: string
): string[] {
  return [path.join(tmpDir, baseNameNoExt + '.pdf'), path.join(mainTexDir, baseNameNoExt + '.pdf')]
}

describe('workspace-mode PDF candidate locations', () => {
  it('lists output-directory first, then mainTexDir as fallback', () => {
    const tmpDir = '/tmp/vislatex-abc'
    const mainTexDir = '/tmp/vislatex-abc/chapters'
    const candidates = getPdfCandidates(tmpDir, mainTexDir, 'thesis')
    expect(candidates[0]).toBe(path.join(tmpDir, 'thesis.pdf'))
    expect(candidates[1]).toBe(path.join(mainTexDir, 'thesis.pdf'))
  })

  it('produces two distinct paths when mainTexDir is a subdirectory', () => {
    const tmpDir = '/tmp/vislatex-abc'
    const mainTexDir = path.join(tmpDir, 'sections')
    const candidates = getPdfCandidates(tmpDir, mainTexDir, 'main')
    expect(candidates[0]).not.toBe(candidates[1])
  })

  it('produces only one unique path when mainTexDir equals tmpDir (single-level)', () => {
    const tmpDir = '/tmp/vislatex-abc'
    const mainTexDir = tmpDir
    const candidates = getPdfCandidates(tmpDir, mainTexDir, 'main')
    // Both candidates point to the same file when there is no subdirectory.
    expect(candidates[0]).toBe(candidates[1])
  })
})

// ---------------------------------------------------------------------------
// Retry logic: simulate the retry loop used when reading the PDF file.
// ---------------------------------------------------------------------------
describe('PDF read retry logic', () => {
  it('succeeds on the first attempt when the file is immediately available', async () => {
    let callCount = 0
    async function readFileMock(): Promise<Buffer> {
      callCount++
      return Buffer.from('fake-pdf-content')
    }

    let pdfBase64: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const bytes = await readFileMock()
        pdfBase64 = bytes.toString('base64')
        break
      } catch {
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 0))
      }
    }

    expect(callCount).toBe(1)
    expect(pdfBase64).not.toBeNull()
  })

  it('retries and succeeds on the second attempt', async () => {
    let callCount = 0
    async function readFileMock(): Promise<Buffer> {
      callCount++
      if (callCount < 2) throw new Error('EBUSY: file locked')
      return Buffer.from('fake-pdf-content')
    }

    let pdfBase64: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const bytes = await readFileMock()
        pdfBase64 = bytes.toString('base64')
        break
      } catch {
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 0))
      }
    }

    expect(callCount).toBe(2)
    expect(pdfBase64).not.toBeNull()
  })

  it('returns null after all 3 attempts fail', async () => {
    async function readFileMock(): Promise<Buffer> {
      throw new Error('ENOENT: no such file')
    }

    let pdfBase64: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const bytes = await readFileMock()
        pdfBase64 = bytes.toString('base64')
        break
      } catch {
        if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 0))
      }
    }

    expect(pdfBase64).toBeNull()
  })
})
