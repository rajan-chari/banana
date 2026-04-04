import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InputInjector } from "./input-injector.js";
import type { ScreenDetector, PromptType } from "./screen-detector.js";
import type * as pty from "node-pty";

// --- Mocks ---

vi.mock("../log.js", () => ({ log: vi.fn() }));

function mockPty(): pty.IPty & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    write: vi.fn((data: string) => written.push(data)),
    // Unused stubs
    pid: 1,
    cols: 120,
    rows: 40,
    process: "claude",
    handleFlowControl: false,
    onData: vi.fn(),
    onExit: vi.fn(),
    on: vi.fn(),
    resize: vi.fn(),
    clear: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  } as any;
}

function mockScreen(promptType: PromptType = "input"): ScreenDetector & { setPromptType: (t: PromptType) => void } {
  let current = promptType;
  return {
    detectPromptType: vi.fn(() => current),
    setPromptType: (t: PromptType) => { current = t; },
    write: vi.fn(),
    resize: vi.fn(),
    snapshot: vi.fn(() => ""),
    dispose: vi.fn(),
  } as any;
}

// Constants matching input-injector.ts
const STARTUP_GRACE_MS = 10_000;
const COOLDOWN_MS = 30_000;
const QUIET_THRESHOLD_MS = 3_000;
const SCREEN_AWARE_QUIET_MS = 1_000;
const HEURISTIC_INTERVAL_MS = 250;
const CHECKPOINT_LIGHT_MS = 2 * 60 * 60 * 1000;
const CHECKPOINT_FULL_MS = 4 * 60 * 60 * 1000;

