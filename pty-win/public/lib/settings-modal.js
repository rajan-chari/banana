// @ts-check
// Settings modal UI. Extracted from app.js (was the initSettingsModal
// IIFE). Schema-driven preferences editor: fetches schema + current
// values on open, renders rows by type, POSTs changes back.
//
// Pure helpers (isCustomSelectValue, the per-type buildXxxRow set,
// renderSettingsRow) are module-level exports for testability. The
// init wirer captures private form state in closure (formState,
// initialState, schema) -- same encapsulation pattern as initFeedPanel.

/**
 * @typedef {{type: "select"|"number"|"boolean"|"string", label?: string, description?: string, options?: string[], allowCustom?: boolean, customLabel?: string, min?: number, max?: number}} PrefDef
 */

/**
 * True if `value` is a custom (not in options) selection for an
 * allowCustom select. Pure.
 *
 * @param {any} value
 * @param {PrefDef} def
 * @returns {boolean}
 */
export function isCustomSelectValue(value, def) {
  if (def.type !== "select" || !def.allowCustom) return false;
  if (!value) return false;
  return !(def.options || []).includes(value);
}

/**
 * Append a label (+ optional description paragraph) to `row`. Returns
 * the label element so callers can reposition it (boolean rows insert
 * the checkbox before the label for CSS alignment).
 *
 * @param {HTMLElement} row
 * @param {string} key
 * @param {PrefDef} def
 * @returns {HTMLLabelElement}
 */
export function buildRowLabel(row, key, def) {
  const label = document.createElement("label");
  label.textContent = def.label || key;
  label.htmlFor = `pref-${key}`;
  row.appendChild(label);
  if (def.description) {
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = def.description;
    row.appendChild(desc);
  }
  return label;
}

/**
 * Build a <select> editor (+ optional "Custom…" path) and append it
 * to `row`. Wires onchange/oninput to call setValue with the new value.
 *
 * @param {HTMLElement} row
 * @param {string} key
 * @param {PrefDef} def
 * @param {any} current
 * @param {(value: any) => void} setValue
 */
export function buildSelectRow(row, key, def, current, setValue) {
  const sel = document.createElement("select");
  sel.id = `pref-${key}`;
  for (const opt of def.options || []) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  }
  const customValue = isCustomSelectValue(current, def);
  if (def.allowCustom) {
    const o = document.createElement("option");
    o.value = "__custom__";
    o.textContent = def.customLabel || "Custom…";
    sel.appendChild(o);
  }
  sel.value = customValue ? "__custom__" : (current || (def.options || [])[0] || "");
  row.appendChild(sel);

  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "custom-input";
  custom.placeholder = "Full path or command";
  custom.value = customValue ? current : "";
  custom.style.display = customValue ? "block" : "none";
  row.appendChild(custom);

  sel.onchange = () => {
    if (sel.value === "__custom__") {
      custom.style.display = "block";
      custom.focus();
      setValue(custom.value || "");
    } else {
      custom.style.display = "none";
      setValue(sel.value);
    }
  };
  custom.oninput = () => { setValue(custom.value); };
}

/**
 * @param {HTMLElement} row
 * @param {string} key
 * @param {PrefDef} def
 * @param {any} current
 * @param {(value: any) => void} setValue
 */
export function buildNumberRow(row, key, def, current, setValue) {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.id = `pref-${key}`;
  inp.value = current === "" ? "" : String(current);
  if (def.min != null) inp.min = String(def.min);
  if (def.max != null) inp.max = String(def.max);
  inp.oninput = () => { setValue(inp.value === "" ? "" : Number(inp.value)); };
  row.appendChild(inp);
}

/**
 * Build a checkbox editor. The label is inserted AFTER the checkbox
 * (CSS expects this order for `.boolean` rows).
 *
 * @param {HTMLElement} row
 * @param {string} key
 * @param {HTMLLabelElement} label - existing label element in `row`
 * @param {any} current
 * @param {(value: boolean) => void} setValue
 */
export function buildBooleanRow(row, key, label, current, setValue) {
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.id = `pref-${key}`;
  inp.checked = !!current;
  inp.onchange = () => { setValue(inp.checked); };
  row.insertBefore(inp, label);
  row.classList.add("boolean");
}

/**
 * @param {HTMLElement} row
 * @param {string} key
 * @param {any} current
 * @param {(value: string) => void} setValue
 */
export function buildStringRow(row, key, current, setValue) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.id = `pref-${key}`;
  inp.value = current ?? "";
  inp.oninput = () => { setValue(inp.value); };
  row.appendChild(inp);
}

/**
 * Build a single settings row (label + editor) for one pref key.
 * Dispatches to the per-type builder. `setValue` is invoked when the
 * user edits the value.
 *
 * @param {string} key
 * @param {PrefDef} def
 * @param {any} current
 * @param {(value: any) => void} setValue
 * @returns {HTMLDivElement}
 */
