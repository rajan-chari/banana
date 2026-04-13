using System.Text;

namespace Tracker;

public static class Fmt
{
    public static string ShortId(string uuid) => uuid.Length >= 8 ? uuid[..8] : uuid;

    public static string ShortDate(string iso)
    {
        if (iso.Length < 19) return iso;
        return $"{iso[5..7]}/{iso[8..10]} {iso[11..19]}";
    }

    public static string Trunc(string s, int width) =>
        s.Length <= width ? s : s[..(width - 1)] + "\u2026";

    public static string FormatList(List<WorkItem> items)
    {
        if (items.Count == 0) return "No items.";
        var sb = new StringBuilder();
        sb.AppendLine($"{"ID",-10}  {"Repo",-12}  {"#",-5}  {"Title",-25}  {"Status",-16}  {"Sev",-4}  {"Assigned",-10}  {"Age",-6}  Last Activity");
        sb.AppendLine(new string('-', 10 + 2 + 12 + 2 + 5 + 2 + 25 + 2 + 16 + 2 + 4 + 2 + 10 + 2 + 6 + 2 + 13));
        foreach (var item in items)
        {
            var num = item.Number is > 0 ? item.Number.Value.ToString() : "";
            var assigned = item.AssignedTo ?? "";
            var origin = item.DateFound ?? item.CreatedAt;
            var age = RelTime(origin);
            var lastAct = RelTime(item.UpdatedAt);
            sb.AppendLine($"{ShortId(item.Id),-10}  {Trunc(item.Repo, 12),-12}  {num,-5}  {Trunc(item.Title, 25),-25}  {item.Status,-16}  {item.Severity[..3],-4}  {Trunc(assigned, 10),-10}  {age,-6}  {lastAct}");
        }
        return sb.ToString().TrimEnd();
    }

    /// <summary>Format ISO timestamp as relative time (2h, 3d, 1w).</summary>
    private static string RelTime(string? iso)
    {
        if (string.IsNullOrEmpty(iso)) return "—";
        if (!DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt))
            return "—";
        var span = DateTime.UtcNow - dt.ToUniversalTime();
        if (span.TotalHours < 1) return $"{(int)span.TotalMinutes}m";
        if (span.TotalDays < 1) return $"{(int)span.TotalHours}h";
        if (span.TotalDays < 7) return $"{(int)span.TotalDays}d";
        return $"{(int)(span.TotalDays / 7)}w";
    }

