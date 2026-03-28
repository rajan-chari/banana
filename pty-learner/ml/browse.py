"""
browse.py — Terminal dataset browser for reviewing and correcting labels in labels.jsonl.

Usage:
    python browse.py [--data PATH] [--source SOURCE] [--label LABEL] [--unreviewed-only]

Controls:
    b  — relabel as busy
    n  — relabel as not_busy
    s  — skip (no change)
    d  — delete (flag, excluded from training)
    q  — quit and save

Default data path: ../../pty-win/ml-dataset/labels.jsonl
"""
import argparse
import json
import os
import sys
from copy import deepcopy
from pathlib import Path

DEFAULT_DATA = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset" / "labels.jsonl"

# ANSI colors
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
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


def load_records(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def save_records(path: Path, records: list[dict]) -> None:
    with open(path, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")


def apply_filters(records: list[dict], source: str | None, label: str | None, unreviewed_only: bool) -> list[int]:
    """Return list of indices into records that match filters."""
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
    return indices


def label_color(label: str) -> str:
    if label == "busy":
        return RED + BOLD + label + RESET
    elif label == "not_busy":
        return GREEN + BOLD + label + RESET
    return BOLD + label + RESET


def render_sample(rec: dict, position: int, total: int) -> None:
    clear()

    # Header
    idx_str = f"{position + 1}/{total}"
    reviewed = " [reviewed]" if rec.get("reviewed") else ""
    deleted = " [DELETED]" if rec.get("deleted") else ""
    print(f"{BOLD}{CYAN}── Sample {idx_str}{RESET}{reviewed}{deleted}")
    print(f"  session : {DIM}{rec.get('session_id', 'n/a')}{RESET}")
    print(f"  time    : {DIM}{rec.get('timestamp', 'n/a')}{RESET}")
    print(f"  source  : {YELLOW}{rec.get('source', 'n/a')}{RESET}")
    print(f"  label   : {label_color(rec.get('label', 'n/a'))}")
    print(f"  conf    : {rec.get('confidence', 'n/a')}")
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


def main():
    parser = argparse.ArgumentParser(description="Browse and correct labels in labels.jsonl")
    parser.add_argument("--data", default=str(DEFAULT_DATA), help="Path to labels.jsonl")
    parser.add_argument("--source", choices=["auto_detect", "force_idle", "timeout_flag"],
                        help="Filter by source")
    parser.add_argument("--label", choices=["busy", "not_busy"], help="Filter by label")
    parser.add_argument("--unreviewed-only", action="store_true",
                        help="Only show samples not yet manually reviewed")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Error: data file not found: {data_path}")
        sys.exit(1)

    records = load_records(data_path)
    original = deepcopy(records)
    filtered = apply_filters(records, args.source, args.label, args.unreviewed_only)

    if not filtered:
        print("No samples match the current filters.")
        sys.exit(0)

    print(f"Loaded {len(records)} total records, {len(filtered)} match filters.")

    n_reviewed = 0
    n_relabeled = 0
    n_deleted = 0
    pos = 0

    while pos < len(filtered):
        idx = filtered[pos]
        rec = records[idx]

        render_sample(rec, pos, len(filtered))

        key = getch()

        if key == "q":
            break
        elif key == "s":
            pos += 1
            continue
        elif key == "b":
            old_label = rec.get("label")
            rec["label"] = "busy"
            rec["reviewed"] = True
            n_reviewed += 1
            if old_label != "busy":
                n_relabeled += 1
            pos += 1
        elif key == "n":
            old_label = rec.get("label")
            rec["label"] = "not_busy"
            rec["reviewed"] = True
            n_reviewed += 1
            if old_label != "not_busy":
                n_relabeled += 1
            pos += 1
        elif key == "d":
            rec["deleted"] = True
            rec["reviewed"] = True
            n_reviewed += 1
            n_deleted += 1
            pos += 1
        # ignore other keys, re-render same sample

    save_records(data_path, records)
    clear()
    print_summary(n_reviewed, n_relabeled, n_deleted)
    print(f"Saved to {data_path}")


if __name__ == "__main__":
    main()
