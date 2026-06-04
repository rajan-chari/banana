// @ts-check
// Pure helpers for workspace-tab interactions. Extracted from app.js
// renderTabs so the drop-target geometry and reorder logic can be
// unit-tested without DOM event simulation.

/**
 * @typedef {{ id: string, [k: string]: unknown }} WorkspaceLike
 */

/**
 * Decide whether a drop falls on the LEFT or RIGHT half of a tab rect,
 * based on the cursor's clientX. Returns "left" when clientX is strictly
 * less than the rect midpoint; "right" otherwise (including exact mid,
 * matching the historical `e.clientX < midpoint` check).
 *
 * @param {{ left: number, width: number }} rect
 * @param {number} clientX
 * @returns {"left" | "right"}
 */
export function tabDropSide(rect, clientX) {
  const mid = rect.left + rect.width / 2;
  return clientX < mid ? "left" : "right";
}

/**
 * Compute a new workspaces array with the source workspace moved adjacent
 * to the target. `side === "left"` inserts BEFORE the target; "right"
 * AFTER. Returns the original array unchanged when:
 *  - src or tgt id is missing from the list
 *  - srcId === tgtId (self-drop)
 *
 * Pure: input array is not mutated.
 *
 * @template {WorkspaceLike} T
 * @param {ReadonlyArray<T>} workspaces
 * @param {string} srcId
 * @param {string} tgtId
 * @param {"left" | "right"} side
 * @returns {T[]}
 */
export function reorderWorkspaces(workspaces, srcId, tgtId, side) {
  if (srcId === tgtId) return [...workspaces];
  const next = [...workspaces];
  const srcIdx = next.findIndex((w) => w.id === srcId);
  if (srcIdx < 0) return next;
  if (!next.some((w) => w.id === tgtId)) return next;
  const removed = next.splice(srcIdx, 1)[0];
  if (!removed) return next;
  const tgtIdx = next.findIndex((w) => w.id === tgtId);
  if (tgtIdx < 0) {
    // Target was the removed item itself (shouldn't reach here given the
    // srcId === tgtId early-out, but defensive); re-insert at original.
    next.splice(srcIdx, 0, removed);
    return next;
  }
  next.splice(side === "left" ? tgtIdx : tgtIdx + 1, 0, removed);
  return next;
}
