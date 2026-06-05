// @vitest-environment happy-dom
//
// Tests for public/lib/session-row.js — the DOM constructors + opts
// shaper extracted from app.js renderSessionsPanel. Also covers the
// createRowActions factory (Phase 6a) which owns the side-effecting tag
// builders and the appendRowActions composer.

import { describe, it, expect, vi } from "vitest";
import {
  createEmptyRow,
  createSessionRow,
  buildSessionRowActionsOpts,
  patchSessionRowIndicators,
  activeNameForRow,
  buildIdentityTag,
  buildUnreadBadge,
  buildIndicatorSlot,
  buildKillButton,
  createRowActions,
} from "../public/lib/session-row.js";

type SessionInfo = {
  name: string;
  group: string;
  command: string;
  status: "starting" | "busy" | "idle" | "dead";
  emcomIdentity?: string | null;
  unreadCount?: number;
  workingDir?: string;
};

type PaneGroup = {
  claude?: string;
  pwsh?: string;
  activeType: "claude" | "pwsh";
};

type ActiveSessionGroup = {
  group: string;
  pg: PaneGroup;
  claudeInfo: SessionInfo | null;
  pwshInfo: SessionInfo | null;
  claudeAlive: boolean;
  pwshAlive: boolean;
  workingDir: string | undefined;
};

function mkInfo(p: Partial<SessionInfo> = {}): SessionInfo {
  return {
    name: p.name ?? "demo",
    group: p.group ?? "demo",
    command: p.command ?? "claude",
    status: p.status ?? "idle",
    emcomIdentity: p.emcomIdentity ?? null,
    unreadCount: p.unreadCount ?? 0,
    workingDir: p.workingDir ?? "C:/work/demo",
  };
}

function mkGroup(p: Partial<ActiveSessionGroup> = {}): ActiveSessionGroup {
  // Use `in` so callers can explicitly pass claudeInfo: null without it
  // being overridden by the default.
  const claudeInfo = "claudeInfo" in p
    ? (p.claudeInfo ?? null)
    : mkInfo({ name: "demo", command: "claude" });
  return {
    group: p.group ?? "demo",
    pg: p.pg ?? { claude: "demo", activeType: "claude" },
    claudeInfo,
    pwshInfo: "pwshInfo" in p ? (p.pwshInfo ?? null) : null,
    claudeAlive: p.claudeAlive ?? true,
    pwshAlive: p.pwshAlive ?? false,
    workingDir: p.workingDir ?? "C:/work/demo",
  };
}

describe("createEmptyRow", () => {
  it("renders the sessions-empty placeholder", () => {
    const el = createEmptyRow();
    expect(el.className).toBe("sessions-empty");
    expect(el.textContent).toBe("No sessions");
  });
});

describe("createSessionRow", () => {
  it("marks row .active when focusedPane matches group name", () => {
    const row = createSessionRow(mkGroup({ group: "demo" }), "demo");
    expect(row.className).toContain("active");
    expect(row.dataset["group"]).toBe("demo");
  });

  it("does not mark row .active when focusedPane is null", () => {
    const row = createSessionRow(mkGroup({ group: "demo" }), null);
    expect(row.className).toBe("session-row ");
  });

  it("includes a status-dot and session-name child", () => {
    const row = createSessionRow(mkGroup(), null);
    expect(row.querySelector(".status-dot")).toBeTruthy();
    expect(row.querySelector(".session-name")?.textContent).toBe("demo");
  });
});

