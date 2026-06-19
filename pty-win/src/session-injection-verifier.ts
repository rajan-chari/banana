export interface InjectionSnapshot {
  screen: string;
  why: string;
  injectText: string;
}

interface VerifyInjectionOptions {
  source: string;
  snapshot: InjectionSnapshot;
  sessionName: string;
  submitKey: string;
  getLastHookPromptSubmitTime: () => number;
  writeSubmit: (submitKey: string, source: string) => void;
  getCurrentScreen?: () => string;
  log: (message: string) => void;
  onRecoveredByResend?: (snapshot: InjectionSnapshot, source: string) => void;
  onGiveUp?: (snapshot: InjectionSnapshot, source: string) => void;
  onUnverified?: (snapshot: InjectionSnapshot, source: string) => void;
  retryOnMissingPromptSubmit?: boolean;
  retryVisibleTextOnMissingPromptSubmit?: boolean;
  attempt?: number;
}

const VERIFY_WINDOW_MS = 5_000;
const MAX_RETRIES = 2;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;

function screenContainsInjectedText(screen: string, injectText: string): boolean {
  if (!screen || !injectText) return false;
  if (screen.includes(injectText)) return true;

  const plain = screen.replace(ANSI_RE, "");
  if (plain.includes(injectText)) return true;

  // Long prompts can be wrapped/repainted by TUIs; the stable prefix is enough
  // to identify the just-injected text in the current input box.
  const prefix = injectText.slice(0, Math.min(80, injectText.length));
  return prefix.length >= 16 && plain.includes(prefix);
}

export function verifyInjectionAfter({
  source,
  snapshot,
  sessionName,
  submitKey,
  getLastHookPromptSubmitTime,
  writeSubmit,
  getCurrentScreen,
  log,
  onRecoveredByResend,
  onGiveUp,
  onUnverified,
  retryOnMissingPromptSubmit = true,
  retryVisibleTextOnMissingPromptSubmit = false,
  attempt = 0,
}: VerifyInjectionOptions): void {
  const injectAt = Date.now();

  setTimeout(() => {
    const submitted = getLastHookPromptSubmitTime() > injectAt;
    if (submitted) {
      const recoveredTag = attempt > 0 ? ` [recovered after ${attempt} retry]` : "";
      log(`[${sessionName}] [verify] inject submitted (source=${source})${recoveredTag}`);
      if (attempt > 0) onRecoveredByResend?.(snapshot, source);
      return;
    }

    if (!retryOnMissingPromptSubmit) {
      const currentScreen = getCurrentScreen?.() ?? "";
      if (
        retryVisibleTextOnMissingPromptSubmit
        && attempt < MAX_RETRIES
        && screenContainsInjectedText(currentScreen, snapshot.injectText)
      ) {
        log(
          `[${sessionName}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) but injected text is still visible — re-sending SUBMIT (retry ${attempt + 1}/${MAX_RETRIES})`,
        );
        writeSubmit(submitKey, `recover:${source}`);
        verifyInjectionAfter({
          source,
          snapshot: { ...snapshot, screen: currentScreen },
          sessionName,
          submitKey,
          getLastHookPromptSubmitTime,
          writeSubmit,
          getCurrentScreen,
          log,
          onRecoveredByResend,
          onGiveUp,
          onUnverified,
          retryOnMissingPromptSubmit,
          retryVisibleTextOnMissingPromptSubmit,
          attempt: attempt + 1,
        });
        return;
      }

      log(
        `[${sessionName}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) — not re-sending SUBMIT (prompt-submit hook not reliable and injected text is not visible)`,
      );
      onUnverified?.(snapshot, source);
      return;
    }

    if (attempt < MAX_RETRIES) {
      log(
        `[${sessionName}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) — re-sending SUBMIT (retry ${attempt + 1}/${MAX_RETRIES})`,
      );
      writeSubmit(submitKey, `recover:${source}`);
      verifyInjectionAfter({
        source,
        snapshot,
        sessionName,
        submitKey,
        getLastHookPromptSubmitTime,
        writeSubmit,
        getCurrentScreen,
        log,
        onRecoveredByResend,
        onGiveUp,
        onUnverified,
        retryOnMissingPromptSubmit,
        attempt: attempt + 1,
      });
      return;
    }

    log(`[${sessionName}] [verify] gave up after ${MAX_RETRIES} retries (source=${source})`);
    onGiveUp?.(snapshot, source);
  }, VERIFY_WINDOW_MS).unref?.();
}
