/**
 * Utilities for detecting whether a line of text should be rendered
 * right-to-left (RTL) or left-to-right (LTR) based on its first meaningful
 * character.
 *
 * RTL ranges covered:
 *   Hebrew:              U+0590–U+05FF
 *   Arabic:              U+0600–U+06FF
 *   Arabic Supplement:   U+0750–U+077F
 *   Arabic Extended-A:   U+08A0–U+08FF
 *   Hebrew Presentation: U+FB1D–U+FB4F
 *   Arabic Presentation: U+FB50–U+FDFF, U+FE70–U+FEFF
 */
const RTL_CHAR_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Leading noise to strip before checking the first meaningful character:
 *   - Whitespace
 *   - Common list markers: '-', '*', '•' and similar bullets
 *   - Numbered list prefixes: e.g. "1.", "2)", "a."
 */
const LEADING_NOISE_RE = /^[\s\-*•\u2022\u2023\u25AA\u25CF]*(?:\d+[.)]\s*|[a-zA-Z][.)]\s*)*/

/**
 * Strips one or more consecutive LaTeX commands of the form \cmd{ or \cmd*{
 * (including any trailing whitespace) so that the content inside the braces
 * is exposed for direction detection.  Only the opening sequences are stripped;
 * closing braces remain in the result but do not affect direction detection.
 * For example:
 *   \subsection*{א. ...}    →  א. ...}
 *   \textbf{\textit{שלום}}  →  שלום}}
 */
const LEADING_LATEX_CMD_RE = /^(?:\\[a-zA-Z]+\*?\{)+\s*/

/**
 * Returns the first character that carries meaningful directional information,
 * skipping leading whitespace, punctuation, common list markers, and LaTeX
 * command prefixes such as \subsection*{ or \textbf{.
 */
export function getFirstMeaningfulChar(text: string): string | null {
  // Strip whitespace, bullets, and numbered/lettered list prefixes.
  let stripped = text.replace(LEADING_NOISE_RE, '')
  // Strip a leading LaTeX command with braces (e.g. \subsection*{) so that
  // \subsection*{Hebrew text} correctly yields the Hebrew character.
  stripped = stripped.replace(LEADING_LATEX_CMD_RE, '')
  // Strip noise a second time: the content inside the braces may itself start
  // with a numbered or lettered prefix (e.g. \subsubsection*{a. Hebrew text}).
  // Without this second pass the leading "a." would be mistaken for LTR content.
  stripped = stripped.replace(LEADING_NOISE_RE, '')
  return stripped.length > 0 ? stripped[0] : null
}

/**
 * Determines whether a line of text should be displayed RTL or LTR based on
 * the first meaningful character.
 */
export function getLineDirection(text: string): 'rtl' | 'ltr' {
  const ch = getFirstMeaningfulChar(text)
  return ch !== null && RTL_CHAR_RE.test(ch) ? 'rtl' : 'ltr'
}

/**
 * Maps a direction to the corresponding CSS text-align value.
 */
export function getAlignmentForDirection(dir: 'rtl' | 'ltr'): 'right' | 'left' {
  return dir === 'rtl' ? 'right' : 'left'
}

/**
 * Matches a line that starts (after optional whitespace) with a backslash,
 * indicating a LaTeX command such as \section, \textbf, \begin, etc.
 */
const STARTS_WITH_LATEX_CMD_RE = /^[ \t]*\\/

/**
 * Returns a fine-grained line direction type used to decide both the text
 * alignment and the paragraph base direction for Monaco view-line elements.
 *
 *   'ltr'     – first meaningful character is LTR (or absent).  Render with
 *               the default LTR paragraph base direction.
 *
 *   'rtl'     – first meaningful character is RTL and the line does NOT start
 *               with a LaTeX command.  Treat as a true RTL paragraph: set
 *               direction:rtl on the inner span so the Unicode Bidi Algorithm
 *               places Hebrew/Arabic words and inline LTR content (e.g. math)
 *               in the correct visual sentence order.
 *
 *   'rtl-cmd' – first meaningful character is RTL but the line starts with a
 *               LaTeX command (e.g. \subsubsection*{Hebrew Introduction}).
 *               Right-align the line but keep the LTR paragraph base direction
 *               so the command, braces, and mixed-language content inside the
 *               braces preserve their logical left-to-right order in the editor
 *               (i.e. \cmd appears to the LEFT of its braces, not the right).
 */
export function getLineDirectionType(text: string): 'ltr' | 'rtl' | 'rtl-cmd' {
  if (getLineDirection(text) === 'ltr') return 'ltr'
  // The line has RTL content.  Check whether it opens with a LaTeX command.
  return STARTS_WITH_LATEX_CMD_RE.test(text) ? 'rtl-cmd' : 'rtl'
}