describe("buildSessionRowActionsOpts", () => {
  it("derives identity from whichever info has emcomIdentity (claude preferred)", () => {
    const g = mkGroup({
      claudeInfo: mkInfo({ emcomIdentity: "moss" }),
      pwshInfo: mkInfo({ emcomIdentity: "frost", command: "pwsh", status: "idle" }),
      claudeAlive: true,
      pwshAlive: true,
    });
    const opts = buildSessionRowActionsOpts(g, undefined, () => {});
    expect(opts.identityName).toBe("moss");
  });

  it("uses claude's identity even when null (does NOT fall back to pwsh)", () => {
    // Faithful to original app.js behavior: `(claudeInfo || pwshInfo)?.emcomIdentity`
    // picks the first existing info object, then reads its identity — it does
    // not skip a null-identity claude to consult pwsh.
    const g = mkGroup({
      claudeInfo: mkInfo({ emcomIdentity: null }),
      pwshInfo: mkInfo({ emcomIdentity: "frost", command: "pwsh", status: "idle" }),
      claudeAlive: true,
      pwshAlive: true,
    });
    expect(buildSessionRowActionsOpts(g, undefined, () => {}).identityName).toBeNull();
  });

  it("uses pwsh identity when claudeInfo is null", () => {
    const g = mkGroup({
      claudeInfo: null,
      pwshInfo: mkInfo({ emcomIdentity: "frost", command: "pwsh", status: "idle" }),
      claudeAlive: false,
      pwshAlive: true,
    });
    expect(buildSessionRowActionsOpts(g, undefined, () => {}).identityName).toBe("frost");
  });

  it("yields null identity when neither side has one", () => {
    const g = mkGroup({ claudeInfo: mkInfo({ emcomIdentity: null }) });
    expect(buildSessionRowActionsOpts(g, undefined, () => {}).identityName).toBeNull();
  });

  it("sums unread across alive sessions", () => {
    const g = mkGroup({
      claudeInfo: mkInfo({ unreadCount: 3 }),
      pwshInfo: mkInfo({ unreadCount: 2, command: "pwsh", status: "idle" }),
      claudeAlive: true,
      pwshAlive: true,
    });
    expect(buildSessionRowActionsOpts(g, undefined, () => {}).unreadCount).toBe(5);
  });

  it("uses claudeCommand only when claude is alive", () => {
    const aliveOpts = buildSessionRowActionsOpts(
      mkGroup({ claudeInfo: mkInfo({ command: "claude" }), claudeAlive: true }),
      undefined,
      () => {},
    );
    expect(aliveOpts.claudeCommand).toBe("claude");

    const deadOpts = buildSessionRowActionsOpts(
      mkGroup({ claudeInfo: mkInfo({ command: "claude" }), claudeAlive: false, pwshAlive: true }),
      undefined,
      () => {},
    );
    expect(deadOpts.claudeCommand).toBeNull();
  });

  it("pulls indicators from cached folder info", () => {
    const opts = buildSessionRowActionsOpts(
      mkGroup(),
      { isClaudeReady: true, hasIdentity: true, identityName: "moss" },
      () => {},
    );
    expect(opts.isClaudeReady).toBe(true);
    expect(opts.hasIdentity).toBe(true);
  });

  it("defaults indicators to false when no cached info", () => {
    const opts = buildSessionRowActionsOpts(mkGroup(), undefined, () => {});
    expect(opts.isClaudeReady).toBe(false);
    expect(opts.hasIdentity).toBe(false);
  });

  it("passes onKill through verbatim", () => {
    const kill = vi.fn();
    const opts = buildSessionRowActionsOpts(mkGroup(), undefined, kill);
    opts.onKill();
    expect(kill).toHaveBeenCalledTimes(1);
  });
});

describe("patchSessionRowIndicators", () => {
  function mkRowWithSlot(): HTMLDivElement {
    const row = document.createElement("div");
    row.innerHTML = `
      <span class="indicator-slot">
        <span class="indicator claude-ready hidden-placeholder"></span>
        <span class="indicator identity hidden-placeholder"></span>
      </span>
    `;
    return row;
  }

  it("removes hidden-placeholder and sets title when isClaudeReady", () => {
    const row = mkRowWithSlot();
    patchSessionRowIndicators(row, { isClaudeReady: true, hasIdentity: false });
    const indC = row.querySelector(".indicator.claude-ready") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(false);
    expect(indC.title).toBe("Has CLAUDE.md");
  });

  it("sets identity title to the named identity when present", () => {
    const row = mkRowWithSlot();
    patchSessionRowIndicators(row, { isClaudeReady: false, hasIdentity: true, identityName: "moss" });
    const indI = row.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.classList.contains("hidden-placeholder")).toBe(false);
    expect(indI.title).toBe("Identity: moss");
  });

  it("falls back to 'yes' when identityName is missing", () => {
    const row = mkRowWithSlot();
    patchSessionRowIndicators(row, { isClaudeReady: false, hasIdentity: true });
    const indI = row.querySelector(".indicator.identity") as HTMLElement;
    expect(indI.title).toBe("Identity: yes");
  });

  it("re-hides indicators when flags are false", () => {
    const row = document.createElement("div");
    row.innerHTML = `
      <span class="indicator-slot">
        <span class="indicator claude-ready" title="Has CLAUDE.md"></span>
        <span class="indicator identity" title="Identity: x"></span>
      </span>
    `;
    patchSessionRowIndicators(row, { isClaudeReady: false, hasIdentity: false });
    const indC = row.querySelector(".indicator.claude-ready") as HTMLElement;
    const indI = row.querySelector(".indicator.identity") as HTMLElement;
    expect(indC.classList.contains("hidden-placeholder")).toBe(true);
    expect(indI.classList.contains("hidden-placeholder")).toBe(true);
  });

  it("is a no-op when the indicator slot is missing", () => {
    const row = document.createElement("div");
    expect(() => patchSessionRowIndicators(row, { isClaudeReady: true, hasIdentity: true })).not.toThrow();
  });
});

