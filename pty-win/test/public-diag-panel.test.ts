// Diag-panel helpers (Round 27 of lint extraction).
//
// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import {
  computeDiagTotalCost,
  isDiagRowHot,
  removeStaleDiagRows,
  findDiagRow,
  upsertDiagRow,
  upsertDiagTotalRow,
  DIAG_HOT_CBS_THRESHOLD,
} from "../public/lib/diag-panel.js";

type SessionInfo = { status?: string; costUsd?: number; lastActiveMs?: number };

function makeTbody(): HTMLTableSectionElement {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  return tbody;
}

describe("computeDiagTotalCost", () => {
  it("returns 0 for empty input", () => {
    expect(computeDiagTotalCost([])).toBe(0);
  });

  it("sums costUsd across sessions", () => {
    const sessions: Array<[string, SessionInfo]> = [
      ["a", { costUsd: 1.25 }],
      ["b", { costUsd: 2.5 }],
      ["c", { costUsd: 0 }],
    ];
    expect(computeDiagTotalCost(sessions)).toBeCloseTo(3.75);
  });

  it("treats undefined and non-numeric costUsd as 0", () => {
    const sessions: Array<[string, SessionInfo]> = [
      ["a", {}],
      ["b", { costUsd: NaN as any }],
      ["c", { costUsd: 1.5 }],
    ];
    expect(computeDiagTotalCost(sessions)).toBe(1.5);
  });
});

describe("isDiagRowHot", () => {
  it("returns false when stats are missing", () => {
    expect(isDiagRowHot(undefined)).toBe(false);
  });

  it(`returns true above threshold (${DIAG_HOT_CBS_THRESHOLD})`, () => {
    expect(isDiagRowHot({ busy: { callbacksPerSec: DIAG_HOT_CBS_THRESHOLD + 1, bytesPerSec: 0 } })).toBe(true);
  });

  it("returns false at threshold (strict gt)", () => {
    expect(isDiagRowHot({ busy: { callbacksPerSec: DIAG_HOT_CBS_THRESHOLD, bytesPerSec: 0 } })).toBe(false);
  });
});

describe("removeStaleDiagRows", () => {
  it("removes rows whose session is not in currentNames", () => {
    const tbody = makeTbody();
    for (const name of ["a", "b", "c"]) {
      const tr = document.createElement("tr");
      tr.className = "diag-row";
      tr.dataset["session"] = name;
      tbody.appendChild(tr);
    }
    removeStaleDiagRows(tbody, new Set(["a", "c"]));
    const remaining = [...tbody.querySelectorAll(".diag-row")].map(
      r => (r as HTMLElement).dataset["session"]
    );
    expect(remaining).toEqual(["a", "c"]);
  });

  it("removes rows with missing data-session", () => {
    const tbody = makeTbody();
    const tr = document.createElement("tr");
    tr.className = "diag-row";
    tbody.appendChild(tr);
    removeStaleDiagRows(tbody, new Set(["a"]));
    expect(tbody.querySelectorAll(".diag-row").length).toBe(0);
  });
});

describe("findDiagRow", () => {
  it("returns row matching name", () => {
    const tbody = makeTbody();
    const tr = document.createElement("tr");
    tr.className = "diag-row";
    tr.dataset["session"] = "alice";
    tbody.appendChild(tr);
    expect(findDiagRow(tbody, "alice")).toBe(tr);
  });

  it("returns null on no match", () => {
    expect(findDiagRow(makeTbody(), "x")).toBeNull();
  });

  it("handles names with special selector characters", () => {
    const tbody = makeTbody();
    const tr = document.createElement("tr");
    tr.className = "diag-row";
    tr.dataset["session"] = 'name"with[chars]';
    tbody.appendChild(tr);
    expect(findDiagRow(tbody, 'name"with[chars]')).toBe(tr);
  });
});

