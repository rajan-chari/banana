// @vitest-environment happy-dom
// State module — global state + AI helpers.
//
// Tests use vi.resetModules() between cases so each gets a fresh `state` —
// `aiDefaultIndex` is read from localStorage at import time, so the only
// way to test that branch is per-test module reload.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importFresh() {
  // Cast to any so TS test file can ignore the JS module's JSDoc types.
  return (await import("../public/lib/state.js")) as any;
}

describe("state defaults", () => {
  it("exposes aiPresets with the five canonical commands in order", async () => {
    const { state } = await importFresh();
    expect(state.aiPresets.map((p: any) => p.command)).toEqual([
      "claude",
      "agency cc",
      "agency cp",
      "copilot",
      "pi",
    ]);
  });

  it("initializes aiDefaultIndex from localStorage at import time", async () => {
    localStorage.setItem("pty-win-ai-default", "3");
    const { state } = await importFresh();
    expect(state.aiDefaultIndex).toBe(3);
  });

  it("defaults aiDefaultIndex to 0 when localStorage is empty", async () => {
    const { state } = await importFresh();
    expect(state.aiDefaultIndex).toBe(0);
  });

  it("defaults aiDefaultIndex to 0 when localStorage value is NaN", async () => {
    localStorage.setItem("pty-win-ai-default", "not-a-number");
    const { state } = await importFresh();
    expect(state.aiDefaultIndex).toBe(0);
  });

  it("starts with empty collections and isDashboard=true", async () => {
    const { state } = await importFresh();
    expect(state.sessions.size).toBe(0);
    expect(state.workspaces).toEqual([]);
    expect(state.terminals.size).toBe(0);
    expect(state.isDashboard).toBe(true);
    expect(state.nextWorkspaceId).toBe(1);
  });
});

describe("getDefaultAiCommand", () => {
  it("returns the command at aiDefaultIndex", async () => {
    localStorage.setItem("pty-win-ai-default", "2");
    const { getDefaultAiCommand, state } = await importFresh();
    expect(state.aiDefaultIndex).toBe(2);
    expect(getDefaultAiCommand()).toBe("agency cp");
  });

  it("returns 'claude' when aiDefaultIndex is 0 (default)", async () => {
    const { getDefaultAiCommand } = await importFresh();
    expect(getDefaultAiCommand()).toBe("claude");
  });

  it("falls back to 'claude' when aiDefaultIndex is out of bounds", async () => {
    const { getDefaultAiCommand, state } = await importFresh();
    state.aiDefaultIndex = 99;
    expect(getDefaultAiCommand()).toBe("claude");
  });
});

describe("getAiPresetForCommand", () => {
  it("returns the matching preset for a known command", async () => {
    const { getAiPresetForCommand } = await importFresh();
    expect(getAiPresetForCommand("copilot")).toEqual({
      name: "Copilot",
      command: "copilot",
      icon: "GH",
    });
  });

  it("returns a synthesized preset for an unknown command", async () => {
    const { getAiPresetForCommand } = await importFresh();
    expect(getAiPresetForCommand("custom-cli")).toEqual({
      name: "custom-cli",
      command: "custom-cli",
      icon: "?",
    });
  });

  it("matches commands exactly (not by prefix)", async () => {
    const { getAiPresetForCommand } = await importFresh();
    // "agency" is not a preset; only "agency cc" / "agency cp" are
    const result = getAiPresetForCommand("agency");
    expect(result.icon).toBe("?");
    expect(result.command).toBe("agency");
  });
});

describe("setAiDefault", () => {
  beforeEach(() => {
    // Default: fetch resolves successfully
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("updates state.aiDefaultIndex", async () => {
    const { setAiDefault, state } = await importFresh();
    setAiDefault(3);
    expect(state.aiDefaultIndex).toBe(3);
  });

  it("writes the index to localStorage as a string", async () => {
    const { setAiDefault } = await importFresh();
    setAiDefault(2);
    expect(localStorage.getItem("pty-win-ai-default")).toBe("2");
  });

  it("POSTs to /api/preferences with the preset command and updatedBy", async () => {
    const { setAiDefault } = await importFresh();
    setAiDefault(3, "test-suite");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/preferences");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      cliPreference: "copilot",
      updatedBy: "test-suite",
    });
  });

  it("defaults updatedBy to 'pty-win-play'", async () => {
    const { setAiDefault } = await importFresh();
    setAiDefault(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).updatedBy).toBe("pty-win-play");
  });

  it("swallows fetch rejections (fire-and-forget)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const { setAiDefault, state } = await importFresh();
    expect(() => setAiDefault(2)).not.toThrow();
    // state was still updated
    expect(state.aiDefaultIndex).toBe(2);
    // wait a microtask so the .catch() resolves
    await Promise.resolve();
  });

  it("skips the POST when the resolved preset has no command", async () => {
    const { setAiDefault, state } = await importFresh();
    // mutate a preset to have no command (defensive — shouldn't happen in practice)
    state.aiPresets[1] = { name: "Bad", command: "", icon: "?" };
    setAiDefault(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("syncAiDefaultFromServer", () => {
  it("updates aiDefaultIndex when the server returns a known command", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cliPreference: "agency cc" }),
    });
    const { syncAiDefaultFromServer, state } = await importFresh();
    await syncAiDefaultFromServer();
    expect(state.aiDefaultIndex).toBe(1);
    expect(localStorage.getItem("pty-win-ai-default")).toBe("1");
  });

  it("does not write localStorage when the index already matches", async () => {
    localStorage.setItem("pty-win-ai-default", "0");
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cliPreference: "claude" }),
    });
    const { syncAiDefaultFromServer, state } = await importFresh();
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    await syncAiDefaultFromServer();
    expect(state.aiDefaultIndex).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it("ignores unknown commands (custom path) and leaves state unchanged", async () => {
    localStorage.setItem("pty-win-ai-default", "2");
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cliPreference: "/usr/local/bin/some-custom-cli" }),
    });
    const { syncAiDefaultFromServer, state } = await importFresh();
    await syncAiDefaultFromServer();
    expect(state.aiDefaultIndex).toBe(2);
  });

  it("ignores response when cliPreference is missing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const { syncAiDefaultFromServer, state } = await importFresh();
    await syncAiDefaultFromServer();
    expect(state.aiDefaultIndex).toBe(0);
  });

  it("does nothing when the server returns a non-OK response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const { syncAiDefaultFromServer, state } = await importFresh();
    await syncAiDefaultFromServer();
    expect(state.aiDefaultIndex).toBe(0);
  });

  it("swallows network errors", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const { syncAiDefaultFromServer, state } = await importFresh();
    await expect(syncAiDefaultFromServer()).resolves.toBeUndefined();
    expect(state.aiDefaultIndex).toBe(0);
  });
});

describe("TERM_THEME", () => {
  it("exports a frozen-shape theme object with foreground/background", async () => {
    const { TERM_THEME } = await importFresh();
    expect(TERM_THEME.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TERM_THEME.foreground).toMatch(/^#[0-9a-f]{6}$/i);
    // Spot-check ANSI colors all present
    for (const k of ["red", "green", "blue", "brightBlack", "brightWhite"]) {
      expect(TERM_THEME[k]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
