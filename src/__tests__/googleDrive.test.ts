/**
 * Tests for the Google Drive API helpers in src/services/googleDrive.ts
 */

import {
  listDriveFolder,
  downloadDriveFile,
  createDriveFile,
  updateDriveFile,
  getDriveFileMeta,
  DRIVE_FOLDER_MIME,
  DriveFile,
} from '../services/googleDrive'

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function blobResponse(content: string, status = 200): Response {
  return new Response(new Blob([content], { type: 'application/pdf' }), { status })
}

function errorResponse(status: number, statusText: string): Response {
  return new Response(null, { status, statusText })
}

beforeEach(() => {
  mockFetch.mockReset()
})

// ─── listDriveFolder ─────────────────────────────────────────────────────────

describe('listDriveFolder', () => {
  const token = 'test-access-token'

  it('sends a GET request with correct query for root', async () => {
    const mockFiles: DriveFile[] = [
      { id: 'file1', name: 'main.tex', mimeType: 'text/plain' },
      { id: 'folder1', name: 'images', mimeType: DRIVE_FOLDER_MIME },
    ]
    mockFetch.mockResolvedValueOnce(jsonResponse({ files: mockFiles }))

    const result = await listDriveFolder(token, null)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const decodedUrl = decodeURIComponent(url)
    expect(decodedUrl).toContain("'root' in parents")
    expect(decodedUrl).toContain('trashed = false')
    expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
    expect(result).toEqual(mockFiles)
  })

  it('sends a GET request with correct query for a folder', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ files: [] }))

    await listDriveFolder(token, 'folder123')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    const decodedUrl = decodeURIComponent(url)
    expect(decodedUrl).toContain("'folder123' in parents")
  })

  it('returns empty array when files is missing from response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}))
    const result = await listDriveFolder(token, null)
    expect(result).toEqual([])
  })

  it('throws an error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, 'Forbidden'))
    await expect(listDriveFolder(token, null)).rejects.toThrow('Drive list failed: 403')
  })
})

// ─── downloadDriveFile ───────────────────────────────────────────────────────

describe('downloadDriveFile', () => {
  const token = 'test-access-token'

  it('sends GET request with alt=media and returns a Blob', async () => {
    mockFetch.mockResolvedValueOnce(blobResponse('%PDF-1.4'))

    const blob = await downloadDriveFile(token, 'file123')

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('files/file123')
    expect(url).toContain('alt=media')
    expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('throws an error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'))
    await expect(downloadDriveFile(token, 'missing')).rejects.toThrow('Drive download failed: 404')
  })
})

// ─── createDriveFile ─────────────────────────────────────────────────────────

describe('createDriveFile', () => {
  const token = 'test-access-token'

  it('sends a multipart POST and returns the created DriveFile', async () => {
    const created: DriveFile = { id: 'new-file', name: 'hello.tex', mimeType: 'text/plain' }
    mockFetch.mockResolvedValueOnce(jsonResponse(created))

    const result = await createDriveFile(token, 'hello.tex', '\\documentclass{article}')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('uploadType=multipart')
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
    expect(result).toEqual(created)
  })

  it('includes parent folder id in metadata when provided', async () => {
    const created: DriveFile = { id: 'child-file', name: 'child.tex', mimeType: 'text/plain', parents: ['parent123'] }
    mockFetch.mockResolvedValueOnce(jsonResponse(created))

    await createDriveFile(token, 'child.tex', '', 'parent123')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = options.body as FormData
    const metaBlob = body.get('metadata') as Blob
    const metaText = await metaBlob.text()
    const meta = JSON.parse(metaText)
    expect(meta.parents).toContain('parent123')
  })

  it('throws an error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Server Error'))
    await expect(createDriveFile(token, 'x.tex', '')).rejects.toThrow('Drive create failed: 500')
  })
})

// ─── updateDriveFile ─────────────────────────────────────────────────────────

describe('updateDriveFile', () => {
  const token = 'test-access-token'

  it('sends a PATCH request with the new content', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    await updateDriveFile(token, 'file123', 'updated content')

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('files/file123')
    expect(url).toContain('uploadType=media')
    expect(options.method).toBe('PATCH')
    expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
    expect(options.body).toBe('updated content')
  })

  it('throws an error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))
    await expect(updateDriveFile(token, 'f', 'content')).rejects.toThrow('Drive update failed: 401')
  })
})

// ─── getDriveFileMeta ────────────────────────────────────────────────────────

describe('getDriveFileMeta', () => {
  const token = 'test-access-token'

  it('returns file metadata', async () => {
    const meta: DriveFile = {
      id: 'file123',
      name: 'main.tex',
      mimeType: 'text/plain',
      parents: ['root'],
      modifiedTime: '2024-01-01T00:00:00Z',
    }
    mockFetch.mockResolvedValueOnce(jsonResponse(meta))

    const result = await getDriveFileMeta(token, 'file123')

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('files/file123')
    expect(result).toEqual(meta)
  })

  it('throws an error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'))
    await expect(getDriveFileMeta(token, 'missing')).rejects.toThrow('Drive metadata failed: 404')
  })
})
