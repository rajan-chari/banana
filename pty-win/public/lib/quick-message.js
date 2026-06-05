// @ts-check
//
// Quick-message popup (Phase 7b).
//
// Owns showQuickMessageInput — the "→ sessionName" popup attached to a
// row action button that lets the user type a one-shot message and POST
// it to /api/sessions/:name/quick-message.
//
// Hardening over the original inline version:
//  - Single cleanup path: dismiss() removes the popup AND the
//    outside-click mousedown listener (the original only removed the
//    listener when an outside-click actually fired; Escape, successful
//    send, and second show() all leaked).
//  - The deferred setTimeout that registers the outside-click listener
//    now guards against an already-dismissed popup before installing.
//  - All side-effects (doc, fetch, setTimeout, windowRef) are injected
//    so tests can shim them.

/**
 * @typedef {{
 *   doc: Document,
 *   byId: (id: string) => HTMLElement | null,
 *   env: {
 *     fetchFn: typeof fetch,
 *     setTimeout: (cb: () => void, ms: number) => any,
 *     windowRef: { innerWidth: number },
 *   },
 * }} QuickMessageDeps
 */

/**
 * @param {QuickMessageDeps} deps
 */
export function createQuickMessage(deps) {
  const { doc, byId, env } = deps;
  const fetcher = env.fetchFn || fetch.bind(window);

  /**
   * @param {string} sessionName
   * @param {HTMLElement} anchorEl
   */
  function show(sessionName, anchorEl) {
    byId("quick-msg-popup")?.remove();

    const popup = doc.createElement("div");
    popup.id = "quick-msg-popup";
    popup.className = "quick-msg-popup";

    const title = doc.createElement("div");
    title.className = "quick-msg-title";
    title.textContent = `→ ${sessionName}`;
    popup.appendChild(title);

    const row = doc.createElement("div");
    row.className = "quick-msg-row";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "quick-msg-input";
    input.placeholder = "Type a message…";

    const sendBtn = doc.createElement("button");
    sendBtn.className = "quick-msg-send";
    sendBtn.textContent = "Send";

    row.appendChild(input);
    row.appendChild(sendBtn);
    popup.appendChild(row);
    doc.body.appendChild(popup);

    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${Math.min(rect.left, env.windowRef.innerWidth - 260)}px`;
    popup.style.top = `${rect.bottom + 4}px`;

    input.focus();

    let active = true;
    /** @type {((ev: Event) => void) | null} */
    let outsideHandler = null;

    const dismiss = () => {
      if (!active) return;
      active = false;
      popup.remove();
      if (outsideHandler) doc.removeEventListener("mousedown", outsideHandler);
    };

    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      input.disabled = true;
      fetcher(`/api/sessions/${encodeURIComponent(sessionName)}/quick-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          if (data.ok) {
            title.textContent = "sent ✓";
            title.style.color = "#4ec94e";
            env.setTimeout(dismiss, 1200);
          } else {
            title.textContent = `error: ${data.error || "failed"}`;
            title.style.color = "#ff6060";
            sendBtn.disabled = false;
            input.disabled = false;
            input.focus();
          }
        })
        .catch(/** @param {any} err */ (err) => {
          if (!active) return;
          title.textContent = `error: ${err.message}`;
          title.style.color = "#ff6060";
          sendBtn.disabled = false;
          input.disabled = false;
          input.focus();
        });
    };

    sendBtn.onclick = send;
    input.onkeydown = /** @param {KeyboardEvent} e */ (e) => {
      if (e.key === "Enter") send();
      if (e.key === "Escape") dismiss();
    };

    outsideHandler = /** @param {Event} ev */ (ev) => {
      const e = /** @type {MouseEvent} */ (ev);
      const t = e.target instanceof Node ? e.target : null;
      if (!popup.contains(t)) dismiss();
    };
    env.setTimeout(() => {
      if (active && popup.isConnected && outsideHandler) {
        doc.addEventListener("mousedown", outsideHandler);
      }
    }, 0);
  }

  return { show };
}
