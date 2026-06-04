import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  broadcastToClients,
  createBatchedSender,
  dispatchClientMessage,
  type BatchedSenderSession,
  type WsSessionLike,
} from "../src/server/ws-helpers.js";

/** Minimal WebSocket stand-in: tracks .send() calls and lets tests flip readyState. */
class FakeWs {
  public readyState: number = WebSocket.OPEN;
  public sent: string[] = [];
  send(msg: string): void {
    this.sent.push(msg);
  }
}

describe("broadcastToClients", () => {
  it("sends serialized payload to every OPEN client", () => {
    const a = new FakeWs();
    const b = new FakeWs();
    broadcastToClients([a as unknown as WebSocket, b as unknown as WebSocket], { type: "hi", n: 1 });
    expect(a.sent).toEqual([JSON.stringify({ type: "hi", n: 1 })]);
    expect(b.sent).toEqual([JSON.stringify({ type: "hi", n: 1 })]);
  });

  it("skips non-OPEN clients", () => {
    const open = new FakeWs();
    const closed = new FakeWs();
    closed.readyState = WebSocket.CLOSED;
    const connecting = new FakeWs();
    connecting.readyState = WebSocket.CONNECTING;
    broadcastToClients(
      [open as unknown as WebSocket, closed as unknown as WebSocket, connecting as unknown as WebSocket],
      { x: 1 },
    );
    expect(open.sent).toHaveLength(1);
    expect(closed.sent).toHaveLength(0);
    expect(connecting.sent).toHaveLength(0);
  });

  it("serializes payload exactly once across many clients", () => {
    const clients = Array.from({ length: 5 }, () => new FakeWs());
    const payload = { type: "sessions", payload: [{ name: "s1" }] };
    const spy = vi.spyOn(JSON, "stringify");
    broadcastToClients(clients as unknown as WebSocket[], payload);
    // First call is our payload; subsequent JSON.stringify calls from other code should be zero here.
    const ourCalls = spy.mock.calls.filter((c) => c[0] === payload);
    expect(ourCalls).toHaveLength(1);
    spy.mockRestore();
  });

  it("handles empty client iterable", () => {
    expect(() => broadcastToClients([], { x: 1 })).not.toThrow();
  });
});

class FakeSession implements WsSessionLike {
  public marks: string[] = [];
  public writes: string[] = [];
  public resizes: Array<{ cols: number; rows: number }> = [];
  public cleared = 0;
  markUserInput(d: string): void { this.marks.push(d); }
  write(d: string): void { this.writes.push(d); }
  resize(cols: number, rows: number): void { this.resizes.push({ cols, rows }); }
  clearInputDirty(): void { this.cleared++; }
}

describe("dispatchClientMessage", () => {
  let sessions: Map<string, FakeSession>;
  let s1: FakeSession;

  beforeEach(() => {
    sessions = new Map();
    s1 = new FakeSession();
    sessions.set("s1", s1);
  });

  it("routes 'input' to markUserInput + write", () => {
    dispatchClientMessage({ type: "input", session: "s1", payload: "abc" }, sessions);
    expect(s1.marks).toEqual(["abc"]);
    expect(s1.writes).toEqual(["abc"]);
  });

  it("routes 'clear-input-dirty'", () => {
    dispatchClientMessage({ type: "clear-input-dirty", session: "s1" }, sessions);
    expect(s1.cleared).toBe(1);
  });

  it("routes 'resize' with numeric cols/rows", () => {
    dispatchClientMessage(
      { type: "resize", session: "s1", payload: { cols: 80, rows: 24 } },
      sessions,
    );
    expect(s1.resizes).toEqual([{ cols: 80, rows: 24 }]);
  });

  it("ignores 'resize' with non-numeric payload", () => {
    dispatchClientMessage(
      { type: "resize", session: "s1", payload: { cols: "80", rows: 24 } },
      sessions,
    );
    expect(s1.resizes).toEqual([]);
  });

  it("ignores unknown message types silently", () => {
    expect(() =>
      dispatchClientMessage({ type: "unknown-foo", session: "s1", payload: {} }, sessions),
    ).not.toThrow();
    expect(s1.marks).toEqual([]);
  });

  it("ignores message with no type", () => {
    expect(() => dispatchClientMessage({ session: "s1" }, sessions)).not.toThrow();
  });

  it("ignores message addressed to unknown session", () => {
    expect(() =>
      dispatchClientMessage({ type: "input", session: "ghost", payload: "x" }, sessions),
    ).not.toThrow();
    expect(s1.marks).toEqual([]);
  });

  it("ignores 'input' with non-string payload", () => {
    dispatchClientMessage({ type: "input", session: "s1", payload: 42 }, sessions);
    expect(s1.marks).toEqual([]);
    expect(s1.writes).toEqual([]);
  });

  it("'clear-input-dirty' with unknown session is a no-op", () => {
    expect(() =>
      dispatchClientMessage({ type: "clear-input-dirty", session: "ghost" }, sessions),
    ).not.toThrow();
    expect(s1.cleared).toBe(0);
  });
});

