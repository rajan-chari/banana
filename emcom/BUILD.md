# Building emcom binaries

emcom ships two distribution channels with **separate build definitions** — do not
try to unify them. Each is the canonical source for its target.

| Channel | Trigger | Source of build args | Output |
| --- | --- | --- | --- |
| **fellow-agents release** (npm consumers) | `workflow_dispatch` on `rajan-chari/fellow-agents` `.github/workflows/release.yml` | release.yml itself (per-matrix `runtime_tmpdir`, `_version.py` write step) | win-x64, osx-arm64, linux-x64 binaries attached to a GitHub Release; `fellow-agents start` downloads them via `download.js` auto-update |
| **local Windows deploy** (frost's box only) | `deploy.ps1` in this directory | `emcom-server.spec` / `emcom-tui.spec` here | `~/.claude/skills/emcom/bin/emcom-server.exe` |

The shared file is the Python source — `emcom/` and `emcom_server/`. Build args
(PyInstaller flags, runtime_tmpdir, provenance) deliberately do **not** share a
single source: every attempt to unify them adds threading complexity without
removing drift surface (see emcom thread `b4446536`).

## Build provenance (`emcom/_version.py`)

`emcom/_version.py` carries four build-time constants consumed by
`emcom-server --version`:

```python
__banana_sha__  = "<full 40-char banana commit SHA>"
__release_tag__ = "v0.0.22"            # fellow-agents release tag
__built_at__    = "2026-05-28T21:45:00Z"  # ISO 8601 UTC
__platform__    = "win-x64"            # matrix.platform
```

- Committed values are sentinels (`"dev"` / `"unknown"`).
- CI overwrites the file in-place — **at `banana/emcom/emcom/_version.py`** (inside the Python package, not at the project-root sibling of `pyproject.toml`) — before `pip install "emcom/"` + `pyinstaller`, so the wheel that PyInstaller bundles carries real provenance. The path ambiguity is a real foot-gun: the file is at `emcom/_version.py` package-relative but `emcom/emcom/_version.py` banana-relative. fellow-agents `release.yml` heredoc runs from banana-root, so it MUST use the banana-relative form.
- `emcom_server/main.py` does `from emcom import _version as _build_version` —
  the explicit import keeps `_version.py` in PyInstaller's static Analysis
  graph (orphan files are not bundled by `pyinstaller --onefile` against a
  script entrypoint, only via wheel install + import discovery).

To inspect a shipped binary:

```
emcom-server --version
# emcom-server v0.0.22 (banana 7a9e2c4, win-x64, built 2026-05-28T21:45:00Z)
```

## Runtime tmpdir (the `~/.emcom/runtime` literal-dir bug)

PyInstaller's `--runtime-tmpdir` flag does **no** path expansion in either
bootloader, with one exception:

- **POSIX bootloader** (`pyi_utils_posix.c`): no expansion of any kind —
  the path goes straight to `mkdir()`. `"~/.emcom/runtime"` creates a literal
  `~` directory under the current working directory.
- **Windows bootloader**: calls `ExpandEnvironmentStringsW`. `%VAR%` expands;
  `~` does not.

Implication:

- Windows: use `%USERPROFILE%\.emcom\runtime` (backslashes — the bootloader
  walks `\` separators when creating intermediate directories).
- POSIX (mac/linux): omit `--runtime-tmpdir` entirely. The default
  `tempfile.gettempdir()` (`/tmp/_MEI<random>`) is fine — AppLocker / WDAC is
  the only reason to relocate extraction, and it's Windows-only.

The fellow-agents matrix encodes this per-platform; see `release.yml` under
`strategy.matrix.include.runtime_tmpdir`. The local Windows spec uses
`runtime_tmpdir='%USERPROFILE%\\.emcom\\runtime'`.

## Local Windows build

```powershell
cd c:\s\projects\work\teams\working\banana\emcom
.\.venv\Scripts\Activate.ps1
pyinstaller --noconfirm emcom-server.spec
.\deploy.ps1   # version check + backup + verification
```

After deploy, sanity-check with `emcom-server --version`.

## Cannot overwrite a running exe

Windows holds an exclusive lock on the running binary. Stop any
`emcom-server.exe` / `emcom-tui.exe` processes before rebuilding (Task Manager
or `Stop-Process -Id <pid>`).

## Last verified

2026-06-02 (frost) — added `--version` plumbing + provenance shape; spec
committed; matches fellow-agents release.yml @92c0cda.
