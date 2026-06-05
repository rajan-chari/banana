// @vitest-environment happy-dom
//
// Tests for public/lib/quick-message.js — createQuickMessage factory
// (Phase 7b). The popup is anchored to a row action button and POSTs a
// short message to /api/sessions/:name/quick-message.
//
// Key behaviors verified here go beyond the original inline parity:
//  - Single cleanup path: dismiss() removes BOTH popup and outside-click
//    listener regardless of trigger (Escape, send success, second show).
//  - Deferred outside-click listener does NOT install if popup was
//    already dismissed before the setTimeout fires.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuickMessage } from "../public/lib/quick-message.js";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void };
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mkAnchor(rect = { left: 100, bottom: 200, right: 150, top: 180, width: 50, height: 20 }) {
  const a = document.createElement("button");
  a.textContent = "→";
  document.body.appendChild(a);
  Object.defineProperty(a, "getBoundingClientRect", {
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }),
    configurable: true,
  });
  return a;
}

function mkFactory(overrides: any = {}) {
  document.body.innerHTML = "";
  const fetchFn = overrides.fetchFn || vi.fn(async () => ({ json: async () => ({ ok: true }) }));
  const setTimeoutSpy =
    overrides.setTimeout ||
    vi.fn((cb: () => void, _ms: number) => {
      return globalThis.setTimeout(cb, 0);
    });
  const windowRef = overrides.windowRef || { innerWidth: 1024 };
  const factory = createQuickMessage({
    doc: document,
    byId: (id: string) => document.getElementById(id),
    env: { fetchFn, setTimeout: setTimeoutSpy, windowRef },
  });
  return { factory, fetchFn, setTimeoutSpy, windowRef };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createQuickMessage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("creates popup with title, input, and send button", () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    const popup = document.getElementById("quick-msg-popup");
    expect(popup).toBeTruthy();
    expect(popup!.querySelector(".quick-msg-title")!.textContent).toBe("→ alpha");
    expect(popup!.querySelector("input.quick-msg-input")).toBeTruthy();
    const btn = popup!.querySelector("button.quick-msg-send")!;
    expect(btn.textContent).toBe("Send");
  });

  it("positions popup below anchor using getBoundingClientRect, clamped to window width", () => {
    const { factory } = mkFactory({ windowRef: { innerWidth: 1024 } });
    factory.show("alpha", mkAnchor({ left: 100, bottom: 200, right: 150, top: 180, width: 50, height: 20 }));
    const popup = document.getElementById("quick-msg-popup") as HTMLElement;
    expect(popup.style.left).toBe("100px");
    expect(popup.style.top).toBe("204px");
  });

  it("clamps left position to (windowRef.innerWidth - 260) when anchor is near right edge", () => {
    const { factory } = mkFactory({ windowRef: { innerWidth: 500 } });
    factory.show("alpha", mkAnchor({ left: 400, bottom: 200, right: 500, top: 180, width: 100, height: 20 }));
    const popup = document.getElementById("quick-msg-popup") as HTMLElement;
    expect(popup.style.left).toBe("240px");
  });

  it("focuses input on open", () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it("empty input → Send button is a no-op (no fetch)", () => {
    const { factory, fetchFn } = mkFactory();
    factory.show("alpha", mkAnchor());
    const btn = document.querySelector(".quick-msg-send") as HTMLButtonElement;
    btn.click();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Send POSTs to /api/sessions/:name/quick-message with JSON body", async () => {
    const { factory, fetchFn } = mkFactory();
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "hello world";
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call: any = (fetchFn as any).mock.calls[0];
    expect(call[0]).toBe("/api/sessions/alpha/quick-message");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call[1].body)).toEqual({ text: "hello world" });
  });

  it("URL-encodes session names containing special characters", async () => {
    const { factory, fetchFn } = mkFactory();
    factory.show("path/with spaces & weird", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "x";
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    await flush();
    const call: any = (fetchFn as any).mock.calls[0];
    expect(call[0]).toBe("/api/sessions/path%2Fwith%20spaces%20%26%20weird/quick-message");
  });

  it("on ok response: shows sent ✓ and schedules dismiss via env.setTimeout(1200)", async () => {
    const setTimeoutSpy = vi.fn((cb: () => void, _ms: number) => globalThis.setTimeout(cb, 0));
    const { factory } = mkFactory({ setTimeout: setTimeoutSpy });
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "yo";
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    await flush();
    const title = document.querySelector(".quick-msg-title") as HTMLElement;
    expect(title.textContent).toBe("sent ✓");
    expect(title.style.color).toBe("#4ec94e");
    const dismissCall = setTimeoutSpy.mock.calls.find((c: any) => c[1] === 1200);
    expect(dismissCall).toBeTruthy();
  });

  it("on error response: shows error message and re-enables input/button", async () => {
    const fetchFn = vi.fn(async () => ({ json: async () => ({ ok: false, error: "nope" }) }));
    const { factory } = mkFactory({ fetchFn });
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    const btn = document.querySelector(".quick-msg-send") as HTMLButtonElement;
    input.value = "yo";
    btn.click();
    await flush();
    const title = document.querySelector(".quick-msg-title") as HTMLElement;
    expect(title.textContent).toBe("error: nope");
    expect(input.disabled).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it("on fetch rejection: shows err.message and re-enables", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const { factory } = mkFactory({ fetchFn });
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "yo";
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    await flush();
    const title = document.querySelector(".quick-msg-title") as HTMLElement;
    expect(title.textContent).toBe("error: network down");
    expect(input.disabled).toBe(false);
  });

  it("Enter triggers send", async () => {
    const { factory, fetchFn } = mkFactory();
    factory.show("alpha", mkAnchor());
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "hi";
    const ev = new KeyboardEvent("keydown", { key: "Enter" });
    input.dispatchEvent(ev);
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Escape dismisses popup AND removes outside-click listener (no leak)", async () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    await flush(); // let deferred outside-click listener install
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    const removeSpy = vi.spyOn(document, "removeEventListener");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.getElementById("quick-msg-popup")).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("outside click dismisses popup AND removes the mousedown listener", async () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    await flush();
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.getElementById("quick-msg-popup")).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("click inside popup does NOT dismiss", async () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    await flush();
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.getElementById("quick-msg-popup")).toBeTruthy();
  });

  it("after successful send dismissal: outside-click listener is removed", async () => {
    const setTimeoutSpy = vi.fn((cb: () => void, _ms: number) => globalThis.setTimeout(cb, 0));
    const { factory } = mkFactory({ setTimeout: setTimeoutSpy });
    factory.show("alpha", mkAnchor());
    await flush();
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "ok";
    const removeSpy = vi.spyOn(document, "removeEventListener");
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(document.getElementById("quick-msg-popup")).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("deferred outside-click listener is NOT added if dismissed before setTimeout fires", () => {
    let deferredCb: (() => void) | null = null;
    const setTimeoutSpy = vi.fn((cb: () => void, _ms: number) => {
      deferredCb = cb;
      return 1;
    });
    const addSpy = vi.spyOn(document, "addEventListener");
    const { factory } = mkFactory({ setTimeout: setTimeoutSpy });
    factory.show("alpha", mkAnchor());
    const before = addSpy.mock.calls.filter((c) => c[0] === "mousedown").length;
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    deferredCb!();
    const after = addSpy.mock.calls.filter((c) => c[0] === "mousedown").length;
    expect(after).toBe(before);
    addSpy.mockRestore();
  });

  it("second show() removes the first popup, leaving exactly one in the DOM", () => {
    const { factory } = mkFactory();
    factory.show("alpha", mkAnchor());
    factory.show("beta", mkAnchor());
    const popups = document.querySelectorAll("#quick-msg-popup");
    expect(popups.length).toBe(1);
    expect(popups[0]!.querySelector(".quick-msg-title")!.textContent).toBe("→ beta");
  });

  it("late fetch resolution after dismiss does not throw or mutate detached popup", async () => {
    const d = defer<any>();
    const fetchFn = vi.fn(() => d.promise);
    const { factory } = mkFactory({ fetchFn });
    factory.show("alpha", mkAnchor());
    const popup = document.getElementById("quick-msg-popup")!;
    const input = document.querySelector(".quick-msg-input") as HTMLInputElement;
    input.value = "yo";
    (document.querySelector(".quick-msg-send") as HTMLButtonElement).click();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.getElementById("quick-msg-popup")).toBeNull();
    d.resolve({ json: async () => ({ ok: true }) });
    await flush();
    expect(popup.querySelector(".quick-msg-title")!.textContent).toBe("→ alpha");
  });
});
