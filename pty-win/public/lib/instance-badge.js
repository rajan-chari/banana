// @ts-check

/**
 * @param {string | undefined} host
 * @returns {string}
 */
function portFromHost(host) {
  const match = (host || "").match(/:(\d+)$/);
  return match ? match[1] : "";
}

/**
 * @param {{ name?: string, port?: number, host?: string }} config
 * @param {{ location?: { host?: string } }} [env]
 * @returns {string}
 */
export function resolveInstanceBadgeText(config, env = {}) {
  const configured = (config.name || "").trim();
  if (configured) return configured;
  const port = config.port || Number(portFromHost(env.location?.host));
  return port ? `PORT-${port}` : "PTY-WIN";
}
