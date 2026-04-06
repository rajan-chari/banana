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
            var num = item.Number.HasValue ? item.Number.Value.ToString() : "";
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
        if (item.Number.HasValue)
            sb.AppendLine($"Number:     {item.Number} ({item.ExternalId})");
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
