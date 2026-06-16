// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTraceSummary, showTraceCaptureModal } from "../public/lib/trace-capture.js";

beforeEach(() => {
  document.body.innerHTML = "";
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
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/debug/sessions/a/trace");
  });
});
