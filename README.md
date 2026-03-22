# VisLaTeX

A modern, real-time LaTeX editor and previewer built as a **Windows desktop application** using Electron + React + Vite.

## Features

- 🖊️ **Monaco Editor** with LaTeX syntax highlighting
- ⚡ **Auto-compile** with 800 ms debounce — see your PDF update as you type
- 💾 **Auto-save** — source is automatically saved to local storage
- 📎 **Drag & drop** support for `.tex`, `.bib`, `.cls`, `.sty`, `.svg`, and image files
- 🗂️ **Asset management** — upload images and `.bib` files; view and remove them from the asset bar
- 📄 **Inline PDF preview** — no external viewer needed
- 🌙 **Dark theme** throughout
- 🔒 **Sandboxed compilation** — `-no-shell-escape` prevents code execution
- 🌐 **XeLaTeX** support for Unicode, Hebrew, and multilingual documents
- ⬇️ **Download PDF** directly from the app
- 🔤 **Auto line alignment** — RTL script lines (Hebrew, Arabic) are right-aligned automatically; mixed RTL+math lines render in correct visual order without character jumping
- 🌐 **Mixed LTR/RTL support** — type Hebrew then math in source order; the PDF places math correctly to the left in RTL context; works in paragraphs and inside `\section{}`/`\subsection{}` titles
- 📁 **Multi-file workspace** — open a folder and work on a complete LaTeX project

## Prerequisites

### Running / developing

- **Node.js 20+** — <https://nodejs.org/>
- **npm 9+** (bundled with Node.js)

### LaTeX compilation

You need a local TeX distribution on **PATH**. Install one of:

- **MiKTeX** (recommended for Windows) — <https://miktex.org/download>  
  After install, open the MiKTeX Console and click **Check for Updates**.
- **TeX Live** — <https://tug.org/texlive/>

Both `pdflatex` and `xelatex` must be available on the system PATH for compilation to work.

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone https://github.com/lazer-code/vislatex.git
cd vislatex

# 2. Install dependencies
npm install

# 3. Start in development mode (hot-reload for renderer)
npm run dev
```

`npm run dev` starts the Vite development server for the renderer and launches the Electron window automatically. Changes to React components reload instantly.

## Building for Production

```bash
# Build the app (compiles main process + preload + renderer)
npm run build