describe("upsertDiagRow", () => {
  const deps = {
    onFocusSession: () => {},
    fmtAgo: (ms: number | undefined) => `${ms ?? 0}ms`,
  };

  it("creates a new row populated with cells", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "alice", { status: "idle", costUsd: 0.5, lastActiveMs: 200 },
      { busy: { callbacksPerSec: 5, bytesPerSec: 1024 } }, deps);
    const row = findDiagRow(tbody, "alice")!;
    expect(row.children[0].textContent).toBe("alice");
    expect(row.children[1].textContent).toBe("idle");
    expect(row.children[2].textContent).toBe("200ms");
    expect(row.children[3].textContent).toBe("5");
    expect(row.children[4].textContent).toBe("1.0");
    expect(row.children[5].textContent).toBe("$0.50");
  });

  it("attaches onclick that fires onFocusSession with name", () => {
    const tbody = makeTbody();
    const spy = vi.fn();
    upsertDiagRow(tbody, "alice", { status: "idle" }, undefined, {
      onFocusSession: spy,
      fmtAgo: () => "",
    });
    findDiagRow(tbody, "alice")?.click();
    expect(spy).toHaveBeenCalledWith("alice");
  });

  it("inserts new row above total row when present", () => {
    const tbody = makeTbody();
    const total = document.createElement("tr");
    total.className = "diag-cost-total";
    tbody.appendChild(total);
    upsertDiagRow(tbody, "alice", { status: "idle" }, undefined, deps);
    const rows = [...tbody.children];
    expect(rows.indexOf(findDiagRow(tbody, "alice")!)).toBeLessThan(rows.indexOf(total));
  });

  it("flags hot row when cb/s > threshold", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "alice", { status: "busy" },
      { busy: { callbacksPerSec: DIAG_HOT_CBS_THRESHOLD + 1, bytesPerSec: 0 } }, deps);
    const row = findDiagRow(tbody, "alice")!;
    expect(row.classList.contains("diag-hot")).toBe(true);
    expect((row.children[3] as HTMLElement).className).toBe("diag-hot-val");
  });

  it("clears hot class when stats drop below threshold", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "alice", { status: "busy" },
      { busy: { callbacksPerSec: 200, bytesPerSec: 0 } }, deps);
    upsertDiagRow(tbody, "alice", { status: "busy" },
      { busy: { callbacksPerSec: 5, bytesPerSec: 0 } }, deps);
    const row = findDiagRow(tbody, "alice")!;
    expect(row.classList.contains("diag-hot")).toBe(false);
    expect((row.children[3] as HTMLElement).className).toBe("");
  });

  it("patches existing row in place", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "alice", { status: "idle", costUsd: 1 }, undefined, deps);
    const before = findDiagRow(tbody, "alice");
    upsertDiagRow(tbody, "alice", { status: "busy", costUsd: 2.5 },
      { busy: { callbacksPerSec: 3, bytesPerSec: 2048 } }, deps);
    const after = findDiagRow(tbody, "alice");
    expect(after).toBe(before);
    expect(after?.children[1].textContent).toBe("busy");
    expect(after?.children[3].textContent).toBe("3");
    expect(after?.children[4].textContent).toBe("2.0");
    expect(after?.children[5].textContent).toBe("$2.50");
  });

  it("does not rewrite cell text when value unchanged", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "a", { status: "idle", costUsd: 0, lastActiveMs: 0 }, undefined, deps);
    const cell = findDiagRow(tbody, "a")!.children[0] as HTMLElement;
    const originalNode = cell.firstChild;
    upsertDiagRow(tbody, "a", { status: "idle", costUsd: 0, lastActiveMs: 0 }, undefined, deps);
    expect(cell.firstChild).toBe(originalNode);
  });

  it("renders 0 cb/s and 0.0 KB/s when stats missing", () => {
    const tbody = makeTbody();
    upsertDiagRow(tbody, "alice", { status: "idle" }, undefined, deps);
    const row = findDiagRow(tbody, "alice")!;
    expect(row.children[3].textContent).toBe("0");
    expect(row.children[4].textContent).toBe("0.0");
  });
});

describe("upsertDiagTotalRow", () => {
  it("creates total row when totalCost > 0 and none exists", () => {
    const tbody = makeTbody();
    upsertDiagTotalRow(tbody, 7.5);
    const total = tbody.querySelector(".diag-cost-total");
    expect(total).not.toBeNull();
    expect(total?.querySelector(".diag-cost")?.textContent).toBe("$7.50");
  });

  it("patches existing total row", () => {
    const tbody = makeTbody();
    upsertDiagTotalRow(tbody, 1);
    const before = tbody.querySelector(".diag-cost-total");
    upsertDiagTotalRow(tbody, 2.25);
    expect(tbody.querySelector(".diag-cost-total")).toBe(before);
    expect(tbody.querySelector(".diag-cost")?.textContent).toBe("$2.25");
  });

  it("removes total row when totalCost = 0", () => {
    const tbody = makeTbody();
    upsertDiagTotalRow(tbody, 1);
    upsertDiagTotalRow(tbody, 0);
    expect(tbody.querySelector(".diag-cost-total")).toBeNull();
  });

  it("is a no-op when totalCost = 0 and no row exists", () => {
    const tbody = makeTbody();
    upsertDiagTotalRow(tbody, 0);
    expect(tbody.querySelector(".diag-cost-total")).toBeNull();
  });
});
