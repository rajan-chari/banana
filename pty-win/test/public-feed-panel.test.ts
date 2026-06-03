// @vitest-environment happy-dom
//
// Tests for the lib/feed-panel.js extraction (was the initFeedPanel
// IIFE in app.js). Pure helpers (getSenderColor, fmtFeedTime) get
// focused coverage. initFeedPanel itself gets a smoke test verifying
// that wiring up against a stubbed DOM does not throw and registers
// the expected event listeners.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SENDER_PALETTE,
  getSenderColor,
  fmtFeedTime,
  initFeedPanel,
  sortEmailsByDate,
  filterEmails,
  buildThreadGroups,
  countUnread,
  populateSenderOptions,
  buildFeedItemClassName,
  buildFeedItemInnerHtml,
} from "../public/lib/feed-panel.js";

describe("getSenderColor", () => {
  it("returns a color from SENDER_PALETTE", () => {
    expect(SENDER_PALETTE).toContain(getSenderColor("moss"));
    expect(SENDER_PALETTE).toContain(getSenderColor("forge"));
    expect(SENDER_PALETTE).toContain(getSenderColor(""));
  });

  it("is deterministic -- same name always returns same color", () => {
    const c1 = getSenderColor("rajan");
    const c2 = getSenderColor("rajan");
    expect(c1).toBe(c2);
  });

  it("distributes across the palette for varied input", () => {
    const colors = new Set();
    const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    for (const n of names) colors.add(getSenderColor(n));
    // 16 distinct names should hit at least 4 different colors with a
    // 12-color palette + the hash function -- guard against a constant
    // regression (everyone-gets-the-same-color bug).
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });
});

