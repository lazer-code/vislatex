import {
  getFirstMeaningfulChar,
  getLineDirection,
  getAlignmentForDirection,
  getBraceBlocksOutsideMath,
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

describe('getBraceBlocksOutsideMath', () => {
  it('returns empty array for a plain English line', () => {
    expect(getBraceBlocksOutsideMath('hello world')).toEqual([])
  })

  it('returns empty array for a line with no braces', () => {
    expect(getBraceBlocksOutsideMath('מאחר ויש')).toEqual([])
  })

  it('detects a single Hebrew brace block', () => {
    // \textbf{שלום} — the {} encloses Hebrew
    const text = '\\textbf{שלום}'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].braceOpen).toBe(text.indexOf('{'))
    expect(blocks[0].braceClose).toBe(text.lastIndexOf('}'))
  })

  it('returns empty for a brace block containing only English', () => {
    expect(getBraceBlocksOutsideMath('\\textbf{hello}')).toEqual([])
  })

  it('does NOT detect braces inside math ($...$)', () => {
    // The {} is inside inline math — should be ignored
    expect(getBraceBlocksOutsideMath('$\\frac{שלום}{x}$')).toEqual([])
  })

  it('does NOT detect braces inside display math ($$...$$)', () => {
    expect(getBraceBlocksOutsideMath('$$\\frac{שלום}{x}$$')).toEqual([])
  })

  it('detects a Hebrew block outside math even if math follows', () => {
    // {שלום} is outside math; {x} is inside math
    const text = '{שלום} and $\\frac{a}{b}$'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].braceOpen).toBe(0)
    expect(blocks[0].braceClose).toBe(text.indexOf('}'))
  })

  it('detects multiple Hebrew brace blocks on one line', () => {
    const text = '\\cmd{שלום} foo \\cmd{עולם}'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(2)
  })

  it('does not recurse into an already-detected RTL outer block', () => {
    // Outer block starts with Hebrew — inner block should not be reported separately
    const text = '{שלום {world}}'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].braceOpen).toBe(0)
  })

  it('finds RTL blocks nested inside non-RTL outer blocks', () => {
    // Outer block starts with English (LTR), inner block starts with Hebrew
    const text = '{hello {שלום}}'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(1)
    expect(text[blocks[0].braceOpen]).toBe('{')
    expect(text[blocks[0].braceClose]).toBe('}')
    // The reported block is the inner one
    const innerOpen = text.indexOf('{', 1)
    expect(blocks[0].braceOpen).toBe(innerOpen)
  })

  it('handles an unmatched opening brace gracefully', () => {
    expect(() => getBraceBlocksOutsideMath('{שלום')).not.toThrow()
  })

  it('returns empty for an empty string', () => {
    expect(getBraceBlocksOutsideMath('')).toEqual([])
  })

  it('returns empty for LaTeX commands without Hebrew in braces', () => {
    expect(getBraceBlocksOutsideMath('\\documentclass{article}')).toEqual([])
  })

  it('handles mixed Hebrew + English block correctly (starts with Hebrew)', () => {
    const text = '{שלום world}'
    const blocks = getBraceBlocksOutsideMath(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].braceOpen).toBe(0)
  })
})

