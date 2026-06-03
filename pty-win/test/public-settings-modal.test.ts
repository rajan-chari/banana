// @vitest-environment happy-dom
//
// Tests for lib/settings-modal.js extraction (was the initSettingsModal
// IIFE in app.js). Pure helpers (isCustomSelectValue, the per-type
// buildXxxRow set, renderSettingsRow) get focused coverage.
// initSettingsModal itself gets a smoke test verifying that wiring up
// against a stubbed DOM does not throw and registers the expected
// event listeners.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isCustomSelectValue,
  buildRowLabel,
  buildSelectRow,
  buildNumberRow,
  buildBooleanRow,
  buildStringRow,
  renderSettingsRow,
  initSettingsModal,
} from "../public/lib/settings-modal.js";

type AnyDef = {
  type: "select" | "number" | "boolean" | "string";
  [key: string]: unknown;
};

describe("isCustomSelectValue", () => {
  it("returns false for non-select def", () => {
    expect(isCustomSelectValue("foo", { type: "string" } as AnyDef)).toBe(false);
  });

  it("returns false when allowCustom is missing", () => {
    expect(isCustomSelectValue("foo", { type: "select", options: ["a", "b"] } as AnyDef)).toBe(false);
  });

  it("returns false for empty/null value even when allowCustom", () => {
    expect(isCustomSelectValue("", { type: "select", allowCustom: true, options: ["a"] } as AnyDef)).toBe(false);
    expect(isCustomSelectValue(null, { type: "select", allowCustom: true, options: ["a"] } as AnyDef)).toBe(false);
  });

  it("returns false when value IS one of the options", () => {
    expect(isCustomSelectValue("a", { type: "select", allowCustom: true, options: ["a", "b"] } as AnyDef)).toBe(false);
  });

  it("returns true when value is not in options (allowCustom)", () => {
    expect(isCustomSelectValue("z", { type: "select", allowCustom: true, options: ["a", "b"] } as AnyDef)).toBe(true);
  });

  it("returns true when options array is missing entirely", () => {
    expect(isCustomSelectValue("z", { type: "select", allowCustom: true } as AnyDef)).toBe(true);
  });
});

describe("buildRowLabel", () => {
  let row: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    row = document.createElement("div");
    document.body.appendChild(row);
  });

  it("uses def.label when present", () => {
    buildRowLabel(row, "myKey", { type: "string", label: "Pretty Name" } as AnyDef);
    const label = row.querySelector("label")!;
    expect(label.textContent).toBe("Pretty Name");
    expect(label.htmlFor).toBe("pref-myKey");
  });

  it("falls back to key when def.label is missing", () => {
    buildRowLabel(row, "myKey", { type: "string" } as AnyDef);
    expect(row.querySelector("label")!.textContent).toBe("myKey");
  });

  it("appends a description paragraph when def.description present", () => {
    buildRowLabel(row, "k", { type: "string", description: "Helpful text" } as AnyDef);
    const desc = row.querySelector("p.desc");
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toBe("Helpful text");
  });

  it("omits description paragraph when not in def", () => {
    buildRowLabel(row, "k", { type: "string" } as AnyDef);
    expect(row.querySelector("p.desc")).toBeNull();
  });

  it("returns the label element for caller reuse", () => {
    const returned = buildRowLabel(row, "k", { type: "string" } as AnyDef);
    expect(returned).toBe(row.querySelector("label"));
  });
});

