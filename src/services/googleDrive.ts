/**
 * Google Drive API v3 helpers.
 *
 * Authentication is handled separately by @react-oauth/google (GIS implicit
 * grant). The access token is kept only in React state – never written to
 * localStorage – so it is automatically discarded when the tab is closed.
 *
 * Requested OAuth scope: https://www.googleapis.com/auth/drive.file
 *   → allows reading / writing only files that were opened or created by this
 *     app.  To browse ALL Drive files, add drive.readonly (see README).
 */

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  modifiedTime?: string
}

const API_BASE = 'https://www.googleapis.com/drive/v3'
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

// Google Drive folder mime type
export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

// ─── Listing ─────────────────────────────────────────────────────────────────

/**
 * List files/folders inside a Drive folder.
 * Pass `null` to list the root of "My Drive".
 */
export async function listDriveFolder(
  accessToken: string,
  folderId: string | null
): Promise<DriveFile[]> {
  const parent = folderId ?? 'root'
  const q = encodeURIComponent(`'${parent}' in parents and trashed = false`)
  const fields = encodeURIComponent('files(id,name,mimeType,parents,modifiedTime)')
  const url = `${API_BASE}/files?q=${q}&fields=${fields}&orderBy=folder,name&pageSize=200`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return (data.files ?? []) as DriveFile[]
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download the raw bytes of a Drive file (non-Google-Docs formats).
 * Returns a Blob so the caller can create an ObjectURL or read text.
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const url = `${API_BASE}/files/${fileId}?alt=media`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${res.statusText}`)
  return res.blob()
}

// ─── Upload / Update ──────────────────────────────────────────────────────────

/**
 * Create a new file in Drive.
 * Returns the newly created DriveFile (with id).
 */
export async function createDriveFile(
  accessToken: string,
  name: string,
  content: string,
  parentFolderId?: string
): Promise<DriveFile> {
  const metadata: { name: string; parents?: string[] } = { name }
  if (parentFolderId) metadata.parents = [parentFolderId]

  const form = new FormData()
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  )
  form.append('file', new Blob([content], { type: 'text/plain' }))

  const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,parents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Drive create failed: ${res.status} ${res.statusText}`)
  return res.json() as Promise<DriveFile>
}

/**
 * Update the content of an existing Drive file.
 */
export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  content: string
): Promise<void> {
  const res = await fetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body: content,
  })
  if (!res.ok) throw new Error(`Drive update failed: ${res.status} ${res.statusText}`)
}

/**
 * Get file metadata.
 */
export async function getDriveFileMeta(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const fields = encodeURIComponent('id,name,mimeType,parents,modifiedTime')
  const res = await fetch(`${API_BASE}/files/${fileId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status} ${res.statusText}`)
  return res.json() as Promise<DriveFile>
}
