// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  forceIdleInFolder,
  validateSubfolderName,
  createSubfolderAndRefresh,
  buildContextMenuActions,
  resolveContextAction,
  createContextMenu,
} from "../public/lib/context-menu.js";
import { createFavoritesStore } from "../public/lib/favorites-store.js";
import { createPinnedFoldersStore } from "../public/lib/pinned-folders-store.js";

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
  let favorites: any, pinned: any, promptFn: any, alertFn: any, fetchFn: any;

  beforeEach(() => {
    openFolder = vi.fn();
    renderTree = vi.fn();
    renderQuickAccess = vi.fn();
    promptFn = vi.fn();
    alertFn = vi.fn();
    fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const baseState: any = {
      sessions: new Map(),
      aiPresets: [],
      folderCache: new Map(),
      expandedPaths: new Set(),
      favorites: [],
      pinnedFolders: [],
    };
    const memStorage = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memStorage.get(k) ?? null,
      setItem: (k: string, v: string) => { memStorage.set(k, v); },
    };
    favorites = createFavoritesStore({
      state: baseState,
      storage,
      defaultEntry: null as any,
    });
    favorites.init();
    pinned = createPinnedFoldersStore({
      state: baseState,
      storage,
      key: "pty-win-pinned-test",
      onChange: () => renderQuickAccess(),
    });
    pinned.init();
    deps = {
      state: baseState,
      openFolder, renderTree, renderQuickAccess,
      favorites, pinned, normPath,
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

  it("'fav-add' delegates to favorites store", () => {
    buildContextMenuActions(deps)["fav-add"]("p", "p");
    expect(deps.state.favorites).toEqual(["p"]);
    expect(favorites.has("p")).toBe(true);
  });

  it("'fav-remove' delegates to favorites store", () => {
    favorites.add("p");
    buildContextMenuActions(deps)["fav-remove"]("p", "p");
    expect(deps.state.favorites).toEqual([]);
    expect(favorites.has("p")).toBe(false);
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

// ===== Phase 7c: createContextMenu factory =====

function mkMenuDom() {
  document.body.innerHTML = "";
  const m = document.createElement("div");
  m.id = "context-menu";
  m.className = "hidden";
  for (const a of ["fav-add", "fav-remove", "pin-add", "pin-remove", "force-idle", "rename"]) {
    const it = document.createElement("div");
    it.className = "ctx-item";
    it.setAttribute("data-action", a);
    it.textContent = a;
    m.appendChild(it);
  }
  const sep = document.createElement("div");
  sep.className = "ctx-sep-pin";
  sep.style.display = "none";
  m.appendChild(sep);
  document.body.appendChild(m);
  return m;
}

function mkCmState(overrides: any = {}) {
  return {
    ctxTarget: null as string | null,
    favorites: [] as string[],
    pinnedFolders: [] as string[],
    aiPresets: [{ command: "claude" }],
    sessions: new Map<string, any>(),
    ...overrides,
  };
}

function mkCmFactory(overrides: any = {}) {
  const menu = mkMenuDom();
  const state = overrides.state || mkCmState();
  const actions = overrides.actions || {};
  const f = createContextMenu({
    doc: document,
    byId: (id: string) => document.getElementById(id),
    state: state as any,
    helpers: { normPath },
    actions,
  });
  return { factory: f, state, menu, actions };
}

describe("createContextMenu.show", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("sets state.ctxTarget to clicked path", () => {
    const { factory, state } = mkCmFactory();
    const e = new MouseEvent("contextmenu", { clientX: 50, clientY: 60 });
    factory.show(e as any, "C:\\foo");
    expect(state.ctxTarget).toBe("C:\\foo");
  });

  it("calls preventDefault and stopPropagation", () => {
    const { factory } = mkCmFactory();
    const e = new MouseEvent("contextmenu");
    const pd = vi.spyOn(e, "preventDefault");
    const sp = vi.spyOn(e, "stopPropagation");
    factory.show(e as any, "C:\\foo");
    expect(pd).toHaveBeenCalled();
    expect(sp).toHaveBeenCalled();
  });

  it("toggles fav-add/fav-remove disabled when path is a favorite", () => {
    const { factory, menu } = mkCmFactory({ state: mkCmState({ favorites: ["C:\\foo"] }) });
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    expect(menu.querySelector('[data-action="fav-add"]')!.classList.contains("ctx-disabled")).toBe(true);
    expect(menu.querySelector('[data-action="fav-remove"]')!.classList.contains("ctx-disabled")).toBe(false);
  });

  it("toggles fav-add/fav-remove disabled when path is NOT a favorite", () => {
    const { factory, menu } = mkCmFactory();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    expect(menu.querySelector('[data-action="fav-add"]')!.classList.contains("ctx-disabled")).toBe(false);
    expect(menu.querySelector('[data-action="fav-remove"]')!.classList.contains("ctx-disabled")).toBe(true);
  });

  it("toggles pin-add/pin-remove disabled when path is pinned", () => {
    const { factory, menu } = mkCmFactory({ state: mkCmState({ pinnedFolders: ["C:\\foo"] }) });
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    expect(menu.querySelector('[data-action="pin-add"]')!.classList.contains("ctx-disabled")).toBe(true);
    expect(menu.querySelector('[data-action="pin-remove"]')!.classList.contains("ctx-disabled")).toBe(false);
  });

  it("always resets .ctx-sep-pin display to empty string on show", () => {
    const { factory, menu } = mkCmFactory();
    const sep = menu.querySelector(".ctx-sep-pin") as HTMLElement;
    expect(sep.style.display).toBe("none");
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    expect(sep.style.display).toBe("");
  });

  it("hides force-idle when no busy AI session matches path", () => {
    const { factory, menu } = mkCmFactory({
      state: mkCmState({
        sessions: new Map([["s", { command: "pwsh", status: "busy", workingDir: "C:\\foo" }]]),
      }),
    });
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const fi = menu.querySelector('[data-action="force-idle"]') as HTMLElement;
    expect(fi.style.display).toBe("none");
  });

  it("shows force-idle when a busy AI session matches the target path", () => {
    const { factory, menu } = mkCmFactory({
      state: mkCmState({
        sessions: new Map([["s", { command: "claude", status: "busy", workingDir: "C:\\foo" }]]),
      }),
    });
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const fi = menu.querySelector('[data-action="force-idle"]') as HTMLElement;
    expect(fi.style.display).toBe("");
  });

  it("hides force-idle when busy AI session exists but workingDir differs", () => {
    const { factory, menu } = mkCmFactory({
      state: mkCmState({
        sessions: new Map([["s", { command: "claude", status: "busy", workingDir: "C:\\other" }]]),
      }),
    });
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const fi = menu.querySelector('[data-action="force-idle"]') as HTMLElement;
    expect(fi.style.display).toBe("none");
  });

  it("positions menu at e.clientX and e.clientY and removes hidden", () => {
    const { factory, menu } = mkCmFactory();
    factory.show(new MouseEvent("contextmenu", { clientX: 123, clientY: 456 }) as any, "C:\\foo");
    expect((menu as HTMLElement).style.left).toBe("123px");
    expect((menu as HTMLElement).style.top).toBe("456px");
    expect(menu.classList.contains("hidden")).toBe(false);
  });

  it("is a no-op when #context-menu is missing from DOM", () => {
    document.body.innerHTML = "";
    const state = mkCmState();
    const f = createContextMenu({
      doc: document,
      byId: (id: string) => document.getElementById(id),
      state: state as any,
      helpers: { normPath },
      actions: {},
    });
    expect(() => f.show(new MouseEvent("contextmenu") as any, "C:\\foo")).not.toThrow();
    expect(state.ctxTarget).toBe("C:\\foo");
  });
});

describe("createContextMenu.attachDismissers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("global document click hides the menu", () => {
    const { factory, menu } = mkCmFactory();
    factory.attachDismissers();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    expect(menu.classList.contains("hidden")).toBe(false);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.classList.contains("hidden")).toBe(true);
  });

  it("menu item click resolves action and invokes handler with (path, name)", async () => {
    const handler = vi.fn();
    const { factory, menu } = mkCmFactory({ actions: { rename: handler } });
    factory.attachDismissers();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo\\bar");
    const item = menu.querySelector('[data-action="rename"]') as HTMLElement;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledWith("C:\\foo\\bar", "bar");
  });

  it("menu click with no matching action does not invoke any handler", async () => {
    const handler = vi.fn();
    const { factory, menu } = mkCmFactory({ actions: { rename: handler } });
    factory.attachDismissers();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const item = menu.querySelector('[data-action="force-idle"]') as HTMLElement;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it("menu click on disabled item does not invoke handler", async () => {
    const handler = vi.fn();
    const { factory, menu } = mkCmFactory({
      state: mkCmState({ favorites: ["C:\\foo"] }),
      actions: { "fav-add": handler },
    });
    factory.attachDismissers();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const item = menu.querySelector('[data-action="fav-add"]') as HTMLElement;
    expect(item.classList.contains("ctx-disabled")).toBe(true);
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it("menu click without a prior show() returns early (no ctxTarget)", async () => {
    const handler = vi.fn();
    const { factory, menu } = mkCmFactory({ actions: { rename: handler } });
    factory.attachDismissers();
    const item = menu.querySelector('[data-action="rename"]') as HTMLElement;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it("awaits async action handlers", async () => {
    let resolved = false;
    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });
    const { factory, menu } = mkCmFactory({ actions: { rename: handler } });
    factory.attachDismissers();
    factory.show(new MouseEvent("contextmenu") as any, "C:\\foo");
    const item = menu.querySelector('[data-action="rename"]') as HTMLElement;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(true);
  });
});