/** EventEmitter-backed PtySession fake satisfying BatchedSenderSession. */
class FakeBatchSession extends EventEmitter implements BatchedSenderSession {
  constructor(
    public name: string,
    private readonly modeReplay = "",
    private readonly rawTail = "",
  ) { super(); }
  getModeReplay(): string { return this.modeReplay; }
  getRawTail(): string { return this.rawTail; }
}

describe("createBatchedSender", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("pre-seeds initial flush with modeReplay + rawTail", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1", "\x1b[?1049h", "hello");
    createBatchedSender(session, ws as unknown as WebSocket, 16);
    expect(ws.sent).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(ws.sent).toHaveLength(1);
    const parsed = JSON.parse(ws.sent[0]);
    expect(parsed).toMatchObject({ type: "data", session: "s1", payload: "\x1b[?1049hhello" });
  });

  it("does not schedule initial flush when both modeReplay and rawTail are empty", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1", "", "");
    createBatchedSender(session, ws as unknown as WebSocket, 16);
    vi.advanceTimersByTime(1000);
    expect(ws.sent).toEqual([]);
  });

  it("batches data events within batchMs window", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1");
    createBatchedSender(session, ws as unknown as WebSocket, 16);

    session.emit("data", "a");
    session.emit("data", "b");
    session.emit("data", "c");
    expect(ws.sent).toEqual([]);

    vi.advanceTimersByTime(16);
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]).payload).toBe("abc");
  });

  it("skips send when ws is not OPEN at flush time", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1");
    createBatchedSender(session, ws as unknown as WebSocket, 16);

    session.emit("data", "x");
    ws.readyState = WebSocket.CLOSED;
    vi.advanceTimersByTime(16);
    expect(ws.sent).toEqual([]);
  });

  it("starts a new flush after the previous one drains", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1");
    createBatchedSender(session, ws as unknown as WebSocket, 16);

    session.emit("data", "a");
    vi.advanceTimersByTime(16);
    expect(ws.sent).toHaveLength(1);

    session.emit("data", "b");
    vi.advanceTimersByTime(16);
    expect(ws.sent).toHaveLength(2);
    expect(JSON.parse(ws.sent[1]).payload).toBe("b");
  });

  it("cleanup() detaches listener and cancels pending flush", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1");
    const handle = createBatchedSender(session, ws as unknown as WebSocket, 16);

    session.emit("data", "x");
    handle.cleanup();
    vi.advanceTimersByTime(1000);
    expect(ws.sent).toEqual([]);

    // Listener is detached: further emits are ignored.
    session.emit("data", "y");
    vi.advanceTimersByTime(1000);
    expect(ws.sent).toEqual([]);
  });

  it("cleanup() is idempotent", () => {
    const ws = new FakeWs();
    const session = new FakeBatchSession("s1");
    const handle = createBatchedSender(session, ws as unknown as WebSocket, 16);
    expect(() => { handle.cleanup(); handle.cleanup(); }).not.toThrow();
  });
});