describe("fmtFeedTime", () => {
  it("formats an ISO timestamp as MM/DD HH:MM", () => {
    const result = fmtFeedTime("2026-06-01T09:05:00");
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("zero-pads single-digit values", () => {
    // Local-time construction to avoid TZ-dependent flake.
    const d = new Date(2026, 0, 5, 7, 3); // Jan 5, 7:03
    const result = fmtFeedTime(d.toISOString());
    expect(result).toBe("01/05 07:03");
  });
});

// --- Pure helpers extracted from renderFeed ----------------------

function mkEmail(over: Partial<{
  id: string;
  sender: string;
  subject: string;
  body: string;
  thread_id: string;
  to: string[];
  tags: string[];
  created_at: string;
}> = {}) {
  return {
    id: over.id ?? "id1",
    sender: over.sender ?? "alice",
    subject: over.subject ?? "hi",
    body: over.body ?? "body",
    thread_id: over.thread_id ?? "t1",
    to: over.to ?? [],
    tags: over.tags ?? [],
    created_at: over.created_at ?? "2026-06-01T10:00:00",
  };
}

describe("sortEmailsByDate", () => {
  it("sorts newest first when flag is true", () => {
    const e1 = mkEmail({ id: "1", created_at: "2026-06-01T10:00:00" });
    const e2 = mkEmail({ id: "2", created_at: "2026-06-02T10:00:00" });
    const e3 = mkEmail({ id: "3", created_at: "2026-05-30T10:00:00" });
    const result = sortEmailsByDate([e1, e2, e3], true);
    expect(result.map(e => e.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts oldest first when flag is false", () => {
    const e1 = mkEmail({ id: "1", created_at: "2026-06-01T10:00:00" });
    const e2 = mkEmail({ id: "2", created_at: "2026-06-02T10:00:00" });
    const e3 = mkEmail({ id: "3", created_at: "2026-05-30T10:00:00" });
    const result = sortEmailsByDate([e1, e2, e3], false);
    expect(result.map(e => e.id)).toEqual(["3", "1", "2"]);
  });

  it("returns the same array reference (sorts in place)", () => {
    const arr = [mkEmail()];
    expect(sortEmailsByDate(arr, true)).toBe(arr);
  });
});

describe("filterEmails", () => {
  const emails = [
    mkEmail({ id: "1", sender: "alice", subject: "hello world", body: "lorem" }),
    mkEmail({ id: "2", sender: "bob",   subject: "test",        body: "ipsum hello" }),
    mkEmail({ id: "3", sender: "alice", subject: "other",       body: "dolor" }),
  ];

  it("returns all emails when no filters set", () => {
    expect(filterEmails(emails, "", "").map(e => e.id)).toEqual(["1", "2", "3"]);
  });

  it("filters by exact sender match", () => {
    expect(filterEmails(emails, "alice", "").map(e => e.id)).toEqual(["1", "3"]);
  });

  it("filters by lowercase substring across subject/body/sender", () => {
    // "hello" appears in #1 subject and #2 body
    expect(filterEmails(emails, "", "hello").map(e => e.id)).toEqual(["1", "2"]);
  });

  it("matches sender substring too", () => {
    expect(filterEmails(emails, "", "bob").map(e => e.id)).toEqual(["2"]);
  });

  it("combines sender + text filters (AND)", () => {
    expect(filterEmails(emails, "alice", "hello").map(e => e.id)).toEqual(["1"]);
  });

  it("does not mutate the input array", () => {
    const before = emails.map(e => e.id);
    filterEmails(emails, "alice", "hello");
    expect(emails.map(e => e.id)).toEqual(before);
  });
});

describe("buildThreadGroups", () => {
  it("groups by thread_id with the first occurrence as root", () => {
    const e1 = mkEmail({ id: "1", thread_id: "tA" });
    const e2 = mkEmail({ id: "2", thread_id: "tA" });
    const e3 = mkEmail({ id: "3", thread_id: "tB" });
    const result = buildThreadGroups([e1, e2, e3]);
    expect(result).toHaveLength(2);
    expect(result[0]?.root.id).toBe("1");
    expect(result[0]?.replies.map(r => r.id)).toEqual(["2"]);
    expect(result[1]?.root.id).toBe("3");
    expect(result[1]?.replies).toEqual([]);
  });

  it("preserves the order of thread roots from the input", () => {
    const e1 = mkEmail({ id: "1", thread_id: "tA" });
    const e2 = mkEmail({ id: "2", thread_id: "tB" });
    const e3 = mkEmail({ id: "3", thread_id: "tA" });
    const result = buildThreadGroups([e1, e2, e3]);
    // tA first (because id=1 came first), then tB
    expect(result.map(r => r.root.id)).toEqual(["1", "2"]);
    expect(result[0]?.replies.map(r => r.id)).toEqual(["3"]);
  });

  it("handles empty input", () => {
    expect(buildThreadGroups([])).toEqual([]);
  });
});

describe("countUnread", () => {
  it("counts emails tagged unread", () => {
    const emails = [
      mkEmail({ tags: ["unread"] }),
      mkEmail({ tags: [] }),
      mkEmail({ tags: ["read", "unread"] }),
      mkEmail({ tags: ["read"] }),
    ];
    expect(countUnread(emails)).toBe(2);
  });

  it("returns 0 when none unread", () => {
    expect(countUnread([mkEmail({ tags: [] })])).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(countUnread([])).toBe(0);
  });
});

describe("populateSenderOptions", () => {
  let select: HTMLSelectElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    select = document.createElement("select");
    document.body.appendChild(select);
  });

  it("populates one option per unique sender, sorted, with 'all' first", () => {
    const emails = [
      mkEmail({ sender: "charlie" }),
      mkEmail({ sender: "alice" }),
      mkEmail({ sender: "bob" }),
      mkEmail({ sender: "alice" }), // duplicate
    ];
    populateSenderOptions(select, emails, "");
    const values = [...select.options].map(o => o.value);
    expect(values).toEqual(["", "alice", "bob", "charlie"]);
  });

  it("preserves prior selection if still present", () => {
    const emails = [mkEmail({ sender: "alice" }), mkEmail({ sender: "bob" })];
    populateSenderOptions(select, emails, "bob");
    expect(select.value).toBe("bob");
  });

  it("falls back to 'all' if prior selection is no longer present", () => {
    const emails = [mkEmail({ sender: "alice" })];
    populateSenderOptions(select, emails, "ghost");
    expect(select.value).toBe("");
  });

  it("replaces existing options on each call", () => {
    const before = [mkEmail({ sender: "alice" })];
    const after = [mkEmail({ sender: "bob" })];
    populateSenderOptions(select, before, "");
    populateSenderOptions(select, after, "");
    const values = [...select.options].map(o => o.value);
    expect(values).toEqual(["", "bob"]);
  });
});

describe("buildFeedItemClassName", () => {
  it("returns just 'feed-item' when all flags false", () => {
    expect(buildFeedItemClassName({ isReply: false, isUnread: false, isExpanded: false, isNew: false }))
      .toBe("feed-item");
  });

  it("adds 'feed-reply' for replies", () => {
    expect(buildFeedItemClassName({ isReply: true, isUnread: false, isExpanded: false, isNew: false }))
      .toBe("feed-item feed-reply");
  });

  it("combines all flags in stable order", () => {
    expect(buildFeedItemClassName({ isReply: true, isUnread: true, isExpanded: true, isNew: true }))
      .toBe("feed-item feed-reply unread expanded feed-new");
  });
});

describe("buildFeedItemInnerHtml", () => {
  const idEsc = (s: string) => s; // pass-through escaper for assertion clarity
  const idTime = (_: string) => "06/01 10:00";

  it("includes subject for root items", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({ subject: "the subject" }),
      { isReply: false, replyCount: 0, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).toContain("feed-subject");
    expect(html).toContain("the subject");
  });

  it("omits subject block for replies", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({ subject: "irrelevant" }),
      { isReply: true, replyCount: 0, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).not.toContain("feed-subject");
    expect(html).not.toContain("irrelevant");
  });

  it("includes thread-count badge when replyCount > 0 on root", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({}),
      { isReply: false, replyCount: 3, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).toContain("feed-thread-count");
    expect(html).toContain("[4]"); // replyCount + 1
  });

  it("renders unread dot when email is tagged unread", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({ tags: ["unread"] }),
      { isReply: false, replyCount: 0, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).toContain("feed-unread-dot");
  });

  it("renders recipient arrow when 'to' is non-empty", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({ to: ["bob", "carol"] }),
      { isReply: false, replyCount: 0, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).toContain("feed-arrow");
    expect(html).toContain("bob, carol");
  });

  it("truncates preview to 100 chars", () => {
    const longBody = "x".repeat(250);
    const html = buildFeedItemInnerHtml(
      mkEmail({ body: longBody }),
      { isReply: false, replyCount: 0, color: "#fff", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    // preview is the 100-char prefix; full body is in feed-body-text
    const previewMatch = html.match(/<div class="feed-preview">(.*?)<\/div>/);
    expect(previewMatch?.[1]).toHaveLength(100);
  });

  it("applies the sender color inline", () => {
    const html = buildFeedItemInnerHtml(
      mkEmail({}),
      { isReply: false, replyCount: 0, color: "#abcdef", escapeHtmlFn: idEsc, fmtTimeFn: idTime },
    );
    expect(html).toContain("color:#abcdef");
  });
});

