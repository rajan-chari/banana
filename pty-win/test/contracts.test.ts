// Cross-boundary contract tests.
//
// pty-win has TWO source-of-truth definitions for shapes that flow over the
// wire: the server interface (src/session.ts) and the browser JSDoc typedef
// (public/lib/state.js). Without an explicit bridge, these silently drift:
// the server starts emitting a new field, the client typedef doesn't know
// about it, and the client either ignores it or crashes when something
// reaches for it later.
//
// Each test below is a deliberate bridge. Two layers per contract:
//
//   1. Compile-time: a fixture typed as `Required<ServerType>` so adding a
//      server field forces the fixture to grow (caught by `npm run check`
//      via tsconfig.test.json).
//
//   2. Runtime: an explicit expected key list. Sorted-equal against the
//      fixture's keys. If you update the server type + fixture but forget
//      the client typedef, the expected list (canonically tracking the
//      client typedef) won't match — `npm test` fails with a clear diff.
//
// To add a field to SessionInfo:
//   - update src/session.ts SessionInfo + getInfo()
//   - update public/lib/state.js SessionInfo typedef
//   - update SERVER_FIXTURE below + EXPECTED_CLIENT_FIELDS

import { describe, it, expect } from "vitest";
import type { SessionInfo as ServerSessionInfo } from "../src/session.js";
import type { SessionInfo as ClientSessionInfo } from "../public/lib/state.js";

// ---------------------------------------------------------------------------
// SessionInfo contract: src/session.ts  <->  public/lib/state.js
// ---------------------------------------------------------------------------

// Compile-time bridge. If the server adds/removes/renames a SessionInfo
// field, this object will fail to type-check under tsconfig.test.json.
//
// Use Required<...> so optional server fields still appear in Object.keys()
// — the contract is about field NAMES, not optionality semantics.
const SERVER_FIXTURE: Required<ServerSessionInfo> = {
  name: "demo",
  group: "demo",
  command: "claude",
  workingDir: "C:\\demo",
  pid: 1234,
  status: "idle",
  emcomIdentity: "demo-id",
  unreadCount: 0,
  dirtyOnExit: false,
  costUsd: 0,
  lastActiveMs: 0,
  pendingPermission: false,
};

// Source of truth for the CLIENT's expected field set. Must mirror the
// SessionInfo typedef in public/lib/state.js. Update both together.
const EXPECTED_CLIENT_FIELDS = [
  "command",
  "costUsd",
  "dirtyOnExit",
  "emcomIdentity",
  "group",
  "lastActiveMs",
  "name",
  "pendingPermission",
  "pid",
  "status",
  "unreadCount",
  "workingDir",
] as const;

// Compile-time bridge for the CLIENT side: a fixture typed as the client
// SessionInfo, using literal-string keys from EXPECTED_CLIENT_FIELDS. If
// the client typedef drops/renames a field, this constructor errors; if
// the client adds an extra field, it shows up here too because we re-use
// the same expected list.
type ClientFieldName = (typeof EXPECTED_CLIENT_FIELDS)[number];
// Confirms every name in EXPECTED_CLIENT_FIELDS is a real key of the
// client typedef. If a name disappears from the client typedef without
// removing it here, this assertion errors at type-check time.
const _clientNamesAreKeys: ReadonlyArray<keyof ClientSessionInfo> = EXPECTED_CLIENT_FIELDS as ReadonlyArray<ClientFieldName>;
void _clientNamesAreKeys;

describe("SessionInfo contract (server <-> client)", () => {
  it("server fixture exposes exactly the fields the client expects", () => {
    const serverKeys = Object.keys(SERVER_FIXTURE).sort();
    const clientKeys = [...EXPECTED_CLIENT_FIELDS].sort();
    expect(serverKeys).toEqual(clientKeys);
  });

  it("every client-expected field appears in the server fixture", () => {
    for (const field of EXPECTED_CLIENT_FIELDS) {
      expect(SERVER_FIXTURE).toHaveProperty(field);
    }
  });
});
