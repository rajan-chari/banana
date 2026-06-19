import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInjectionRelay } from "../src/server/injection.js";
import { SUBMIT, SUBMIT_DELAY_MS } from "../src/session.js";
import type { PtySession } from "../src/session.js";

function makeSession() {
  const writes: string[] = [];
  const session = Object.assign(new EventEmitter(), {
    getInfo: () => ({ name: "s" }),
    getStatus: () => "idle",
    write: (data: string) => writes.push(data),
  }) as unknown as PtySession;
  return { session, writes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createInjectionRelay", () => {
  it("delays the single submit long enough for long TUI prompts to settle", () => {
    vi.useFakeTimers();
    const { session, writes } = makeSession();
    const relay = createInjectionRelay(new Map([["s", session]]));

    relay.injectWrite(session, "Check emcom inbox", "emcom-auto");

    expect(writes).toEqual(["Check emcom inbox"]);
    vi.advanceTimersByTime(SUBMIT_DELAY_MS - 1);
    expect(writes).toEqual(["Check emcom inbox"]);
    vi.advanceTimersByTime(1);
    expect(writes).toEqual(["Check emcom inbox", SUBMIT]);
    expect(SUBMIT_DELAY_MS).toBeGreaterThanOrEqual(1000);
  });
});