describe("InputInjector — state machine", () => {
  let ptyMock: ReturnType<typeof mockPty>;
  let screen: ReturnType<typeof mockScreen>;
  let injector: InputInjector;

  beforeEach(() => {
    vi.useFakeTimers();
    ptyMock = mockPty();
    screen = mockScreen("input");
  });

  afterEach(() => {
    injector?.stopHeuristic();
    injector?.stopCheckpointTimers();
    vi.useRealTimers();
  });

  function create(opts?: { resumed?: boolean }): InputInjector {
    injector = new InputInjector(ptyMock, QUIET_THRESHOLD_MS, COOLDOWN_MS, "test", opts?.resumed ?? false);
    injector.setScreenDetector(screen);
    return injector;
  }

  // --- 1. Initial state ---

  it("starts in startup state", () => {
    create();
    expect(injector.getState()).toBe("startup");
  });

  // --- 2. Startup grace period → busy (no idle signal) ---

  it("transitions startup → busy after grace period with no idle signal", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS);
    expect(injector.getState()).toBe("busy");
  });

  // --- 3. Startup grace period → idle (idle signal received during startup) ---

  it("transitions startup → idle when idle hook fired during startup", () => {
    create();
    injector.signalIdle(); // fires during startup — deferred
    expect(injector.getState()).toBe("startup"); // still startup
    vi.advanceTimersByTime(STARTUP_GRACE_MS);
    expect(injector.getState()).toBe("idle");
  });

  it("auto-injects when idle after startup with pending messages", () => {
    create();
    injector.notifyNewMessages();
    injector.signalIdle();
    vi.advanceTimersByTime(STARTUP_GRACE_MS);
    // Should have injected (state moves to cooldown)
    expect(injector.getState()).toBe("cooldown");
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("emcom");
  });

  // --- 4. idle → busy on output ---

  it("transitions idle → busy on PTY output", () => {
    create();
    injector.signalIdle();
    vi.advanceTimersByTime(STARTUP_GRACE_MS);
    expect(injector.getState()).toBe("idle");
    injector.onOutput();
    expect(injector.getState()).toBe("busy");
  });

  // --- 5. signalIdle during startup defers ---

  it("defers idle signal during startup (does not transition immediately)", () => {
    create();
    injector.signalIdle();
    expect(injector.getState()).toBe("startup");
  });

  // --- 6. signalIdle during busy → idle ---

  it("transitions busy → idle via hook signal", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.signalIdle();
    expect(injector.getState()).toBe("idle");
  });

  // --- 7. notifyNewMessages during idle → inject → cooldown ---

  it("injects emcom prompt immediately when messages arrive during idle", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.signalIdle(); // → idle
    injector.notifyNewMessages();
    expect(injector.getState()).toBe("cooldown");
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("emcom");
  });

  // --- 8. notifyNewMessages during busy → queued → inject on next idle ---

  it("queues messages during busy and injects when idle", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.notifyNewMessages();
    expect(ptyMock.written.length).toBe(0); // not yet
    injector.signalIdle(); // → idle → inject
    expect(injector.getState()).toBe("cooldown");
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("emcom");
  });

  // --- 9. cooldown → busy after timeout ---

  it("transitions cooldown → busy after cooldown period", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.signalIdle(); // → idle
    injector.notifyNewMessages(); // inject → cooldown
    expect(injector.getState()).toBe("cooldown");
    vi.advanceTimersByTime(COOLDOWN_MS);
    expect(injector.getState()).toBe("busy");
  });

  // --- 10. Heuristic: quiet + screen "input" → idle ---

  it("heuristic detects idle when quiet > threshold and screen shows input prompt", () => {
    create();
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy, needsStartupKick

    // First heuristic idle triggers startup kick → cooldown
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("cooldown");
    expect(ptyMock.written[0]).toContain("startup-kick");

    // Cooldown → busy (advance to just before cooldown ends, output to reset quiet timer)
    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    injector.onOutput(); // reset quiet timer before cooldown ends
    vi.advanceTimersByTime(1); // cooldown fires → busy
    expect(injector.getState()).toBe("busy");

    // Now let it go quiet → heuristic detects idle
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("idle");
  });

  // --- 11. Heuristic: screen "permission" → stays busy ---

  it("heuristic stays busy when screen shows permission prompt", () => {
    create();
    screen.setPromptType("permission");
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("busy");
  });

  // --- 12. Heuristic: screen "busy" → stays busy ---

  it("heuristic stays busy when screen shows busy animation", () => {
    create();
    screen.setPromptType("busy");
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("busy");
  });

  // --- 13. Startup kick via heuristic ---

  it("injects startup kick when heuristic detects first idle", () => {
    create();
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy, needsStartupKick
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    // First idle should trigger startup kick, not normal idle
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("startup-kick");
    expect(injector.getState()).toBe("cooldown");
  });

  // --- 14. Resume kick instead of startup kick ---

  it("injects resume kick for resumed sessions", () => {
    create({ resumed: true });
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy, needsStartupKick
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("session-resumed");
    expect(injector.getState()).toBe("cooldown");
  });

  // --- 15. After startup kick, next idle is normal ---

  it("normal idle after startup kick is consumed", () => {
    create();
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy, needsStartupKick
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS); // startup kick → cooldown
    expect(ptyMock.written[0]).toContain("startup-kick");
    expect(injector.getState()).toBe("cooldown");

    // Cooldown → busy
    vi.advanceTimersByTime(COOLDOWN_MS);
    // Heuristic still running — immediately go quiet → idle again
    // Need to simulate output first to reset the quiet timer
    injector.onOutput();
    expect(injector.getState()).toBe("busy");

    // Now let it go quiet → should be normal idle (not another kick)
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("idle");
    // Only the startup kick was written — no second injection
    expect(ptyMock.written.length).toBe(1);
  });

  // --- 16. signalIdle ignored during cooldown ---

  it("ignores idle signals during cooldown", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.signalIdle(); // → idle
    injector.notifyNewMessages(); // → cooldown
    expect(injector.getState()).toBe("cooldown");
    injector.signalIdle(); // should be ignored (cooldown is not "busy")
    expect(injector.getState()).toBe("cooldown");
  });

  // --- 17. signalIdle ignored during startup ---

  it("signalIdle during non-busy states is no-op", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.signalIdle(); // → idle
    injector.signalIdle(); // already idle, setIdle checks state === "busy"
    expect(injector.getState()).toBe("idle");
  });

  // --- 18. Multiple messages → single injection ---

  it("multiple notifyNewMessages while busy result in single injection", () => {
    create();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.notifyNewMessages();
    injector.notifyNewMessages();
    injector.notifyNewMessages();
    injector.signalIdle(); // → inject once
    expect(ptyMock.written.length).toBe(1);
  });

  // --- 19. Output resets quiet timer (prevents premature heuristic idle) ---

  it("output resets quiet timer so heuristic does not fire early", () => {
    create();
    injector.startHeuristic();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy, needsStartupKick

    // Let heuristic fire startup kick first
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS + HEURISTIC_INTERVAL_MS); // → cooldown

    // Cooldown → busy (reset quiet timer before transition)
    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    injector.onOutput();
    vi.advanceTimersByTime(1); // → busy
    expect(injector.getState()).toBe("busy");

    // Advance partway through quiet threshold, then output
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS / 2);
    injector.onOutput(); // reset quiet timer
    // Advance the remainder — not enough quiet since last output
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS / 2 + HEURISTIC_INTERVAL_MS);
    expect(injector.getState()).toBe("busy");

    // Now let full quiet period elapse from last output
    vi.advanceTimersByTime(SCREEN_AWARE_QUIET_MS);
    expect(injector.getState()).toBe("idle");
  });
});

