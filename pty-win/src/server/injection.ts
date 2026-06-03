import { MessageChannel, type MessagePort } from "worker_threads";
import { PtySession, SUBMIT, SUBMIT_DELAY_MS } from "../session.js";
import { clog } from "../log.js";

interface InjectionMessage {
  name: string;
  text: string;
  source?: string;
}

export interface InjectionRelay {
  injectionSender: MessagePort;
  injectWrite: (session: PtySession, text: string, source?: string) => void;
}

/**
 * Build a reliable PTY injection relay backed by MessageChannel.
 * Writes from MessagePort callbacks are more reliable than timer callbacks.
 */
export function createInjectionRelay(sessions: Map<string, PtySession>): InjectionRelay {
  const { port1: injectionReceiver, port2: injectionSender } = new MessageChannel();

  function injectWrite(session: PtySession, text: string, source: string = "unknown"): void {
    const submitEsc = (SUBMIT as string) === "\r"
      ? "\\r"
      : (SUBMIT as string) === "\n"
        ? "\\n"
        : `0x${(SUBMIT as string).charCodeAt(0).toString(16)}`;
    clog(`[inject ${source}] T+0   text(${text.length}b) -> ${session.getInfo().name}`);
    session.write(text);
    setTimeout(() => {
      clog(`[inject ${source}] T+${SUBMIT_DELAY_MS}  SUBMIT(${submitEsc}) -> ${session.getInfo().name} (status=${session.getStatus()})`);
      session.write(SUBMIT);
    }, SUBMIT_DELAY_MS);
  }

  injectionReceiver.on("message", ({ name, text, source }: InjectionMessage) => {
    const session = sessions.get(name);
    if (!session) {
      clog(`injection relay: session "${name}" not found`);
      return;
    }
    injectWrite(session, text, source || "relay");
  });

  return { injectionSender, injectWrite };
}
