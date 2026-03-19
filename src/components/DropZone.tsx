interface DropZoneProps {
  isDragging: boolean
  onDrop: (files: FileList) => void
}

export default function DropZone({ isDragging, onDrop }: DropZoneProps) {
  if (!isDragging) return null

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      onDrop(e.dataTransfer.files)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-4 border-2 border-dashed border-cyan-400 rounded-2xl px-20 py-16 text-cyan-400 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-16 w-16 opacity-80"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-2xl font-semibold">Drop your LaTeX files here</p>
        <p className="text-sm text-cyan-500 opacity-80">.tex, .bib, .cls, .sty, images</p>
      </div>
    </div>
  )
}
