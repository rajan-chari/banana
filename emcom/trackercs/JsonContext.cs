using System.Text.Json.Serialization;

namespace Tracker;

[JsonSerializable(typeof(WorkItem))]
[JsonSerializable(typeof(List<WorkItem>))]
[JsonSerializable(typeof(HistoryEntry))]
[JsonSerializable(typeof(List<HistoryEntry>))]
[JsonSerializable(typeof(LinkEntry))]
[JsonSerializable(typeof(WorkItemStats))]
[JsonSerializable(typeof(CreateWorkItemRequest))]
[JsonSerializable(typeof(UpdateWorkItemRequest))]
[JsonSerializable(typeof(CommentRequest))]
[JsonSerializable(typeof(LinkRequest))]
[JsonSerializable(typeof(LocalIdentity))]
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(StatusResponse))]
[JsonSerializable(typeof(Dictionary<string, int>))]
[JsonSerializable(typeof(Dictionary<string, double>))]
[JsonSerializable(typeof(Dictionary<string, PersonMetrics>))]
[JsonSerializable(typeof(Report))]
[JsonSerializable(typeof(PrVelocity))]
[JsonSerializable(typeof(SlaMetrics))]
[JsonSerializable(typeof(AgeMetrics))]
[JsonSerializable(typeof(PeopleReport))]
[JsonSerializable(typeof(PersonMetrics))]
[JsonSerializable(typeof(SlaReport))]
[JsonSerializable(typeof(SlaItem))]
[JsonSerializable(typeof(List<SlaItem>))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
public partial class TrackerJsonContext : JsonSerializerContext;
