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
        sb.AppendLine($"{"ID",-10}  {"Repo",-12}  {"#",-5}  {"Title",-28}  {"Status",-16}  {"Sev",-6}  {"Assigned",-10}  {"Updated",-14}");
        sb.AppendLine(new string('-', 10 + 2 + 12 + 2 + 5 + 2 + 28 + 2 + 16 + 2 + 6 + 2 + 10 + 2 + 14));
        foreach (var item in items)
        {
            var num = item.Number is > 0 ? item.Number.Value.ToString() : "";
            var assigned = item.AssignedTo ?? "";
            sb.AppendLine($"{ShortId(item.Id),-10}  {Trunc(item.Repo, 12),-12}  {num,-5}  {Trunc(item.Title, 28),-28}  {item.Status,-16}  {item.Severity[..3],-6}  {Trunc(assigned, 10),-10}  {ShortDate(item.UpdatedAt),-14}");
        }
        return sb.ToString().TrimEnd();
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

    public static string FormatReport(Report r)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Report: {r.Period}" + (r.Repo != null ? $" (repo: {r.Repo})" : " (all repos)"));
        sb.AppendLine($"  Created: {r.Created}  Closed: {r.Closed}  Open: {r.Open}");
        sb.AppendLine();
        if (r.PrVelocity != null)
        {
            sb.AppendLine("PR Velocity:");
            sb.AppendLine($"  Merged: {r.PrVelocity.MergedCount}");
            if (r.PrVelocity.AvgCycleHours.HasValue)
                sb.AppendLine($"  Cycle time: avg {r.PrVelocity.AvgCycleHours:F1}h, " +
                    $"min {r.PrVelocity.MinCycleHours:F1}h, max {r.PrVelocity.MaxCycleHours:F1}h");
        }
        if (r.Sla != null)
        {
            sb.AppendLine("SLA (first response):");
            if (r.Sla.AvgResponseHours.HasValue)
                sb.AppendLine($"  Response time: avg {r.Sla.AvgResponseHours:F1}h, " +
                    $"min {r.Sla.MinResponseHours:F1}h, max {r.Sla.MaxResponseHours:F1}h " +
                    $"({r.Sla.ItemsMeasured} items)");
            else
                sb.AppendLine("  No response data yet");
        }
        if (r.OpenIssueAge is { Count: > 0 })
        {
            sb.AppendLine("Open issue age:");
            sb.AppendLine($"  Avg: {r.OpenIssueAge.AvgHours:F1}h, Max: {r.OpenIssueAge.MaxHours:F1}h ({r.OpenIssueAge.Count} items)");
        }
        if (r.DwellTimes is { Count: > 0 })
        {
            sb.AppendLine("Avg dwell time per status (hours):");
            foreach (var (status, hours) in r.DwellTimes)
                sb.AppendLine($"  {status,-20} {hours:F1}h");
        }
        return sb.ToString().TrimEnd();
    }

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
