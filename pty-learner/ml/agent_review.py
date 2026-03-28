"""
agent_review.py — Agent-friendly dataset review tool for pty-learner.

Two modes:

  EXPORT mode: reads all labels-*.jsonl, outputs a JSON review file for an AI agent
    python agent_review.py --export reviews.json

  APPLY mode: reads a corrections JSON file and applies changes back to source files
    python agent_review.py --apply corrections.json
    python agent_review.py --apply corrections.json --dry-run

Export format (reviews.json):
  [
    {
      "id": "labels-001.jsonl:42",    # <filename>:<index-in-file>
      "source_file": "labels-001.jsonl",
      "index": 42,
      "text_lines": [...],
      "current_label": "busy",
      "source": "timeout_flag",
      "confidence": "uncertain",
      "timestamp": "...",
      "session_id": "...",
      "regex_opinion": "not_busy",    # "busy" | "not_busy" | "unknown"
      "regex_agrees": false
    },
    ...
  ]
  Priority order: timeout_flag first, then regex-disagrees, then unreviewed, then reviewed.

Corrections format (corrections.json):
  [
    {"id": "labels-001.jsonl:42", "label": "not_busy"},
    {"id": "labels-002.jsonl:7",  "label": "delete"},
    ...
  ]
  label values: "busy" | "not_busy" | "delete"

Default data dir: ../../pty-win/ml-dataset/
"""
import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_DATA_DIR = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset"

# Regex opinions — ported from pty-win/src/screen-detector.ts
_BUSY_RE = re.compile(r"\S+…\s+\(")
_INPUT_RE = re.compile(r"^[❯>]\s*$")
_PERM_RE = re.compile(r"allow|permission|approve|deny|y/n|yes.*no", re.IGNORECASE)
_STATUS_RE = re.compile(r"^\s*[▸▶●⏺]\s|@\w+\s+\$|shift.tab|accept\s+edits", re.IGNORECASE)


def regex_opinion(text_lines: list[str]) -> str:
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


def find_dataset_files(data_dir: Path) -> list[Path]:
    files = sorted(data_dir.glob("labels-*.jsonl"))
    if not files:
        single = data_dir / "labels.jsonl"
        if single.exists():
            files = [single]
    return files


def load_file(path: Path) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def save_file(path: Path, records: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")


def make_id(filename: str, index: int) -> str:
    return f"{filename}:{index}"


def priority_key(entry: dict) -> tuple:
    is_timeout = entry["source"] == "timeout_flag"
    disagrees = not entry["regex_agrees"] and entry["regex_opinion"] != "unknown"
    is_reviewed = entry.get("reviewed", False)
    return (not is_timeout, not disagrees, is_reviewed)


# ── Export mode ───────────────────────────────────────────────────────────────

def cmd_export(data_dir: Path, output_path: Path) -> None:
    files = find_dataset_files(data_dir)
    if not files:
        print(f"No dataset files found in {data_dir}", file=sys.stderr)
        sys.exit(1)

    entries = []
    for file_path in files:
        records = load_file(file_path)
        for idx, rec in enumerate(records):
            if rec.get("deleted"):
                continue
            opinion = regex_opinion(rec.get("text_lines", []))
            current_label = rec.get("label", "")
            entry = {
                "id": make_id(file_path.name, idx),
                "source_file": file_path.name,
                "index": idx,
                "text_lines": rec.get("text_lines", []),
                "current_label": current_label,
                "source": rec.get("source", ""),
                "confidence": rec.get("confidence", ""),
                "timestamp": rec.get("timestamp", ""),
                "session_id": rec.get("session_id", ""),
                "reviewed": rec.get("reviewed", False),
                "regex_opinion": opinion,
                "regex_agrees": (opinion == current_label) if opinion != "unknown" else True,
            }
            entries.append(entry)

    # Sort by priority
    entries.sort(key=priority_key)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    n_timeout = sum(1 for e in entries if e["source"] == "timeout_flag")
    n_disagree = sum(1 for e in entries if not e["regex_agrees"] and e["regex_opinion"] != "unknown")
    print(f"Exported {len(entries)} samples to {output_path}")
    print(f"  timeout_flag: {n_timeout}")
    print(f"  regex disagrees: {n_disagree}")
    print(f"  reviewed: {sum(1 for e in entries if e['reviewed'])}")


# ── Apply mode ────────────────────────────────────────────────────────────────

def cmd_apply(data_dir: Path, corrections_path: Path, dry_run: bool) -> None:
    with open(corrections_path, encoding="utf-8") as f:
        corrections: list[dict] = json.load(f)

    # Group corrections by source file
    by_file: dict[str, dict[int, dict]] = {}
    for c in corrections:
        rec_id = c["id"]
        parts = rec_id.rsplit(":", 1)
        if len(parts) != 2:
            print(f"WARNING: invalid id format '{rec_id}', skipping", file=sys.stderr)
            continue
        filename, idx_str = parts
        try:
            idx = int(idx_str)
        except ValueError:
            print(f"WARNING: invalid index in id '{rec_id}', skipping", file=sys.stderr)
            continue
        by_file.setdefault(filename, {})[idx] = c

    n_relabeled = 0
    n_deleted = 0

    for filename, index_map in by_file.items():
        file_path = data_dir / filename
        if not file_path.exists():
            print(f"WARNING: file not found: {file_path}", file=sys.stderr)
            continue

        records = load_file(file_path)
        for idx, correction in sorted(index_map.items()):
            if idx >= len(records):
                print(f"WARNING: index {idx} out of range in {filename}, skipping")
                continue

            rec = records[idx]
            new_label = correction.get("label", "")
            old_label = rec.get("label", "")

            if new_label == "delete":
                if dry_run:
                    print(f"  [dry-run] DELETE {filename}:{idx}  (was: {old_label})")
                else:
                    rec["deleted"] = True
                    rec["reviewed"] = True
                n_deleted += 1
            elif new_label in ("busy", "not_busy"):
                if dry_run:
                    change = f"{old_label} → {new_label}" if old_label != new_label else f"{new_label} (no change)"
                    print(f"  [dry-run] RELABEL {filename}:{idx}  {change}")
                else:
                    rec["label"] = new_label
                    rec["reviewed"] = True
                    if old_label != new_label:
                        n_relabeled += 1
            else:
                print(f"WARNING: unknown label '{new_label}' for {filename}:{idx}, skipping")
                continue

        if not dry_run:
            save_file(file_path, records)

    prefix = "[dry-run] " if dry_run else ""
    print(f"\n{prefix}Applied {len(corrections)} corrections:")
    print(f"  Relabeled : {n_relabeled}")
    print(f"  Deleted   : {n_deleted}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Agent-friendly dataset review tool")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--export", metavar="OUTPUT.json",
                       help="Export samples to JSON for agent review")
    group.add_argument("--apply", metavar="CORRECTIONS.json",
                       help="Apply corrections JSON to source files")

    parser.add_argument("--dry-run", action="store_true",
                        help="Preview apply changes without writing (only with --apply)")

    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    if args.export:
        cmd_export(data_dir, Path(args.export))
    else:
        if args.dry_run:
            print("Dry run — no files will be modified")
        cmd_apply(data_dir, Path(args.apply), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
