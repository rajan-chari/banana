// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  forceIdleInFolder,
  validateSubfolderName,
  createSubfolderAndRefresh,
  addFavorite,
  removeFavorite,
  addPin,
  removePin,
  buildContextMenuActions,
  resolveContextAction,
} from "../public/lib/context-menu.js";

const normPath = (p: string) => (p ? p.replace(/\\/g, "/").toLowerCase() : "");

describe("forceIdleInFolder", () => {
  it("POSTs force-idle only for busy AI sessions in matching folder", () => {
    const fetcher = vi.fn();
    const state = {
      sessions: new Map<string, any>([
        ["a", { command: "claude", status: "busy", workingDir: "C:\\foo" }],
        ["b", { command: "claude", status: "idle", workingDir: "C:\\foo" }],
        ["c", { command: "pwsh", status: "busy", workingDir: "C:\\foo" }],
        ["d", { command: "claude", status: "busy", workingDir: "C:\\other" }],
      ]),
      aiPresets: [{ command: "claude" }],
    };
    forceIdleInFolder("C:\\foo", state as any, fetcher as any, normPath);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/a/force-idle",
      { method: "POST" },
    );
  });

  it("does nothing when no aiPresets match", () => {
    const fetcher = vi.fn();
    const state = {
      sessions: new Map([["a", { command: "claude", status: "busy", workingDir: "/foo" }]]),
      aiPresets: [{ command: "codex" }],
    };
    forceIdleInFolder("/foo", state as any, fetcher as any, normPath);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("URL-encodes session names", () => {
    const fetcher = vi.fn();
    const state = {
      sessions: new Map([
        ["with space", { command: "claude", status: "busy", workingDir: "/x" }],
      ]),
      aiPresets: [{ command: "claude" }],
    };
    forceIdleInFolder("/x", state as any, fetcher as any, normPath);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/with%20space/force-idle",
      { method: "POST" },
    );
  });
});

describe("validateSubfolderName", () => {
  it("returns empty string sentinel for null/empty/whitespace", () => {
    expect(validateSubfolderName(null)).toBe("");
    expect(validateSubfolderName(undefined)).toBe("");
    expect(validateSubfolderName("")).toBe("");
    expect(validateSubfolderName("   ")).toBe("");
  });

  it("returns null when valid", () => {
    expect(validateSubfolderName("ok-name")).toBeNull();
    expect(validateSubfolderName("My Folder")).toBeNull();
  });

  it("returns error message when invalid chars present", () => {
    expect(validateSubfolderName("a/b")).toContain("Invalid");
    expect(validateSubfolderName("x?")).toContain("Invalid");
    expect(validateSubfolderName('a"b')).toContain("Invalid");
  });

  it("trims before validating", () => {
    expect(validateSubfolderName("  ok  ")).toBeNull();
  });
});

describe("createSubfolderAndRefresh", () => {
  function mkState() {
    return {
      folderCache: new Map([["C:\\foo", { stale: true }]]),
      expandedPaths: new Set<string>(),
    };
  }

  it("POSTs, busts cache, expands, re-renders on success", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const alertF = vi.fn();
    const renderTree = vi.fn();
    const state = mkState();
    await createSubfolderAndRefresh("C:\\foo", "newdir", state as any, { fetcher: fetcher as any, alertF, renderTree });
    expect(fetcher).toHaveBeenCalledWith("/api/folders", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ parentPath: "C:\\foo", name: "newdir" }),
    }));
    expect(state.folderCache.has("C:\\foo")).toBe(false);
    expect(state.expandedPaths.has("C:\\foo")).toBe(true);
    expect(renderTree).toHaveBeenCalledTimes(1);
    expect(alertF).not.toHaveBeenCalled();
  });

  it("alerts with server error on !ok response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "exists" }) });
    const alertF = vi.fn();
    const renderTree = vi.fn();
    const state = mkState();
    await createSubfolderAndRefresh("C:\\foo", "newdir", state as any, { fetcher: fetcher as any, alertF, renderTree });
    expect(alertF).toHaveBeenCalledWith("exists");
    expect(renderTree).not.toHaveBeenCalled();
    expect(state.folderCache.has("C:\\foo")).toBe(true);
  });

  it("alerts default message on !ok with no error field", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const alertF = vi.fn();
    await createSubfolderAndRefresh("C:\\foo", "x", mkState() as any, { fetcher: fetcher as any, alertF, renderTree: vi.fn() });
    expect(alertF).toHaveBeenCalledWith("Failed to create folder");
  });

  it("alerts on network failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const alertF = vi.fn();
    await createSubfolderAndRefresh("C:\\foo", "x", mkState() as any, { fetcher: fetcher as any, alertF, renderTree: vi.fn() });
    expect(alertF).toHaveBeenCalledWith("Failed to create folder: offline");
  });
});

