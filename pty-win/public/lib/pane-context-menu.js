// @ts-check
// Pure helpers for showPaneContextMenu (tracker cx-10). The orchestrating
// function stays in app.js because it threads app state and singletons;
// these helpers split out the resume-eligibility logic and the small
// menu-item factories so each piece is testable in isolation.

/** @typedef {{ status?: string, command?: string, workingDir?: string|null }} ClaudeSessionInfo */

/**
 * Decide whether the "Resume Claude session" item should appear in the
 * pane context menu and whether it should be enabled.
 *
 * The original three-flag logic:
 *   - isDeadAi: a Claude session exists, it's dead, and its command is
 *               one of the known AI presets.
 *   - isNoAi:   either no Claude session exists at all, or it's dead.
 *   - canResume: isDeadAi AND a workingDir is recorded (needed to relaunch).
 *
 * The menu shows the item whenever isDeadAi || isNoAi (i.e. there is no
 * live Claude session running). The item is enabled only when canResume.
 *
 * @param {ClaudeSessionInfo | null | undefined} claudeSession
 * @param {Iterable<string>} aiCommands
 * @returns {{ show: boolean, canResume: boolean, workingDir: string | null }}
 */
export function resolveResumeMenuState(claudeSession, aiCommands) {
  const cmds = aiCommands instanceof Set ? aiCommands : new Set(aiCommands);
  const isDeadAi = !!claudeSession
    && claudeSession.status === "dead"
    && !!claudeSession.command
    && cmds.has(claudeSession.command);
  const isNoAi = !claudeSession || claudeSession.status === "dead";
  const workingDir = isDeadAi ? (claudeSession?.workingDir ?? null) : null;
  return {
    show: isDeadAi || isNoAi,
    canResume: isDeadAi && !!workingDir,
    workingDir,
  };
}

/**
 * Build a single ctx-menu item. The onClick (if provided) is wired and
 * the disabled class is omitted; the caller decides disabled state.
 *
 * @param {string} text
 * @param {(() => void) | null} onClick
 * @param {string} [extraClass]
 * @returns {HTMLDivElement}
 */
export function makeCtxItem(text, onClick, extraClass = "") {
  const item = document.createElement("div");
  item.className = `ctx-item${extraClass ? " " + extraClass : ""}`;
  item.textContent = text;
  if (onClick) item.onclick = onClick;
  return item;
}

/** Build a thin separator <div> for ctx menus. */
export function makeCtxSeparator() {
  const sep = document.createElement("div");
  sep.className = "ctx-sep";
  return sep;
}

/** Build a (non-interactive) header label for a ctx-menu section.
 * @param {string} text
 */
export function makeCtxHeader(text) {
  const header = document.createElement("div");
  header.className = "ctx-header";
  header.textContent = text;
  return header;
}
