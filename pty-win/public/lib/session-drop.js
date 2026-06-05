// @ts-check
// Session/folder drag-and-drop handlers for workspaces.
//
// Extracted from app.js (Phase 5b). Owns handleSessionDrop (sessions or
// folders dropped onto a workspace tab or workspace area) and the simpler
// addSessionToWorkspace mutator. Workspace-area drag/drop listeners are
// also wired here so app.js no longer carries them.

import { appendLeafToTree } from "./tiling.js";

/**
 * @typedef {{
 *   state: { sessions: Map<string, any>, workspaces: any[], activeWorkspaceId: string | null },
 *   byId: (id: string) => HTMLElement | null,
 *   helpers: {
 *     getLeafList: (node: any) => string[],
 *     getDefaultAiCommand: () => string,
 *   },
 *   actions: {
 *     createWorkspace: (name: string | null) => any,
 *     switchToWorkspace: (id: string) => void,
 *     renderActiveWorkspace: () => void,
 *     openFolder: (path: string, name: string, command?: string, newWorkspace?: boolean, args?: string[]) => Promise<unknown> | unknown,
 *   }
 * }} SessionDropDeps
 */

/**
 * @param {SessionDropDeps} deps
 */
export function createSessionDrop(deps) {
  const { state, byId, helpers, actions } = deps;

  /**
   * @param {string} workspaceId
   * @param {string} sessionName
   */
  function addSessionToWorkspace(workspaceId, sessionName) {
    const ws = state.workspaces.find((/** @type {any} */ w) => w.id === workspaceId);
    if (!ws) return;
    if (!ws.layout) {
      ws.layout = { type: "leaf", session: sessionName };
      return;
    }
    ws.layout = appendLeafToTree(ws.layout, { type: "leaf", session: sessionName });
  }

  /**
   * @param {DragEvent} e
   * @param {string | null | undefined} targetWsId
   */
  async function handleSessionDrop(e, targetWsId) {
    e.preventDefault();
    if (!e.dataTransfer) return;
    let groupName, workingDir, folderName;

    const sessionData = e.dataTransfer.getData("pty-win/session");
    const folderData = e.dataTransfer.getData("pty-win/folder");

    if (sessionData) {
      const d = JSON.parse(sessionData);
      groupName = d.group;
    } else if (folderData) {
      const d = JSON.parse(folderData);
      workingDir = d.workingDir;
      folderName = d.folderName;
      groupName = folderName;
      const existing = state.sessions.get(groupName);
      if (!existing || existing.status === "dead") {
        await actions.openFolder(workingDir, folderName, helpers.getDefaultAiCommand());
      }
    }

    if (!groupName) return;

    let ws;
    if (targetWsId) {
      ws = state.workspaces.find((/** @type {any} */ w) => w.id === targetWsId);
    } else {
      ws = actions.createWorkspace(groupName);
    }
    if (!ws) return;

    const leaves = ws.layout ? helpers.getLeafList(ws.layout) : [];
    if (!leaves.includes(groupName)) {
      addSessionToWorkspace(ws.id, groupName);
    }
    actions.switchToWorkspace(ws.id);
    actions.renderActiveWorkspace();
  }

  function attachWorkspaceAreaListeners() {
    const area = byId("workspace-area");
    if (!area) return;
    area.addEventListener("dragover", /** @param {Event} ev */ (ev) => {
      const e = /** @type {DragEvent} */ (ev);
      if (!e.dataTransfer) return;
      if (
        e.dataTransfer.types.includes("pty-win/session") ||
        e.dataTransfer.types.includes("pty-win/folder")
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });
    area.addEventListener("drop", /** @param {Event} ev */ (ev) => {
      const e = /** @type {DragEvent} */ (ev);
      if (!e.dataTransfer) return;
      if (
        e.dataTransfer.types.includes("pty-win/session") ||
        e.dataTransfer.types.includes("pty-win/folder")
      ) {
        handleSessionDrop(e, state.activeWorkspaceId);
      }
    });
  }

  return {
    handleSessionDrop,
    addSessionToWorkspace,
    attachWorkspaceAreaListeners,
  };
}
