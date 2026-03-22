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
- 🔤 **Auto line alignment** — RTL script lines (Hebrew, Arabic) are right-aligned automatically
- 📁 **Multi-file workspace** — open a folder and work on a complete LaTeX project

## Prerequisites

### Running / developing

- **Node.js 20+** — <https://nodejs.org/>
- **npm 9+** (bundled with Node.js)

### LaTeX compilation

> **Recommended: use GitHub Actions** — no local LaTeX install needed.  
> See [Compiling with GitHub Actions](#compiling-with-github-actions) below.

If you prefer to compile locally, install a TeX distribution and make sure both `pdflatex` and `xelatex` are available on your system PATH:

- **MiKTeX** (recommended for Windows) — <https://miktex.org/download>  
  After install, open the MiKTeX Console and click **Check for Updates**.
- **TeX Live** — <https://tug.org/texlive/>

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

## Compiling with GitHub Actions

You can compile your `.tex` files entirely in the cloud using the included GitHub Actions workflow — **no local LaTeX installation required**.

### How it works

The workflow (`.github/workflows/build-latex.yml`) runs automatically whenever you push a commit that changes a `.tex` file. It:

1. Checks out your repository on an `ubuntu-latest` runner
2. Installs TeX Live with XeLaTeX, pdfLaTeX, and common font packages
3. Compiles every `.tex` file found in the repository (using XeLaTeX by default, falling back to pdfLaTeX)
4. Uploads all generated PDFs as a build artifact called **`compiled-pdfs`**

### Triggering a build

The workflow runs automatically on:

- **Push** — any commit that modifies a `.tex` file (or the workflow file itself)
- **Pull request** — when a PR touches a `.tex` file

You can also trigger it manually:

1. Go to your repository on GitHub
2. Click **Actions** → **Build LaTeX**
3. Click **Run workflow** → **Run workflow**

### Downloading the compiled PDF

1. Go to **Actions** in your repository
2. Click the completed **Build LaTeX** workflow run
3. Scroll to **Artifacts** at the bottom of the page
4. Download **`compiled-pdfs`** — it contains all PDFs generated from the repository's `.tex` files

## Writing Hebrew (RTL) with XeLaTeX

Switch to **XeLaTeX** using the compiler dropdown, then use `polyglossia` and `bidi` for RTL support. Ensure you have the required fonts installed (e.g., FreeSerif from `fonts-freefont-otf`).

### Editor auto-alignment

The editor automatically detects the dominant direction of each line:

- Lines whose **first meaningful character** is Hebrew or Arabic are **right-aligned**.
- All other lines are **left-aligned**.
- Leading whitespace, list markers (`-`, `*`, `•`), and numbered prefixes are skipped.

### Minimal Hebrew example

```latex
\documentclass{article}
\usepackage{fontspec}
\usepackage{polyglossia}

\setmainlanguage{hebrew}
\setotherlanguage{english}

\newfontfamily\hebrewfont{FreeSerif}

\begin{document}

\textlatin{Hello} --- שלום עולם

\textlatin{Math works too:} $E = mc^2$

\end{document}
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

