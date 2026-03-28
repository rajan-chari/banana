"""
browse.py — Terminal dataset browser for reviewing and correcting labels in labels.jsonl.

Loads all labels-*.jsonl files from ml-dataset/ as a unified dataset.
Saves changes back to each record's source file.

Usage:
    python browse.py [--data-dir PATH] [--source SOURCE] [--label LABEL] [--unreviewed-only]

Controls:
    b  — relabel as busy
    n  — relabel as not_busy
    s  — skip (no change)
    d  — delete (flag, excluded from training)
    q  — quit and save

Default data dir: ../../pty-win/ml-dataset/
"""
import argparse
import json
import os
import re
import sys
from copy import deepcopy
from pathlib import Path

DEFAULT_DATA_DIR = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset"

# Regex opinions — ported from pty-win/src/screen-detector.ts
_BUSY_RE = re.compile(r"\S+…\s+\(")
_INPUT_RE = re.compile(r"^[❯>]\s*$")
_PERM_RE = re.compile(r"allow|permission|approve|deny|y/n|yes.*no", re.IGNORECASE)
_STATUS_RE = re.compile(r"^\s*[▸▶●⏺]\s|@\w+\s+\$|shift.tab|accept\s+edits", re.IGNORECASE)

# ANSI colors
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
MAGENTA = "\033[35m"
RESET = "\033[0m"


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def getch() -> str:
    """Read a single keypress without requiring Enter."""
    if os.name == "nt":
        import msvcrt
        ch = msvcrt.getch()
        return ch.decode("utf-8", errors="replace").lower()
    else:
        import tty, termios
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        return ch.lower()


# ── Data loading / saving ────────────────────────────────────────────────────

def find_dataset_files(data_dir: Path) -> list[Path]:
    files = sorted(data_dir.glob("labels-*.jsonl"))
    if not files:
        # Fallback: single labels.jsonl (original format)
        single = data_dir / "labels.jsonl"
        if single.exists():
            files = [single]
    return files


def load_all_records(data_dir: Path) -> list[dict]:
    """Load all label files into one list. Each record gets a '_source_file' key."""
    files = find_dataset_files(data_dir)
    if not files:
        return []
    records = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rec = json.loads(line)
                    rec["_source_file"] = str(path)
                    records.append(rec)
    return records


def save_all_records(records: list[dict]) -> None:
    """Group records by source file and rewrite each file."""
    by_file: dict[str, list[dict]] = {}
    for rec in records:
        path = rec["_source_file"]
        by_file.setdefault(path, []).append(rec)

    for path, recs in by_file.items():
        with open(path, "w", encoding="utf-8") as f:
            for rec in recs:
                out = {k: v for k, v in rec.items() if not k.startswith("_")}
                f.write(json.dumps(out) + "\n")


# ── Regex opinion ────────────────────────────────────────────────────────────

def regex_opinion(text_lines: list[str]) -> str:
    """Return 'busy' or 'not_busy' or 'unknown' based on pty-win's screen detector logic."""
    for line in text_lines:
        if _BUSY_RE.search(line):
            return "busy"
    joined = " ".join(text_lines)
    if _PERM_RE.search(joined):
        return "not_busy"
    for line in reversed(text_lines):
        if _STATUS_RE.search(line):
            continue
        if _INPUT_RE.match(line):
            return "not_busy"
    return "unknown"


# ── Prioritisation ───────────────────────────────────────────────────────────

def priority_key(rec: dict) -> tuple:
    """Lower = shown first. Order: disagree → timeout_flag → unreviewed → reviewed."""
    opinion = regex_opinion(rec.get("text_lines", []))
    disagrees = opinion != "unknown" and opinion != rec.get("label")
    is_timeout = rec.get("source") == "timeout_flag"
    is_reviewed = bool(rec.get("reviewed"))
    return (not disagrees, not is_timeout, is_reviewed)


# ── Filtering ────────────────────────────────────────────────────────────────

def apply_filters(records: list[dict], source: str | None, label: str | None,
                  unreviewed_only: bool) -> list[int]:
    indices = []
    for i, rec in enumerate(records):
        if rec.get("deleted"):
            continue
        if source and rec.get("source") != source:
            continue
        if label and rec.get("label") != label:
            continue
        if unreviewed_only and rec.get("reviewed"):
            continue
        indices.append(i)
    # Sort by priority
    indices.sort(key=lambda i: priority_key(records[i]))
    return indices


# ── Stats ────────────────────────────────────────────────────────────────────

