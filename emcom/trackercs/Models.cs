using System.Text.Json.Serialization;

namespace Tracker;

public sealed class WorkItem
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("repo")] public string Repo { get; set; } = "";
    [JsonPropertyName("number")] public int? Number { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "issue";
    [JsonPropertyName("severity")] public string Severity { get; set; } = "normal";
    [JsonPropertyName("status")] public string Status { get; set; } = "new";
    [JsonPropertyName("assigned_to")] public string? AssignedTo { get; set; }
    [JsonPropertyName("created_by")] public string CreatedBy { get; set; } = "";
    [JsonPropertyName("blocker")] public string? Blocker { get; set; }
    [JsonPropertyName("blocked_since")] public string? BlockedSince { get; set; }
    [JsonPropertyName("findings")] public string? Findings { get; set; }
    [JsonPropertyName("decision")] public string? Decision { get; set; }
    [JsonPropertyName("decision_rationale")] public string? DecisionRationale { get; set; }
    [JsonPropertyName("date_found")] public string? DateFound { get; set; }
    [JsonPropertyName("labels")] public List<string> Labels { get; set; } = [];
    [JsonPropertyName("notes")] public string Notes { get; set; } = "";
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; } = "";
    [JsonPropertyName("updated_at")] public string UpdatedAt { get; set; } = "";
    [JsonPropertyName("history")] public List<HistoryEntry>? History { get; set; }
    [JsonPropertyName("links")] public List<LinkEntry>? Links { get; set; }

    public string ExternalId => Number is > 0 ? $"{Repo}#{Number}" : Repo;
}

public sealed class HistoryEntry
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("work_item_id")] public string WorkItemId { get; set; } = "";
    [JsonPropertyName("field")] public string Field { get; set; } = "";
    [JsonPropertyName("old_value")] public string? OldValue { get; set; }
    [JsonPropertyName("new_value")] public string? NewValue { get; set; }
    [JsonPropertyName("changed_by")] public string ChangedBy { get; set; } = "";
    [JsonPropertyName("changed_at")] public string ChangedAt { get; set; } = "";
    [JsonPropertyName("comment")] public string Comment { get; set; } = "";
}

public sealed class LinkEntry
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "";
}

public sealed class WorkItemStats
{
    [JsonPropertyName("by_status")] public Dictionary<string, int> ByStatus { get; set; } = new();
    [JsonPropertyName("by_repo")] public Dictionary<string, int> ByRepo { get; set; } = new();
    [JsonPropertyName("by_assignee")] public Dictionary<string, int> ByAssignee { get; set; } = new();
    [JsonPropertyName("by_severity")] public Dictionary<string, int> BySeverity { get; set; } = new();
}

// --- Request DTOs ---

public sealed class CreateWorkItemRequest
{
    [JsonPropertyName("repo")] public string Repo { get; set; } = "";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("number")] public int? Number { get; set; }
    [JsonPropertyName("type")] public string Type { get; set; } = "issue";
    [JsonPropertyName("severity")] public string Severity { get; set; } = "normal";
    [JsonPropertyName("status")] public string Status { get; set; } = "new";
    [JsonPropertyName("assigned_to")] public string? AssignedTo { get; set; }
    [JsonPropertyName("date_found")] public string? DateFound { get; set; }
    [JsonPropertyName("labels")] public List<string> Labels { get; set; } = [];
    [JsonPropertyName("notes")] public string Notes { get; set; } = "";
}

public sealed class UpdateWorkItemRequest
{
    [JsonPropertyName("title")] public string? Title { get; set; }
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("severity")] public string? Severity { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("assigned_to")] public string? AssignedTo { get; set; }
    [JsonPropertyName("number")] public int? Number { get; set; }
    [JsonPropertyName("blocker")] public string? Blocker { get; set; }
    [JsonPropertyName("date_found")] public string? DateFound { get; set; }
    [JsonPropertyName("append_notes")] public string? AppendNotes { get; set; }
    [JsonPropertyName("findings")] public string? Findings { get; set; }
    [JsonPropertyName("decision")] public string? Decision { get; set; }
    [JsonPropertyName("decision_rationale")] public string? DecisionRationale { get; set; }
    [JsonPropertyName("labels")] public List<string>? Labels { get; set; }
    [JsonPropertyName("notes")] public string? Notes { get; set; }
    [JsonPropertyName("comment")] public string Comment { get; set; } = "";
}

