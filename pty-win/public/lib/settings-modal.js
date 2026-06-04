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
 * Append an About section (version + commit + startedAt + platform + reload
 * button) to the given container. Fetches /api/config asynchronously and
 * fills in placeholder values once it resolves. Exposed at module scope so
 * the settings modal can stay under the eslint max-lines-per-function cap.
 *
 * @param {HTMLElement} container
 */
export function renderAboutSection(container) {
  const section = document.createElement("div");
  section.className = "settings-about-section";
  section.innerHTML = `
    <h3 class="settings-section-title">About</h3>
    <div class="settings-about-body">
      <div class="settings-about-row"><span class="lbl">pty-win</span><span class="val" id="about-version">\u2026</span></div>
      <div class="settings-about-row"><span class="lbl">Commit</span><span class="val" id="about-commit" title="Short SHA from the banana repo (github.com/rajan-chari/banana)">\u2026</span></div>
      <div class="settings-about-row"><span class="lbl">fellow-agents</span><span class="val" id="about-fellow" title="GitHub release tag of the fellow-agents distribution that built this pty-win.zip ('dev' if running outside a release context)">\u2026</span></div>
      <div class="settings-about-row"><span class="lbl">Started</span><span class="val" id="about-started">\u2026</span></div>
      <div class="settings-about-row"><span class="lbl">Platform</span><span class="val" id="about-platform">\u2026</span></div>
      <div class="settings-about-actions">
        <button id="about-copy" type="button">Copy</button>
        <button id="about-reload" type="button" title="Hard reload to pick up new frontend assets">Reload Page</button>
      </div>
    </div>`;
  container.appendChild(section);

  const fetcher = typeof fetch === "function" ? fetch.bind(globalThis) : null;
  if (fetcher) {
    fetcher("/api/config").then((r) => r.json()).then((cfg) => {
      const b = cfg.build || {};
      const ver = section.querySelector("#about-version");
      const com = section.querySelector("#about-commit");
      const fel = section.querySelector("#about-fellow");
      const sta = section.querySelector("#about-started");
      const pla = section.querySelector("#about-platform");
      if (ver) ver.textContent = b.version ? `v${b.version}` : "unknown";
      if (com) com.textContent = b.commit || "unknown";
      if (fel) fel.textContent = b.fellowAgentsRelease || "dev";
      if (sta) sta.textContent = b.startedAt ? new Date(b.startedAt).toLocaleString() : "unknown";
      if (pla) pla.textContent = `${cfg.platform || "?"} \u00b7 ${cfg.defaultShell || "?"}`;

      const copyBtn = /** @type {HTMLButtonElement | null} */ (section.querySelector("#about-copy"));
      if (copyBtn) {
        copyBtn.onclick = async () => {
          const txt = `pty-win v${b.version || "?"} (commit ${b.commit || "?"})\nfellow-agents ${b.fellowAgentsRelease || "dev"}\nstarted ${b.startedAt || "?"}\nplatform ${cfg.platform || "?"} (${cfg.defaultShell || "?"})`;
          try {
            await navigator.clipboard.writeText(txt);
            copyBtn.textContent = "Copied";
            setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
          } catch { alert(txt); }
        };
      }
    }).catch(() => {
      const ver = section.querySelector("#about-version");
      if (ver) ver.textContent = "(failed to load /api/config)";
    });
  }

  const reload = /** @type {HTMLButtonElement | null} */ (section.querySelector("#about-reload"));
  if (reload) reload.onclick = () => { location.reload(); };
}

/**
 * @typedef {object} SettingsModalDeps
 * @property {(id: string) => HTMLElement} byId
 * @property {(id: string) => HTMLButtonElement} buttonById
 * @property {{aiPresets?: Array<{command: string}>, aiDefaultIndex?: number}} state
 */

/**
 * Compute which form entries changed from their initial values AND are
 * non-empty. Treats empty string and null/undefined as "not present" — these
 * are not sent to the server, matching the historical behavior of save().
 * Pure: inputs are not mutated.
 *
 * @param {Record<string, any>} formState
 * @param {Record<string, any>} initialState
 * @returns {Array<[string, any]>}
 */
export function computeChangedPrefs(formState, initialState) {
  return Object.entries(formState).filter(
    ([k, v]) => v !== initialState[k] && v !== "" && v != null,
  );
}

/**
 * Build the initial form state from the current preferences file and CLI
 * fallback, keyed by the schema. Each entry resolves to:
 *   file[key] ?? prefs.cliPreference ?? ""
 * matching openModal's existing logic. Pure.
 *
 * @param {Record<string, PrefDef>} schema
 * @param {{file?: Record<string, any> | null, cliPreference?: any}} prefs
 * @returns {Record<string, any>}
 */
export function buildInitialFormState(schema, prefs) {
  /** @type {Record<string, any>} */
  const initial = {};
  const file = (prefs && prefs.file) || {};
  for (const key of Object.keys(schema)) {
    initial[key] = file[key] ?? prefs.cliPreference ?? "";
  }
  return initial;
}

/**
 * Locate the AI preset whose `command` matches `cliValue` and return its
 * index. Returns -1 when there's no match or no presets array. Pure.
 *
 * @param {ReadonlyArray<{command?: string}> | null | undefined} presets
 * @param {any} cliValue
 * @returns {number}
 */
export function findAiPresetIndexByCommand(presets, cliValue) {
  if (!Array.isArray(presets)) return -1;
  return presets.findIndex((p) => p && p.command === cliValue);
}

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
      initialState = buildInitialFormState(schema, prefs);
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
    renderAboutSection(body);
  }

  async function save() {
    setStatus("saving\u2026");
    saveBtn.disabled = true;

    const changed = computeChangedPrefs(formState, initialState);
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
      const idx = findAiPresetIndexByCommand(state.aiPresets, formState["cliPreference"]);
      if (idx >= 0) {
        state.aiDefaultIndex = idx;
        localStorage.setItem("pty-win-ai-default", String(idx));
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