describe("addFavorite / removeFavorite", () => {
  it("addFavorite pushes, persists, re-renders, returns true", () => {
    const state = { favorites: [] };
    const saveFavorites = vi.fn(); const renderTree = vi.fn();
    expect(addFavorite("p", state as any, { saveFavorites, renderTree })).toBe(true);
    expect(state.favorites).toEqual(["p"]);
    expect(saveFavorites).toHaveBeenCalled();
    expect(renderTree).toHaveBeenCalled();
  });

  it("addFavorite no-ops + returns false when already present", () => {
    const state = { favorites: ["p"] };
    const saveFavorites = vi.fn(); const renderTree = vi.fn();
    expect(addFavorite("p", state as any, { saveFavorites, renderTree })).toBe(false);
    expect(saveFavorites).not.toHaveBeenCalled();
  });

  it("removeFavorite removes existing", () => {
    const state = { favorites: ["a", "b"] };
    const saveFavorites = vi.fn(); const renderTree = vi.fn();
    expect(removeFavorite("a", state as any, { saveFavorites, renderTree })).toBe(true);
    expect(state.favorites).toEqual(["b"]);
  });

  it("removeFavorite no-ops on missing", () => {
    const state = { favorites: ["a"] };
    const saveFavorites = vi.fn();
    expect(removeFavorite("missing", state as any, { saveFavorites, renderTree: vi.fn() })).toBe(false);
    expect(saveFavorites).not.toHaveBeenCalled();
  });
});

describe("addPin / removePin", () => {
  it("addPin pushes, persists, re-renders", () => {
    const state = { pinnedFolders: [] };
    const savePinnedFolders = vi.fn(); const renderQuickAccess = vi.fn();
    expect(addPin("p", state as any, { savePinnedFolders, renderQuickAccess })).toBe(true);
    expect(state.pinnedFolders).toEqual(["p"]);
    expect(savePinnedFolders).toHaveBeenCalled();
    expect(renderQuickAccess).toHaveBeenCalled();
  });

  it("removePin removes existing, no-ops on missing", () => {
    const state = { pinnedFolders: ["a", "b"] };
    const savePinnedFolders = vi.fn(); const renderQuickAccess = vi.fn();
    expect(removePin("b", state as any, { savePinnedFolders, renderQuickAccess })).toBe(true);
    expect(state.pinnedFolders).toEqual(["a"]);
    expect(removePin("missing", state as any, { savePinnedFolders, renderQuickAccess })).toBe(false);
  });
});

describe("resolveContextAction", () => {
  function makeItem(action: string | null, disabled = false): HTMLElement {
    const el = document.createElement("div");
    el.className = "ctx-item";
    if (action) el.dataset["action"] = action;
    if (disabled) el.classList.add("ctx-disabled");
    return el;
  }

  it("returns null if target is not an Element", () => {
    expect(resolveContextAction(null, "C:\\foo")).toBeNull();
  });

  it("returns null when no .ctx-item ancestor", () => {
    const el = document.createElement("span");
    expect(resolveContextAction(el, "C:\\foo")).toBeNull();
  });

  it("returns null when ctx-disabled", () => {
    const el = makeItem("open", true);
    expect(resolveContextAction(el, "C:\\foo")).toBeNull();
  });

  it("returns null when no ctxTarget", () => {
    const el = makeItem("open");
    expect(resolveContextAction(el, null)).toBeNull();
    expect(resolveContextAction(el, undefined)).toBeNull();
  });

  it("returns action, path, name on success", () => {
    const el = makeItem("open");
    expect(resolveContextAction(el, "C:\\projects\\foo")).toEqual({
      action: "open",
      path: "C:\\projects\\foo",
      name: "foo",
    });
  });

  it("name falls back to full path when no segments", () => {
    const el = makeItem("open");
    expect(resolveContextAction(el, "/")?.name).toBe("/");
  });

  it("walks up to closest .ctx-item if clicked child", () => {
    const parent = makeItem("open-new-ws");
    const child = document.createElement("span");
    parent.appendChild(child);
    expect(resolveContextAction(child, "C:\\x")?.action).toBe("open-new-ws");
  });
});

