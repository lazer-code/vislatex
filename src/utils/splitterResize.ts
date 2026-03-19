/**
 * Pure helper functions for splitter/resize-handle delta calculations.
 *
 * Both helpers use a delta-based approach: they record the pointer position
 * and pane size at drag-start, then apply the displacement on every move.
 * This prevents the pane from jumping when the drag starts slightly off-centre
 * from the splitter.
 */

/**
 * Compute the new editor pane percentage after a horizontal drag.
 *
 * @param startPct  - Editor pane percentage at drag start (0–100).
 * @param startX    - Cursor clientX at drag start (px).
 * @param currentX  - Current cursor clientX (px).
 * @param totalW    - Total draggable container width in px.
 * @param min       - Minimum allowed percentage (default 20).
 * @param max       - Maximum allowed percentage (default 80).
 */
export function computeEditorPct(
  startPct: number,
  startX: number,
  currentX: number,
  totalW: number,
  min = 20,
  max = 80,
): number {
  const deltaPct = ((currentX - startX) / totalW) * 100
  return Math.min(max, Math.max(min, startPct + deltaPct))
}

/**
 * Compute the new sidebar width after a horizontal drag.
 *
 * @param startW   - Sidebar width at drag start (px).
 * @param startX   - Cursor clientX at drag start (px).
 * @param currentX - Current cursor clientX (px).
 * @param min      - Minimum allowed width (default 120).
 * @param max      - Maximum allowed width (default 480).
 */
export function computeSidebarWidth(
  startW: number,
  startX: number,
  currentX: number,
  min = 120,
  max = 480,
): number {
  return Math.min(max, Math.max(min, startW + currentX - startX))
}
