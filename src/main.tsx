import React from 'react'
import ReactDOM from 'react-dom/client'
import VisLatexApp from './components/VisLatexApp'
import './globals.css'

// Configure Monaco editor workers for Vite bundling
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new editorWorker()
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VisLatexApp />
  </React.StrictMode>,
)
