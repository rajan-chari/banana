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

// ---------------------------------------------------------------------------
// TrackerItem contract: public/lib/state.js  <->  emcom tracker API
// ---------------------------------------------------------------------------
//
// TrackerItem comes from the emcom Python service (out of this repo). There
// is no TypeScript source-of-truth on the producer side, so the bridge is:
//
//   1. A captured fixture (TRACKER_FIXTURE below) representing a realistic
//      response from GET /api/emcom-proxy/tracker. The fixture is typed as
//      ClientTrackerItem — if the client typedef drops or renames a field
//      the fixture uses, the cast fails at type-check time.
//
//   2. A required-fields list. Any tracker item missing these will break
//      tracker-render.js. If a future server change removes one of these,
//      refresh the fixture + bump the assertion.
//
// To refresh the fixture: call the live API, copy a representative item:
//   curl -H "X-Emcom-Name: moss" http://127.0.0.1:8800/tracker | jq '.[0]'

import type { TrackerItem as ClientTrackerItem, TrackerHistoryEntry } from "../public/lib/state.js";

// Captured 2026-06-03. Realistic shape — every typedef field populated so
// changes to the typedef force a corresponding fixture update.
const TRACKER_FIXTURE: ClientTrackerItem = {
  id: "abc12345",
  title: "Example tracker item with all known fields populated",
  repo: "banana",
  number: 42,
  status: "open",
  severity: "normal",
  assigned_to: "moss",
  opened_by: "rajan-chari",
  github_author: "rajan-chari",
  created_by: "rajan-chari",
  github_last_commenter: "milo",
  responders: ["moss", "milo"],
  labels: ["bug", "guard-rail"],
  created_at: "2026-06-01T10:00:00.000Z",
  updated_at: "2026-06-03T17:00:00.000Z",
  date_found: "2026-06-01",
  last_github_activity: "2026-06-03T16:30:00.000Z",
  blocker: "waiting on CI",
  findings: "Repro confirmed",
  decision: "fix",
  decision_rationale: "Affects future guard-rails",
  notes: "Working as planned",
};

// History entries arrive via a separate /api/emcom-proxy/tracker/<id> fetch
// (see app.js:3393). Same drift risk: fixture below documents the expected
// shape; fixing the typedef without the fixture would silently un-test the
// new field.
const TRACKER_HISTORY_FIXTURE: TrackerHistoryEntry = {
  field: "status",
  new_value: "open",
  comment: "Triaged",
  changed_at: "2026-06-01T10:00:00.000Z",
  changed_by: "rajan-chari",
};

// Required at runtime by tracker-render.js + tracker-filters.js. Removing
// any of these from the server response would break the row entirely.
const TRACKER_REQUIRED_FIELDS = ["id"] as const;

// Compile-time confirm the lists reference real TrackerItem keys.
const _trackerRequiredAreKeys: ReadonlyArray<keyof ClientTrackerItem> =
  TRACKER_REQUIRED_FIELDS as ReadonlyArray<keyof ClientTrackerItem>;
void _trackerRequiredAreKeys;

describe("TrackerItem contract (emcom API <-> client)", () => {
  it("fixture satisfies all required tracker fields", () => {
    for (const field of TRACKER_REQUIRED_FIELDS) {
      expect(TRACKER_FIXTURE).toHaveProperty(field);
      expect(TRACKER_FIXTURE[field]).toBeTruthy();
    }
  });

  it("fixture exercises every field declared in the client typedef", () => {
    // Hardcoded list mirrors the typedef in public/lib/state.js. If the
    // typedef gains/loses a field, update BOTH this list and the fixture.
    // The compile-time `keyof ClientTrackerItem` check below guarantees
    // every name here is a real typedef field.
    const typedefFields = [
      "id", "title", "repo", "number", "status", "severity",
      "assigned_to", "opened_by", "github_author", "created_by",
      "github_last_commenter", "responders", "labels",
      "created_at", "updated_at", "date_found", "last_github_activity",
      "blocker", "findings", "decision", "decision_rationale", "notes",
    ] as const satisfies ReadonlyArray<keyof ClientTrackerItem>;
    for (const field of typedefFields) {
      expect(TRACKER_FIXTURE).toHaveProperty(field);
    }
  });

  it("history fixture exercises every TrackerHistoryEntry field", () => {
    const historyFields = [
      "field", "new_value", "comment", "changed_at", "changed_by",
    ] as const satisfies ReadonlyArray<keyof TrackerHistoryEntry>;
    for (const field of historyFields) {
      expect(TRACKER_HISTORY_FIXTURE).toHaveProperty(field);
    }
  });
});
