import { describe, expect, it } from "vitest";
import { resolveInstanceBadgeText } from "../public/lib/instance-badge.js";

describe("resolveInstanceBadgeText", () => {
  it("uses configured instance name when present", () => {
    expect(resolveInstanceBadgeText({ name: "debug-3701", port: 3600 })).toBe("debug-3701");
  });

  it("falls back to configured server port", () => {
    expect(resolveInstanceBadgeText({ port: 3658 })).toBe("PORT-3658");
  });

  it("falls back to browser host port when config omits port", () => {
    expect(resolveInstanceBadgeText({}, { location: { host: "127.0.0.1:3701" } })).toBe("PORT-3701");
  });

  it("uses a safe non-empty fallback when no port is available", () => {
    expect(resolveInstanceBadgeText({})).toBe("PTY-WIN");
  });
});
