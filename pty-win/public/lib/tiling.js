// @ts-check
// Tiling tree model — pure functions for binary tree workspace layouts.
// Canonical home for this logic; app.js imports from here.
//
// Previously duplicated as src/tiling.ts (test-only); consolidated as part
// of tracker e0ca3757 after happy-dom test runner landed.

/** @typedef {{ type: "leaf", session: string }} LeafNode */
/** @typedef {{ type: "split", direction: "h" | "v", ratio: number, children: [TileNode, TileNode] }} SplitNode */
/** @typedef {LeafNode | SplitNode} TileNode */

/**
 * Build a balanced binary tree from a list of session names.
 * @param {string[]} sessions
 * @returns {TileNode | null}
 */
export function buildBalancedTree(sessions) {
  if (sessions.length === 0) return null;
  if (sessions.length === 1) return { type: "leaf", session: sessions[0] };

  const mid = Math.ceil(sessions.length / 2);
  const left = sessions.slice(0, mid);
  const right = sessions.slice(mid);

  // Top-level: vertical split (rows). Within rows: horizontal split (columns).
  const direction = sessions.length <= 2 ? "h" : "v";
  return {
    type: "split",
    direction,
    ratio: mid / sessions.length,
    children: [
      /** @type {TileNode} */ (buildBalancedTree(left)),
      /** @type {TileNode} */ (buildBalancedTree(right)),
    ],
  };
}

/**
 * Remove a session from the layout tree, collapsing empty splits.
 * @param {TileNode | null} node
 * @param {string} sessionName
 * @returns {TileNode | null}
 */
export function removeSessionFromLayout(node, sessionName) {
  if (!node) return null;
  if (node.type === "leaf") return node.session === sessionName ? null : node;
  const left = removeSessionFromLayout(node.children[0], sessionName);
  const right = removeSessionFromLayout(node.children[1], sessionName);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

/**
 * Append a leaf to the trailing (rightmost/bottommost) edge of the tree.
 * @param {TileNode} node
 * @param {LeafNode} newLeaf
 * @returns {SplitNode}
 */
export function appendLeafToTree(node, newLeaf) {
  if (node.type === "leaf") {
    return { type: "split", direction: "h", ratio: 0.5, children: [node, newLeaf] };
  }
  return { ...node, children: [node.children[0], appendLeafToTree(node.children[1], newLeaf)] };
}

/**
 * Get a flat list of all session names in the tree.
 * @param {TileNode | null} node
 * @param {string[]} [list]
 * @returns {string[]}
 */
export function getLeafList(node, list = []) {
  if (!node) return list;
  if (node.type === "leaf") { list.push(node.session); return list; }
  getLeafList(node.children[0], list);
  getLeafList(node.children[1], list);
  return list;
}

/**
 * Check if the tree contains a session by name.
 * @param {TileNode} node
 * @param {string} sessionName
 * @returns {boolean}
 */
export function treeContains(node, sessionName) {
  if (node.type === "leaf") return node.session === sessionName;
  return treeContains(node.children[0], sessionName) || treeContains(node.children[1], sessionName);
}

/**
 * Count the number of leaves in the tree.
 * @param {TileNode} node
 * @returns {number}
 */
export function countLeaves(node) {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/**
 * Insert a session adjacent to a target pane (for drag-drop).
 * @param {TileNode | null} node
 * @param {string} targetSession
 * @param {string} insertSession
 * @param {"left" | "right" | "top" | "bottom"} side
 * @returns {TileNode | null}
 */
export function insertAdjacentToPane(node, targetSession, insertSession, side) {
  if (!node) return null;
  if (node.type === "leaf") {
    if (node.session !== targetSession) return node;
    /** @type {LeafNode} */
    const insertLeaf = { type: "leaf", session: insertSession };
    const direction = (side === "left" || side === "right") ? "h" : "v";
    const first  = (side === "left"  || side === "top")    ? insertLeaf : node;
    const second = (side === "right" || side === "bottom") ? insertLeaf : node;
    return { type: "split", direction, ratio: 0.5, children: [first, second] };
  }
  return {
    ...node,
    children: [
      /** @type {TileNode} */ (insertAdjacentToPane(node.children[0], targetSession, insertSession, side)),
      /** @type {TileNode} */ (insertAdjacentToPane(node.children[1], targetSession, insertSession, side)),
    ],
  };
}

/**
 * Find the split node that is the immediate parent of a leaf with the given session.
 * @param {TileNode} node
 * @param {string} sessionName
 * @returns {SplitNode | null}
 */
export function findParentSplit(node, sessionName) {
  if (node.type === "leaf") return null;
  for (const child of node.children) {
    if (child.type === "leaf" && child.session === sessionName) return node;
    const found = findParentSplit(child, sessionName);
    if (found) return found;
  }
  return null;
}
