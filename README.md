# VisLaTeX

A modern, real-time LaTeX document viewer and previewer built with Next.js 14.

![VisLaTeX Screenshot](screenshot-placeholder.png)

## Features

- 🖊️ **Monaco Editor** with syntax awareness and code editing features
- ⚡ **Auto-compile** with 800ms debounce — see your PDF update as you type
- 📎 **Drag & drop** support for `.tex`, `.bib`, `.cls`, `.sty`, and image files
- 📄 **Inline PDF preview** via iframe — no PDF.js needed
- 🌙 **Dark theme** throughout
- 🔒 **Sandboxed compilation** — `-no-shell-escape` prevents code execution

## Prerequisites

- **Node.js 20+** and npm for local development
- **Docker** for containerized use (includes TeX Live)
- **TeX Live** installed locally if running without Docker

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
4. Use **Upload .tex** to load a `.tex` file from disk
5. **Drag and drop** a `.tex` file (with any assets) onto the window
6. Click **Download PDF** to save the compiled PDF

## Security

- `pdflatex` is run with `-no-shell-escape` to prevent `\write18` code execution
- Each compilation runs in an isolated temporary directory
- Temp directories are cleaned up after each request

## Architecture

```
src/
├── app/
│   ├── api/compile/route.ts   # Next.js API route — spawns pdflatex
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
└── components/
    ├── VisLatexApp.tsx         # Main app shell
    ├── TopBar.tsx              # Header with controls
    ├── Editor.tsx              # Monaco editor wrapper
    ├── PDFViewer.tsx           # iframe PDF preview
    ├── DropZone.tsx            # Drag-and-drop overlay
    └── LogPanel.tsx            # Compile log panel
```

## Deployment

Build the Docker image for production:

```bash
docker build -t vislatex .
docker run -p 3000:3000 vislatex
```