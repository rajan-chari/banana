// @vitest-environment happy-dom
//
// Regression tests for the XSS hardening landed in 010fc8d / 41d4756
// and the lib/tracker-render.js extraction (a396a9a8 follow-up).
//
// These tests guard against future edits accidentally re-introducing
// raw `${item.X}` interpolation. We set the rendered HTML on a real
// DOM node and assert no <script> tag escapes into the document, plus
// that payload text round-trips as visible text content.

import { describe, it, expect, vi } from "vitest";
import {
  renderTrackerItemHtml,
  renderTrackerHistoryEntries,
  severityClass,
  githubOrgRepo,
  patchTrackerItem,
  renderTrackerEmpty,
  removeTrackerEmpty,
  removeStaleTrackerItems,
  removeEmptyTrackerGroups,
  removeAllTrackerGroups,
  renderFlatTrackerItems,
  ensureTrackerGroup,
  renderTrackerGroupItems,
  renderGroupedTrackerItems,
} from "../public/lib/tracker-render.js";

const XSS = "<script>alert(1)</script>";
const ATTR_XSS = '" onerror="alert(1)';

function mount(html: string): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const baseItem = {
  id: "abc",
  repo: "banana",
  number: 7,
  title: "ok",
  status: "new",
  severity: "normal",
  assigned_to: "moss",
  opened_by: "frost",
  responders: ["forge"],
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-04T00:00:00.000Z",
};

describe("githubOrgRepo", () => {
  it("prefixes unscoped repo with 'microsoft/'", () => {
    expect(githubOrgRepo("teams.net")).toBe("microsoft/teams.net");
    expect(githubOrgRepo("fellow-agents")).toBe("microsoft/fellow-agents");
  });
  it("returns already-qualified repo unchanged", () => {
    expect(githubOrgRepo("microsoft/teams-cli")).toBe("microsoft/teams-cli");
    expect(githubOrgRepo("rajan-chari/banana")).toBe("rajan-chari/banana");
  });
  it("returns empty string for missing input", () => {
    expect(githubOrgRepo("")).toBe("");
    expect(githubOrgRepo(null)).toBe("");
    expect(githubOrgRepo(undefined)).toBe("");
  });
});

describe("renderTrackerItemHtml — GitHub href construction", () => {
  it("builds a correct href for unscoped repo names", () => {
    const el = mount(renderTrackerItemHtml({ ...baseItem, repo: "teams.net", number: 519 }, 1));
    const a = el.querySelector("a.tracker-gh-link") as HTMLAnchorElement | null;
    expect(a?.getAttribute("href")).toBe("https://github.com/microsoft/teams.net/issues/519");
  });
  it("does not double-prefix already-scoped repo names (closes 75bbe69b)", () => {
    const el = mount(renderTrackerItemHtml({ ...baseItem, repo: "microsoft/teams-cli", number: 2843 }, 1));
    const a = el.querySelector("a.tracker-gh-link") as HTMLAnchorElement | null;
    expect(a?.getAttribute("href")).toBe("https://github.com/microsoft/teams-cli/issues/2843");
  });
  it("supports non-microsoft orgs in scoped repo names", () => {
    const el = mount(renderTrackerItemHtml({ ...baseItem, repo: "rajan-chari/banana", number: 1 }, 1));
    const a = el.querySelector("a.tracker-gh-link") as HTMLAnchorElement | null;
    expect(a?.getAttribute("href")).toBe("https://github.com/rajan-chari/banana/issues/1");
  });
});

describe("severityClass", () => {
  it("returns sev-critical / sev-high / sev-low for known values", () => {
    expect(severityClass("critical")).toBe("sev-critical");
    expect(severityClass("high")).toBe("sev-high");
    expect(severityClass("low")).toBe("sev-low");
  });
  it("returns sev-normal for normal/missing/unknown", () => {
    expect(severityClass("normal")).toBe("sev-normal");
    expect(severityClass(null)).toBe("sev-normal");
    expect(severityClass(undefined)).toBe("sev-normal");
    expect(severityClass("nonsense")).toBe("sev-normal");
  });
});

