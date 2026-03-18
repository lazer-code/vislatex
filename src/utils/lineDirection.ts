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
 * Returns the first character that carries meaningful directional information,
 * skipping leading whitespace, punctuation, and common list markers.
 */
export function getFirstMeaningfulChar(text: string): string | null {
  const stripped = text.replace(LEADING_NOISE_RE, '')
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
