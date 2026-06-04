import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { createAddSession } from "../src/server/session-wiring.js";
import type { PtySession } from "../src/session.js";

function makeFakeSession(name: string): PtySession {
  const ee = new EventEmitter() as EventEmitter & { name: string };
  ee.name = name;
  return ee as unknown as PtySession;
}

function makeFakeRuntime() {
  return {
    attachSession: vi.fn(),
    broadcastSessionList: vi.fn(),
    broadcastStatus: vi.fn(),
    broadcastNotification: vi.fn(),
  };
}

describe("createAddSession", () => {
  it("registers the session in the map and attaches/broadcasts immediately", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    const s = makeFakeSession("alpha");

    addSession(s);

    expect(sessions.get("alpha")).toBe(s);
    expect(rt.attachSession).toHaveBeenCalledWith(s);
    expect(rt.broadcastSessionList).toHaveBeenCalledTimes(1);
  });

  it("rebroadcasts the session list when a registered session emits exit", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    const s = makeFakeSession("beta");

    addSession(s);
    rt.broadcastSessionList.mockClear();

    (s as unknown as EventEmitter).emit("exit");
    expect(rt.broadcastSessionList).toHaveBeenCalledTimes(1);
  });

  it("forwards status-change events through broadcastStatus", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    const s = makeFakeSession("gamma");
    addSession(s);

    (s as unknown as EventEmitter).emit("status-change");
    expect(rt.broadcastStatus).toHaveBeenCalledWith(s);
  });

  it("forwards notification events with count and senders", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    const s = makeFakeSession("delta");
    addSession(s);

    (s as unknown as EventEmitter).emit("notification", 3, ["x", "y"]);
    expect(rt.broadcastNotification).toHaveBeenCalledWith("delta", 3, ["x", "y"]);
  });

  it("supports adding multiple distinct sessions to the same map", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    addSession(makeFakeSession("a"));
    addSession(makeFakeSession("b"));
    expect(sessions.size).toBe(2);
    expect(rt.attachSession).toHaveBeenCalledTimes(2);
    expect(rt.broadcastSessionList).toHaveBeenCalledTimes(2);
  });

  it("overwrites a session if added with the same name (last wins)", () => {
    const sessions = new Map<string, PtySession>();
    const rt = makeFakeRuntime();
    const addSession = createAddSession(sessions, rt);
    const s1 = makeFakeSession("dup");
    const s2 = makeFakeSession("dup");
    addSession(s1);
    addSession(s2);
    expect(sessions.get("dup")).toBe(s2);
  });
});