describe("renderTrackerItemHtml — basic shape", () => {
  it("produces a row + detail section with the expected class names", () => {
    const html = renderTrackerItemHtml(baseItem, 1);
    const el = mount(html);
    expect(el.querySelector(".tracker-item-row")).not.toBeNull();
    expect(el.querySelector(".tracker-item-detail")).not.toBeNull();
    expect(el.querySelector(".tracker-row-num")?.textContent).toBe("1");
    expect(el.querySelector(".tracker-ref-repo")?.textContent).toBe("banana");
    expect(el.querySelector(".tracker-ref-num")?.textContent).toBe("#7");
  });
  it("omits the GitHub link when item.number is missing", () => {
    const html = renderTrackerItemHtml({ ...baseItem, number: undefined }, 1);
    const el = mount(html);
    expect(el.querySelector("a.tracker-gh-link")).toBeNull();
    expect(el.querySelector(".tracker-ref-num")).toBeNull();
  });
  it("includes the closed badge for closed/merged/deferred only", () => {
    const open = mount(renderTrackerItemHtml({ ...baseItem, status: "new" }, 1));
    expect(open.querySelector(".tracker-closed-badge")).toBeNull();
    const closed = mount(renderTrackerItemHtml({ ...baseItem, status: "closed" }, 1));
    expect(closed.querySelector(".tracker-closed-badge")?.textContent).toBe("closed");
  });
});

describe("renderTrackerItemHtml — XSS hardening", () => {
  const fields = [
    "title",
    "github_author",
    "github_last_commenter",
    "blocker",
    "findings",
    "decision",
    "decision_rationale",
    "notes",
    "opened_by",
    "assigned_to",
  ];
  for (const field of fields) {
    it(`escapes script-tag payload in item.${field}`, () => {
      const item = { ...baseItem, [field]: XSS };
      const el = mount(renderTrackerItemHtml(item, 1));
      expect(el.querySelectorAll("script").length).toBe(0);
      expect(el.textContent).toContain(XSS);
    });
  }

  it("escapes script-tag payload in item.created_by (fallback for opened-by line)", () => {
    // created_by only appears when opened_by AND github_author are absent
    const item = { ...baseItem, opened_by: "", github_author: "", created_by: XSS };
    const el = mount(renderTrackerItemHtml(item, 1));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.textContent).toContain(XSS);
  });

  it("escapes script-tag payload in item.repo", () => {
    const item = { ...baseItem, repo: XSS };
    const el = mount(renderTrackerItemHtml(item, 1));
    expect(el.querySelectorAll("script").length).toBe(0);
    // Repo appears in both the ref + the detail link text
    expect(el.querySelector(".tracker-ref-repo")?.textContent).toBe(XSS);
  });

  it("escapes script-tag payload in item.labels[]", () => {
    const item = { ...baseItem, labels: ["safe", XSS, "also-safe"] };
    const el = mount(renderTrackerItemHtml(item, 1));
    expect(el.querySelectorAll("script").length).toBe(0);
    const labelTexts = Array.from(el.querySelectorAll(".tracker-label")).map(n => n.textContent);
    expect(labelTexts).toEqual(["safe", XSS, "also-safe"]);
  });

  it("escapes script-tag payload in item.responders[]", () => {
    const item = { ...baseItem, responders: ["a", XSS, "b"] };
    const el = mount(renderTrackerItemHtml(item, 1));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.querySelector(".tracker-responders")?.textContent).toContain(XSS);
  });

  it("neutralizes attribute-context injection in item.status (CSS class)", () => {
    // status feeds badge-${status} CSS class. " onerror=" attempt
    // would otherwise break out of the class attribute.
    const item = { ...baseItem, status: "closed" };
    // Use a payload that would visibly break attr context if unescaped
    const evilStatus = `closed${ATTR_XSS}`;
    const el = mount(renderTrackerItemHtml({ ...item, status: evilStatus }, 1));
    expect(el.querySelectorAll("[onerror]").length).toBe(0);
  });

  it("does not allow item.repo to break out of the GitHub href", () => {
    const el = mount(renderTrackerItemHtml({ ...baseItem, repo: ATTR_XSS }, 1));
    const a = el.querySelector("a.tracker-gh-link") as HTMLAnchorElement | null;
    expect(a).not.toBeNull();
    // href stays on github.com
    expect(a!.getAttribute("href")?.startsWith("https://github.com/microsoft/")).toBe(true);
    // No injected attribute
    expect(a!.hasAttribute("onerror")).toBe(false);
  });

  it("does not produce any onerror/onclick attributes from any field", () => {
    const item = {
      ...baseItem,
      title: ATTR_XSS,
      notes: ATTR_XSS,
      labels: [ATTR_XSS],
      assigned_to: ATTR_XSS,
    };
    const el = mount(renderTrackerItemHtml(item, 1));
    expect(el.querySelectorAll("[onerror]").length).toBe(0);
    expect(el.querySelectorAll("[onclick]").length).toBe(0);
  });
});

