"""Read scout's metrics.jsonl and aggregate GitHub data for reports."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

# Default path to scout's metrics file
DEFAULT_METRICS_PATH = (
    Path.home().parent / "ranaras" / "projects" / "work" / "teams" / "working"
    / "fellow_scholars" / "claude-folders" / "issue-gatherer" / "metrics.jsonl"
) if False else Path(  # Use absolute path
    r"C:\s\projects\work\teams\working\fellow_scholars\claude-folders\issue-gatherer\metrics.jsonl"
)


def _load_events(path: Path | None = None, since: str | None = None) -> list[dict]:
    """Load events from metrics.jsonl, optionally filtered by date."""
    p = path or DEFAULT_METRICS_PATH
    if not p.exists():
        return []
    events = []
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
                if since and evt.get("date", "") < since:
                    continue
                events.append(evt)
            except json.JSONDecodeError:
                continue
    return events


def github_metrics(period: str = "30d", repo: str | None = None,
                   metrics_path: Path | None = None) -> dict:
    """Aggregate GitHub metrics from scout's JSONL for the report endpoint."""
    from datetime import timedelta
    days = int(period.rstrip("d")) if period.endswith("d") else 30
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    events = _load_events(metrics_path, since=cutoff)

    # PR velocity from pr_merged events
    pr_merged = [e for e in events if e.get("type") == "pr_merged"]
    if repo:
        pr_merged = [e for e in pr_merged if e.get("repo", "").endswith(repo) or repo in e.get("repo", "")]

    cycle_times = [e["open_to_merge_hours"] for e in pr_merged if "open_to_merge_hours" in e]
    first_review_times = [e["first_review_hours"] for e in pr_merged if "first_review_hours" in e]

    # Issue metrics from issue_closed events
    issue_closed = [e for e in events if e.get("type") == "issue_closed"]
    if repo:
        issue_closed = [e for e in issue_closed if repo in e.get("repo", "")]

    # Community first-response from community_issue events
    community = [e for e in events if e.get("type") == "community_issue"]
    if repo:
        community = [e for e in community if repo in e.get("repo", "")]
    response_times = [e.get("first_response_hours") for e in community if e.get("first_response_hours") is not None]

    # Daily data: reviews per person, commits per contributor
    daily = [e for e in events if e.get("type") == "daily"]
    reviews_by_person: dict[str, int] = {}
    commits_by_person: dict[str, int] = {}
    for d in daily:
        for reviewer, count in d.get("reviews", {}).items():
            reviews_by_person[reviewer] = reviews_by_person.get(reviewer, 0) + count
        for author, count in d.get("commits", {}).items():
            commits_by_person[author] = commits_by_person.get(author, 0) + count

    # Issue age snapshots
    age_snapshots = [e for e in events if e.get("type") == "issue_age_snapshot"]
    if repo:
        age_snapshots = [e for e in age_snapshots if repo in e.get("repo", "")]
    latest_ages = {}
    for snap in age_snapshots:
        r = snap.get("repo", "")
        latest_ages[r] = {"p50_days": snap.get("p50_days"), "p90_days": snap.get("p90_days"),
                          "open_count": snap.get("open_count")}

    # Monthly summaries
    monthly = [e for e in events if e.get("type") == "monthly_summary"]

    return {
        "source": "github (scout metrics.jsonl)",
        "period": period,
        "pr_velocity": {
            "merged_count": len(pr_merged),
            "avg_cycle_hours": round(sum(cycle_times) / len(cycle_times), 1) if cycle_times else None,
            "min_cycle_hours": round(min(cycle_times), 1) if cycle_times else None,
            "max_cycle_hours": round(max(cycle_times), 1) if cycle_times else None,
        },
        "first_review": {
            "avg_hours": round(sum(first_review_times) / len(first_review_times), 1) if first_review_times else None,
            "count": len(first_review_times),
        },
        "issues_closed": len(issue_closed),
        "community_response": {
            "avg_hours": round(sum(response_times) / len(response_times), 1) if response_times else None,
            "count": len(response_times),
        },
        "issue_age": latest_ages if latest_ages else None,
        "reviews_by_person": dict(sorted(reviews_by_person.items(), key=lambda x: -x[1])[:15]),
        "commits_by_person": dict(sorted(commits_by_person.items(), key=lambda x: -x[1])[:15]),
        "monthly_summaries": monthly[-3:] if monthly else [],
    }