describe("buildContextMenuActions dispatcher", () => {
  let deps: any;
  let openFolder: any, renderTree: any, renderQuickAccess: any;
  let saveFavorites: any, savePinnedFolders: any, promptFn: any, alertFn: any, fetchFn: any;

  beforeEach(() => {
    openFolder = vi.fn();
    renderTree = vi.fn();
    renderQuickAccess = vi.fn();
    saveFavorites = vi.fn();
    savePinnedFolders = vi.fn();
    promptFn = vi.fn();
    alertFn = vi.fn();
    fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    deps = {
      state: {
        sessions: new Map(),
        aiPresets: [],
        folderCache: new Map(),
        expandedPaths: new Set(),
        favorites: [],
        pinnedFolders: [],
      },
      openFolder, renderTree, renderQuickAccess,
      saveFavorites, savePinnedFolders, normPath,
      promptFn, alertFn, fetchFn,
    };
  });

  it("'open' calls openFolder with (path, name)", () => {
    const actions = buildContextMenuActions(deps);
    actions["open"]("C:\\foo", "foo");
    expect(openFolder).toHaveBeenCalledWith("C:\\foo", "foo");
  });

  it("'open-new-ws' passes newWorkspace=true", () => {
    const actions = buildContextMenuActions(deps);
    actions["open-new-ws"]("C:\\foo", "foo");
    expect(openFolder).toHaveBeenCalledWith("C:\\foo", "foo", undefined, true);
  });

  it("'open-cmd' prompts and forwards command", () => {
    promptFn.mockReturnValue("custom-cmd");
    const actions = buildContextMenuActions(deps);
    actions["open-cmd"]("C:\\foo", "foo");
    expect(promptFn).toHaveBeenCalledWith("Command to run:", "cmd.exe");
    expect(openFolder).toHaveBeenCalledWith("C:\\foo", "foo", "custom-cmd");
  });

  it("'open-cmd' is no-op when prompt cancelled", () => {
    promptFn.mockReturnValue(null);
    buildContextMenuActions(deps)["open-cmd"]("C:\\foo", "foo");
    expect(openFolder).not.toHaveBeenCalled();
  });

  it("'fav-add' delegates to addFavorite", () => {
    buildContextMenuActions(deps)["fav-add"]("p", "p");
    expect(deps.state.favorites).toEqual(["p"]);
    expect(saveFavorites).toHaveBeenCalled();
  });

  it("'fav-remove' delegates to removeFavorite", () => {
    deps.state.favorites = ["p"];
    buildContextMenuActions(deps)["fav-remove"]("p", "p");
    expect(deps.state.favorites).toEqual([]);
  });

  it("'pin-add' / 'pin-remove' update pinnedFolders", () => {
    const actions = buildContextMenuActions(deps);
    actions["pin-add"]("p", "p");
    expect(deps.state.pinnedFolders).toEqual(["p"]);
    expect(renderQuickAccess).toHaveBeenCalledTimes(1);
    actions["pin-remove"]("p", "p");
    expect(deps.state.pinnedFolders).toEqual([]);
    expect(renderQuickAccess).toHaveBeenCalledTimes(2);
  });

  it("'new-folder' skips silently on empty prompt", async () => {
    promptFn.mockReturnValue("");
    await buildContextMenuActions(deps)["new-folder"]("C:\\foo", "foo");
    expect(alertFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("'new-folder' alerts on invalid name", async () => {
    promptFn.mockReturnValue("bad/name");
    await buildContextMenuActions(deps)["new-folder"]("C:\\foo", "foo");
    expect(alertFn).toHaveBeenCalledWith(expect.stringContaining("Invalid"));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("'new-folder' POSTs on valid name", async () => {
    promptFn.mockReturnValue("newdir");
    await buildContextMenuActions(deps)["new-folder"]("C:\\foo", "foo");
    expect(fetchFn).toHaveBeenCalledWith("/api/folders", expect.objectContaining({
      method: "POST",
    }));
    expect(renderTree).toHaveBeenCalled();
  });

  it("'force-idle' fires POSTs for matching busy AI sessions", () => {
    deps.state.sessions = new Map([
      ["a", { command: "claude", status: "busy", workingDir: "C:\\foo" }],
    ]);
    deps.state.aiPresets = [{ command: "claude" }];
    buildContextMenuActions(deps)["force-idle"]("C:\\foo", "foo");
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/sessions/a/force-idle",
      { method: "POST" },
    );
  });

  it("dispatcher exposes all 9 actions", () => {
    const actions = buildContextMenuActions(deps);
    expect(Object.keys(actions).sort()).toEqual([
      "fav-add", "fav-remove", "force-idle", "new-folder",
      "open", "open-cmd", "open-new-ws", "pin-add", "pin-remove",
    ]);
  });

  it("falls back to window.fetch with correct receiver (regression: 'Illegal invocation')", async () => {
    // When deps.fetchFn is undefined, buildContextMenuActions should use the
    // real window.fetch and call it with `window` as receiver. Calling fetch
    // with the wrong `this` throws "Illegal invocation" in real browsers.
    // We simulate that here by replacing global fetch with a function that
    // throws if invoked with the wrong this.
    const originalFetch = globalThis.fetch;
    const strictFetch = function (this: unknown, ..._args: unknown[]) {
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    };
    Object.defineProperty(globalThis, "fetch", { value: strictFetch, configurable: true, writable: true });
    try {
      const depsNoFetch = { ...deps };
      delete depsNoFetch.fetchFn;
      promptFn.mockReturnValue("newdir");
      // If fetch is invoked with `deps` as receiver, this throws and the
      // alertFn is invoked instead -- the test should fail.
      await buildContextMenuActions(depsNoFetch)["new-folder"]("C:\\foo", "foo");
      expect(alertFn).not.toHaveBeenCalledWith(expect.stringContaining("Illegal"));
      expect(renderTree).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "fetch", { value: originalFetch, configurable: true, writable: true });
    }
  });
});
