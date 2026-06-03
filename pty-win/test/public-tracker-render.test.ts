// @vitest-environment happy-dom
//
// Regression tests for the XSS hardening landed in 010fc8d / 41d4756
// and the lib/tracker-render.js extraction (a396a9a8 follow-up).
//
// These tests guard against future edits accidentally re-introducing
// raw `${item.X}` interpolation. We set the rendered HTML on a real
// DOM node and assert no <script> tag escapes into the document, plus
// that payload text round-trips as visible text content.

import { describe, it, expect } from "vitest";
import {
  renderTrackerItemHtml,
  renderTrackerHistoryEntries,
  severityClass,
  githubOrgRepo,
  patchTrackerItem,
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
