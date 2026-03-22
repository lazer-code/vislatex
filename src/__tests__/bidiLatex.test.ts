import {
  hasMixedBidi,
  documentNeedsBidi,
  buildBidiPreamble,
  RTL_LATEX_TEMPLATE,
} from '@/utils/bidiLatex'

describe('hasMixedBidi', () => {
  it('returns false for a plain English string', () => {
    expect(hasMixedBidi('Hello world')).toBe(false)
  })

  it('returns false for a plain Hebrew string', () => {
    expect(hasMixedBidi('שלום עולם')).toBe(false)
  })

  it('returns true for Hebrew word followed by Latin math command', () => {
    // "היי" is Hebrew; "frac" is Latin → mixed
    expect(hasMixedBidi('היי \\frac{1}{2}')).toBe(true)
  })

  it('returns true for Hebrew with inline math containing letters', () => {
    expect(hasMixedBidi('מאחר $E = mc^2$ כלשהו')).toBe(true)
  })

  it('returns true for \\section with Hebrew + Latin math', () => {
    expect(hasMixedBidi('\\section{היי $\\frac{1}{2}$}')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(hasMixedBidi('')).toBe(false)
  })

  it('returns false for a string with only numbers and punctuation', () => {
    expect(hasMixedBidi('1 + 2 = 3')).toBe(false)
  })

  it('returns true for Arabic with Latin text', () => {
    // Arabic letter U+0627 + Latin 'a'
    expect(hasMixedBidi('\u0627a')).toBe(true)
  })
})

describe('documentNeedsBidi', () => {
  it('returns false for a document with no RTL characters', () => {
    const source = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}'
    expect(documentNeedsBidi(source)).toBe(false)
  })

  it('returns true for a document with Hebrew text', () => {
    const source = '\\documentclass{article}\n\\begin{document}\nשלום\n\\end{document}'
    expect(documentNeedsBidi(source)).toBe(true)
  })

  it('returns true for a document with Hebrew inside a section title', () => {
    const source = '\\section{שלום עולם}'
    expect(documentNeedsBidi(source)).toBe(true)
  })

  it('returns true for a document with mixed Hebrew + math paragraph', () => {
    const source = 'היי $\\frac{1}{2}$ --- השבר מוצג משמאל'
    expect(documentNeedsBidi(source)).toBe(true)
  })

  it('returns false for an empty document', () => {
    expect(documentNeedsBidi('')).toBe(false)
  })

  it('returns true for a document with Arabic text', () => {
    expect(documentNeedsBidi('العربية')).toBe(true)
  })
})

describe('buildBidiPreamble', () => {
  it('uses default values when no options provided', () => {
    const preamble = buildBidiPreamble()
    expect(preamble).toContain('\\usepackage{fontspec}')
    expect(preamble).toContain('\\usepackage{polyglossia}')
    expect(preamble).toContain('\\setmainlanguage{hebrew}')
    expect(preamble).toContain('\\setotherlanguage{english}')
    expect(preamble).toContain('\\newfontfamily\\hebrewfont{FreeSerif}')
  })

  it('respects custom mainLanguage option', () => {
    const preamble = buildBidiPreamble({ mainLanguage: 'arabic' })
    expect(preamble).toContain('\\setmainlanguage{arabic}')
  })

  it('respects custom otherLanguage option', () => {
    const preamble = buildBidiPreamble({ otherLanguage: 'french' })
    expect(preamble).toContain('\\setotherlanguage{french}')
  })

  it('respects custom hebrewFont option', () => {
    const preamble = buildBidiPreamble({ hebrewFont: 'David CLM' })
    expect(preamble).toContain('\\newfontfamily\\hebrewfont{David CLM}')
  })

  it('produces valid multi-line output', () => {
    const lines = buildBidiPreamble().split('\n')
    expect(lines.length).toBeGreaterThan(3)
  })
})

describe('RTL_LATEX_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof RTL_LATEX_TEMPLATE).toBe('string')
    expect(RTL_LATEX_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('starts with \\documentclass', () => {
    expect(RTL_LATEX_TEMPLATE.trimStart()).toMatch(/^\\documentclass/)
  })

  it('includes polyglossia setup', () => {
    expect(RTL_LATEX_TEMPLATE).toContain('\\usepackage{polyglossia}')
    expect(RTL_LATEX_TEMPLATE).toContain('\\setmainlanguage{hebrew}')
  })

  it('demonstrates mixed Hebrew + math in source order', () => {
    // The template should contain Hebrew followed by a math expression
    expect(RTL_LATEX_TEMPLATE).toContain('היי $\\frac{1}{2}$')
  })

  it('includes a section with Hebrew + math in title braces', () => {
    // \subsection{...} with mixed content
    expect(RTL_LATEX_TEMPLATE).toMatch(/\\subsection\{[^}]*\$[^}]*\}/)
  })

  it('includes \\begin{document} and \\end{document}', () => {
    expect(RTL_LATEX_TEMPLATE).toContain('\\begin{document}')
    expect(RTL_LATEX_TEMPLATE).toContain('\\end{document}')
  })
})
