interface LogPanelProps {
  log: string
  isOpen: boolean
  onToggle: () => void
  onClearLog: () => void
  hasError: boolean
}

function colorLine(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error')) return 'text-red-400'
  if (lower.includes('warning')) return 'text-yellow-400'
  return 'text-zinc-400'
}

export default function LogPanel({ log, isOpen, onToggle, onClearLog, hasError }: LogPanelProps) {
  const lines = log ? log.split('\n') : []

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 bg-zinc-900 border-zinc-800">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 py-2 text-left hover:bg-zinc-800/50 transition-colors rounded"
        >
          <span className="text-sm font-medium text-zinc-300">Compile Log</span>
          {lines.length > 0 && (
            <span className="text-xs text-zinc-500">{lines.length} lines</span>
          )}
          {log && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                hasError
                  ? 'bg-red-900/50 text-red-400'
                  : 'bg-emerald-900/50 text-emerald-400'
              }`}
            >
              {hasError ? 'Error' : 'OK'}
            </span>
          )}
          <span className="ml-auto text-zinc-500 text-xs">{isOpen ? '▼' : '▲'}</span>
        </button>
        {log && (
          <button
            onClick={onClearLog}
            className="text-xs px-2 py-1 text-zinc-500 hover:text-red-400 transition-colors border border-transparent hover:border-red-900/50 rounded"
            title="Clear log"
          >
            Clear
          </button>
        )}
      </div>

      {/* Log content */}
      {isOpen && (
        <div className="overflow-y-auto max-h-48 border-t border-zinc-800">
          <pre className="px-4 py-2 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
            {lines.length === 0 ? (
              <span className="text-zinc-600">No output yet.</span>
            ) : (
              lines.map((line, i) => (
                <span key={i} className={`block ${colorLine(line)}`}>
                  {line || '\u00A0'}
                </span>
              ))
            )}
          </pre>
        </div>
      )}
    </div>
  )
}