describe("buildSelectRow", () => {
  let row: HTMLElement;
  let captured: unknown;
  const setValue = (v: unknown) => { captured = v; };

  beforeEach(() => {
    document.body.innerHTML = "";
    row = document.createElement("div");
    document.body.appendChild(row);
    captured = undefined;
  });

  it("populates one <option> per def.options entry", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["claude", "pi"] } as AnyDef, "claude", setValue);
    const sel = row.querySelector("select")!;
    const values = [...sel.options].map(o => o.value);
    expect(values).toEqual(["claude", "pi"]);
  });

  it("adds a __custom__ option when allowCustom is true", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a"], allowCustom: true } as AnyDef, "a", setValue);
    const sel = row.querySelector("select")!;
    const customOpt = [...sel.options].find(o => o.value === "__custom__");
    expect(customOpt).toBeDefined();
    expect(customOpt!.textContent).toBe("Custom\u2026");
  });

  it("uses def.customLabel when provided", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a"], allowCustom: true, customLabel: "Type your own" } as AnyDef, "a", setValue);
    const customOpt = [...row.querySelector("select")!.options].find(o => o.value === "__custom__");
    expect(customOpt!.textContent).toBe("Type your own");
  });

  it("selects __custom__ when current is not in options", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a"], allowCustom: true } as AnyDef, "wholly-custom", setValue);
    const sel = row.querySelector("select")!;
    expect(sel.value).toBe("__custom__");
  });

  it("shows + pre-fills the custom-input when current is a custom value", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a"], allowCustom: true } as AnyDef, "my-path", setValue);
    const custom = row.querySelector("input.custom-input") as HTMLInputElement;
    expect(custom.style.display).toBe("block");
    expect(custom.value).toBe("my-path");
  });

  it("hides the custom-input when current is a standard option", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a", "b"], allowCustom: true } as AnyDef, "a", setValue);
    const custom = row.querySelector("input.custom-input") as HTMLInputElement;
    expect(custom.style.display).toBe("none");
  });

  it("calls setValue when the select changes to a standard option", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a", "b"], allowCustom: true } as AnyDef, "a", setValue);
    const sel = row.querySelector("select") as HTMLSelectElement;
    sel.value = "b";
    sel.dispatchEvent(new Event("change"));
    expect(captured).toBe("b");
  });

  it("calls setValue when the custom input is typed into", () => {
    buildSelectRow(row, "cli", { type: "select", options: ["a"], allowCustom: true } as AnyDef, "a", setValue);
    const custom = row.querySelector("input.custom-input") as HTMLInputElement;
    custom.value = "new-path";
    custom.dispatchEvent(new Event("input"));
    expect(captured).toBe("new-path");
  });
});