describe("activeNameForRow", () => {
  it("returns the claude session name when claude is alive", () => {
    const g = mkGroup({
      pg: { claude: "demo", pwsh: "demo~pwsh", activeType: "claude" },
      claudeAlive: true,
      pwshAlive: true,
    });
    expect(activeNameForRow(g)).toBe("demo");
  });

  it("returns the pwsh name when claude is dead", () => {
    const g = mkGroup({
      pg: { claude: "demo", pwsh: "demo~pwsh", activeType: "pwsh" },
      claudeAlive: false,
      pwshAlive: true,
    });
    expect(activeNameForRow(g)).toBe("demo~pwsh");
  });
});

describe("buildIdentityTag", () => {
  it("renders the name when present", () => {
    const el = buildIdentityTag("moss");
    expect(el.className).toBe("identity-tag ");
    expect(el.textContent).toBe("moss");
  });

  it("renders @ placeholder with hidden-placeholder class when null/empty", () => {
    expect(buildIdentityTag(null).className).toBe("identity-tag hidden-placeholder");
    expect(buildIdentityTag(null).textContent).toBe("@");
    expect(buildIdentityTag("").className).toContain("hidden-placeholder");
    expect(buildIdentityTag(undefined).className).toContain("hidden-placeholder");
  });
});

describe("buildUnreadBadge", () => {
  it("renders (N) and clears hidden-placeholder when count > 0", () => {
    const el = buildUnreadBadge(5);
    expect(el.className).toBe("unread-badge ");
    expect(el.textContent).toBe("(5)");
  });

  it("renders (0) with hidden-placeholder when count is 0", () => {
    const el = buildUnreadBadge(0);
    expect(el.className).toBe("unread-badge hidden-placeholder");
    expect(el.textContent).toBe("(0)");
  });
});

describe("buildIndicatorSlot", () => {
  it("shows both dots without hidden-placeholder when flags are true", () => {
    const slot = buildIndicatorSlot({ isClaudeReady: true, hasIdentity: true, identityName: "moss" });
    const claudeDot = slot.querySelector(".indicator.claude-ready") as HTMLElement;
    const idDot = slot.querySelector(".indicator.identity") as HTMLElement;
    expect(claudeDot.classList.contains("hidden-placeholder")).toBe(false);
    expect(claudeDot.title).toBe("Has CLAUDE.md");
    expect(idDot.classList.contains("hidden-placeholder")).toBe(false);
    expect(idDot.title).toBe("Identity: moss");
  });

  it("hides both dots when flags are false (no title set)", () => {
    const slot = buildIndicatorSlot({ isClaudeReady: false, hasIdentity: false });
    const claudeDot = slot.querySelector(".indicator.claude-ready") as HTMLElement;
    const idDot = slot.querySelector(".indicator.identity") as HTMLElement;
    expect(claudeDot.classList.contains("hidden-placeholder")).toBe(true);
    expect(claudeDot.title).toBe("");
    expect(idDot.classList.contains("hidden-placeholder")).toBe(true);
    expect(idDot.title).toBe("");
  });

  it("uses 'yes' as identity title fallback when name missing", () => {
    const slot = buildIndicatorSlot({ isClaudeReady: false, hasIdentity: true });
    const idDot = slot.querySelector(".indicator.identity") as HTMLElement;
    expect(idDot.title).toBe("Identity: yes");
  });

  it("uses ◆ and ● characters for the two dots", () => {
    const slot = buildIndicatorSlot({ isClaudeReady: true, hasIdentity: true });
    expect(slot.querySelector(".indicator.claude-ready")?.textContent).toBe("\u25c6");
    expect(slot.querySelector(".indicator.identity")?.textContent).toBe("\u25cf");
  });
});