describe("renderTrackerHistoryEntries", () => {
  it("returns empty string for empty / missing history", () => {
    expect(renderTrackerHistoryEntries([])).toBe("");
    // @ts-expect-error testing non-array input
    expect(renderTrackerHistoryEntries(null)).toBe("");
  });

  it("renders one entry per history record", () => {
    const html = renderTrackerHistoryEntries([
      { field: "status", new_value: "triaged", changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
      { field: "status", new_value: "closed", changed_at: "2026-06-02T00:00:00Z", changed_by: "moss" },
    ]);
    const el = mount(html);
    expect(el.querySelectorAll(".tracker-timeline-entry").length).toBe(2);
  });

  it("escapes script-tag payload in h.new_value (status field)", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: "status", new_value: XSS, changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
    ]));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.textContent).toContain(XSS);
  });

  it("escapes script-tag payload in h.comment", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: "status", new_value: "triaged", comment: XSS, changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
    ]));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.querySelector(".tl-comment")?.textContent).toBe(XSS);
  });

  it("escapes script-tag payload in h.changed_by", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: "status", new_value: "triaged", changed_at: "2026-06-01T00:00:00Z", changed_by: XSS },
    ]));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.querySelector(".tracker-timeline-who")?.textContent).toBe(`[${XSS}]`);
  });

  it("escapes script-tag payload in h.field (unknown field branch)", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: XSS, new_value: "x", changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
    ]));
    expect(el.querySelectorAll("script").length).toBe(0);
    expect(el.textContent).toContain(XSS);
  });

  it("emits 'blocker cleared' when h.new_value is empty for blocker field", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: "blocker", new_value: "", changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
    ]));
    expect(el.textContent).toContain("blocker cleared");
  });

  it("emits 'assigned -> unassigned' when h.new_value is empty for assigned_to field", () => {
    const el = mount(renderTrackerHistoryEntries([
      { field: "assigned_to", new_value: "", changed_at: "2026-06-01T00:00:00Z", changed_by: "moss" },
    ]));
    expect(el.textContent).toContain("unassigned");
  });
});


describe("patchTrackerItem", () => {
  // Build a row from renderTrackerItemHtml so we have the real DOM
  // structure (.tracker-item-title, .tracker-severity, etc.), then
  // patch it with a different item and assert the visible fields
  // change accordingly.
  function buildRow(item: typeof baseItem): HTMLElement {
    const wrap = document.createElement("div");
    wrap.innerHTML = renderTrackerItemHtml(item, 1);
    // renderTrackerItemHtml returns a <div class="tracker-item"...> root.
    return wrap.firstElementChild as HTMLElement;
  }

  it("updates the title text without rebuilding the row", () => {
    const row = buildRow(baseItem);
    const titleEl = row.querySelector(".tracker-item-title");
    patchTrackerItem(row, { ...baseItem, title: "new title" });
    expect(titleEl?.textContent).toBe("new title");
    // Same element instance: not a re-render.
    expect(row.querySelector(".tracker-item-title")).toBe(titleEl);
  });

  it("updates the assignee with @ prefix and clears when empty", () => {
    const row = buildRow(baseItem);
    patchTrackerItem(row, { ...baseItem, assigned_to: "newperson" });
    expect(row.querySelector(".tracker-assignee")?.textContent).toBe("@newperson");
    patchTrackerItem(row, { ...baseItem, assigned_to: undefined });
    expect(row.querySelector(".tracker-assignee")?.textContent).toBe("");
  });

  it("updates severity text + class consistent with renderTrackerItemHtml", () => {
    const row = buildRow(baseItem);
    patchTrackerItem(row, { ...baseItem, severity: "critical" });
    const sev = row.querySelector(".tracker-severity");
    expect(sev?.textContent).toBe("critical");
    expect(sev?.className).toBe("tracker-severity sev-critical");
  });

  it("maps severity=low to sev-low (matches renderTrackerItemHtml)", () => {
    // Regression: prior inline ternary in app.js mapped low -> sev-normal,
    // diverging from the render path. Extraction to severityClass fixes this.
    const row = buildRow({ ...baseItem, severity: "high" });
    patchTrackerItem(row, { ...baseItem, severity: "low" });
    expect(row.querySelector(".tracker-severity")?.className).toBe("tracker-severity sev-low");
  });

  it("renders '-' for missing last_github_activity", () => {
    const row = buildRow(baseItem);
    patchTrackerItem(row, { ...baseItem, last_github_activity: undefined });
    expect(row.querySelector(".tracker-activity")?.textContent).toBe("-");
  });

  it("toggles tracker-item-done class based on status", () => {
    const row = buildRow(baseItem);
    patchTrackerItem(row, { ...baseItem, status: "closed" });
    expect(row.classList.contains("tracker-item-done")).toBe(true);
    patchTrackerItem(row, { ...baseItem, status: "in-progress" });
    expect(row.classList.contains("tracker-item-done")).toBe(false);
  });

  it("joins responders with comma-space, clears when empty array", () => {
    const row = buildRow(baseItem);
    patchTrackerItem(row, { ...baseItem, responders: ["a", "b", "c"] });
    expect(row.querySelector(".tracker-responders")?.textContent).toBe("a, b, c");
    patchTrackerItem(row, { ...baseItem, responders: [] });
    expect(row.querySelector(".tracker-responders")?.textContent).toBe("");
  });
});


