# Git Hooks

Committed git hooks for the banana monorepo. Plain bash scripts — no husky or other dep.

## Activate (one-time per clone)

```bash
git config core.hooksPath .githooks
```

This points git at this directory instead of the default `.git/hooks/`.

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

Each clone activates the hook explicitly so it's never invisible to a contributor.