public sealed class CommentRequest
{
    [JsonPropertyName("comment")] public string Comment { get; set; } = "";
}

public sealed class LinkRequest
{
    [JsonPropertyName("to_id")] public string ToId { get; set; } = "";
    [JsonPropertyName("link_type")] public string LinkType { get; set; } = "related";
}

public sealed class LocalIdentity
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("server")] public string Server { get; set; } = "";
    [JsonPropertyName("registered_at")] public string RegisteredAt { get; set; } = "";
}

public sealed class ErrorResponse
{
    [JsonPropertyName("detail")] public string Detail { get; set; } = "";
}

public sealed class StatusResponse
{
    [JsonPropertyName("status")] public string Status { get; set; } = "";
}

public sealed class Report
{
    [JsonPropertyName("period")] public string Period { get; set; } = "";
    [JsonPropertyName("repo")] public string? Repo { get; set; }
    [JsonPropertyName("created")] public int Created { get; set; }
    [JsonPropertyName("closed")] public int Closed { get; set; }
    [JsonPropertyName("open")] public int Open { get; set; }
    [JsonPropertyName("pr_velocity")] public PrVelocity? PrVelocity { get; set; }
    [JsonPropertyName("sla")] public SlaMetrics? Sla { get; set; }
    [JsonPropertyName("open_issue_age")] public AgeMetrics? OpenIssueAge { get; set; }
    [JsonPropertyName("dwell_times")] public Dictionary<string, double>? DwellTimes { get; set; }
}

public sealed class PrVelocity
{
    [JsonPropertyName("merged_count")] public int MergedCount { get; set; }
    [JsonPropertyName("avg_cycle_hours")] public double? AvgCycleHours { get; set; }
    [JsonPropertyName("min_cycle_hours")] public double? MinCycleHours { get; set; }
    [JsonPropertyName("max_cycle_hours")] public double? MaxCycleHours { get; set; }
}

public sealed class SlaMetrics
{
    [JsonPropertyName("avg_response_hours")] public double? AvgResponseHours { get; set; }
    [JsonPropertyName("min_response_hours")] public double? MinResponseHours { get; set; }
    [JsonPropertyName("max_response_hours")] public double? MaxResponseHours { get; set; }
    [JsonPropertyName("items_measured")] public int ItemsMeasured { get; set; }
}

public sealed class AgeMetrics
{
    [JsonPropertyName("avg_hours")] public double? AvgHours { get; set; }
    [JsonPropertyName("max_hours")] public double? MaxHours { get; set; }
    [JsonPropertyName("count")] public int Count { get; set; }
}

public sealed class PeopleReport
{
    [JsonPropertyName("period")] public string Period { get; set; } = "";
    [JsonPropertyName("people")] public Dictionary<string, PersonMetrics> People { get; set; } = new();
}

public sealed class PersonMetrics
{
    [JsonPropertyName("actions")] public int Actions { get; set; }
    [JsonPropertyName("status_changes")] public int StatusChanges { get; set; }
    [JsonPropertyName("comments")] public int Comments { get; set; }
    [JsonPropertyName("items_touched")] public int ItemsTouched { get; set; }
    [JsonPropertyName("resolved")] public int Resolved { get; set; }
}

public sealed class SlaReport
{
    [JsonPropertyName("repo")] public string? Repo { get; set; }
    [JsonPropertyName("items")] public List<SlaItem> Items { get; set; } = [];
}

public sealed class SlaItem
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("repo")] public string Repo { get; set; } = "";
    [JsonPropertyName("number")] public int? Number { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("status")] public string Status { get; set; } = "";
    [JsonPropertyName("severity")] public string Severity { get; set; } = "";
    [JsonPropertyName("age_hours")] public double AgeHours { get; set; }
    [JsonPropertyName("response_hours")] public double? ResponseHours { get; set; }
}