// ===== Round 20 body-render helpers =====

function mkItem(overrides: any = {}) {
  return { ...baseItem, ...overrides };
}

describe("renderTrackerEmpty / removeTrackerEmpty", () => {
  it("renderTrackerEmpty sets the placeholder", () => {
    const body = document.createElement("div");
    renderTrackerEmpty(body);
    expect(body.querySelector(".tracker-empty")?.textContent).toBe("// NO OPEN ITEMS");
  });
  it("removeTrackerEmpty removes it if present", () => {
    const body = document.createElement("div");
    body.innerHTML = `<div class="tracker-empty">// NO OPEN ITEMS</div>`;
    removeTrackerEmpty(body);
    expect(body.querySelector(".tracker-empty")).toBeNull();
  });
  it("removeTrackerEmpty no-ops if absent", () => {
    const body = document.createElement("div");
    expect(() => removeTrackerEmpty(body)).not.toThrow();
  });
});

describe("removeStaleTrackerItems", () => {
  it("removes rows whose id is not in the current set", () => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="tracker-item" data-id="a"></div>
      <div class="tracker-item" data-id="b"></div>
      <div class="tracker-item" data-id="c"></div>
    `;
    removeStaleTrackerItems(body, new Set(["a", "c"]));
    expect(body.querySelectorAll(".tracker-item").length).toBe(2);
    expect(body.querySelector(`[data-id="b"]`)).toBeNull();
  });
  it("removes items missing data-id", () => {
    const body = document.createElement("div");
    body.innerHTML = `<div class="tracker-item" data-id=""></div>`;
    removeStaleTrackerItems(body, new Set(["a"]));
    expect(body.querySelector(".tracker-item")).toBeNull();
  });
});

describe("removeEmptyTrackerGroups / removeAllTrackerGroups", () => {
  it("removeEmptyTrackerGroups keeps non-empty groups", () => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="tracker-group" data-status="x"></div>
      <div class="tracker-group" data-status="y"><div class="tracker-item"></div></div>
    `;
    removeEmptyTrackerGroups(body);
    expect(body.querySelectorAll(".tracker-group").length).toBe(1);
    expect(body.querySelector(`[data-status="y"]`)).not.toBeNull();
  });
  it("removeAllTrackerGroups removes every group", () => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="tracker-group"></div>
      <div class="tracker-group"><div class="tracker-item"></div></div>
    `;
    removeAllTrackerGroups(body);
    expect(body.querySelectorAll(".tracker-group").length).toBe(0);
  });
});

describe("renderFlatTrackerItems", () => {
  it("appends new items via buildItem", () => {
    const body = document.createElement("div");
    const buildItem = vi.fn((i: any) => {
      const el = document.createElement("div");
      el.className = "tracker-item";
      el.dataset["id"] = i.id;
      return el;
    });
    const patchItem = vi.fn();
    renderFlatTrackerItems(body, [mkItem({ id: "a" }), mkItem({ id: "b" })], { buildItem, patchItem });
    expect(buildItem).toHaveBeenCalledTimes(2);
    expect(patchItem).not.toHaveBeenCalled();
    expect(body.querySelectorAll(".tracker-item").length).toBe(2);
  });
  it("re-uses existing items via patchItem and re-appends for sort order", () => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="tracker-item" data-id="a">A</div>
      <div class="tracker-item" data-id="b">B</div>
    `;
    const buildItem = vi.fn();
    const patchItem = vi.fn();
    // request order [b, a] -> expect b to be moved before a
    renderFlatTrackerItems(body, [mkItem({ id: "b" }), mkItem({ id: "a" })], { buildItem, patchItem });
    expect(buildItem).not.toHaveBeenCalled();
    expect(patchItem).toHaveBeenCalledTimes(2);
    const ids = [...body.querySelectorAll(".tracker-item")].map((el) => (el as HTMLElement).dataset["id"]);
    expect(ids).toEqual(["b", "a"]);
  });
});

