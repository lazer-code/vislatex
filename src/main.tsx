import React from 'react'
import ReactDOM from 'react-dom/client'
import VisLatexApp from './components/VisLatexApp'
import PreviewApp from './components/PreviewApp'
import './globals.css'

// Configure Monaco editor workers for Vite bundling
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new editorWorker()
  },
}

// When the window is opened with ?mode=preview it acts as the detached PDF
// preview window; otherwise render the full editor application.
const isPreview = new URLSearchParams(window.location.search).get('mode') === 'preview'
const App = isPreview ? PreviewApp : VisLatexApp

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
