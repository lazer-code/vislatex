# VisLaTeX

A modern, real-time LaTeX document viewer and previewer built with Next.js.

## Features

- 🖊️ **Monaco Editor** with LaTeX syntax highlighting
- ⚡ **Auto-compile** with 800ms debounce — see your PDF update as you type
- 💾 **Auto-save** — source is automatically saved to local storage
- 📎 **Drag & drop** support for `.tex`, `.bib`, `.cls`, `.sty`, `.svg`, and image files
- 🗂️ **Asset management** — upload images and `.bib` files; view and remove them from the asset bar
- 📄 **Inline PDF preview** via iframe — no PDF.js needed
- 🌙 **Dark theme** throughout
- 🔒 **Sandboxed compilation** — `-no-shell-escape` prevents code execution
- 🗑️ **Clear log** button to reset the compile output panel
- 🌐 **XeLaTeX** support for Unicode, Hebrew, and multilingual documents
- ⬇️ **Download PDF** directly from the browser

## Prerequisites

- **Node.js 20+** and npm for local development
- **Docker** for containerized use (includes TeX Live with XeLaTeX)
- **TeX Live** installed locally if running without Docker (`texlive-xetex` for XeLaTeX)

## Quick Start

### Local Development (requires TeX Live)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### With Docker (recommended)

```bash
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

## How to Use

1. **Type or paste** LaTeX source in the left editor panel
2. The document **auto-compiles** after 800ms of inactivity
3. **Click Compile** to force an immediate compilation
4. Use the **compiler selector** (top-right) to switch between **XeLaTeX** (default) and **pdfLaTeX**
5. Use **Upload Files** to load a `.tex` file, images (`.png`, `.jpg`, `.svg`), or a `.bib` bibliography
6. **Drag and drop** any supported files onto the window
7. Uploaded assets appear in the **asset bar** — click **×** to remove individual files
8. Click **Download PDF** to save the compiled PDF
9. Use the **Clear** button in the log panel to reset the compilation output

## Writing Hebrew (RTL) with XeLaTeX

Switch to **XeLaTeX** using the compiler dropdown, then use `polyglossia` and `bidi` for RTL support. The Docker image includes `texlive-xetex`, `texlive-lang-other`, and `fonts-freefont-otf` which provide the required packages and fonts.

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

### Mixed Hebrew / English / Math

```latex
\documentclass{article}
\usepackage{fontspec}
\usepackage{polyglossia}
\usepackage{amsmath}

\setmainlanguage{hebrew}
\setotherlanguage{english}

\newfontfamily\hebrewfont{FreeSerif}
\setmainfont{FreeSerif}

\begin{document}

\section{ברוך הבא}

VisLaTeX תומך בעברית, \textlatin{English} ומתמטיקה:
\[
  E = mc^2 \quad \text{(תורת היחסות של \textlatin{Einstein})}
\]

\end{document}
```

> **Note:** When using Hebrew as the main language, the document direction is automatically right-to-left. Use `\textlatin{...}` for inline English/Latin text.

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
- Each compilation runs in an isolated temporary directory
- Temp directories are cleaned up after each request

## Architecture

```
src/
├── app/
│   ├── api/compile/route.ts   # Next.js API route — spawns pdflatex or xelatex
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
└── components/
    ├── VisLatexApp.tsx         # Main app shell
    ├── TopBar.tsx              # Header with controls and compiler selector
    ├── Editor.tsx              # Monaco editor (LaTeX syntax highlighting)
    ├── AssetPanel.tsx          # Uploaded asset list with remove buttons
    ├── PDFViewer.tsx           # iframe PDF preview
    ├── DropZone.tsx            # Drag-and-drop overlay
    └── LogPanel.tsx            # Compile log panel with clear button
```

## Deployment

Build the Docker image for production:

```bash
docker build -t vislatex .
docker run -p 3000:3000 vislatex
```
