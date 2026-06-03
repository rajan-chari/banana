import { registerHookEventRoutes } from "./sessions/hook-events.js";
import { registerSessionIoRoutes } from "./sessions/session-io.js";
import { registerSessionManagementRoutes } from "./sessions/session-management.js";
import { registerSessionObservabilityRoutes } from "./sessions/observability.js";
import type { SessionRoutesOptions } from "./sessions/types.js";

export function registerSessionRoutes(options: SessionRoutesOptions): void {
  registerSessionManagementRoutes(options);

  registerHookEventRoutes(options);

  registerSessionIoRoutes(options);

  registerSessionObservabilityRoutes(options);
}
