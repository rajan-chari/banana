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
  relayWrite: (text: string, source?: string) => void;
  log: (message: string) => void;
  onRecoveredByResend?: (snapshot: InjectionSnapshot, source: string) => void;
  onGiveUp?: (snapshot: InjectionSnapshot, source: string) => void;
  onUnverified?: (snapshot: InjectionSnapshot, source: string) => void;
  retryOnMissingPromptSubmit?: boolean;
  attempt?: number;
}

const VERIFY_WINDOW_MS = 5_000;
const MAX_RETRIES = 2;

export function verifyInjectionAfter({
  source,
  snapshot,
  sessionName,
  submitKey,
  getLastHookPromptSubmitTime,
  relayWrite,
  log,
  onRecoveredByResend,
  onGiveUp,
  onUnverified,
  retryOnMissingPromptSubmit = true,
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
      log(
        `[${sessionName}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) — not re-sending SUBMIT (prompt-submit hook not reliable for this command)`,
      );
      onUnverified?.(snapshot, source);
      return;
    }

    if (attempt < MAX_RETRIES) {
      log(
        `[${sessionName}] [verify] no hook:prompt-submit within ${VERIFY_WINDOW_MS}ms (source=${source}) — re-sending SUBMIT (retry ${attempt + 1}/${MAX_RETRIES})`,
      );
      relayWrite(submitKey, `recover:${source}`);
      verifyInjectionAfter({
        source,
        snapshot,
        sessionName,
        submitKey,
        getLastHookPromptSubmitTime,
        relayWrite,
        log,
        onRecoveredByResend,
        onGiveUp,
        retryOnMissingPromptSubmit,
        attempt: attempt + 1,
      });
      return;
    }

    log(`[${sessionName}] [verify] gave up after ${MAX_RETRIES} retries (source=${source})`);
    onGiveUp?.(snapshot, source);
  }, VERIFY_WINDOW_MS).unref?.();
}
