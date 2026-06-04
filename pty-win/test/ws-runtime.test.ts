import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { createServer, type Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { WebSocket } from "ws";
import { createWsRuntime, type WsRuntime } from "../src/server/ws-runtime.js";
import type { PtySession } from "../src/session.js";

/** Minimal stand-in for PtySession that satisfies ws-runtime's reach surface. */
class FakeSession extends EventEmitter {
  public name: string;
  public marks: string[] = [];
  public writes: string[] = [];
  public resizes: Array<{ cols: number; rows: number }> = [];
  public cleared = 0;
  public rawTail = "";
  private info: Record<string, unknown>;

  constructor(name: string, info: Partial<Record<string, unknown>> = {}, rawTail = "") {
    super();
    this.name = name;
    this.rawTail = rawTail;
    this.info = {
      name,
      group: name,
      command: "claude",
      workingDir: "/tmp",
      pid: 1,
      status: "idle",
      unreadCount: 0,
      dirtyOnExit: false,
      costUsd: 0,
      lastActiveMs: 0,
      pendingPermission: false,
      ...info,
    };
  }

  getInfo() { return this.info; }
  getRawTail() { return this.rawTail; }
  markUserInput(data: string) { this.marks.push(data); }
  write(data: string) { this.writes.push(data); }
  resize(cols: number, rows: number) { this.resizes.push({ cols, rows }); }
  clearInputDirty() { this.cleared++; }
  emitData(data: string) { this.emit("data", data); }
}

type Msg = { type: string; [k: string]: unknown };

/** WebSocket client that queues incoming messages from open-time so tests
 *  can await them without racing the open → first-message sequence. */
interface QueuedWs {
  ws: WebSocket;
  next(): Promise<Msg>;
  drainFor(ms: number): Promise<Msg[]>;
  close(): void;
}

function connect(port: number): Promise<QueuedWs> {
  return new Promise((resolve, reject) => {
    const queue: Msg[] = [];
    const waiters: Array<(m: Msg) => void> = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const w = waiters.shift();
      if (w) w(msg);
      else queue.push(msg);
    });
    ws.once("open", () => {
      resolve({
        ws,
        next() {
          if (queue.length) return Promise.resolve(queue.shift()!);
          return new Promise<Msg>((r) => waiters.push(r));
        },
        drainFor(ms: number) {
          return new Promise<Msg[]>((r) => setTimeout(() => r(queue.splice(0)), ms));
        },
        close() { ws.close(); },
      });
    });
    ws.once("error", reject);
  });
}

