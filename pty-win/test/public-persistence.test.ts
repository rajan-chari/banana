// @vitest-environment happy-dom
//
// Spike: prove vitest + happy-dom can exercise browser ES modules from public/lib/
// directly, without a bundler. Targets persistence.js (localStorage load/save helpers).
// Companion to tracker e0ca3757.

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFavorites, saveFavorites,
  loadPinnedFolders, savePinnedFolders,
  loadExpandedPaths, saveExpandedPaths,
  loadSidebarWidth, saveSidebarWidth,
  saveWorkspaces, loadWorkspaces,
  loadSessionMeta, saveSessionMeta,
} from "../public/lib/persistence.js";
import { state } from "../public/lib/state.js";

beforeEach(() => {
  localStorage.clear();
  // Reset mutable state used by the savers.
  state.favorites = [];
  state.pinnedFolders = [];
  state.expandedPaths = new Set();
  state.workspaces = [];
  state.activeWorkspaceId = null;
  state.nextWorkspaceId = 1;
  state.sessionMeta = new Map();
});

describe("favorites", () => {
  it("returns [] when nothing stored", () => {
    expect(loadFavorites()).toEqual([]);
  });

  it("round-trips through save/load", () => {
    state.favorites = ["C:\\one", "C:\\two"];
    saveFavorites();
    expect(loadFavorites()).toEqual(["C:\\one", "C:\\two"]);
  });

  it("returns [] on malformed JSON", () => {
    localStorage.setItem("pty-win-favorites", "{not json");
    expect(loadFavorites()).toEqual([]);
  });
});

describe("pinnedFolders", () => {
  it("returns [] when missing", () => {
    expect(loadPinnedFolders()).toEqual([]);
  });

  it("round-trips", () => {
    state.pinnedFolders = ["C:\\pin"];
    savePinnedFolders();
    expect(loadPinnedFolders()).toEqual(["C:\\pin"]);
  });
});

describe("expandedPaths", () => {
  it("returns empty Set when missing", () => {
    const result = loadExpandedPaths();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("round-trips a Set through serialization", () => {
    state.expandedPaths = new Set(["C:\\a", "C:\\b"]);
    saveExpandedPaths();
    const loaded = loadExpandedPaths();
    expect(loaded).toBeInstanceOf(Set);
    expect([...loaded].sort()).toEqual(["C:\\a", "C:\\b"]);
  });

  it("returns empty Set on malformed JSON", () => {
    localStorage.setItem("pty-win-expanded", "garbage");
    expect(loadExpandedPaths().size).toBe(0);
  });
});

describe("sidebarWidth", () => {
  it("defaults to 220 when missing", () => {
    expect(loadSidebarWidth()).toBe(220);
  });

  it("round-trips", () => {
    saveSidebarWidth(310);
    expect(loadSidebarWidth()).toBe(310);
  });

  it("parses as int (trailing chars stripped by parseInt)", () => {
    localStorage.setItem("pty-win-sidebar-width", "180px");
    expect(loadSidebarWidth()).toBe(180);
  });
});

describe("workspaces", () => {
  it("loadWorkspaces returns null when nothing stored", () => {
    expect(loadWorkspaces()).toBeNull();
  });

  it("strips terminal instances and persists only metadata + layout", () => {
    state.workspaces = [
      { id: "w1", name: "main", customName: true, layout: { type: "leaf", session: "s1" } },
      { id: "w2", name: "scratch", layout: null },
    ] as any;
    state.activeWorkspaceId = "w1";
    state.nextWorkspaceId = 3;

    saveWorkspaces();
    const loaded = loadWorkspaces();

    expect(loaded).not.toBeNull();
    expect(loaded.workspaces).toHaveLength(2);
    expect(loaded.workspaces[0]).toEqual({
      id: "w1", name: "main", customName: true,
      layout: { type: "leaf", session: "s1" },
    });
    expect(loaded.workspaces[1]).toEqual({
      id: "w2", name: "scratch", customName: false, layout: null,
    });
    expect(loaded.activeWorkspaceId).toBe("w1");
    expect(loaded.isDashboard).toBeUndefined();
    expect(loaded.nextId).toBe(3);
  });
});

describe("sessionMeta", () => {
  it("returns empty Map when missing", () => {
    const m = loadSessionMeta();
    expect(m).toBeInstanceOf(Map);
    expect(m.size).toBe(0);
  });

  it("round-trips Map through object serialization", () => {
    state.sessionMeta = new Map([
      ["proj~claude", { workingDir: "C:\\proj", command: "claude" }],
      ["proj~pwsh", { workingDir: "C:\\proj", command: "pwsh" }],
    ]);
    saveSessionMeta();

    const loaded = loadSessionMeta();
    expect(loaded.size).toBe(2);
    expect(loaded.get("proj~claude")).toEqual({ workingDir: "C:\\proj", command: "claude" });
    expect(loaded.get("proj~pwsh")).toEqual({ workingDir: "C:\\proj", command: "pwsh" });
  });

  it("returns empty Map on malformed JSON", () => {
    localStorage.setItem("pty-win-session-meta", "nope");
    expect(loadSessionMeta().size).toBe(0);
  });
});
