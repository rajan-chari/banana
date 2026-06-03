// @ts-check
// WebSocket-handler pure helpers — extracted from app.js's connect()
// `sessions` case (tracker 8eb3a993 Phase 3).
//
// These are read-only logic kernels around session-name diffing and
// workspace-layout orphan handling. app.js wraps them and applies the
// returned updates.

/** @typedef {{ id: string, layout?: unknown, [key: string]: unknown }} Workspace */

/**
 * True iff the *set* of session names changed (additions or removals).
 * Reorderings or status-only changes return false.
 *
 * Honest name: only compares names, NOT layouts, group memberships, or
 * active pairings. Callers that need a broader "did anything visible
 * change" check should use a different signal.
 *
 * @param {Iterable<string>} prevNames
 * @param {Iterable<string>} serverNames
 * @returns {boolean}
 */
export function hasSessionNameSetChanged(prevNames, serverNames) {
  const prev = prevNames instanceof Set ? prevNames : new Set(prevNames);
  const next = serverNames instanceof Set ? serverNames : new Set(serverNames);
  if (prev.size !== next.size) return true;
  for (const n of next) if (!prev.has(n)) return true;
  for (const n of prev) if (!next.has(n)) return true;
  return false;
}

/**
 * Collect every leaf name that appears in any workspace layout but isn't
 * present in serverGroups (i.e., the server no longer knows about it).
 *
 * @template TLayout
 * @param {Array<{ layout?: TLayout | null }>} workspaces
 * @param {Set<string>} serverGroups
 * @param {(layout: TLayout) => string[]} getLeafListFn
 * @returns {Set<string>}
 */
export function findOrphanedLeaves(workspaces, serverGroups, getLeafListFn) {
  /** @type {Set<string>} */
  const orphans = new Set();
  for (const ws of workspaces) {
    if (!ws.layout) continue;
    for (const name of getLeafListFn(ws.layout)) {
      if (!serverGroups.has(name)) orphans.add(name);
    }
  }
  return orphans;
}

/**
 * Split orphan *group* names into:
 *   - recreatable: session names (the orphan group `g` and/or `g + "~pwsh"`)
 *     that have saved metadata in sessionMeta; caller will POST these back
 *     to the server.
 *   - unrecoverable: orphan group names with no metadata at all for either
 *     `g` or `g + "~pwsh"`; caller should prune these from layouts.
 *
 * Note the asymmetry: `recreatable` contains *session* names (so a single
 * orphan group may contribute up to two entries — one claude, one pwsh),
 * while `unrecoverable` contains *group* names. This matches the original
 * inline behavior at app.js lines 115-121.
 *
 * @param {Iterable<string>} orphanGroups
 * @param {Map<string, unknown>} sessionMeta
 * @returns {{ recreatable: string[], unrecoverable: string[] }}
 */
export function classifyOrphanGroups(orphanGroups, sessionMeta) {
  /** @type {string[]} */
  const recreatable = [];
  /** @type {string[]} */
  const unrecoverable = [];
  for (const g of orphanGroups) {
    const hasClaude = sessionMeta.has(g);
    const hasPwsh = sessionMeta.has(g + "~pwsh");
    if (hasClaude) recreatable.push(g);
    if (hasPwsh) recreatable.push(g + "~pwsh");
    if (!hasClaude && !hasPwsh) unrecoverable.push(g);
  }
  return { recreatable, unrecoverable };
}

/** @typedef {{ workspace: { id: string, layout?: unknown }, newLayout: unknown }} LayoutUpdate */

/**
 * For each workspace whose layout contains any of `deadLeaves`, return a
 * new layout built from the surviving leaves via `buildBalancedTreeFn`.
 *
 * WARNING: this rebuilds the workspace as a balanced tree, which discards
 * any prior split ratios and shape. That matches the legacy behavior in
 * app.js lines 124-134 (carried over for now). A future enhancement could
 * remove leaves in place while preserving structure.
 *
 * Workspaces whose layout has no overlap with `deadLeaves` are not
 * included in the result — caller need only apply returned updates.
 *
 * @template TLayout
 * @param {Array<{ id: string, layout?: TLayout | null }>} workspaces
 * @param {Iterable<string>} deadLeaves
 * @param {(layout: TLayout) => string[]} getLeafListFn
 * @param {(leaves: string[]) => TLayout} buildBalancedTreeFn
 * @returns {Array<{ workspace: { id: string, layout?: TLayout | null }, newLayout: TLayout }>}
 */
export function rebalanceLayoutsWithoutLeaves(workspaces, deadLeaves, getLeafListFn, buildBalancedTreeFn) {
  const deadSet = deadLeaves instanceof Set ? deadLeaves : new Set(deadLeaves);
  /** @type {Array<{ workspace: { id: string, layout?: TLayout | null }, newLayout: TLayout }>} */
  const updates = [];
  for (const ws of workspaces) {
    if (!ws.layout) continue;
    const leaves = getLeafListFn(ws.layout);
    const alive = leaves.filter((n) => !deadSet.has(n));
    if (alive.length < leaves.length) {
      updates.push({ workspace: ws, newLayout: buildBalancedTreeFn(alive) });
    }
  }
  return updates;
}