describe("buildKillButton", () => {
  it("wires onKill with stopPropagation when callback provided", () => {
    const onKill = vi.fn();
    const btn = buildKillButton(onKill);
    expect(btn.className).toBe("kill-btn");
    expect(btn.textContent).toBe("\u00d7");
    expect(btn.title).toBe("Kill session");
    const e = new MouseEvent("click", { bubbles: true });
    const stop = vi.spyOn(e, "stopPropagation");
    btn.onclick?.(e as unknown as PointerEvent);
    expect(stop).toHaveBeenCalled();
    expect(onKill).toHaveBeenCalled();
  });

  it("disables pointer events when onKill is omitted (column spacer)", () => {
    const btn = buildKillButton(null);
    expect(btn.style.pointerEvents).toBe("none");
    expect(btn.title).toBe("");
    expect(btn.onclick).toBeNull();
  });
});

// ===== createRowActions factory (Phase 6a) =====

function mkRowActions(overrides: any = {}) {
  const state: any = {
    aiPresets: [
      { name: "Claude", icon: "C", command: "claude" },
      { name: "Codex",  icon: "X", command: "codex" },
    ],
    aiDefaultIndex: 0,
    ...overrides.state,
  };
  const fetchFn = vi.fn(async () => new Response("{}"));
  const actions = {
    openFolder: vi.fn(),
    showQuickMessageInput: vi.fn(),
    showAiTagContextMenu: vi.fn(),
    ...overrides.actions,
  };
  const helpers = {
    getAiPresetForCommand: vi.fn((cmd: string) =>
      state.aiPresets.find((p: any) => p.command === cmd) || state.aiPresets[0]),
    getDefaultAiCommand: vi.fn(() => "claude"),
    ...overrides.helpers,
  };
  const ra = createRowActions({
    state,
    doc: document,
    env: { fetchFn: fetchFn as any },
    helpers,
    actions,
  });
  return { ra, state, actions, helpers, fetchFn };
}

describe("createRowActions - buildAiTag (live)", () => {
  it("renders the running command's preset icon and 'alive' className", () => {
    const { ra } = mkRowActions();
    const tag = ra._buildAiTag({ claudeAlive: true, claudeCommand: "codex", folderName: "x", workingDir: "/x" });
    expect(tag.textContent).toBe("X");
    expect(tag.className).toContain("alive");
    expect(tag.title).toContain("running");
  });

  it("click on alive tag calls showQuickMessageInput with folderName + tag anchor", () => {
    const { ra, actions } = mkRowActions();
    const tag = ra._buildAiTag({ claudeAlive: true, claudeCommand: "claude", folderName: "myfolder", workingDir: "/x" });
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    tag.onclick!(evt);
    expect(evt.stopPropagation).toHaveBeenCalled();
    expect(actions.showQuickMessageInput).toHaveBeenCalledWith("myfolder", tag);
  });
});

