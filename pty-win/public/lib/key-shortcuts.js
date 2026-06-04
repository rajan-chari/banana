// @ts-check
// Pure key-shortcut resolvers (tracker cx-09). Each resolver maps a
// KeyboardEvent.key value to a discriminated-union action descriptor;
// the caller in app.js performs the side effects (focus changes, WS
// sends, workspace switches). Splitting the dispatch from the actions
// makes the keyboard layer exhaustively testable without happy-dom.

/** @typedef {
 *   | { type: "noop" }
 *   | { type: "passthrough" }
 *   | { type: "clearInputDirty" }
 *   | { type: "switchToDashboard" }
 *   | { type: "closeFocusedPane" }
 *   | { type: "toggleSidebar" }
 *   | { type: "switchWorkspace", index: number }
 *   | { type: "resize", direction: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" }
 * } CtrlShiftKeyAction */

/** @type {Record<string, CtrlShiftKeyAction>} */
const CTRL_SHIFT_KEY_MAP = {
  " ": { type: "clearInputDirty" },
  D: { type: "switchToDashboard" }, d: { type: "switchToDashboard" },
  W: { type: "closeFocusedPane" },  w: { type: "closeFocusedPane" },
  B: { type: "toggleSidebar" },     b: { type: "toggleSidebar" },
  // H/V are swallowed (browser-shortcut conflicts) but produce no action.
  H: { type: "noop" }, h: { type: "noop" },
  V: { type: "noop" }, v: { type: "noop" },
  ArrowLeft:  { type: "resize", direction: "ArrowLeft" },
  ArrowRight: { type: "resize", direction: "ArrowRight" },
  ArrowUp:    { type: "resize", direction: "ArrowUp" },
  ArrowDown:  { type: "resize", direction: "ArrowDown" },
};

/**
 * Map a Ctrl+Shift+<key> press to a single action descriptor. Returns
 * `{type: "passthrough"}` when the caller should let the key bubble to
 * xterm; any other action implies the key was consumed.
 *
 * @param {string} key  - KeyboardEvent.key value
 * @returns {CtrlShiftKeyAction}
 */
export function resolveCtrlShiftKeyAction(key) {
  const mapped = CTRL_SHIFT_KEY_MAP[key];
  if (mapped) return mapped;
  if (key.length === 1 && key >= "1" && key <= "9") {
    return { type: "switchWorkspace", index: parseInt(key, 10) - 1 };
  }
  return { type: "passthrough" };
}
