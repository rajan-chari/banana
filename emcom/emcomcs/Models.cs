using System.Text.Json;
using System.Text.Json.Serialization;

namespace Emcom;

// --- Response models ---

public sealed class Email
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("thread_id")] public string ThreadId { get; set; } = "";
    [JsonPropertyName("sender")] public string Sender { get; set; } = "";
    [JsonPropertyName("from")] public string From { get; set; } = "";
    [JsonPropertyName("to")] public List<string> To { get; set; } = [];
    [JsonPropertyName("cc")] public List<string> Cc { get; set; } = [];
    [JsonPropertyName("subject")] public string Subject { get; set; } = "";
    [JsonPropertyName("body")] public string Body { get; set; } = "";
    [JsonPropertyName("in_reply_to")] public string? InReplyTo { get; set; }
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; } = "";
    [JsonPropertyName("tags")] public List<string> Tags { get; set; } = [];

    /// <summary>Returns Sender if non-empty, else From (server may use either key).</summary>
    public string SenderName => !string.IsNullOrEmpty(Sender) ? Sender : From;
}

public sealed class Identity
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("location")] public string Location { get; set; } = "";
    [JsonPropertyName("registered_at")] public string RegisteredAt { get; set; } = "";
    [JsonPropertyName("last_seen")] public string LastSeen { get; set; } = "";
    [JsonPropertyName("active")][JsonConverter(typeof(BoolFromIntConverter))] public bool Active { get; set; } = true;
}

/// <summary>Handles server returning active as 0/1 integer instead of true/false.</summary>
public sealed class BoolFromIntConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.True => true,
            JsonTokenType.False => false,
            JsonTokenType.Number => reader.GetInt32() != 0,
            _ => throw new JsonException($"Cannot convert {reader.TokenType} to bool")
        };

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options) =>
        writer.WriteBooleanValue(value);
}

public sealed class Thread
{
    [JsonPropertyName("thread_id")] public string ThreadId { get; set; } = "";
    [JsonPropertyName("subject")] public string Subject { get; set; } = "";
    [JsonPropertyName("participants")] public List<string> Participants { get; set; } = [];
    [JsonPropertyName("email_count")] public int EmailCount { get; set; }
    [JsonPropertyName("last_activity")] public string LastActivity { get; set; } = "";
}

public sealed class LocalIdentity
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("server")] public string Server { get; set; } = "";
    [JsonPropertyName("registered_at")] public string RegisteredAt { get; set; } = "";
}

// --- Request DTOs ---

public sealed class RegisterRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("location")] public string Location { get; set; } = "";
    [JsonPropertyName("force")] public bool Force { get; set; }
}

public sealed class SendEmailRequest
{
    [JsonPropertyName("to")] public List<string> To { get; set; } = [];
    [JsonPropertyName("cc")] public List<string> Cc { get; set; } = [];
    [JsonPropertyName("subject")] public string Subject { get; set; } = "";
    [JsonPropertyName("body")] public string Body { get; set; } = "";
    [JsonPropertyName("in_reply_to")] public string? InReplyTo { get; set; }
}

public sealed class TagRequest
{
    [JsonPropertyName("tags")] public List<string> Tags { get; set; } = [];
}

public sealed class AddNamesRequest
{
    [JsonPropertyName("names")] public List<string> Names { get; set; } = [];
}

public sealed class UpdateDescriptionRequest
{
    [JsonPropertyName("description")] public string Description { get; set; } = "";
}

// --- Purge response ---

public sealed class PurgeResult
{
    [JsonPropertyName("purged")] public PurgeCounts Purged { get; set; } = new();
}

public sealed class PurgeCounts
{
    [JsonPropertyName("emails")] public int Emails { get; set; }
    [JsonPropertyName("tags")] public int Tags { get; set; }
    [JsonPropertyName("identities")] public int Identities { get; set; }
}

public sealed class AddNamesResponse
{
    [JsonPropertyName("added")] public int Added { get; set; }
}

public sealed class ErrorResponse
{
    [JsonPropertyName("detail")] public string Detail { get; set; } = "";
}