describe("createRowActions - buildAiTag (absent)", () => {
  it("uses state.aiPresets[state.aiDefaultIndex] when no claudeCommand", () => {
    const { ra, state } = mkRowActions();
    state.aiDefaultIndex = 1;  // mutate after factory creation to verify live read
    const tag = ra._buildAiTag({ claudeAlive: false, folderName: "x", workingDir: "/x" });
    expect(tag.textContent).toBe("X");
    expect(tag.className).toContain("absent");
    expect(tag.title).toContain("right-click");
  });

  it("click launches openFolder with getDefaultAiCommand result", () => {
    const { ra, actions, helpers } = mkRowActions();
    const tag = ra._buildAiTag({ claudeAlive: false, folderName: "x", workingDir: "/x" });
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    tag.onclick!(evt);
    expect(helpers.getDefaultAiCommand).toHaveBeenCalled();
    expect(actions.openFolder).toHaveBeenCalledWith("/x", "x", "claude");
  });

  it("right-click calls showAiTagContextMenu and preventDefault/stopPropagation", () => {
    const { ra, actions } = mkRowActions();
    const tag = ra._buildAiTag({ claudeAlive: false, folderName: "x", workingDir: "/x" });
    const evt: any = new Event("contextmenu");
    evt.preventDefault = vi.fn();
    evt.stopPropagation = vi.fn();
    tag.oncontextmenu!(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(evt.stopPropagation).toHaveBeenCalled();
    expect(actions.showAiTagContextMenu).toHaveBeenCalledWith(evt, "/x", "x");
  });

  it("does not attach oncontextmenu when alive", () => {
    const { ra } = mkRowActions();
    const tag = ra._buildAiTag({ claudeAlive: true, claudeCommand: "claude", folderName: "x", workingDir: "/x" });
    expect(tag.oncontextmenu).toBeNull();
  });
});

describe("createRowActions - buildPwshTag", () => {
  it("renders 'alive' className and no onclick when pwsh is running", () => {
    const { ra } = mkRowActions();
    const tag = ra._buildPwshTag({ pwshAlive: true, folderName: "x", workingDir: "/x" });
    expect(tag.className).toContain("alive");
    expect(tag.title).toContain("running");
    expect(tag.onclick).toBeNull();
  });

  it("absent click launches openFolder with 'pwsh' command", () => {
    const { ra, actions } = mkRowActions();
    const tag = ra._buildPwshTag({ pwshAlive: false, folderName: "x", workingDir: "/x" });
    expect(tag.className).toContain("absent");
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    tag.onclick!(evt);
    expect(actions.openFolder).toHaveBeenCalledWith("/x", "x", "pwsh");
  });
});

describe("createRowActions - buildVsCodeTag", () => {
  it("POSTs /api/open-editor via injected fetchFn with the working dir", () => {
    const { ra, fetchFn } = mkRowActions();
    const tag = ra._buildVsCodeTag("/foo/bar");
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    tag.onclick!(evt);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call: any = fetchFn.mock.calls[0];
    expect(call[0]).toBe("/api/open-editor");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ path: "/foo/bar" });
  });

  it("exits fullscreen first when document.fullscreenElement is set", () => {
    const { ra } = mkRowActions();
    const exitFs = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", { value: document.body, configurable: true });
    Object.defineProperty(document, "exitFullscreen", { value: exitFs, configurable: true });
    const tag = ra._buildVsCodeTag("/x");
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    tag.onclick!(evt);
    expect(exitFs).toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
  });
});

describe("createRowActions - appendRowActions", () => {
  it("appends 7 children in the documented order (identity, unread, AI, pwsh, code, indicator, kill)", () => {
    const { ra } = mkRowActions();
    const container = document.createElement("div");
    ra.appendRowActions(container, {
      identityName: "moss",
      unreadCount: 3,
      claudeAlive: true,
      claudeCommand: "claude",
      pwshAlive: false,
      workingDir: "/r",
      folderName: "r",
      isClaudeReady: true,
      hasIdentity: true,
      onKill: vi.fn(),
    });
    expect(container.children).toHaveLength(7);
    expect(container.children[0].className).toContain("identity-tag");
    expect(container.children[1].className).toContain("unread-badge");
    expect(container.children[2].className).toContain("cmd-tag");
    expect(container.children[3].className).toContain("pwsh");
    expect(container.children[4].className).toContain("code");
    expect(container.children[5].className).toContain("indicator");
    expect(container.children[6].className).toContain("kill-btn");
  });

  it("kill button wired to opts.onKill", () => {
    const { ra } = mkRowActions();
    const container = document.createElement("div");
    const onKill = vi.fn();
    ra.appendRowActions(container, {
      identityName: null, unreadCount: 0,
      claudeAlive: false, pwshAlive: false,
      workingDir: "/r", folderName: "r", onKill,
    });
    const killBtn = container.children[6] as HTMLButtonElement;
    const evt: any = new Event("click"); evt.stopPropagation = vi.fn();
    killBtn.onclick!(evt);
    expect(onKill).toHaveBeenCalled();
  });
});
