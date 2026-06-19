// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTraceSummary, showTraceCaptureModal, traceFetchErrorMessage } from "../public/lib/trace-capture.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function trace(rawIncluded = false) {
  return {
    traceVersion: 1,
    capturedAt: "2026-06-16T13:00:00.000Z",
    session: {
      name: "a",
      command: "copilot",
      workingDir: "C:\\repo",
      status: "idle",
      unreadCount: 2,
      pendingMessages: true,
      inputBoxDirty: false,
      pollerActive: true,
    },
    privacy: { rawIncluded },
    histories: { injections: [{ type: "emcom" }], stateEvents: [], detection: [] },
    server: { build: { version: "0.2.0", commit: "abc123", fellowAgentsRelease: "dev" } },
    user: { note: "enter failed" },
    ...(rawIncluded ? { rawTerminal: { maxBytes: 1024, tail: "secret" } } : {}),
  };
}

describe("buildTraceSummary", () => {
  it("summarizes key trace fields without dumping raw terminal content", () => {
    const summary = buildTraceSummary(trace(true));

    expect(summary).toContain("session: a");
    expect(summary).toContain("unreadCount: 2");
    expect(summary).toContain("rawIncluded: true");
    expect(summary).not.toContain("secret");
  });

  describe("traceFetchErrorMessage", () => {
    it("turns 404 into wrong-port/build guidance with session and URL", () => {
      const msg = traceFetchErrorMessage(404, "coder", "http://127.0.0.1:3658/");

      expect(msg).toContain("Trace endpoint missing");
      expect(msg).toContain("build >= daf196b");
      expect(msg).toContain("http://127.0.0.1:3658/");
      expect(msg).toContain("coder");
    });

    it("turns session-not-found 404 into missing-pane guidance", () => {
      const msg = traceFetchErrorMessage(404, "coder", "http://127.0.0.1:3658/", "session not found");

      expect(msg).toContain("Trace session not found");
      expect(msg).toContain("Open or focus a live pane");
      expect(msg).toContain("coder");
    });
  });
});

describe("showTraceCaptureModal", () => {
  it("fetches a redacted preview first, then raw only after explicit opt-in", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trace(false)) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trace(true)) });

    showTraceCaptureModal({ sessionName: "a", doc: document, fetchFn: fetchFn as any });
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledWith("/api/debug/sessions/a/trace", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"includeRaw":false'),
    }));
    expect(document.querySelector(".trace-preview")?.textContent).toContain("rawIncluded: false");

    (document.querySelector(".trace-include-raw") as HTMLInputElement).checked = true;
    (document.querySelector(".trace-refresh") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenLastCalledWith("/api/debug/sessions/a/trace", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"includeRaw":true'),
    }));
    expect(document.querySelector(".trace-preview")?.textContent).toContain("rawIncluded: true");
  });

  it("copies only the summary and does not upload anywhere", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(trace(false)) });
    const writeText = vi.fn().mockResolvedValue(undefined);

    showTraceCaptureModal({
      sessionName: "a",
      doc: document,
      fetchFn: fetchFn as any,
      navigator: { clipboard: { writeText } },
    });
    await new Promise((r) => setTimeout(r, 0));
    (document.querySelector(".trace-copy") as HTMLElement).click();
    (document.querySelector(".trace-download") as HTMLElement).click();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("session: a"));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/debug/sessions/a/trace");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/debug/sessions/a/trace");
  });

  it("refreshes with the current note before downloading JSON", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trace(false)) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        ...trace(false),
        user: { note: "typed after preview" },
      }) });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    showTraceCaptureModal({ sessionName: "a", doc: document, fetchFn: fetchFn as any });
    await new Promise((r) => setTimeout(r, 0));

    (document.querySelector(".trace-note") as HTMLTextAreaElement).value = "typed after preview";
    (document.querySelector(".trace-download") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith("/api/debug/sessions/a/trace", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"note":"typed after preview"'),
    }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does not download a stale trace if the pre-download refresh fails", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trace(false)) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    showTraceCaptureModal({ sessionName: "a", doc: document, fetchFn: fetchFn as any });
    await new Promise((r) => setTimeout(r, 0));

    (document.querySelector(".trace-note") as HTMLTextAreaElement).value = "new note";
    (document.querySelector(".trace-download") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(clicked).not.toHaveBeenCalled();
    expect(document.querySelector(".trace-status")?.textContent).toContain("Trace unavailable");
  });

  it("shows actionable guidance when the trace endpoint is missing", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    showTraceCaptureModal({
      sessionName: "coder",
      doc: document,
      fetchFn: fetchFn as any,
      location: { href: "http://127.0.0.1:3658/" },
    });
    await new Promise((r) => setTimeout(r, 0));

    const status = document.querySelector(".trace-status")?.textContent || "";
    expect(status).toContain("Trace endpoint missing");
    expect(status).toContain("coder");
    expect(status).toContain("127.0.0.1:3658");
  });

  it("shows missing-session guidance when the server reports session not found", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      clone: () => ({ json: () => Promise.resolve({ error: "session not found" }) }),
      text: () => Promise.resolve(""),
    });

    showTraceCaptureModal({
      sessionName: "coder",
      doc: document,
      fetchFn: fetchFn as any,
      location: { href: "http://127.0.0.1:3658/" },
    });
    await new Promise((r) => setTimeout(r, 0));

    const status = document.querySelector(".trace-status")?.textContent || "";
    expect(status).toContain("Trace session not found");
    expect(status).toContain("Open or focus a live pane");
  });
});
