'use client'

interface AssetPanelProps {
  assets: File[]
  onRemove: (name: string) => void
}

function fileTypeIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return '🖼'
  if (ext === 'bib') return '📚'
  if (ext === 'pdf') return '📄'
  if (['cls', 'sty'].includes(ext)) return '🔧'
  return '📎'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AssetPanel({ assets, onRemove }: AssetPanelProps) {
  if (assets.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 overflow-x-auto shrink-0">
      <span className="text-xs text-zinc-500 shrink-0">Assets:</span>
      {assets.map((file) => (
        <div
          key={file.name}
          className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-xs text-zinc-300 shrink-0 group"
          title={`${file.name} (${formatBytes(file.size)})`}
        >
          <span>{fileTypeIcon(file.name)}</span>
          <span className="font-mono max-w-[120px] truncate">{file.name}</span>
          <span className="text-zinc-600">{formatBytes(file.size)}</span>
          <button
            onClick={() => onRemove(file.name)}
            className="ml-0.5 text-zinc-600 hover:text-red-400 transition-colors leading-none"
            title={`Remove ${file.name}`}
            aria-label={`Remove ${file.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
