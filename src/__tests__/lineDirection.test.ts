import {
  getFirstMeaningfulChar,
  getLineDirection,
  getAlignmentForDirection,
  getLineDirectionType,
} from '@/utils/lineDirection'

describe('getFirstMeaningfulChar', () => {
  it('returns null for an empty string', () => {
    expect(getFirstMeaningfulChar('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(getFirstMeaningfulChar('   ')).toBeNull()
  })

  it('returns the first character of a simple word', () => {
    expect(getFirstMeaningfulChar('Hello')).toBe('H')
  })

  it('skips leading whitespace', () => {
    expect(getFirstMeaningfulChar('  Hello')).toBe('H')
  })

  it('skips a dash list marker', () => {
    expect(getFirstMeaningfulChar('- Hello')).toBe('H')
  })

  it('skips an asterisk list marker', () => {
    expect(getFirstMeaningfulChar('* Hello')).toBe('H')
  })

  it('skips a bullet character list marker', () => {
    expect(getFirstMeaningfulChar('• Hello')).toBe('H')
  })

  it('skips a numbered list prefix "1. "', () => {
    expect(getFirstMeaningfulChar('1. Hello')).toBe('H')
  })

  it('skips a numbered list prefix "2) "', () => {
    expect(getFirstMeaningfulChar('2) Hello')).toBe('H')
  })

  it('skips a lettered list prefix "a. "', () => {
    expect(getFirstMeaningfulChar('a. Hello')).toBe('H')
  })

  it('returns the first Hebrew character on a Hebrew line', () => {
    expect(getFirstMeaningfulChar('מאחר ויש')).toBe('מ')
  })

  it('skips whitespace and returns first Hebrew character', () => {
    expect(getFirstMeaningfulChar('  מאחר')).toBe('מ')
  })

  it('skips a dash marker and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('- מאחר')).toBe('מ')
  })

  it('skips a LaTeX command prefix \\subsection*{ and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('\\subsection*{א. $|x-2| \\le 5$}')).toBe('א')
  })

  it('skips a LaTeX command prefix \\textbf{ and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('\\textbf{שלום}')).toBe('ש')
  })

  it('skips nested LaTeX command prefixes and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('\\textbf{\\textit{שלום}}')).toBe('ש')
  })

  it('skips a LaTeX command prefix \\section{ and returns the English character', () => {
    expect(getFirstMeaningfulChar('\\section{Introduction}')).toBe('I')
  })

  it('skips \\subsubsection*{ plus a lettered prefix and returns the Hebrew character', () => {
    // \subsubsection*{a. Hebrew text} – the Latin "a." inside the braces must
    // not be mistaken for LTR content; the second LEADING_NOISE_RE pass strips it.
    // (The fix is needed because LEADING_NOISE_RE uses [a-zA-Z] for letter
    // prefixes, so only a *Latin* prefix exercises the regression.)
    expect(getFirstMeaningfulChar('\\subsubsection*{a. תוכן בעברית}')).toBe('ת')
  })

  it('skips \\subsubsection*{ plus a numbered prefix and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('\\subsubsection*{1. תוכן בעברית}')).toBe('ת')
  })

  it('skips \\section{ plus a lettered prefix and returns the Hebrew character', () => {
    expect(getFirstMeaningfulChar('\\section{b. שלום}')).toBe('ש')
  })
})

describe('getLineDirection', () => {
  it('returns "ltr" for a plain English line', () => {
    expect(getLineDirection('Hello world')).toBe('ltr')
  })

  it('returns "rtl" for a plain Hebrew line', () => {
    expect(getLineDirection('מאחר ויש נקודת אפס אחת')).toBe('rtl')
  })

  it('returns "rtl" for the example from the issue (Hebrew with inline math)', () => {
    expect(
      getLineDirection('מאחר ויש נקודת אפס אחת $x=2$, נבדוק את התחומים הרלוונטיים:')
    ).toBe('rtl')
  })

  it('returns "rtl" for a Hebrew paragraph line (no math)', () => {
    expect(
      getLineDirection(
        'מצאו את קבוצת המספרים המקיימים את כל אחד מהאי-שוויונות הבאים וסרטטו את תשובתכם על ציר המספרים:'
      )
    ).toBe('rtl')
  })

  it('returns "rtl" for a LaTeX \\subsection*{ line with Hebrew content', () => {
    expect(getLineDirection('\\subsection*{א. $|x-2| \\le 5$}')).toBe('rtl')
  })

  it('returns "rtl" for \\subsubsection*{ with a lettered prefix before Hebrew', () => {
    // Regression: without the second LEADING_NOISE_RE pass the Latin "a." was
    // seen first and the line was incorrectly classified as LTR.
    expect(getLineDirection('\\subsubsection*{a. תוכן בעברית}')).toBe('rtl')
  })

  it('returns "rtl" for \\subsubsection*{ with a numbered prefix before Hebrew', () => {
    expect(getLineDirection('\\subsubsection*{1. שלום עולם}')).toBe('rtl')
  })

  it('returns "ltr" for \\subsubsection*{ with purely English content after prefix', () => {
    expect(getLineDirection('\\subsubsection*{a. Introduction}')).toBe('ltr')
  })

  it('returns "ltr" for an empty line', () => {
    expect(getLineDirection('')).toBe('ltr')
  })

  it('returns "ltr" for a line with only whitespace', () => {
    expect(getLineDirection('   ')).toBe('ltr')
  })

  it('returns "ltr" for a LaTeX command line', () => {
    expect(getLineDirection('\\documentclass{article}')).toBe('ltr')
  })

  it('returns "ltr" for a line beginning with a number', () => {
    expect(getLineDirection('42 is the answer')).toBe('ltr')
  })

  it('returns "rtl" when leading whitespace precedes Hebrew', () => {
    expect(getLineDirection('  שלום')).toBe('rtl')
  })

  it('returns "rtl" when a dash marker precedes Hebrew', () => {
    expect(getLineDirection('- שלום')).toBe('rtl')
  })

  it('returns "rtl" when a numbered marker precedes Hebrew', () => {
    expect(getLineDirection('1. שלום')).toBe('rtl')
  })

  it('returns "rtl" for an Arabic line', () => {
    // Arabic letter 'alef' U+0627
    expect(getLineDirection('\u0627\u0644\u0639\u0631\u0628\u064A\u0629')).toBe('rtl')
  })
})

describe('getAlignmentForDirection', () => {
  it('returns "right" for "rtl"', () => {
    expect(getAlignmentForDirection('rtl')).toBe('right')
  })

  it('returns "left" for "ltr"', () => {
    expect(getAlignmentForDirection('ltr')).toBe('left')
  })
})
