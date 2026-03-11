using System.Text.Json.Serialization;

namespace Emcom;

[JsonSerializable(typeof(Email))]
[JsonSerializable(typeof(Email[]))]
[JsonSerializable(typeof(List<Email>))]
[JsonSerializable(typeof(Identity))]
[JsonSerializable(typeof(Identity[]))]
[JsonSerializable(typeof(List<Identity>))]
[JsonSerializable(typeof(Thread))]
[JsonSerializable(typeof(Thread[]))]
[JsonSerializable(typeof(List<Thread>))]
[JsonSerializable(typeof(LocalIdentity))]
[JsonSerializable(typeof(RegisterRequest))]
[JsonSerializable(typeof(SendEmailRequest))]
[JsonSerializable(typeof(TagRequest))]
[JsonSerializable(typeof(AddNamesRequest))]
[JsonSerializable(typeof(UpdateDescriptionRequest))]
[JsonSerializable(typeof(PurgeResult))]
[JsonSerializable(typeof(PurgeCounts))]
[JsonSerializable(typeof(AddNamesResponse))]
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(List<string>))]
[JsonSerializable(typeof(string[]))]
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
public partial class EmcomJsonContext : JsonSerializerContext;