def compute_balance(records: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {"busy": 0, "not_busy": 0, "deleted": 0}
    for rec in records:
        if rec.get("deleted"):
            counts["deleted"] += 1
        elif rec.get("label") == "busy":
            counts["busy"] += 1
        elif rec.get("label") == "not_busy":
            counts["not_busy"] += 1
    return counts


# ── Rendering ────────────────────────────────────────────────────────────────

def label_color(label: str) -> str:
    if label == "busy":
        return RED + BOLD + label + RESET
    elif label == "not_busy":
        return GREEN + BOLD + label + RESET
    return BOLD + label + RESET


def opinion_str(opinion: str, stored_label: str) -> str:
    if opinion == "unknown":
        return f"{DIM}? uncertain{RESET}"
    agrees = opinion == stored_label
    mark = f"{GREEN}✓ agree{RESET}" if agrees else f"{RED}{BOLD}✗ DISAGREE{RESET}"
    return f"regex→{label_color(opinion)}  {mark}"


def render_sample(rec: dict, position: int, total: int, balance: dict[str, int]) -> None:
    clear()

    # Balance bar
    bal = (f"  {BOLD}busy:{RESET} {balance['busy']}  "
           f"{BOLD}not_busy:{RESET} {balance['not_busy']}  "
           f"{DIM}deleted:{RESET} {balance['deleted']}")
    print(bal)
    print()

    # Header
    source_file = Path(rec.get("_source_file", "?")).name
    reviewed = f" {GREEN}[reviewed]{RESET}" if rec.get("reviewed") else ""
    deleted = f" {RED}[DELETED]{RESET}" if rec.get("deleted") else ""
    opinion = regex_opinion(rec.get("text_lines", []))

    print(f"{BOLD}{CYAN}── Sample {position + 1}/{total}{RESET}  {DIM}{source_file}{RESET}{reviewed}{deleted}")
    print(f"  session : {DIM}{rec.get('session_id', 'n/a')}{RESET}")
    print(f"  time    : {DIM}{rec.get('timestamp', 'n/a')}{RESET}")
    print(f"  source  : {YELLOW}{rec.get('source', 'n/a')}{RESET}")
    print(f"  label   : {label_color(rec.get('label', 'n/a'))}")
    print(f"  conf    : {rec.get('confidence', 'n/a')}")
    print(f"  regex   : {opinion_str(opinion, rec.get('label', ''))}")
    print()

    # Terminal block
    print(f"{BOLD}── Screen buffer ──────────────────────────────{RESET}")
    lines = rec.get("text_lines", [])
    for i, line in enumerate(lines):
        print(f"  {DIM}{i+1:2d}{RESET} │ {line}")
    print(f"{BOLD}───────────────────────────────────────────────{RESET}")
    print()

    # Controls
    print(f"  {BOLD}b{RESET}=busy  {BOLD}n{RESET}=not_busy  {BOLD}s{RESET}=skip  {BOLD}d{RESET}=delete  {BOLD}q{RESET}=quit+save")
    print(f"  > ", end="", flush=True)


def print_summary(n_reviewed: int, n_relabeled: int, n_deleted: int) -> None:
    print()
    print(f"{BOLD}── Session summary ──────────────────────────{RESET}")
    print(f"  Reviewed  : {n_reviewed}")
    print(f"  Relabeled : {n_relabeled}")
    print(f"  Deleted   : {n_deleted}")
    print()


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Browse and correct labels in labels-*.jsonl")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Directory with labels-*.jsonl files")
    parser.add_argument("--source", choices=["auto_detect", "force_idle", "timeout_flag"],
                        help="Filter by source")
    parser.add_argument("--label", choices=["busy", "not_busy"], help="Filter by label")
    parser.add_argument("--unreviewed-only", action="store_true",
                        help="Only show samples not yet manually reviewed")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"Error: data directory not found: {data_dir}")
        sys.exit(1)

    records = load_all_records(data_dir)
    if not records:
        print(f"No labels-*.jsonl files found in {data_dir}")
        sys.exit(0)

    filtered = apply_filters(records, args.source, args.label, args.unreviewed_only)

    if not filtered:
        print("No samples match the current filters.")
        sys.exit(0)

    print(f"Loaded {len(records)} total records from {data_dir}, {len(filtered)} match filters.")

    n_reviewed = 0
    n_relabeled = 0
    n_deleted = 0
    pos = 0

    while pos < len(filtered):
        idx = filtered[pos]
        rec = records[idx]
        balance = compute_balance(records)

        render_sample(rec, pos, len(filtered), balance)

        key = getch()

        if key == "q":
            break
        elif key == "s":
            pos += 1
            continue
        elif key in ("b", "n", "d"):
            old_label = rec.get("label", "")

            if key == "d":
                rec["deleted"] = True
                rec["reviewed"] = True
                n_reviewed += 1
                n_deleted += 1
                print(f"\r  {DIM}deleted{RESET}                    ")
            else:
                new_label = "busy" if key == "b" else "not_busy"
                rec["label"] = new_label
                rec["reviewed"] = True
                n_reviewed += 1
                if old_label != new_label:
                    n_relabeled += 1
                    print(f"\r  was: {label_color(old_label)} → now: {label_color(new_label)}    ")
                else:
                    print(f"\r  confirmed: {label_color(new_label)}              ")

            pos += 1
        # ignore other keys, re-render same sample

    save_all_records(records)
    clear()
    print_summary(n_reviewed, n_relabeled, n_deleted)
    print(f"Saved to {data_dir}")


if __name__ == "__main__":
    main()