describe("InputInjector — checkpoint injection", () => {
  let ptyMock: ReturnType<typeof mockPty>;
  let screen: ReturnType<typeof mockScreen>;
  let injector: InputInjector;

  beforeEach(() => {
    vi.useFakeTimers();
    ptyMock = mockPty();
    screen = mockScreen("input");
  });

  afterEach(() => {
    injector?.stopHeuristic();
    injector?.stopCheckpointTimers();
    vi.useRealTimers();
  });

  function create(): InputInjector {
    injector = new InputInjector(ptyMock, QUIET_THRESHOLD_MS, COOLDOWN_MS, "test", false);
    injector.setScreenDetector(screen);
    return injector;
  }

  // --- 20. Checkpoint light timer fires → injects when idle ---

  it("injects light checkpoint when timer fires and session is idle", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity
    injector.signalIdle(); // → idle

    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    // Should have injected checkpoint
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("checkpoint-light");
  });

  // --- 21. Checkpoint full timer fires → injects when idle ---

  it("injects full checkpoint when timer fires and session is idle", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity

    // At 2hr: light fires while busy → queued
    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    // At 4hr: full fires while busy → overrides pending light
    vi.advanceTimersByTime(CHECKPOINT_FULL_MS - CHECKPOINT_LIGHT_MS);

    // Now go idle — should inject the full checkpoint (not light)
    injector.signalIdle();
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("checkpoint-full");
  });

  // --- 22. Emcom has priority over checkpoint ---

  it("emcom messages take priority over pending checkpoint", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity

    // Advance to checkpoint time while busy
    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    // Now both checkpoint pending and we add messages
    injector.notifyNewMessages();
    injector.signalIdle();

    // First write should be emcom, not checkpoint
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("emcom");
  });

  // --- 23. Pending full not overridden by light ---

  it("pending full checkpoint is not overridden by light timer", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity

    // Advance past full checkpoint time (4hr) — both timers fire
    // At 2hr: light fires, sets pendingCheckpoint = "light"
    // At 4hr: full fires, sets pendingCheckpoint = "full"
    // But light at 2hr fires first — if still busy, it queues
    // Then at 4hr full fires — it should override or not be blocked by light

    // Advance to just after 4hr while busy (no idle)
    vi.advanceTimersByTime(CHECKPOINT_FULL_MS);
    // Now signal idle — should inject whatever is pending
    injector.signalIdle();

    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("checkpoint-full");
  });

  // --- 24. Checkpoint skipped when no activity ---

  it("skips checkpoint when no activity since last checkpoint", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity
    injector.signalIdle(); // → idle

    // First checkpoint fires — injects
    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    expect(ptyMock.written.length).toBe(1);

    // Cooldown → busy
    vi.advanceTimersByTime(COOLDOWN_MS);
    // Go idle again without any output (no new activity)
    injector.signalIdle();

    // Second checkpoint timer fires — should skip (no activity)
    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    expect(ptyMock.written.length).toBe(1); // still just the first one
  });

  // --- 25. Checkpoint queued while busy, injected on idle ---

  it("queues checkpoint while busy and injects on next idle", () => {
    create();
    injector.startCheckpointTimers();
    vi.advanceTimersByTime(STARTUP_GRACE_MS); // → busy
    injector.onOutput(); // mark activity

    // Timer fires while busy
    vi.advanceTimersByTime(CHECKPOINT_LIGHT_MS);
    expect(ptyMock.written.length).toBe(0); // not yet

    // Now go idle
    injector.signalIdle();
    expect(ptyMock.written.length).toBe(1);
    expect(ptyMock.written[0]).toContain("checkpoint-light");
  });
});
