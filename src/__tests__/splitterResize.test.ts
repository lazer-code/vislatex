/**
 * Unit tests for the splitter resize delta computation.
 *
 * The Editor/PDF splitter calculates the new pane percentage using a
 * delta-based approach to avoid jumping when the cursor is not exactly
 * on the splitter centre at drag start.
 */

import { computeEditorPct, computeSidebarWidth } from '@/utils/splitterResize'

describe('computeEditorPct (delta-based splitter resize)', () => {
  it('returns startPct unchanged when cursor has not moved', () => {
    expect(computeEditorPct(50, 400, 400, 800)).toBe(50)
  })

  it('increases pct when cursor moves right', () => {
    // moving 80px right in an 800px container = +10%
    expect(computeEditorPct(50, 400, 480, 800)).toBe(60)
  })

  it('decreases pct when cursor moves left', () => {
    // moving 80px left in an 800px container = -10%
    expect(computeEditorPct(50, 400, 320, 800)).toBe(40)
  })

  it('clamps to minimum (20%)', () => {
    // large leftward move should not go below 20
    expect(computeEditorPct(50, 400, 0, 800)).toBe(20)
  })

  it('clamps to maximum (80%)', () => {
    // large rightward move should not go above 80
    expect(computeEditorPct(50, 400, 1200, 800)).toBe(80)
  })

  it('does not jump when drag starts slightly left of splitter', () => {
    // User clicks 10px to the left of the splitter centre; cursor hasn't
    // moved yet so the pane size must stay exactly at startPct.
    expect(computeEditorPct(50, 390, 390, 800)).toBe(50)
  })

  it('respects custom min/max bounds', () => {
    expect(computeEditorPct(50, 400, 0, 800, 30, 70)).toBe(30)
    expect(computeEditorPct(50, 400, 1200, 800, 30, 70)).toBe(70)
  })
})

describe('computeSidebarWidth (delta-based sidebar resize)', () => {
  it('returns startW unchanged when cursor has not moved', () => {
    expect(computeSidebarWidth(224, 300, 300)).toBe(224)
  })

  it('increases width when cursor moves right', () => {
    expect(computeSidebarWidth(224, 300, 350)).toBe(274)
  })

  it('decreases width when cursor moves left', () => {
    expect(computeSidebarWidth(224, 300, 250)).toBe(174)
  })

  it('clamps to minimum (120)', () => {
    expect(computeSidebarWidth(224, 300, 0)).toBe(120)
  })

  it('clamps to maximum (480)', () => {
    expect(computeSidebarWidth(224, 300, 800)).toBe(480)
  })
})