describe("ensureTrackerGroup", () => {
  it("builds a new group with the count badge", () => {
    const body = document.createElement("div");
    const g = ensureTrackerGroup(body, "decision-pending", 3);
    expect(g.classList.contains("tracker-group")).toBe(true);
    expect(g.dataset["status"]).toBe("decision-pending");
    expect(g.querySelector(".tracker-group-count")?.textContent).toBe("(3)");
    expect(g.querySelector(".tracker-group-name")?.textContent).toBe("decision pending");
  });
  it("returns existing group and updates count", () => {
    const body = document.createElement("div");
    const first = ensureTrackerGroup(body, "monitoring", 1);
    const second = ensureTrackerGroup(body, "monitoring", 7);
    expect(second).toBe(first);
    expect(body.querySelectorAll(".tracker-group").length).toBe(1);
    expect(second.querySelector(".tracker-group-count")?.textContent).toBe("(7)");
  });
  it("escapes status name in display (defense in depth)", () => {
    const body = document.createElement("div");
    const g = ensureTrackerGroup(body, "<svg>", 1);
    // textContent recovers the literal characters; no element injected
    expect(g.querySelector(".tracker-group-name")?.textContent).toBe("<svg>");
    expect(g.querySelector("svg")).toBeNull();
  });
});

describe("renderTrackerGroupItems", () => {
  it("builds new and patches existing items", () => {
    const groupEl = document.createElement("div");
    groupEl.innerHTML = `<div class="tracker-item" data-id="a"></div>`;
    const buildItem = vi.fn((i: any) => {
      const el = document.createElement("div");
      el.className = "tracker-item";
      el.dataset["id"] = i.id;
      return el;
    });
    const patchItem = vi.fn();
    const items = [mkItem({ id: "a", status: "x" }), mkItem({ id: "b", status: "x" })];
    const newItemMap = new Map(items.map((i) => [i.id, i]));
    renderTrackerGroupItems(groupEl, items, "x", newItemMap, { buildItem, patchItem });
    expect(buildItem).toHaveBeenCalledWith(items[1]);
    expect(patchItem).toHaveBeenCalledTimes(1);
    expect(groupEl.querySelectorAll(".tracker-item").length).toBe(2);
  });
  it("removes items whose status changed", () => {
    const groupEl = document.createElement("div");
    groupEl.innerHTML = `
      <div class="tracker-item" data-id="a"></div>
      <div class="tracker-item" data-id="b"></div>
    `;
    const buildItem = vi.fn();
    const patchItem = vi.fn();
    // Only 'a' stays in this group ("x"); 'b' moved to "y" (different status)
    const items = [mkItem({ id: "a", status: "x" })];
    const newItemMap = new Map([
      ["a", mkItem({ id: "a", status: "x" })],
      ["b", mkItem({ id: "b", status: "y" })],
    ]);
    renderTrackerGroupItems(groupEl, items, "x", newItemMap, { buildItem, patchItem });
    expect(groupEl.querySelector(`[data-id="b"]`)).toBeNull();
    expect(groupEl.querySelector(`[data-id="a"]`)).not.toBeNull();
  });
});

describe("renderGroupedTrackerItems", () => {
  it("removes empty groups for statuses with no items", () => {
    const body = document.createElement("div");
    body.innerHTML = `<div class="tracker-group" data-status="testing"></div>`;
    const buildItem = vi.fn();
    const patchItem = vi.fn();
    renderGroupedTrackerItems(body, [], ["testing"], new Map(), { buildItem, patchItem });
    expect(body.querySelector(`[data-status="testing"]`)).toBeNull();
  });
  it("creates groups in given order and populates them", () => {
    const body = document.createElement("div");
    const items = [
      mkItem({ id: "a", status: "first" }),
      mkItem({ id: "b", status: "second" }),
      mkItem({ id: "c", status: "first" }),
    ];
    const newItemMap = new Map(items.map((i) => [i.id, i]));
    const buildItem = vi.fn((i: any) => {
      const el = document.createElement("div");
      el.className = "tracker-item";
      el.dataset["id"] = i.id;
      return el;
    });
    const patchItem = vi.fn();
    renderGroupedTrackerItems(body, items, ["first", "second"], newItemMap, { buildItem, patchItem });
    const groups = body.querySelectorAll(".tracker-group");
    expect(groups.length).toBe(2);
    expect((groups[0] as HTMLElement).dataset["status"]).toBe("first");
    expect((groups[1] as HTMLElement).dataset["status"]).toBe("second");
    expect(groups[0].querySelectorAll(".tracker-item").length).toBe(2);
    expect(groups[1].querySelectorAll(".tracker-item").length).toBe(1);
  });
});