    public static string FormatItem(WorkItem item)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"ID:         {item.Id}");
        sb.AppendLine($"Repo:       {item.Repo}");
        if (item.Number is > 0)
            sb.AppendLine($"Number:     #{item.Number} ({item.ExternalId})");
        sb.AppendLine($"Title:      {item.Title}");
        sb.AppendLine($"Type:       {item.Type}");
        sb.AppendLine($"Severity:   {item.Severity}");
        sb.AppendLine($"Status:     {item.Status}");
        if (item.AssignedTo != null)
            sb.AppendLine($"Assigned:   {item.AssignedTo}");
        sb.AppendLine($"Created by: {item.CreatedBy}");
        sb.AppendLine($"Created:    {ShortDate(item.CreatedAt)}");
        sb.AppendLine($"Updated:    {ShortDate(item.UpdatedAt)}");
        if (item.Labels.Count > 0)
            sb.AppendLine($"Labels:     {string.Join(", ", item.Labels)}");
        if (!string.IsNullOrEmpty(item.DateFound))
            sb.AppendLine($"Found:      {ShortDate(item.DateFound)}");
        if (!string.IsNullOrEmpty(item.Blocker))
        {
            sb.AppendLine($"Blocker:    {item.Blocker}");
            if (item.BlockedSince != null)
                sb.AppendLine($"Blocked:    since {ShortDate(item.BlockedSince)}");
        }
        if (!string.IsNullOrEmpty(item.Findings))
            sb.AppendLine($"Findings:   {item.Findings}");
        if (!string.IsNullOrEmpty(item.Decision))
        {
            sb.AppendLine($"Decision:   {item.Decision}");
            if (!string.IsNullOrEmpty(item.DecisionRationale))
                sb.AppendLine($"Rationale:  {item.DecisionRationale}");
        }
        if (!string.IsNullOrEmpty(item.Notes))
        {
            sb.AppendLine();
            sb.AppendLine(item.Notes);
        }
        if (item.Links is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("Links:");
            foreach (var link in item.Links)
                sb.AppendLine($"  {link.Type}: {ShortId(link.Id)}");
        }
        if (item.History is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("History:");
            foreach (var h in item.History)
            {
                var desc = h.Field == "comment"
                    ? h.Comment
                    : $"{h.Field}: {h.OldValue ?? "(none)"} → {h.NewValue ?? "(none)"}";
                var comment = h.Field != "comment" && !string.IsNullOrEmpty(h.Comment) ? $" — {h.Comment}" : "";
                sb.AppendLine($"  {ShortDate(h.ChangedAt)} [{h.ChangedBy}] {desc}{comment}");
            }
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatRepoMetrics(RepoMetrics r)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== GITHUB ACTIVITY ({r.Period}) ===");
        if (r.PrVelocity is { MergedCount: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("PR VELOCITY");
            sb.AppendLine($"  {"Merged",-10}  {"Avg Cycle",-10}  {"Min",-8}  Max");
            sb.AppendLine($"  {r.PrVelocity.MergedCount,-10}  {Hrs(r.PrVelocity.AvgCycleHours),-10}  {Hrs(r.PrVelocity.MinCycleHours),-8}  {Hrs(r.PrVelocity.MaxCycleHours)}");
        }
        if (r.FirstReview is { AvgHours: not null })
        {
            sb.AppendLine();
            sb.AppendLine("FIRST REVIEW");
            sb.AppendLine($"  {"Avg",-10}  PRs Measured");
            sb.AppendLine($"  {Hrs(r.FirstReview.AvgHours),-10}  {r.FirstReview.Count}");
        }
        if (r.CommunityResponse is { AvgHours: not null })
        {
            sb.AppendLine();
            sb.AppendLine("COMMUNITY RESPONSE");
            sb.AppendLine($"  {"Avg",-10}  Issues Measured");
            sb.AppendLine($"  {Hrs(r.CommunityResponse.AvgHours),-10}  {r.CommunityResponse.Count}");
        }
        if (r.ReviewsByPerson is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("REVIEWS BY PERSON");
            sb.AppendLine($"  {"Name",-20}  Reviews");
            sb.AppendLine($"  {new string('-', 20)}  -------");
            foreach (var (name, count) in r.ReviewsByPerson.Take(10))
                sb.AppendLine($"  {name,-20}  {count}");
        }
        if (r.CommitsByPerson is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("COMMITS BY PERSON");
            sb.AppendLine($"  {"Name",-20}  Commits");
            sb.AppendLine($"  {new string('-', 20)}  -------");
            foreach (var (name, count) in r.CommitsByPerson.Take(10))
                sb.AppendLine($"  {name,-20}  {count}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatReport(Report r)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== AGENT WORKFLOW ({r.Period}" + (r.Repo != null ? $", {r.Repo}" : "") + ") ===");
        sb.AppendLine();
        sb.AppendLine("OVERVIEW");
        sb.AppendLine($"  {"Created",-10}  {"Closed",-10}  Open");
        sb.AppendLine($"  {r.Created,-10}  {r.Closed,-10}  {r.Open}");
        if (r.PrVelocity is { MergedCount: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("PR VELOCITY");
            sb.AppendLine($"  {"Merged",-10}  {"Avg Cycle",-10}  {"Min",-8}  Max");
            sb.AppendLine($"  {r.PrVelocity.MergedCount,-10}  {Hrs(r.PrVelocity.AvgCycleHours),-10}  {Hrs(r.PrVelocity.MinCycleHours),-8}  {Hrs(r.PrVelocity.MaxCycleHours)}");
        }
        if (r.Sla != null)
        {
            sb.AppendLine();
            sb.AppendLine("SLA (first response)");
            if (r.Sla.AvgResponseHours.HasValue)
            {
                sb.AppendLine($"  {"Avg",-10}  {"Min",-8}  {"Max",-8}  Items");
                sb.AppendLine($"  {Hrs(r.Sla.AvgResponseHours),-10}  {Hrs(r.Sla.MinResponseHours),-8}  {Hrs(r.Sla.MaxResponseHours),-8}  {r.Sla.ItemsMeasured}");
            }
            else
                sb.AppendLine("  No response data yet");
        }
        if (r.OpenIssueAge is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("OPEN ISSUE AGE");
            sb.AppendLine($"  {"Avg",-10}  {"Max",-10}  Count");
            sb.AppendLine($"  {Hrs(r.OpenIssueAge.AvgHours),-10}  {Hrs(r.OpenIssueAge.MaxHours),-10}  {r.OpenIssueAge.Count}");
        }
        if (r.DwellTimes is { Count: > 0 })
        {
            sb.AppendLine();
            sb.AppendLine("DWELL TIME BY STATUS");
            sb.AppendLine($"  {"Status",-20}  Avg Hours");
            sb.AppendLine($"  {new string('-', 20)}  ---------");
            foreach (var (status, hours) in r.DwellTimes)
                sb.AppendLine($"  {status,-20}  {hours:F1}h");
        }
        return sb.ToString().TrimEnd();
    }

    private static string Hrs(double? h) => h.HasValue ? $"{h:F1}h" : "—";

    public static string FormatPeopleReport(PeopleReport r)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"People Report: {r.Period}");
        sb.AppendLine($"{"Name",-14}  {"Actions",-8}  {"Status",-7}  {"Comments",-9}  {"Items",-6}  Resolved");
        sb.AppendLine(new string('-', 14 + 2 + 8 + 2 + 7 + 2 + 9 + 2 + 6 + 2 + 8));
        foreach (var (name, m) in r.People.OrderByDescending(x => x.Value.Actions))
            sb.AppendLine($"{Trunc(name, 14),-14}  {m.Actions,-8}  {m.StatusChanges,-7}  {m.Comments,-9}  {m.ItemsTouched,-6}  {m.Resolved}");
        return sb.ToString().TrimEnd();
    }

    public static string FormatSlaReport(SlaReport r)
    {
        if (r.Items.Count == 0) return "No open items.";
        var sb = new StringBuilder();
        sb.AppendLine($"SLA Report" + (r.Repo != null ? $" (repo: {r.Repo})" : ""));
        sb.AppendLine($"{"ID",-10}  {"Repo",-12}  {"#",-5}  {"Title",-25}  {"Status",-14}  {"Sev",-5}  {"Age(h)",-8}  Resp(h)");
        sb.AppendLine(new string('-', 10 + 2 + 12 + 2 + 5 + 2 + 25 + 2 + 14 + 2 + 5 + 2 + 8 + 2 + 7));
        foreach (var i in r.Items)
        {
            var num = i.Number is > 0 ? i.Number.Value.ToString() : "";
            var resp = i.ResponseHours.HasValue ? $"{i.ResponseHours:F1}" : "—";
            sb.AppendLine($"{i.Id,-10}  {Trunc(i.Repo, 12),-12}  {num,-5}  {Trunc(i.Title, 25),-25}  {i.Status,-14}  {i.Severity[..3],-5}  {i.AgeHours,-8:F1}  {resp}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatStats(WorkItemStats stats)
    {
        var sb = new StringBuilder();
        sb.AppendLine("By Status:");
        foreach (var (k, v) in stats.ByStatus.OrderByDescending(x => x.Value))
            sb.AppendLine($"  {k,-20} {v}");
        if (stats.ByRepo.Count > 0)
        {
            sb.AppendLine("By Repo (open):");
            foreach (var (k, v) in stats.ByRepo.OrderByDescending(x => x.Value))
                sb.AppendLine($"  {k,-20} {v}");
        }
        if (stats.ByAssignee.Count > 0)
        {
            sb.AppendLine("By Assignee (open):");
            foreach (var (k, v) in stats.ByAssignee.OrderByDescending(x => x.Value))
                sb.AppendLine($"  {k,-20} {v}");
        }
        if (stats.BySeverity.Count > 0)
        {
            sb.AppendLine("By Severity (open):");
            foreach (var (k, v) in stats.BySeverity.OrderBy(x => x.Key))
                sb.AppendLine($"  {k,-20} {v}");
        }
        return sb.ToString().TrimEnd();
    }
}
