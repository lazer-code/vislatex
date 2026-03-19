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

/**
 * Describes the character positions of a `{…}` brace group found by
 * getBraceBlocksOutsideMath.
 */
export interface BraceBlock {
  /** 0-based index of the opening `{` character. */
  braceOpen: number
  /** 0-based index of the closing `}` character. */
  braceClose: number
}

/**
 * Parses a single line of LaTeX source and returns every `{…}` brace group
 * that satisfies BOTH of the following conditions:
 *
 *   1. The group is NOT inside a math environment (`$…$` or `$$…$$`).
 *   2. The *first meaningful character* of the group's content is an RTL
 *      character (Hebrew, Arabic, etc.) according to `getLineDirection`.
 *
 * Nesting is handled correctly: if an outer group already starts with Hebrew
 * it is returned and its interior is not searched further (the outer isolation
 * is sufficient).  If the outer group starts with a non-RTL character, the
 * function recurses into it to find any inner RTL groups.
 *
 * Math mode entered with `$…$` or `$$…$$` is tracked so that `{}` pairs
 * inside equations are never reported.
 */
export function getBraceBlocksOutsideMath(text: string): BraceBlock[] {
  const result: BraceBlock[] = []

  /**
   * Scans the substring text[from..limit) for brace groups, respecting
   * the math-mode tracking.  Returns the index at which scanning stopped.
   */
  function scan(from: number, limit: number): void {
    let i = from
    let inMath = false
    let mathDouble = false

    while (i < limit) {
      const ch = text[i]

      // ---- math-mode tracking ----
      if (ch === '$') {
        if (!inMath) {
          if (text[i + 1] === '$') {
            inMath = true
            mathDouble = true
            i += 2
          } else {
            inMath = true
            mathDouble = false
            i += 1
          }
          continue
        } else {
          // already in math
          if (mathDouble && text[i + 1] === '$') {
            inMath = false
            i += 2
          } else if (!mathDouble) {
            inMath = false
            i += 1
          } else {
            i++
          }
          continue
        }
      }

      if (inMath) {
        i++
        continue
      }

      // ---- outside math: look for `{` ----
      if (ch === '{') {
        const braceOpen = i
        // Walk forward to find the matching `}`, tracking depth.
        let depth = 1
        let j = i + 1
        // Track math mode inside this brace group for depth counting only
        let innerMath = false
        let innerDouble = false
        while (j < limit && depth > 0) {
          const jch = text[j]
          if (jch === '$') {
            if (!innerMath) {
              if (text[j + 1] === '$') {
                innerMath = true; innerDouble = true; j += 2
              } else {
                innerMath = true; innerDouble = false; j += 1
              }
              continue
            } else {
              if (innerDouble && text[j + 1] === '$') {
                innerMath = false; j += 2
              } else if (!innerDouble) {
                innerMath = false; j += 1
              } else {
                j++
              }
              continue
            }
          }
          if (!innerMath) {
            if (jch === '{') depth++
            else if (jch === '}') depth--
          }
          j++
        }

        if (depth !== 0) {
          // Unmatched brace – skip and move on.
          i++
          continue
        }

        const braceClose = j - 1
        const content = text.slice(braceOpen + 1, braceClose)

        if (getLineDirection(content) === 'rtl') {
          // This group starts with Hebrew: record it and do NOT recurse
          // inside (the outer RTL isolation is sufficient).
          result.push({ braceOpen, braceClose })
          i = braceClose + 1
        } else {
          // Not an RTL group: recurse into the content to find nested RTL groups.
          scan(braceOpen + 1, braceClose)
          i = braceClose + 1
        }
        continue
      }

      i++
    }
  }

  scan(0, text.length)
  return result
}
