import { existsSync, readFileSync } from "fs";
import type { CostSample } from "./cost-history.js";

/**
 * Best-effort load of session cost totals from a JSON file. Returns a Map
 * keyed by session name → costUsd. Missing files, parse errors, and
 * unexpected shapes all yield an empty map (never throws).
 *
 * Pure aside from the synchronous read of `path` itself.
 */
export function loadSavedCosts(path: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    if (!existsSync(path)) return out;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (data && data.sessions && typeof data.sessions === "object") {
      for (const [name, cost] of Object.entries(data.sessions)) {
        if (typeof cost === "number") out.set(name, cost);
      }
    }
  } catch {
    /* ignore corrupt file */
  }
  return out;
}

/**
 * Best-effort load of the cost history sample array, truncated to the last
 * `max` entries. Missing files, parse errors, and non-array contents all
 * yield an empty array (never throws).
 */
export function loadCostHistory(path: string, max: number): CostSample[] {
  try {
    if (!existsSync(path)) return [];
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(data)) return [];
    return data.slice(-max);
  } catch {
    return [];
  }
}