describe("buildNumberRow", () => {
  let row: HTMLElement;
  let captured: unknown;
  const setValue = (v: unknown) => { captured = v; };

  beforeEach(() => {
    document.body.innerHTML = "";
    row = document.createElement("div");
    document.body.appendChild(row);
    captured = undefined;
  });

  it("renders <input type=number> with current value", () => {
    buildNumberRow(row, "n", { type: "number" } as AnyDef, 42, setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    expect(inp.type).toBe("number");
    expect(inp.value).toBe("42");
  });

  it("leaves value empty when current is the empty string", () => {
    buildNumberRow(row, "n", { type: "number" } as AnyDef, "", setValue);
    expect((row.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("applies min/max when present in def", () => {
    buildNumberRow(row, "n", { type: "number", min: 1, max: 99 } as AnyDef, 5, setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    expect(inp.min).toBe("1");
    expect(inp.max).toBe("99");
  });

  it("calls setValue with a Number on input", () => {
    buildNumberRow(row, "n", { type: "number" } as AnyDef, 0, setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    inp.value = "12";
    inp.dispatchEvent(new Event("input"));
    expect(captured).toBe(12);
  });

  it("calls setValue with empty string when input cleared", () => {
    buildNumberRow(row, "n", { type: "number" } as AnyDef, 5, setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    inp.value = "";
    inp.dispatchEvent(new Event("input"));
    expect(captured).toBe("");
  });
});

describe("buildBooleanRow", () => {
  let row: HTMLElement;
  let label: HTMLLabelElement;
  let captured: unknown;
  const setValue = (v: unknown) => { captured = v; };

  beforeEach(() => {
    document.body.innerHTML = "";
    row = document.createElement("div");
    label = document.createElement("label");
    row.appendChild(label);
    document.body.appendChild(row);
    captured = undefined;
  });

  it("creates a checkbox checked when current truthy", () => {
    buildBooleanRow(row, "b", label, true, setValue);
    const inp = row.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(inp.checked).toBe(true);
  });

  it("creates an unchecked checkbox when current falsy", () => {
    buildBooleanRow(row, "b", label, false, setValue);
    expect((row.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(false);
  });

  it("inserts the checkbox BEFORE the label in the row", () => {
    buildBooleanRow(row, "b", label, false, setValue);
    const first = row.firstElementChild!;
    expect(first.tagName).toBe("INPUT");
    expect((first as HTMLInputElement).type).toBe("checkbox");
  });

  it("adds the .boolean class to the row", () => {
    buildBooleanRow(row, "b", label, false, setValue);
    expect(row.classList.contains("boolean")).toBe(true);
  });

  it("calls setValue with the new checked state on change", () => {
    buildBooleanRow(row, "b", label, false, setValue);
    const inp = row.querySelector("input[type=checkbox]") as HTMLInputElement;
    inp.checked = true;
    inp.dispatchEvent(new Event("change"));
    expect(captured).toBe(true);
  });
});

describe("buildStringRow", () => {
  let row: HTMLElement;
  let captured: unknown;
  const setValue = (v: unknown) => { captured = v; };

  beforeEach(() => {
    document.body.innerHTML = "";
    row = document.createElement("div");
    document.body.appendChild(row);
    captured = undefined;
  });

  it("renders <input type=text> with current value", () => {
    buildStringRow(row, "s", "hello", setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    expect(inp.type).toBe("text");
    expect(inp.value).toBe("hello");
  });

  it("treats null/undefined current as empty", () => {
    buildStringRow(row, "s", null, setValue);
    expect((row.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("calls setValue on input", () => {
    buildStringRow(row, "s", "", setValue);
    const inp = row.querySelector("input") as HTMLInputElement;
    inp.value = "typed";
    inp.dispatchEvent(new Event("input"));
    expect(captured).toBe("typed");
  });
});

describe("renderSettingsRow (dispatch)", () => {
  it("returns a div with .settings-row + type class", () => {
    const row = renderSettingsRow("k", { type: "string" } as AnyDef, "", () => {});
    expect(row.tagName).toBe("DIV");
    expect(row.classList.contains("settings-row")).toBe(true);
    expect(row.classList.contains("string")).toBe(true);
  });

  it("dispatches to select builder for type=select", () => {
    const row = renderSettingsRow("k", { type: "select", options: ["a"] } as AnyDef, "a", () => {});
    expect(row.querySelector("select")).not.toBeNull();
  });

  it("dispatches to number builder for type=number", () => {
    const row = renderSettingsRow("k", { type: "number" } as AnyDef, 0, () => {});
    expect((row.querySelector("input") as HTMLInputElement).type).toBe("number");
  });

  it("dispatches to boolean builder for type=boolean", () => {
    const row = renderSettingsRow("k", { type: "boolean" } as AnyDef, false, () => {});
    expect(row.classList.contains("boolean")).toBe(true);
  });

  it("dispatches to string builder for unknown/string type", () => {
    const row = renderSettingsRow("k", { type: "string" } as AnyDef, "x", () => {});
    expect((row.querySelector("input") as HTMLInputElement).type).toBe("text");
  });
});

// --- initSettingsModal smoke test ---------------------------------

const MODAL_DOM_IDS = [
  "settings-modal", "settings-modal-backdrop", "settings-modal-close",
  "settings-modal-cancel", "settings-modal-body", "settings-modal-status",
];

function setupModalDom() {
  document.body.innerHTML = "";
  const btn = document.createElement("button");
  btn.id = "settings-btn";
  document.body.appendChild(btn);
  for (const id of MODAL_DOM_IDS) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  const save = document.createElement("button");
  save.id = "settings-modal-save";
  document.body.appendChild(save);
}

describe("initSettingsModal (smoke)", () => {
  beforeEach(() => {
    setupModalDom();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));
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
      buttonById: (id: string) => document.getElementById(id) as HTMLButtonElement,
      state: {},
    };
  }

  it("initializes without throwing", () => {
    expect(() => initSettingsModal(makeDeps())).not.toThrow();
  });

  it("registers onclick on the settings button", () => {
    initSettingsModal(makeDeps());
    const btn = document.getElementById("settings-btn") as HTMLButtonElement & { onclick: unknown };
    expect(typeof btn.onclick).toBe("function");
  });

  it("registers onclick on close, cancel, backdrop, save", () => {
    initSettingsModal(makeDeps());
    for (const id of ["settings-modal-close", "settings-modal-cancel", "settings-modal-backdrop", "settings-modal-save"]) {
      const el = document.getElementById(id) as HTMLElement & { onclick: unknown };
      expect(typeof el.onclick).toBe("function");
    }
  });

  it("returns early without wiring when required ids are missing", () => {
    document.body.innerHTML = "";
    // Only btn + save (settings-modal element missing)
    const btn = document.createElement("button");
    btn.id = "settings-btn";
    document.body.appendChild(btn);
    const save = document.createElement("button");
    save.id = "settings-modal-save";
    document.body.appendChild(save);
    // byId throws for missing -- so deps that hard-throw can't be used.
    // Use a soft byId for this test that returns null-cast-as-HTMLElement.
    const softDeps = {
      byId: (id: string) => document.getElementById(id) as unknown as HTMLElement,
      buttonById: (id: string) => document.getElementById(id) as HTMLButtonElement,
      state: {},
    };
    expect(() => initSettingsModal(softDeps)).not.toThrow();
    // btn.onclick should still be unset because the function returned early
    expect((btn as HTMLButtonElement & { onclick: unknown }).onclick).toBeNull();
  });
});

// --- initSettingsModal integration ---------------------------------
//
// Exercise the high-value flow: open → fetch schema + prefs → render
// rows → edit a value → save → POST to /api/preferences with the
// new value. Verifies the setValue closure path and the save loop
// stay wired correctly across the extraction boundary.

describe("initSettingsModal (integration: open + edit + save)", () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupModalDom();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function makeDeps(state: Record<string, unknown> = {}) {
    return {
      byId: (id: string) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Element #${id} not found`);
        return el as HTMLElement;
      },
      buttonById: (id: string) => document.getElementById(id) as HTMLButtonElement,
      state,
    };
  }

  function jsonResp(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("open fetches schema + prefs and renders a row per pref", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/preferences/schema") {
        return Promise.resolve(jsonResp({
          keys: {
            cliPreference: { type: "select", options: ["claude", "pi"], allowCustom: true, label: "AI CLI" },
          },
        }));
      }
      if (url === "/api/preferences") {
        return Promise.resolve(jsonResp({ file: { cliPreference: "claude" }, source: "file" }));
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    initSettingsModal(makeDeps());
    const btn = document.getElementById("settings-btn") as HTMLButtonElement;
    btn.click();
    // Wait for both fetches + the .then chain.
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    const body = document.getElementById("settings-modal-body")!;
    const row = body.querySelector(".settings-row.select");
    expect(row).not.toBeNull();
    expect(row!.querySelector("label")!.textContent).toBe("AI CLI");
    const sel = row!.querySelector("select") as HTMLSelectElement;
    expect(sel.value).toBe("claude");
  });

  it("save POSTs the edited cliPreference value and updates state.aiDefaultIndex", async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/preferences/schema") {
        return Promise.resolve(jsonResp({
          keys: { cliPreference: { type: "select", options: ["claude", "pi"], label: "AI CLI" } },
        }));
      }
      if (url === "/api/preferences" && (!opts || opts.method !== "POST")) {
        return Promise.resolve(jsonResp({ file: { cliPreference: "claude" }, source: "file" }));
      }
      if (url === "/api/preferences" && opts?.method === "POST") {
        return Promise.resolve(jsonResp({ ok: true }));
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    });

    const state = {
      aiPresets: [{ command: "claude" }, { command: "pi" }],
      aiDefaultIndex: 0,
    };
    initSettingsModal(makeDeps(state));
    (document.getElementById("settings-btn") as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    // Change selection to "pi"
    const sel = document.querySelector(".settings-row.select select") as HTMLSelectElement;
    sel.value = "pi";
    sel.dispatchEvent(new Event("change"));

    // Click save
    (document.getElementById("settings-modal-save") as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    // Assert: a POST went out with cliPreference="pi"
    const postCall = fetchMock.mock.calls.find(call =>
      call[0] === "/api/preferences" && (call[1] as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1].body as string);
    expect(body.cliPreference).toBe("pi");
    expect(body.updatedBy).toBe("pty-win-settings");

    // Assert: local AI default index updated
    expect(state.aiDefaultIndex).toBe(1);
    expect(localStorage.getItem("pty-win-ai-default")).toBe("1");
  });

  it("save skips POST when no fields changed and reports 'No changes'", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/preferences/schema") {
        return Promise.resolve(jsonResp({
          keys: { cliPreference: { type: "select", options: ["claude"], label: "AI CLI" } },
        }));
      }
      return Promise.resolve(jsonResp({ file: { cliPreference: "claude" }, source: "file" }));
    });

    initSettingsModal(makeDeps());
    (document.getElementById("settings-btn") as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    fetchMock.mockClear();
    (document.getElementById("settings-modal-save") as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 0));

    const postCalls = fetchMock.mock.calls.filter(call =>
      (call[1] as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(0);
    expect(document.getElementById("settings-modal-status")!.textContent).toBe("No changes");
  });
});
