import path from 'path'

// ── Path safety ───────────────────────────────────────────────────────────────

/**
 * Returns true if `p` is a relative path that does not escape its root
 * directory via `..` traversal.
 */
export function isSafeRelativePath(p: string): boolean {
  if (path.isAbsolute(p)) return false
  const normalized = path.normalize(p)
  return !normalized.startsWith('..')
}

// ── Hebrew bidirectional text helpers ─────────────────────────────────────────

const HEBREW_RE = /[\u0590-\u05FF]/

/** Returns true if the source contains at least one Hebrew character. */
export function hasHebrewText(source: string): boolean {
  return HEBREW_RE.test(source)
}

/**
 * Returns true if the LaTeX source already loads any of the given packages
 * via `\usepackage{...}` (with or without optional arguments).
 */
export function hasAnyOfPackages(source: string, packages: string[]): boolean {
  return packages.some((pkg) =>
    new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{${pkg}\\}`).test(source)
  )
}

/**
 * When a XeLaTeX document contains Hebrew characters but no bidirectional
 * package (polyglossia / bidi / babel), inject a minimal polyglossia preamble
 * immediately after `\documentclass` so the compiled PDF renders correctly.
 *
 * Only the temporary compilation copy is modified; the user's file on disk is
 * left untouched.
 */
export function injectHebrewBidi(source: string): string {
  if (!hasHebrewText(source)) return source
  if (hasAnyOfPackages(source, ['polyglossia', 'bidi', 'babel'])) return source

  const insert = [
    '\\usepackage{polyglossia}',
    '\\setmainlanguage{hebrew}',
    '\\setotherlanguage{english}',
    '',
  ].join('\n')

  // Insert after the \documentclass{...} line (handles optional [] arguments)
  return source.replace(
    /(\\documentclass(?:\[[^\]]*\])?\{[^}]*\}[^\n]*\n)/,
    `$1${insert}`
  )
}
