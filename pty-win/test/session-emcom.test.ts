import { describe, expect, it } from "vitest";
import { applyUnreadCount, markEmcomInjectionSent } from "../src/session-emcom.js";

describe("session emcom message state", () => {
  it("does not turn an existing unread count into a pending injection", () => {
    const injected = markEmcomInjectionSent({ pendingMessages: true, unreadCount: 1 });
    expect(injected).toEqual({ pendingMessages: false, unreadCount: 1 });

    const next = applyUnreadCount(injected, 1);
    expect(next).toEqual({ state: injected, changed: false });
  });

  it("preserves pending work while unread messages remain and clears it at zero", () => {
    const pending = { pendingMessages: true, unreadCount: 1 };
    expect(applyUnreadCount(pending, 2)).toEqual({
      state: { pendingMessages: true, unreadCount: 2 },
      changed: true,
    });
    expect(applyUnreadCount(pending, 0)).toEqual({
      state: { pendingMessages: false, unreadCount: 0 },
      changed: true,
    });
  });
});
