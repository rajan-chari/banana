import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { launchVscode, readIdentityInfo } from "../src/server/routes/admin-helpers.js";

describe("readIdentityInfo", () => {
  let scratch: string;

  beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), "pty-win-id-")); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it("returns hasIdentity=false when identity.json is absent", () => {
    const out = readIdentityInfo(scratch);
    expect(out).toEqual({ hasIdentity: false, identityName: undefined });
  });

  it("returns parsed name when identity.json contains a non-empty name", () => {
    writeFileSync(join(scratch, "identity.json"), JSON.stringify({ name: "agent-x" }));
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: true, identityName: "agent-x" });
  });

  it("returns undefined identityName when name is empty or whitespace", () => {
    writeFileSync(join(scratch, "identity.json"), JSON.stringify({ name: "   " }));
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: true, identityName: undefined });
  });

  it("returns undefined identityName when name field is missing", () => {
    writeFileSync(join(scratch, "identity.json"), JSON.stringify({ other: "thing" }));
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: true, identityName: undefined });
  });

  it("returns hasIdentity=true / identityName=undefined when JSON is malformed", () => {
    writeFileSync(join(scratch, "identity.json"), "{ this is not json");
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: true, identityName: undefined });
  });

  it("returns undefined identityName when name is the wrong type", () => {
    writeFileSync(join(scratch, "identity.json"), JSON.stringify({ name: 42 }));
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: true, identityName: undefined });
  });

  it("ignores nested identity.json — only checks the direct child", () => {
    mkdirSync(join(scratch, "sub"));
    writeFileSync(join(scratch, "sub", "identity.json"), JSON.stringify({ name: "nested" }));
    expect(readIdentityInfo(scratch)).toEqual({ hasIdentity: false, identityName: undefined });
  });
});

/** Fake spawn process — records command + args, mimics ChildProcess shape. */
class FakeProc extends EventEmitter {
  public unrefCalls = 0;
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  unref() { this.unrefCalls++; }
}

describe("launchVscode", () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
  });

  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }

  it("on win32 spawns powershell with -NoProfile -Command + minimized script", () => {
    setPlatform("win32");
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeSpawn = vi.fn((cmd: string, args: ReadonlyArray<string>) => {
      calls.push({ cmd, args: [...args] });
      return new FakeProc() as unknown as ReturnType<typeof import("child_process").spawn>;
    });
    launchVscode("C:\\projects\\demo", fakeSpawn as unknown as typeof import("child_process").spawn);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("powershell");
    expect(calls[0]?.args[0]).toBe("-NoProfile");
    expect(calls[0]?.args[1]).toBe("-Command");
    expect(calls[0]?.args[2]).toContain("Start-Process code");
    expect(calls[0]?.args[2]).toContain("C:\\projects\\demo");
  });

  it("on win32 escapes single quotes in the resolved path", () => {
    setPlatform("win32");
    let captured = "";
    const fakeSpawn = vi.fn((_cmd: string, args: ReadonlyArray<string>) => {
      captured = args[2] ?? "";
      return new FakeProc() as unknown as ReturnType<typeof import("child_process").spawn>;
    });
    launchVscode("C:\\Tim's\\proj", fakeSpawn as unknown as typeof import("child_process").spawn);
    expect(captured).toContain("Tim''s");
    expect(captured).not.toContain("Tim's\\proj'");
  });

  it("on win32 calls unref on the spawned process", () => {
    setPlatform("win32");
    const proc = new FakeProc();
    const fakeSpawn = vi.fn(
      () => proc as unknown as ReturnType<typeof import("child_process").spawn>,
    );
    launchVscode("C:\\x", fakeSpawn as unknown as typeof import("child_process").spawn);
    expect(proc.unrefCalls).toBe(1);
  });

  it("on non-win32 spawns 'code' with shell:true and unrefs the child", () => {
    setPlatform("linux");
    const calls: Array<{ cmd: string; args: string[]; opts: { shell?: boolean } }> = [];
    const proc = new FakeProc();
    const fakeSpawn = vi.fn((cmd: string, args: ReadonlyArray<string>, opts: { shell?: boolean }) => {
      calls.push({ cmd, args: [...args], opts });
      return proc as unknown as ReturnType<typeof import("child_process").spawn>;
    });
    launchVscode("/home/me/proj", fakeSpawn as unknown as typeof import("child_process").spawn);
    expect(calls).toEqual([{ cmd: "code", args: ["/home/me/proj"], opts: expect.objectContaining({ shell: true }) }]);
    expect(proc.unrefCalls).toBe(1);
  });
});