# Then launch the built app with Electron
npx electron .
```

## Packaging a Windows Installer

```bash
# Build everything and produce a distributable installer
npm run dist
```

This produces an NSIS installer (`.exe`) and a portable executable inside the `release/` folder. The installer supports both **x64** and **ia32** Windows targets.

> **Note:** Packaging downloads Electron binaries for the target platform. This requires internet access and may take a few minutes on the first run.

## How to Use

1. **Type or paste** LaTeX source in the left editor panel
2. The document **auto-compiles** after 800 ms of inactivity
3. Click **Compile** to force an immediate compilation
4. Use the **compiler selector** (top-right) to switch between **XeLaTeX** (default) and **pdfLaTeX**
5. Use **Upload Files** to load a `.tex` file, images (`.png`, `.jpg`, `.svg`), or a `.bib` bibliography
6. Use **Open Folder** to open an entire LaTeX project folder as a workspace
7. **Drag and drop** any supported files onto the window
8. Uploaded assets appear in the **asset bar** — click **×** to remove individual files
9. Click **Download PDF** to save the compiled PDF

## Writing Hebrew / RTL with XeLaTeX

Switch to **XeLaTeX** using the compiler dropdown (or click **🔤 RTL Template** in the toolbar for a
ready-made setup), then use `polyglossia` for RTL support.  Ensure you have the required fonts
installed (e.g. FreeSerif from `fonts-freefont-otf`).

### Quick start — 🔤 RTL Template button

Click **🔤 RTL Template** in the top bar.  The editor loads a complete Hebrew + math template and
switches the compiler to XeLaTeX automatically.  Just hit **Compile ▶** to see the result.

### How mixed LTR/RTL works

With `polyglossia` and `\setmainlanguage{hebrew}`:

| You type in source | PDF renders as |
|--------------------|----------------|
| `היי $\frac{1}{2}$` | `[fraction]  [היי]` (fraction to the **left** of the Hebrew word) |
| `\section{היי $\frac{1}{2}$}` | Section title with fraction to the **left** |

The source stays in the **natural typed order** — no special wrapping required.  The `bidi` engine
(bundled in `polyglossia`) handles the visual reordering for the PDF automatically based on the
first strong character in each paragraph or heading.

### Editor auto-alignment

The editor automatically detects the dominant direction of each line:

- Lines whose **first meaningful character** is Hebrew or Arabic are **right-aligned**.
- All other lines are **left-aligned**.
- Leading whitespace, list markers (`-`, `*`, `•`), and numbered prefixes are skipped.
- LaTeX command prefixes such as `\section{`, `\subsection*{`, `\textbf{` are also stripped, so
  `\section{Hebrew text}` is correctly aligned right.
- Mixed lines (RTL text followed by Latin math) are also aligned right, and the browser's Unicode
  Bidirectional Algorithm renders the LTR math run in the correct visual position within the line —
  no character jumping.

### Minimal Hebrew example

```latex
\documentclass{article}
\usepackage{fontspec}
\usepackage{polyglossia}

\setmainlanguage{hebrew}
\setotherlanguage{english}

\newfontfamily\hebrewfont{FreeSerif}

\begin{document}

% Typing in source order → PDF shows fraction to the LEFT of the Hebrew word:
היי $\frac{1}{2}$ --- השבר מוצג משמאל לטקסט העברי.

\textlatin{Hello} --- שלום עולם

\textlatin{Math works too:} $E = mc^2$

\end{document}
```

### Section titles with mixed content

```latex
\section{היי $\frac{1}{2}$}
\subsection{כותרת עם מתמטיקה $x^2 + y^2 = r^2$}
```

Both compile correctly with `polyglossia`.  The editor right-aligns these lines because it strips
the `\section{` / `\subsection{` prefix when detecting the first meaningful character.

### Programmatic bidi helpers

The `src/utils/bidiLatex.ts` module exposes utilities for bidi-aware tooling:

```typescript
import { hasMixedBidi, documentNeedsBidi, buildBidiPreamble, RTL_LATEX_TEMPLATE }
  from '@/utils/bidiLatex'

hasMixedBidi('היי $\\frac{1}{2}$')   // true  — has both RTL and LTR characters
documentNeedsBidi(source)             // true  — source contains RTL characters

buildBidiPreamble()
// → \usepackage{fontspec}
//   \usepackage{polyglossia}
//   \setmainlanguage{hebrew}
//   \setotherlanguage{english}
//   \newfontfamily\hebrewfont{FreeSerif}
```

## Using Images

Upload image files (`.png`, `.jpg`, `.jpeg`, `.svg`) via **Upload Files** or drag & drop. Reference them in your LaTeX source by their filename:

```latex
\documentclass{article}
\usepackage{graphicx}

\begin{document}
\includegraphics[width=0.5\textwidth]{photo.jpg}
\end{document}
```

## Using Bibliography Files

Upload a `.bib` file and reference it with `\bibliography{}`:

```latex
\documentclass{article}

\begin{document}
\cite{author2024}

\bibliographystyle{plain}
\bibliography{references}
\end{document}
```

## Security

- Compiler is run with `-no-shell-escape` to prevent `\write18` code execution
- Each compilation runs in an isolated temporary directory that is deleted after the run
- The renderer uses `contextIsolation: true` and `nodeIntegration: false`
- Node.js APIs are exposed to the renderer only through a typed `contextBridge` (see `electron/preload.ts`)

## Architecture

```
vislatex/
├── electron/
│   ├── main.ts          # Main process — BrowserWindow, IPC compile handler
│   └── preload.ts       # contextBridge — exposes window.electronAPI to renderer
├── src/
│   ├── main.tsx         # React renderer entry point
│   ├── globals.css      # Tailwind directives + Monaco RTL/LTR styles
│   ├── renderer.d.ts    # TypeScript types for window.electronAPI
│   ├── components/
│   │   ├── VisLatexApp.tsx   # Main app shell (uses window.electronAPI.compile)
│   │   ├── TopBar.tsx        # Header with controls and compiler selector
│   │   ├── Editor.tsx        # Monaco editor (LaTeX syntax highlighting)
│   │   ├── AssetPanel.tsx    # Uploaded asset list with remove buttons
│   │   ├── PDFViewer.tsx     # iframe PDF preview
│   │   ├── DropZone.tsx      # Drag-and-drop overlay
│   │   ├── LogPanel.tsx      # Compile log panel
│   │   ├── FileExplorer.tsx  # Workspace file tree
│   │   ├── GoogleDrivePanel.tsx  # Google Drive file browser
│   │   └── GoogleSignInModal.tsx # Google OAuth setup modal
│   ├── types/           # Shared TypeScript types
│   └── utils/           # Utility functions (line direction, etc.)
├── index.html           # Vite HTML entry point
├── electron.vite.config.ts  # electron-vite build configuration
├── electron-builder.config.js  # Packaging configuration
└── tailwind.config.js   # Tailwind CSS configuration
```

## Development Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start in development mode (Vite HMR + Electron) |
| `npm run build` | Build all targets (main, preload, renderer) into `out/` |
| `npm run preview` | Preview the production build |
| `npm run dist` | Build + package into a distributable installer in `release/` |
| `npm test` | Run Jest unit tests |

