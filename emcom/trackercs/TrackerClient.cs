using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Tracker;

public class TrackerException(string message) : Exception(message);
public class TrackerConnectionException(string message) : TrackerException(message);
public class TrackerNotFoundException(string message) : TrackerException(message);

public sealed class TrackerClient
{
    private readonly HttpClient _http;
    private readonly string _identityFile;
    private LocalIdentity? _identity;

    public string? Name => _identity?.Name;

    public TrackerClient(string identity = "identity.json", string server = "http://127.0.0.1:8800")
    {
        _identityFile = identity;
        var baseUrl = server;

        if (File.Exists(_identityFile))
        {
            var json = File.ReadAllText(_identityFile);
            _identity = JsonSerializer.Deserialize(json, TrackerJsonContext.Default.LocalIdentity);
            if (_identity != null && !string.IsNullOrEmpty(_identity.Server))
                baseUrl = _identity.Server;
        }

        _http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };
    }

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
        try { resp = _http.Send(req); }
        catch (HttpRequestException ex) when (ex.InnerException is System.Net.Sockets.SocketException)
        { throw new TrackerConnectionException($"Cannot connect to {_http.BaseAddress}"); }
        catch (HttpRequestException)
        { throw new TrackerConnectionException($"Cannot connect to {_http.BaseAddress}"); }
        catch (TaskCanceledException)
        { throw new TrackerConnectionException($"Request timed out to {_http.BaseAddress}"); }

        if (resp.IsSuccessStatusCode) return resp;

        var detail = ReadDetail(resp);
        throw resp.StatusCode switch
        {
            HttpStatusCode.NotFound => new TrackerNotFoundException(detail),
            _ => new TrackerException($"HTTP {(int)resp.StatusCode}: {detail}")
        };
    }

    private static string ReadDetail(HttpResponseMessage resp)
    {
        var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        try
        {
            var err = JsonSerializer.Deserialize(text, TrackerJsonContext.Default.ErrorResponse);
            if (err != null && !string.IsNullOrEmpty(err.Detail)) return err.Detail;
        }
        catch { }
        return string.IsNullOrEmpty(text) ? resp.StatusCode.ToString() : text;
    }

    private HttpResponseMessage Get(string path) => Request(HttpMethod.Get, path);
    private HttpResponseMessage Delete(string path) => Request(HttpMethod.Delete, path);

    /// <summary>Check if server is running; if not, start it as a background process.</summary>
    public void EnsureServer()
    {
        try
        {
            var req = new HttpRequestMessage(HttpMethod.Get, "/health");
            var resp = _http.Send(req);
            if (resp.IsSuccessStatusCode) return;
        }
        catch { /* server not running */ }

        var thisDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var serverExe = Path.Combine(thisDir, "emcom-server.exe");
        if (!File.Exists(serverExe))
            serverExe = "emcom-server";

        var psi = new System.Diagnostics.ProcessStartInfo(serverExe)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        try
        {
            var proc = System.Diagnostics.Process.Start(psi);
            if (proc == null) return;
            var pidFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".emcom-server.pid");
            File.WriteAllText(pidFile, proc.Id.ToString());
        }
        catch { return; }

        for (int i = 0; i < 50; i++)
        {
            Thread.Sleep(100);
            try
            {
                var req = new HttpRequestMessage(HttpMethod.Get, "/health");
                var resp = _http.Send(req);
                if (resp.IsSuccessStatusCode) return;
            }
            catch { }
        }
    }

    private HttpResponseMessage PostJson<T>(string path, T body) where T : class =>
        Request(HttpMethod.Post, path, new StringContent(
            JsonSerializer.Serialize(body, (JsonTypeInfo<T>)TrackerJsonContext.Default.GetTypeInfo(typeof(T))!),
            Encoding.UTF8, "application/json"));

    private HttpResponseMessage PatchJson<T>(string path, T body) where T : class =>
        Request(HttpMethod.Patch, path, new StringContent(
            JsonSerializer.Serialize(body, (JsonTypeInfo<T>)TrackerJsonContext.Default.GetTypeInfo(typeof(T))!),
            Encoding.UTF8, "application/json"));

    private T Read<T>(HttpResponseMessage resp, JsonTypeInfo<T> typeInfo) where T : class
    {
        var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        return JsonSerializer.Deserialize(text, typeInfo)!;
    }

    // --- API Methods ---

    public WorkItem Create(CreateWorkItemRequest req)
    {
        var resp = PostJson("/tracker", req);
        return Read(resp, TrackerJsonContext.Default.WorkItem);
    }

    public List<WorkItem> List(string? status = null, string? repo = null,
        string? assignedTo = null, string? severity = null, string? label = null,
        bool blocked = false, string? since = null)
    {
        var parts = new List<string>();
        if (status != null) parts.Add($"status={Uri.EscapeDataString(status)}");
        if (repo != null) parts.Add($"repo={Uri.EscapeDataString(repo)}");
        if (assignedTo != null) parts.Add($"assigned_to={Uri.EscapeDataString(assignedTo)}");
        if (severity != null) parts.Add($"severity={Uri.EscapeDataString(severity)}");
        if (label != null) parts.Add($"label={Uri.EscapeDataString(label)}");
        if (blocked) parts.Add("blocked=true");
        if (since != null) parts.Add($"since={Uri.EscapeDataString(since)}");
        var qs = parts.Count > 0 ? "?" + string.Join("&", parts) : "";
        return Read(Get($"/tracker{qs}"), TrackerJsonContext.Default.ListWorkItem);
    }

    public WorkItem View(string itemRef)
    {
        return Read(Get($"/tracker/{Uri.EscapeDataString(itemRef)}"), TrackerJsonContext.Default.WorkItem);
    }

    public WorkItem Update(string itemRef, UpdateWorkItemRequest req)
    {
        return Read(PatchJson($"/tracker/{Uri.EscapeDataString(itemRef)}", req), TrackerJsonContext.Default.WorkItem);
    }

    public void Comment(string itemRef, string comment)
    {
        PostJson($"/tracker/{Uri.EscapeDataString(itemRef)}/comment", new CommentRequest { Comment = comment });
    }

    public void Link(string itemRef, string toId, string linkType = "related")
    {
        PostJson($"/tracker/{Uri.EscapeDataString(itemRef)}/link", new LinkRequest { ToId = toId, LinkType = linkType });
    }

    public void Unlink(string itemRef, string toRef)
    {
        Delete($"/tracker/{Uri.EscapeDataString(itemRef)}/link/{Uri.EscapeDataString(toRef)}");
    }

    public List<WorkItem> Stale(int hours = 24)
    {
        return Read(Get($"/tracker/stale?hours={hours}"), TrackerJsonContext.Default.ListWorkItem);
    }

    public List<WorkItem> Blocked()
    {
        return Read(Get("/tracker/blocked"), TrackerJsonContext.Default.ListWorkItem);
    }

    public List<WorkItem> Queue(string agent)
    {
        return Read(Get($"/tracker/queue/{Uri.EscapeDataString(agent)}"), TrackerJsonContext.Default.ListWorkItem);
    }

    public WorkItemStats Stats()
    {
        return Read(Get("/tracker/stats"), TrackerJsonContext.Default.WorkItemStats);
    }

    public List<WorkItem> Decisions(string? repo = null)
    {
        var qs = repo != null ? $"?repo={Uri.EscapeDataString(repo)}" : "";
        return Read(Get($"/tracker/decisions{qs}"), TrackerJsonContext.Default.ListWorkItem);
    }

    public List<WorkItem> Search(string q)
    {
        return Read(Get($"/tracker/search?q={Uri.EscapeDataString(q)}"), TrackerJsonContext.Default.ListWorkItem);
    }

    public List<HistoryEntry> History(string itemRef)
    {
        return Read(Get($"/tracker/{Uri.EscapeDataString(itemRef)}/history"), TrackerJsonContext.Default.ListHistoryEntry);
    }

    public Report Report(string period = "30d", string? repo = null)
    {
        var qs = $"?period={Uri.EscapeDataString(period)}";
        if (repo != null) qs += $"&repo={Uri.EscapeDataString(repo)}";
        return Read(Get($"/tracker/report{qs}"), TrackerJsonContext.Default.Report);
    }

    public RepoMetrics GithubReport(string period = "30d", string? repo = null)
    {
        var qs = $"?period={Uri.EscapeDataString(period)}";
        if (repo != null) qs += $"&repo={Uri.EscapeDataString(repo)}";
        return Read(Get($"/tracker/github{qs}"), TrackerJsonContext.Default.RepoMetrics);
    }

    public PeopleReport ReportPeople(string period = "30d")
    {
        return Read(Get($"/tracker/report/people?period={Uri.EscapeDataString(period)}"), TrackerJsonContext.Default.PeopleReport);
    }

    public SlaReport ReportSla(string? repo = null)
    {
        var qs = repo != null ? $"?repo={Uri.EscapeDataString(repo)}" : "";
        return Read(Get($"/tracker/report/sla{qs}"), TrackerJsonContext.Default.SlaReport);
    }
}
