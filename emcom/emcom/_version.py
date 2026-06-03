"""Build provenance — overwritten by fellow-agents release.yml at release-build time.

Local dev builds keep these sentinel values; CI emits a fresh file with the real
banana SHA, release tag, build timestamp, and platform before pyinstaller bundles
the package. The fields are intentionally module-level constants so PyInstaller's
static Analysis picks them up via the `from emcom import _version` in
emcom_server/main.py.

Field shape (locked with forge, emcom thread b4446536):
    __banana_sha__    — full 40-char banana commit SHA (display [:7] at runtime)
    __release_tag__   — fellow-agents release tag, e.g. "v0.0.22"
    __built_at__      — ISO 8601 UTC, e.g. "2026-05-28T21:45:00Z"
    __platform__      — matrix.platform, e.g. "win-x64" / "osx-arm64" / "linux-x64"
"""

__banana_sha__ = "dev"
__release_tag__ = "dev"
__built_at__ = "unknown"
__platform__ = "dev"
