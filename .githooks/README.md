# Git Hooks

Committed git hooks for the banana monorepo. Plain bash scripts — no husky or other dep.

## Activation

Auto-activated when you run `npm install` in `pty-win/` — the `prepare` script in `pty-win/package.json` sets `core.hooksPath` to this directory.

If you've never run `npm install` (e.g., you only touch `chat/` or `python/`), activate manually:

```bash
git config core.hooksPath .githooks
```

**On `git pull`:** nothing to do. `core.hooksPath` lives in `.git/config` and persists across pulls; updated hook scripts in this directory come through with the pull (executable bit is tracked).

## Hooks

### `pre-push`
Runs subproject checks for any subproject whose files are in the push range:
- **pty-win**: `npm run check` + `npm test` (run from `pty-win/`)

The hook diffs against `@{u}` (upstream tracking ref), falling back to `origin/main`.

## Skip in an emergency

```bash
git push --no-verify
```

## Rationale

CI catches everything in `.github/workflows/pty-win-check.yml`, but it runs ~50s after the push. The pre-push hook gives faster feedback locally and prevents pushing broken commits in the first place. They compound — they don't replace each other.

The `pty-win/package.json` `prepare` script auto-activates `core.hooksPath` on `npm install` so contributors don't have to remember a one-time step. It's still visible (one line in `scripts`) — not magic — and falls back silently in non-git contexts (`|| true`).