describe("createWsRuntime", () => {
  let httpServer: HttpServer;
  let sessions: Map<string, PtySession>;
  let runtime: WsRuntime;
  let port: number;

  beforeEach(async () => {
    sessions = new Map<string, PtySession>();
    httpServer = createServer();
    runtime = createWsRuntime(httpServer, sessions);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const addr = httpServer.address() as AddressInfo;
    port = addr.port;
  });

  afterEach(async () => {
    runtime.shutdown();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("sends the current session list on connect", async () => {
    const sess = new FakeSession("alpha") as unknown as PtySession;
    sessions.set("alpha", sess);

    const c = await connect(port);
    const first = await c.next();

    expect(first.type).toBe("sessions");
    expect((first["payload"] as Array<{ name: string }>)[0].name).toBe("alpha");

    c.close();
  });

  it("routes input messages to markUserInput + write", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next(); // drain initial sessions

    c.ws.send(JSON.stringify({ type: "input", session: "alpha", payload: "hello" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fake.marks).toEqual(["hello"]);
    expect(fake.writes).toEqual(["hello"]);

    c.close();
  });

  it("routes resize messages with cols and rows", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();

    c.ws.send(JSON.stringify({ type: "resize", session: "alpha", payload: { cols: 80, rows: 24 } }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fake.resizes).toEqual([{ cols: 80, rows: 24 }]);

    c.close();
  });

  it("routes clear-input-dirty messages", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();

    c.ws.send(JSON.stringify({ type: "clear-input-dirty", session: "alpha" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fake.cleared).toBe(1);

    c.close();
  });

  it("ignores malformed JSON without throwing", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();

    c.ws.send("not json");
    c.ws.send(JSON.stringify({ type: "input", session: "missing", payload: "x" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fake.writes).toEqual([]);
    expect(c.ws.readyState).toBe(WebSocket.OPEN);

    c.close();
  });

  it("batches session data and broadcasts within ~16ms", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();

    fake.emitData("abc");
    fake.emitData("def");

    const msgs = await c.drainFor(80);
    const dataMsgs = msgs.filter((m) => m.type === "data");
    expect(dataMsgs).toHaveLength(1);
    expect(dataMsgs[0]["payload"]).toBe("abcdef");
    expect(dataMsgs[0]["session"]).toBe("alpha");

    c.close();
  });

  it("broadcastStatus fans out the session's current info to all clients", async () => {
    const fake = new FakeSession("alpha", { status: "busy", unreadCount: 3 });
    sessions.set("alpha", fake as unknown as PtySession);

    const c1 = await connect(port);
    const c2 = await connect(port);
    await c1.next();
    await c2.next();

    runtime.broadcastStatus(fake as unknown as PtySession);

    const [m1, m2] = await Promise.all([c1.next(), c2.next()]);
    for (const m of [m1, m2]) {
      expect(m.type).toBe("status");
      expect(m["session"]).toBe("alpha");
      const payload = m["payload"] as { status: string; unreadCount: number };
      expect(payload.status).toBe("busy");
      expect(payload.unreadCount).toBe(3);
    }

    c1.close();
    c2.close();
  });

  it("broadcastSessionList sends a sessions message to all clients", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();

    runtime.broadcastSessionList();
    const m = await c.next();

    expect(m.type).toBe("sessions");
    expect((m["payload"] as Array<{ name: string }>)[0].name).toBe("alpha");

    c.close();
  });

  it("broadcastNotification carries count and senders", async () => {
    const c = await connect(port);
    await c.next();

    runtime.broadcastNotification("alpha", 2, ["rajan", "milo"]);
    const m = await c.next();

    expect(m.type).toBe("notification");
    expect(m["session"]).toBe("alpha");
    expect(m["payload"]).toEqual({ count: 2, from: ["rajan", "milo"] });

    c.close();
  });

  it("broadcastName sends a config message", async () => {
    const c = await connect(port);
    await c.next();

    runtime.broadcastName("preview");
    const m = await c.next();

    expect(m.type).toBe("config");
    expect(m["name"]).toBe("preview");

    c.close();
  });

  it("replays the session's raw byte tail to a new client on connect", async () => {
    // Late-connecting browsers need the recent byte history (alt-screen,
    // mouse-mode escapes, etc.) so xterm.js can restore terminal state.
    const fake = new FakeSession(
      "alpha",
      {},
      "\x1b[?1049h\x1b[?1002hRESTORED-STATE",
    );
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    // The first message is `sessions` (sent on connection). Then the replayed
    // tail arrives as a `data` message after the batch flush.
    const msgs = await c.drainFor(80);
    const dataMsgs = msgs.filter((m) => m.type === "data");
    expect(dataMsgs).toHaveLength(1);
    expect(dataMsgs[0]["session"]).toBe("alpha");
    expect(dataMsgs[0]["payload"]).toBe("\x1b[?1049h\x1b[?1002hRESTORED-STATE");

    c.close();
  });

  it("does not send a data message when the raw tail is empty", async () => {
    const fake = new FakeSession("alpha");  // rawTail defaults to ""
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    const msgs = await c.drainFor(80);
    const dataMsgs = msgs.filter((m) => m.type === "data");
    expect(dataMsgs).toHaveLength(0);

    c.close();
  });

  it("merges replayed tail with new live data in the first flush", async () => {
    const fake = new FakeSession("alpha", {}, "OLD-");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    // Emit live data before the 16ms batch flushes
    fake.emitData("NEW");

    const msgs = await c.drainFor(80);
    const dataMsgs = msgs.filter((m) => m.type === "data");
    expect(dataMsgs).toHaveLength(1);
    expect(dataMsgs[0]["payload"]).toBe("OLD-NEW");

    c.close();
  });

  it("attachSession wires data flow for sessions added after a client connected", async () => {
    const c = await connect(port);
    await c.next();

    const late = new FakeSession("beta");
    sessions.set("beta", late as unknown as PtySession);
    runtime.attachSession(late as unknown as PtySession);

    late.emitData("late-data");
    const msgs = await c.drainFor(80);
    const data = msgs.find((m) => m.type === "data" && m["session"] === "beta");

    expect(data).toBeDefined();
    expect(data!["payload"]).toBe("late-data");

    c.close();
  });

  it("stops broadcasting to a client after it disconnects", async () => {
    const fake = new FakeSession("alpha");
    sessions.set("alpha", fake as unknown as PtySession);

    const c = await connect(port);
    await c.next();
    c.close();
    await new Promise((r) => setTimeout(r, 30));

    expect(runtime.getClientCount()).toBe(0);
    // emitting data should not throw even though no clients remain
    fake.emitData("orphan");
  });

  it("getClientCount reflects connected clients", async () => {
    expect(runtime.getClientCount()).toBe(0);

    const c1 = await connect(port);
    const c2 = await connect(port);
    await new Promise((r) => setTimeout(r, 30));

    expect(runtime.getClientCount()).toBe(2);

    c1.close();
    c2.close();
  });

  it("shutdown terminates clients and clears state", async () => {
    const c = await connect(port);
    await c.next();

    runtime.shutdown();
    await new Promise((r) => setTimeout(r, 30));

    expect(runtime.getClientCount()).toBe(0);
  });
});

/** Heartbeat path — requires a fresh runtime constructed under fake setInterval
 *  so we can advance time without affecting Node's real socket / setTimeout
 *  scheduling. Lives in its own describe so beforeEach state is independent. */
describe("createWsRuntime heartbeat", () => {
  let httpServer: HttpServer;
  let sessions: Map<string, PtySession>;
  let runtime: WsRuntime;
  let port: number;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    sessions = new Map<string, PtySession>();
    httpServer = createServer();
    runtime = createWsRuntime(httpServer, sessions);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    runtime.shutdown();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    vi.useRealTimers();
  });

  it("pings clients on each 30s heartbeat tick", async () => {
    const c = await connect(port);
    await c.next();

    const pings: Buffer[] = [];
    c.ws.on("ping", (data) => pings.push(Buffer.from(data)));

    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setImmediate(r));

    expect(pings.length).toBeGreaterThanOrEqual(1);

    c.close();
  });

  it("terminates a client that fails to pong before the next tick", async () => {
    const c = await connect(port);
    await c.next();

    // Suppress automatic pong-on-ping by removing the ws library's default handler.
    // The library installs a built-in pong reply; intercepting "ping" and not
    // calling ws.pong() simulates a dead client without writing back.
    c.ws.removeAllListeners("ping");
    c.ws.on("ping", () => { /* swallow — do not pong */ });

    expect(runtime.getClientCount()).toBe(1);

    // First tick: marks client as not-alive, sends a ping (which we swallow).
    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setImmediate(r));
    expect(runtime.getClientCount()).toBe(1);

    // Second tick: client still not-alive → terminate.
    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setImmediate(r));

    expect(runtime.getClientCount()).toBe(0);
  });
});
