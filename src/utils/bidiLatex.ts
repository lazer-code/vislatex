/**
 * Utilities for bidirectional (RTL/LTR) LaTeX documents.
 *
 * When a document mixes Hebrew/Arabic (RTL) text with Latin or math (LTR),
 * the XeLaTeX `polyglossia` package (which bundles the `bidi` engine) must be
 * present in the preamble so that the typesetter can produce correct PDF output.
 *
 * PDF rendering rules with polyglossia + bidi:
 *   - RTL paragraph: text flows right → left; inline math appears to the LEFT.
 *   - LTR paragraph: text flows left → right; inline math appears to the RIGHT.
 *
 * Example: writing "היי $\frac{1}{2}$" in a Hebrew (RTL) document produces:
 *   [fraction]  [היי]         (fraction to the LEFT of the Hebrew word)
 * while the source stays in exactly the order the user typed it.
 *
 * This also applies to text inside LaTeX command braces such as
 * \section{היי $\frac{1}{2}$} — both editor alignment and PDF output are
 * handled correctly by the per-line RTL detection and the bidi engine.
 */

import { containsRtl } from './lineDirection'

/** Matches at least one Latin / extended-Latin character. */
const LTR_ALPHA_RE = /[A-Za-z\u00C0-\u024F]/

/**
 * Returns true when the text contains both RTL characters (Hebrew / Arabic)
 * AND LTR Latin characters, indicating a mixed bidirectional segment.
 */
export function hasMixedBidi(text: string): boolean {
  return containsRtl(text) && LTR_ALPHA_RE.test(text)
}

/**
 * Returns true when the LaTeX document source contains any RTL character,
 * indicating that bidi typesetting packages should be included in the preamble.
 */
export function documentNeedsBidi(source: string): boolean {
  return containsRtl(source)
}

/**
 * Builds the XeLaTeX preamble fragment required for bidirectional typesetting.
 * The generated snippet should be placed in the document preamble (before
 * \begin{document}).
 *
 * @param opts.mainLanguage  - polyglossia main language (default: 'hebrew')
 * @param opts.otherLanguage - polyglossia secondary language (default: 'english')
 * @param opts.hebrewFont    - font for Hebrew text (default: 'FreeSerif')
 */
export function buildBidiPreamble(opts?: {
  mainLanguage?: string
  otherLanguage?: string
  hebrewFont?: string
}): string {
  const main = opts?.mainLanguage ?? 'hebrew'
  const other = opts?.otherLanguage ?? 'english'
  const font = opts?.hebrewFont ?? 'FreeSerif'
  return [
    '% --- Bidirectional (RTL/LTR) support ---',
    '% amsmath must be loaded BEFORE polyglossia so the bidi engine',
    '% can patch the math environments correctly.',
    '\\usepackage{amsmath}',
    '\\usepackage{fontspec}',
    '\\usepackage{polyglossia}',
    '',
    `\\setmainlanguage{${main}}`,
    `\\setotherlanguage{${other}}`,
    '',
    `\\newfontfamily\\hebrewfont[Script=Hebrew]{${font}}`,
    '% ----------------------------------------',
  ].join('\n')
}

/**
 * A ready-to-use XeLaTeX template for documents that mix Hebrew/Arabic with
 * Latin text or math.
 *
 * Key properties demonstrated:
 *  • Typing "היי $\frac{1}{2}$" keeps source in typed order; PDF shows the
 *    fraction to the LEFT of the Hebrew word (correct RTL visual order).
 *  • \section{...} and \subsection{...} with mixed content also render
 *    correctly in both the editor and the compiled PDF.
 *  • No special character wrapping is needed — polyglossia + bidi handle the
 *    direction automatically based on the first strong character.
 *
 * Requires XeLaTeX and a Hebrew-capable font.  FreeSerif (fonts-freefont-otf
 * on Linux) is used by default; substitute "Arial", "David", or any other
 * installed font that supports Hebrew if needed.
 *
 * Package loading order matters:
 *  1. amsmath  – loaded FIRST so that polyglossia's bidi engine can patch
 *                the math environments for correct RTL/LTR interaction.
 *  2. fontspec – required by polyglossia for XeLaTeX font selection.
 *  3. polyglossia – loads the bidi engine and sets paragraph direction.
 */
export const RTL_LATEX_TEMPLATE = `\\documentclass{article}
% amsmath must come BEFORE polyglossia so bidi can patch math environments.
\\usepackage{amsmath}
\\usepackage{fontspec}
\\usepackage{polyglossia}

\\setmainlanguage{hebrew}
\\setotherlanguage{english}

% Script=Hebrew activates correct OpenType Hebrew shaping.
% Replace FreeSerif with any installed Hebrew-capable font (e.g. Arial, David).
\\newfontfamily\\hebrewfont[Script=Hebrew]{FreeSerif}

\\title{כותרת המסמך}
\\author{שם המחבר}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{מבוא}
זהו מסמך לדוגמה עם תמיכה בכתיבה דו-כיוונית.

% Typing "היי $\\frac{1}{2}$" in source order → PDF shows fraction LEFT of Hebrew:
היי $\\frac{1}{2}$ --- השבר מוצג משמאל לטקסט העברי.

\\section{מתמטיקה מעורבת}
נוסחה בתוך שורה: $E = mc^2$.

\\[
  x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\\]

\\subsection{כותרת עם מתמטיקה $x^2 + y^2 = r^2$}
ניתן לכלול מתמטיקה בכותרות ובסעיפי משנה --- הסדר נשמר גם שם.

\\section{\\textenglish{XeLaTeX} ועברית}
ניתן לשלב מילים \\textenglish{Latin} בתוך טקסט עברי ללא שינוי סדר.

\\end{document}
`