export function renderSettingsRow(key, def, current, setValue) {
  const row = document.createElement("div");
  row.className = `settings-row ${def.type}`;
  const label = buildRowLabel(row, key, def);

  if (def.type === "select") buildSelectRow(row, key, def, current, setValue);
  else if (def.type === "number") buildNumberRow(row, key, def, current, setValue);
  else if (def.type === "boolean") buildBooleanRow(row, key, label, current, setValue);
  else buildStringRow(row, key, current, setValue);

  return row;
}

/**
 * @typedef {object} SettingsModalDeps
 * @property {(id: string) => HTMLElement} byId
 * @property {(id: string) => HTMLButtonElement} buttonById
 * @property {{aiPresets?: Array<{command: string}>, aiDefaultIndex?: number}} state
 */

/**
 * Wire up the settings modal. Captures private state (formState,
 * initialState, schema) in closure. Init-pattern; same rationale as
 * initFeedPanel — splitting would force private mutables into module
 * scope.
 *
 * @param {SettingsModalDeps} deps
 */
export function initSettingsModal(deps) {
  const { byId, buttonById, state } = deps;
  const btn = byId("settings-btn");
  const modal = byId("settings-modal");
  const backdrop = byId("settings-modal-backdrop");
  const closeBtn = byId("settings-modal-close");
  const cancelBtn = byId("settings-modal-cancel");
  const saveBtn = buttonById("settings-modal-save");
  const body = byId("settings-modal-body");
  const status = byId("settings-modal-status");

  if (!btn || !modal || !body) return;

  /** @type {Record<string, any>} */
  let formState = {};
  /** @type {Record<string, any>} */
  let initialState = {};
  /** @type {Record<string, PrefDef>} */
  let schema = {};

  async function openModal() {
    setStatus("loading\u2026");
    saveBtn.disabled = true;
    show(true);

    try {
      const [schemaResp, prefsResp] = await Promise.all([
        fetch("/api/preferences/schema"),
        fetch("/api/preferences"),
      ]);
      if (!schemaResp.ok) throw new Error("schema fetch failed");
      const schemaPayload = await schemaResp.json();
      schema = schemaPayload.keys || {};

      const prefs = prefsResp.ok ? await prefsResp.json() : {};
      const file = prefs.file || {};
      initialState = {};
      for (const key of Object.keys(schema)) {
        initialState[key] = file[key] ?? prefs.cliPreference ?? "";
      }
      formState = { ...initialState };
      render();
      setStatus(prefs.source === "first-found" ? "Default detected from PATH (no preference saved yet)" : "");
      saveBtn.disabled = false;
    } catch (e) {
      setStatus(`Failed to load: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function closeModal() {
    show(false);
    body.innerHTML = "";
    setStatus("");
    formState = {};
    initialState = {};
  }

  /** @param {boolean} visible */
  function show(visible) {
    modal.classList.toggle("hidden", !visible);
  }

  /**
   * @param {string} msg
   * @param {string} [level]
   */
  function setStatus(msg, level) {
    status.textContent = msg || "";
    status.classList.remove("error", "ok");
    if (level === "error") status.classList.add("error");
    if (level === "ok") status.classList.add("ok");
  }

  function render() {
    body.innerHTML = "";
    for (const [key, def] of Object.entries(schema)) {
      const setValue = (/** @type {any} */ v) => { formState[key] = v; };
      body.appendChild(renderSettingsRow(key, def, formState[key] ?? "", setValue));
    }
  }

  async function save() {
    setStatus("saving\u2026");
    saveBtn.disabled = true;

    // For now, the only key the server-side POST endpoint accepts is
    // cliPreference. If we add more keys later, expand to POST each that
    // changed.
    const changed = Object.entries(formState).filter(([k, v]) => v !== initialState[k] && v !== "" && v != null);
    if (changed.length === 0) {
      setStatus("No changes", "ok");
      saveBtn.disabled = false;
      return;
    }

    try {
      for (const [key, value] of changed) {
        if (key !== "cliPreference") {
          console.warn(`[settings] unsupported key in POST: ${key}`);
          continue;
        }
        const resp = await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cliPreference: String(value), updatedBy: "pty-win-settings" }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${resp.status}`);
        }
      }
      // Update local AI default index to match the saved value.
      if (state.aiPresets) {
        const cli = formState["cliPreference"];
        const idx = state.aiPresets.findIndex((p) => p.command === cli);
        if (idx >= 0) {
          state.aiDefaultIndex = idx;
          localStorage.setItem("pty-win-ai-default", String(idx));
        }
      }
      setStatus("Saved", "ok");
      initialState = { ...formState };
      setTimeout(closeModal, 600);
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      saveBtn.disabled = false;
    }
  }

  btn.onclick = openModal;
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  backdrop.onclick = closeModal;
  saveBtn.onclick = save;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}
