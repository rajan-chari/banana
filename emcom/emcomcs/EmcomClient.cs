using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Emcom;

// --- Exceptions ---

public class EmcomException(string message) : Exception(message);
public class EmcomConnectionException(string message) : EmcomException(message);
public class EmcomNotFoundExcpetion(string message) : EmcomException(message);
public class EmcomConflictException(string message) : EmcomException(message);
public class EmcomAuthException(string message) : EmcomException(message);

public sealed class EmcomClient
{
    private readonly HttpClient _http;
    private readonly string _identityFile;
    private LocalIdentity? _identity;

    public string? Name => _identity?.Name;

    public EmcomClient(string identity = "identity.json", string server = "http://127.0.0.1:8800")
    {
        _identityFile = identity;
        var baseUrl = server;

        // Load existing identity if present
        if (File.Exists(_identityFile))
        {
            var json = File.ReadAllText(_identityFile);
            _identity = JsonSerializer.Deserialize(json, EmcomJsonContext.Default.LocalIdentity);
            if (_identity != null && !string.IsNullOrEmpty(_identity.Server))
                baseUrl = _identity.Server;
        }

        _http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };
    }

    // --- Low-level ---

    private void AddAuthHeaders(HttpRequestMessage req)
    {
        if (_identity != null)
            req.Headers.Add("X-Emcom-Name", _identity.Name);
    }

    private HttpResponseMessage Request(HttpMethod method, string path, HttpContent? content = null)
    {
        var req = new HttpRequestMessage(method, path) { Content = content };
        AddAuthHeaders(req);
        HttpResponseMessage resp;
        try
        {
            resp = _http.Send(req);
        }
        catch (HttpRequestException ex) when (ex.InnerException is System.Net.Sockets.SocketException)
        {
            throw new EmcomConnectionException($"Cannot connect to {_http.BaseAddress}");
        }
        catch (HttpRequestException)
        {
            throw new EmcomConnectionException($"Cannot connect to {_http.BaseAddress}");
        }
        catch (TaskCanceledException)
        {
            throw new EmcomConnectionException($"Request timed out to {_http.BaseAddress}");
        }

        if (resp.IsSuccessStatusCode) return resp;

        var detail = ReadDetail(resp);
        throw resp.StatusCode switch
        {
            HttpStatusCode.Unauthorized => new EmcomAuthException(detail),
            HttpStatusCode.NotFound => new EmcomNotFoundExcpetion(detail),
            HttpStatusCode.Conflict => new EmcomConflictException(detail),
            _ => new EmcomException($"HTTP {(int)resp.StatusCode}: {detail}")
        };
    }

    private static string ReadDetail(HttpResponseMessage resp)
    {
        var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        try
        {
            var err = JsonSerializer.Deserialize(text, EmcomJsonContext.Default.ErrorResponse);
            if (err != null && !string.IsNullOrEmpty(err.Detail)) return err.Detail;
        }
        catch { /* fall through */ }
        return string.IsNullOrEmpty(text) ? resp.StatusCode.ToString() : text;
    }

    private HttpResponseMessage Get(string path) => Request(HttpMethod.Get, path);
    private HttpResponseMessage Delete(string path) => Request(HttpMethod.Delete, path);

    private HttpResponseMessage PostJson<T>(string path, T body) where T : class =>
        Request(HttpMethod.Post, path, new StringContent(
            JsonSerializer.Serialize(body, (JsonTypeInfo<T>)EmcomJsonContext.Default.GetTypeInfo(typeof(T))!),
            Encoding.UTF8, "application/json"));

    private HttpResponseMessage Post(string path) => Request(HttpMethod.Post, path);

    private HttpResponseMessage PatchJson<T>(string path, T body) where T : class =>
        Request(HttpMethod.Patch, path, new StringContent(
            JsonSerializer.Serialize(body, (JsonTypeInfo<T>)EmcomJsonContext.Default.GetTypeInfo(typeof(T))!),
            Encoding.UTF8, "application/json"));

    private T Read<T>(HttpResponseMessage resp, JsonTypeInfo<T> typeInfo) where T : class
    {
        var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        return JsonSerializer.Deserialize(text, typeInfo)!;
    }

    // --- Identity ---

    private void SaveIdentity(string name)
    {
        _identity = new LocalIdentity
        {
            Name = name,
            Server = _http.BaseAddress!.ToString().TrimEnd('/'),
            RegisteredAt = DateTime.UtcNow.ToString("o")
        };
        var dir = Path.GetDirectoryName(Path.GetFullPath(_identityFile));
        if (dir != null) Directory.CreateDirectory(dir);
        File.WriteAllText(_identityFile, JsonSerializer.Serialize(_identity, EmcomJsonContext.Default.LocalIdentity));
    }

    private void RemoveIdentity()
    {
        if (File.Exists(_identityFile)) File.Delete(_identityFile);
        _identity = null;
    }

    public Identity Register(string? name = null, string description = "", bool force = false)
    {
        if (_identity != null && !force)
            throw new EmcomException($"Already registered as '{_identity.Name}'. Unregister first or use --force.");

        // Compute location from last 3 CWD path segments (match Python)
        var parts = Directory.GetCurrentDirectory().Replace('\\', '/').Split('/');
        var location = string.Join("/", parts.Length >= 3 ? parts[^3..] : parts);

        var req = new RegisterRequest { Name = name, Description = description, Location = location, Force = force };
        var resp = PostJson("/register", req);
        var identity = Read(resp, EmcomJsonContext.Default.Identity);
        SaveIdentity(identity.Name);
        return identity;
    }

    public void Unregister()
    {
        if (_identity == null) throw new EmcomException("Not registered");
        Delete($"/register/{_identity.Name}");
        RemoveIdentity();
    }

    public List<Identity> Who()
    {
        var resp = Get("/who");
        return Read(resp, EmcomJsonContext.Default.ListIdentity);
    }

    public Identity UpdateDescription(string description)
    {
        if (_identity == null) throw new EmcomException("Not registered");
        var resp = PatchJson($"/who/{_identity.Name}", new UpdateDescriptionRequest { Description = description });
        return Read(resp, EmcomJsonContext.Default.Identity);
    }

    // --- Email ---

    public Email Send(List<string> to, string subject, string body, List<string>? cc = null)
    {
        var req = new SendEmailRequest { To = to, Subject = subject, Body = body, Cc = cc ?? [] };
        var resp = PostJson("/email", req);
        return Read(resp, EmcomJsonContext.Default.Email);
    }

    public List<Email> Inbox(bool includeAll = false)
    {
        var path = includeAll ? "/email/inbox?all=true" : "/email/inbox";
        var resp = Get(path);
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    public Email ReadEmail(string emailId, List<string>? tags = null, bool addPending = true)
    {
        // Default: add 'pending' tag. Pass addPending=false for preview-only reads.
        tags ??= addPending ? ["pending"] : [];
        var path = $"/email/{emailId}";
        if (tags.Count > 0)
            path += $"?add_tags={Uri.EscapeDataString(string.Join(",", tags))}";
        var resp = Get(path);
        return Read(resp, EmcomJsonContext.Default.Email);
    }

    public List<Email> Sent()
    {
        var resp = Get("/email/sent");
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    public List<Email> AllMail()
    {
        var resp = Get("/email/all");
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    public Email Reply(string emailId, string body)
    {
        // Read original to determine recipients
        var original = ReadEmail(emailId);
        var replyTo = new HashSet<string>([original.SenderName, .. original.To, .. original.Cc]);
        if (_identity != null)
            replyTo.Remove(_identity.Name);

        var req = new SendEmailRequest { To = [.. replyTo], Body = body, InReplyTo = emailId };
        var resp = PostJson("/email", req);
        return Read(resp, EmcomJsonContext.Default.Email);
    }

    // --- Threads ---

    public List<Thread> Threads()
    {
        var resp = Get("/threads");
        return Read(resp, EmcomJsonContext.Default.ListThread);
    }

    public List<Email> Thread(string threadId)
    {
        var resp = Get($"/threads/{threadId}");
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    // --- Tags ---

    public void Tag(string emailId, params string[] tags)
    {
        PostJson($"/email/{emailId}/tags", new TagRequest { Tags = [.. tags] });
    }

    public void Untag(string emailId, string tag)
    {
        Delete($"/email/{emailId}/tags/{tag}");
    }

    public List<Email> Tagged(string tag)
    {
        var resp = Get($"/email/tags/{tag}");
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    // --- Search ---

    public List<Email> Search(string? from = null, string? to = null, string? subject = null, string? tag = null, string? body = null)
    {
        var parts = new List<string>();
        if (from != null) parts.Add($"from_={Uri.EscapeDataString(from)}");
        if (to != null) parts.Add($"to={Uri.EscapeDataString(to)}");
        if (subject != null) parts.Add($"subject={Uri.EscapeDataString(subject)}");
        if (tag != null) parts.Add($"tag={Uri.EscapeDataString(tag)}");
        if (body != null) parts.Add($"body={Uri.EscapeDataString(body)}");
        var qs = parts.Count > 0 ? "?" + string.Join("&", parts) : "";
        var resp = Get($"/search{qs}");
        return Read(resp, EmcomJsonContext.Default.ListEmail);
    }

    // --- Name Pool ---

    public List<string> Names()
    {
        var resp = Get("/names");
        return Read(resp, EmcomJsonContext.Default.ListString);
    }

    public int AddNames(List<string> names)
    {
        var resp = PostJson("/names", new AddNamesRequest { Names = names });
        return Read(resp, EmcomJsonContext.Default.AddNamesResponse).Added;
    }

    // --- Admin ---

    public PurgeResult Purge()
    {
        var resp = Post("/admin/purge");
        return Read(resp, EmcomJsonContext.Default.PurgeResult);
    }
}