// --- initFeedPanel smoke test ------------------------------------
//
// Build a minimal DOM with the elements the panel queries by id,
// stub fetch + setInterval, then call initFeedPanel. The success
// criterion is "doesn't throw and registers listeners on the
// resize/collapse/expand controls."

const FEED_DOM_IDS = [
  "feed-panel", "feed-strip", "feed-body",
  "feed-collapse-btn", "feed-expand-btn", "feed-title",
  "feed-unread-badge", "feed-strip-badge", "feed-identity-badge",
  "feed-expand-all", "feed-collapse-all",
  "feed-resize-handle",
];

const FEED_INPUT_IDS = ["feed-search"];
const FEED_SELECT_IDS = ["feed-sender-filter"];
const FEED_BUTTON_IDS = ["feed-sort-btn", "feed-threads-btn"];

function setupFeedDom() {
  document.body.innerHTML = "";
  for (const id of FEED_DOM_IDS) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_INPUT_IDS) {
    const el = document.createElement("input");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_SELECT_IDS) {
    const el = document.createElement("select");
    el.id = id;
    document.body.appendChild(el);
  }
  for (const id of FEED_BUTTON_IDS) {
    const el = document.createElement("button");
    el.id = id;
    document.body.appendChild(el);
  }
}

describe("initFeedPanel (smoke)", () => {
  beforeEach(() => {
    setupFeedDom();
    // Stub fetch -- panel issues a fetch on init when identity is set.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
    // Stub setInterval to avoid leaking timers between tests.
    vi.stubGlobal("setInterval", vi.fn(() => 0));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function makeDeps() {
    return {
      byId: (id: string) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Element #${id} not found`);
        return el as HTMLElement;
      },
      inputById: (id: string) => document.getElementById(id) as HTMLInputElement,
      selectById: (id: string) => document.getElementById(id) as HTMLSelectElement,
      state: {
        terminals: new Map<string, unknown>(),
        workspaces: [],
        activeWorkspaceId: null,
      },
      fitAllTerminals: () => {},
    };
  }

  it("initializes without throwing when no identity is set", () => {
    expect(() => initFeedPanel(makeDeps())).not.toThrow();
  });

  it("registers an onclick handler on the collapse button", () => {
    initFeedPanel(makeDeps());
    const collapseBtn = document.getElementById("feed-collapse-btn") as HTMLElement & { onclick: unknown };
    expect(typeof collapseBtn.onclick).toBe("function");
  });

  it("registers an onclick handler on the expand button", () => {
    initFeedPanel(makeDeps());
    const expandBtn = document.getElementById("feed-expand-btn") as HTMLElement & { onclick: unknown };
    expect(typeof expandBtn.onclick).toBe("function");
  });

  it("starts the poll loop via setInterval", () => {
    const setIntervalSpy = vi.fn((_fn: () => void, _ms: number) => 0);
    vi.stubGlobal("setInterval", setIntervalSpy);
    initFeedPanel(makeDeps());
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy.mock.calls[0]?.[1]).toBe(10_000); // FEED_POLL_MS
  });

  it("restores saved feed width from localStorage", () => {
    localStorage.setItem("pty-win-feed-width", "320");
    initFeedPanel(makeDeps());
    const panel = document.getElementById("feed-panel") as HTMLElement;
    expect(panel.style.width).toBe("320px");
  });

  it("opens by default but respects saved collapsed state", () => {
    localStorage.setItem("pty-win-feed-open", "false");
    initFeedPanel(makeDeps());
    const panel = document.getElementById("feed-panel") as HTMLElement;
    const strip = document.getElementById("feed-strip") as HTMLElement;
    expect(panel.classList.contains("hidden")).toBe(true);
    expect(strip.classList.contains("hidden")).toBe(false);
  });
});
