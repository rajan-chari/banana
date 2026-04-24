using System.Text;

namespace Tracker;

public static class Program
{
    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        var server = "http://127.0.0.1:8800";
        var identity = "identity.json";
        var remaining = new List<string>();

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--server" && i + 1 < args.Length)
                server = args[++i];
            else if ((args[i] == "--identity" || args[i] == "-i") && i + 1 < args.Length)
                identity = args[++i];
            else
                remaining.Add(args[i]);
        }

        if (remaining.Count == 0 || remaining[0] is "--help" or "-h")
        {
            PrintUsage();
            return 0;
        }

        try
        {
            return Dispatch(remaining, server, identity);
        }
        catch (TrackerException ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static TrackerClient MakeClient(string server, string identity) => new(identity, server);

    private static void PrintUsage()
    {
        Console.WriteLine("Usage: tracker <command> [options]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  create     Create a work item");
        Console.WriteLine("  update     Update a work item");
        Console.WriteLine("  comment    Add a comment");
        Console.WriteLine("  link       Link two work items");
        Console.WriteLine("  list       List work items (with filters)");
        Console.WriteLine("  view       View a work item with history");
        Console.WriteLine("  queue      Show agent's work queue");
        Console.WriteLine("  stats      Show summary statistics");
        Console.WriteLine("  report     Agent workflow report");
        Console.WriteLine("  github     GitHub activity report");
        Console.WriteLine("  decisions  Show items with decisions");
        Console.WriteLine("  stale      Show stale items");
        Console.WriteLine("  blocked    Show blocked items");
        Console.WriteLine("  search     Search work items");
        Console.WriteLine("  history    Show item history");
        Console.WriteLine("  version    Show version info");
        Console.WriteLine();
        Console.WriteLine("Run 'tracker <command> --help' for command-specific options.");
    }

    private static void PrintCommandHelp(string cmd)
    {
        switch (cmd)
        {
            case "create":
                Console.WriteLine("Usage: tracker create --repo <repo> --title <title> [options]");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --repo <name>           Repository (required)");
                Console.WriteLine("  --title <text>          Title (required)");
                Console.WriteLine("  --number <n>            GitHub issue/PR number");
                Console.WriteLine("  --issue <n>             Alias for --number");
                Console.WriteLine("  --type <type>           issue, pr, investigation, decision (default: issue)");
                Console.WriteLine("  --severity <sev>        low, normal, high, critical (default: normal)");
                Console.WriteLine("  --status <status>       Initial status (default: new)");
                Console.WriteLine("  --assigned <agent>      Assign to agent");
                Console.WriteLine("  --date-found <iso>      When issue was originally filed");
                Console.WriteLine("  --opened-by <name>      Who originally reported the issue");
                Console.WriteLine("  --responders <a,b,c>    Comma-separated responders");
                Console.WriteLine("  --labels <a,b,c>        Comma-separated labels");
                Console.WriteLine("  --notes <text>          Initial notes");
                break;
            case "update":
                Console.WriteLine("Usage: tracker update <id-or-ref> [options]");
                Console.WriteLine();
                Console.WriteLine("Lookup: UUID prefix, repo#number, or bare number");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --status <status>                 new, triaged, investigating, findings-reported,");
                Console.WriteLine("                                    decision-pending, pr-up, testing, ready-to-merge,");
                Console.WriteLine("                                    merged, deferred, closed");
                Console.WriteLine("  --assigned <agent>                Assign to agent");
                Console.WriteLine("  --blocker <text>                  Who/what is blocking");
                Console.WriteLine("  --findings <text>                 Investigation findings");
                Console.WriteLine("  --decision <text>                 Decision made");
                Console.WriteLine("  --decision-rationale <text>       Why this decision");
                Console.WriteLine("  --date-found <iso>                When issue was originally filed");
                Console.WriteLine("  --last-github-activity <iso>      Latest GitHub activity timestamp");
                Console.WriteLine("  --github-author <user>            GitHub username who opened");
                Console.WriteLine("  --github-last-commenter <user>    Last commenter/reviewer");
                Console.WriteLine("  --opened-by <name>                Who originally reported the issue");
                Console.WriteLine("  --responders <a,b,c>              Replace responders list");
                Console.WriteLine("  --add-responder <name>            Add a responder (no duplicates)");
                Console.WriteLine("  --title <text>                    Update title");
                Console.WriteLine("  --severity <sev>                  low, normal, high, critical");
                Console.WriteLine("  --labels <a,b,c>                  Replace labels");
                Console.WriteLine("  --notes <text>                    Replace notes");
                Console.WriteLine("  --append-notes <text>             Append timestamped note");
                Console.WriteLine("  --pr <n>                          Set PR number");
                Console.WriteLine("  --comment <text>                  Comment on the change");
                break;
            case "list":
                Console.WriteLine("Usage: tracker list [options]");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --status <status>       Filter by status (or 'open' for all non-closed)");
                Console.WriteLine("  --repo <name>           Filter by repository");
                Console.WriteLine("  --assigned <agent>      Filter by assignee");
                Console.WriteLine("  --severity <sev>        Filter by severity");
                Console.WriteLine("  --label <label>         Filter by label");
                Console.WriteLine("  --since <iso>           Updated since date");
                Console.WriteLine("  --blocked               Show only blocked items");
                Console.WriteLine("  --needs-decision        Alias for --status decision-pending");
                break;
            case "report":
                Console.WriteLine("Usage: tracker report [people|sla] [options]");
                Console.WriteLine();
                Console.WriteLine("  tracker report                    Agent workflow summary");
                Console.WriteLine("  tracker report people             Per-person activity");
                Console.WriteLine("  tracker report sla                SLA for open items");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --period <Nd>           Time period, e.g. 7d, 30d (default: 30d)");
                Console.WriteLine("  --repo <name>           Filter by repository");
                break;
            case "github":
                Console.WriteLine("Usage: tracker github [options]");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --period <Nd>           Time period, e.g. 7d, 30d (default: 30d)");
                Console.WriteLine("  --repo <name>           Filter by repository");
                break;
            case "comment":
                Console.WriteLine("Usage: tracker comment <id-or-ref> <text>");
                break;
            case "link":
                Console.WriteLine("Usage: tracker link <id1> <id2> [--type related|blocks|blocked-by|duplicate]");
                break;
            case "view":
                Console.WriteLine("Usage: tracker view <id-or-ref>");
                break;
            case "queue":
                Console.WriteLine("Usage: tracker queue [agent-name] [--include-closed]  (defaults to self)");
                Console.WriteLine("  --include-closed    Include merged/deferred/closed items (default: open only)");
                break;
            case "stale":
                Console.WriteLine("Usage: tracker stale [--hours <N>]  (default: 24)");
                break;
            case "search":
                Console.WriteLine("Usage: tracker search <query>");
                break;
            case "history":
                Console.WriteLine("Usage: tracker history <id-or-ref>");
                break;
            default:
                PrintUsage();
                break;
        }
    }

    private static int Dispatch(List<string> args, string server, string identity)
    {
        var cmd = args[0];
        var rest = args.Skip(1).ToList();

        // Per-command help
        if (rest.Contains("--help") || rest.Contains("-h"))
        {
            PrintCommandHelp(cmd);
            return 0;
        }

        var c = MakeClient(server, identity);
        if (cmd != "version")
            c.EnsureServer();

        switch (cmd)
        {
            case "version":
                Console.WriteLine($"tracker {BuildInfo.Version}");
                Console.WriteLine($"Built: {BuildInfo.BuildTime}");
                Console.WriteLine($"Features: create, update, comment, link, list, view, queue, stats, report, decisions, stale, blocked, search, history");
                break;
            case "create":
            {
                string? repo = null, title = null, type = null, severity = null;
                string? assigned = null, notes = null, status = null, dateFound = null;
                string? openedBy = null;
                int? number = null;
                List<string> labels = [];
                List<string> responders = [];
                for (int i = 0; i < rest.Count; i++)
                {
                    if (rest[i] == "--repo" && i + 1 < rest.Count) repo = rest[++i];
                    else if (rest[i] == "--title" && i + 1 < rest.Count) title = rest[++i];
                    else if (rest[i] == "--number" && i + 1 < rest.Count && int.TryParse(rest[i + 1], out var n)) { number = n; i++; }
                    else if (rest[i] == "--issue" && i + 1 < rest.Count && int.TryParse(rest[i + 1], out var iss)) { number = iss; i++; }
                    else if (rest[i] == "--type" && i + 1 < rest.Count) type = rest[++i];
                    else if (rest[i] == "--severity" && i + 1 < rest.Count) severity = rest[++i];
                    else if (rest[i] == "--status" && i + 1 < rest.Count) status = rest[++i];
                    else if (rest[i] == "--assigned" && i + 1 < rest.Count) assigned = rest[++i];
                    else if (rest[i] == "--date-found" && i + 1 < rest.Count) dateFound = rest[++i];
                    else if (rest[i] == "--opened-by" && i + 1 < rest.Count) openedBy = rest[++i];
                    else if (rest[i] == "--responders" && i + 1 < rest.Count)
                        responders.AddRange(rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                    else if (rest[i] == "--labels" && i + 1 < rest.Count)
                        labels.AddRange(rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                    else if (rest[i] == "--notes" && i + 1 < rest.Count) notes = rest[++i];
                    else if (rest[i].StartsWith('-'))
                    { Console.Error.WriteLine($"Error: unknown flag '{rest[i]}'"); return 1; }
                }
                if (repo == null) { Console.Error.WriteLine("Error: --repo required"); return 1; }
                if (title == null) { Console.Error.WriteLine("Error: --title required"); return 1; }
                var req = new CreateWorkItemRequest { Repo = repo, Title = title, Number = number };
                if (type != null) req.Type = type;
                if (severity != null) req.Severity = severity;
                if (status != null) req.Status = status;
                req.AssignedTo = assigned;
                req.DateFound = dateFound;
                req.OpenedBy = openedBy;
                if (responders.Count > 0) req.Responders = responders;
                if (labels.Count > 0) req.Labels = labels;
                if (notes != null) req.Notes = notes;
                var item = c.Create(req);
                Console.WriteLine($"Created [{Fmt.ShortId(item.Id)}] {item.ExternalId}: {item.Title}");
                break;
            }
            case "update":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: item ID/ref required"); return 1; }
                var itemRef = rest[0];
                var req = new UpdateWorkItemRequest();
                for (int i = 1; i < rest.Count; i++)
                {
                    if (rest[i] == "--status" && i + 1 < rest.Count) req.Status = rest[++i];
                    else if (rest[i] == "--assigned" && i + 1 < rest.Count) req.AssignedTo = rest[++i];
                    else if (rest[i] == "--pr" && i + 1 < rest.Count && int.TryParse(rest[i + 1], out var pr)) { req.Number = pr; i++; }
                    else if (rest[i] == "--blocker" && i + 1 < rest.Count) req.Blocker = rest[++i];
                    else if (rest[i] == "--findings" && i + 1 < rest.Count) req.Findings = rest[++i];
                    else if (rest[i] == "--decision" && i + 1 < rest.Count) req.Decision = rest[++i];
                    else if (rest[i] == "--decision-rationale" && i + 1 < rest.Count) req.DecisionRationale = rest[++i];
                    else if (rest[i] == "--date-found" && i + 1 < rest.Count) req.DateFound = rest[++i];
                    else if (rest[i] == "--last-github-activity" && i + 1 < rest.Count) req.LastGithubActivity = rest[++i];
                    else if (rest[i] == "--github-author" && i + 1 < rest.Count) req.GithubAuthor = rest[++i];
                    else if (rest[i] == "--github-last-commenter" && i + 1 < rest.Count) req.GithubLastCommenter = rest[++i];
                    else if (rest[i] == "--opened-by" && i + 1 < rest.Count) req.OpenedBy = rest[++i];
                    else if (rest[i] == "--responders" && i + 1 < rest.Count)
                        req.Responders = [..rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
                    else if (rest[i] == "--add-responder" && i + 1 < rest.Count) req.AddResponder = rest[++i];
                    else if (rest[i] == "--title" && i + 1 < rest.Count) req.Title = rest[++i];
                    else if (rest[i] == "--severity" && i + 1 < rest.Count) req.Severity = rest[++i];
                    else if (rest[i] == "--labels" && i + 1 < rest.Count)
                        req.Labels = [..rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
                    else if (rest[i] == "--notes" && i + 1 < rest.Count) req.Notes = rest[++i];
                    else if (rest[i] == "--append-notes" && i + 1 < rest.Count) req.AppendNotes = rest[++i];
                    else if (rest[i] == "--comment" && i + 1 < rest.Count) req.Comment = rest[++i];
                    else if (rest[i].StartsWith('-'))
                    { Console.Error.WriteLine($"Error: unknown flag '{rest[i]}'"); return 1; }
                }
                var item = c.Update(itemRef, req);
                Console.WriteLine($"Updated [{Fmt.ShortId(item.Id)}] {item.ExternalId} → {item.Status}");
                break;
            }
            case "comment":
            {
                if (rest.Count < 2) { Console.Error.WriteLine("Error: item ID/ref and comment text required"); return 1; }
                c.Comment(rest[0], string.Join(" ", rest.Skip(1)));
                Console.WriteLine($"Comment added to {rest[0]}");
                break;
            }
            case "link":
            {
                if (rest.Count < 2) { Console.Error.WriteLine("Error: two item IDs required"); return 1; }
                string linkType = "related";
                for (int i = 2; i < rest.Count; i++)
                    if (rest[i] == "--type" && i + 1 < rest.Count) linkType = rest[++i];
                c.Link(rest[0], rest[1], linkType);
                Console.WriteLine($"Linked {rest[0]} ↔ {rest[1]} ({linkType})");
                break;
            }
            case "list":
            {
                string? status = null, repo = null, assigned = null, severity = null, label = null, since = null;
                bool blocked = false;
                for (int i = 0; i < rest.Count; i++)
                {
                    if (rest[i] == "--status" && i + 1 < rest.Count) status = rest[++i];
                    else if (rest[i] == "--repo" && i + 1 < rest.Count) repo = rest[++i];
                    else if (rest[i] == "--assigned" && i + 1 < rest.Count) assigned = rest[++i];
                    else if (rest[i] == "--severity" && i + 1 < rest.Count) severity = rest[++i];
                    else if (rest[i] == "--label" && i + 1 < rest.Count) label = rest[++i];
                    else if (rest[i] == "--since" && i + 1 < rest.Count) since = rest[++i];
                    else if (rest[i] == "--blocked") blocked = true;
                    else if (rest[i] == "--needs-decision") status = "decision-pending";
                }
                Console.WriteLine(Fmt.FormatList(c.List(status, repo, assigned, severity, label, blocked, since)));
                break;
            }
            case "view":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: item ID/ref required"); return 1; }
                Console.WriteLine(Fmt.FormatItem(c.View(rest[0])));
                break;
            }
            case "queue":
            {
                bool includeClosed = rest.Remove("--include-closed");
                var agent = rest.Count > 0 ? rest[0] : c.Name ?? "";
                if (string.IsNullOrEmpty(agent)) { Console.Error.WriteLine("Error: agent name required (or register first)"); return 1; }
                Console.WriteLine(Fmt.FormatList(c.Queue(agent, includeClosed)));
                break;
            }
            case "report":
            {
                string period = "30d"; string? repo = null; string? subCmd = null;
                for (int i = 0; i < rest.Count; i++)
                {
                    if (rest[i] == "--period" && i + 1 < rest.Count) period = rest[++i];
                    else if (rest[i] == "--repo" && i + 1 < rest.Count) repo = rest[++i];
                    else if (rest[i] is "people" or "sla") subCmd = rest[i];
                }
                if (subCmd == "people")
                    Console.WriteLine(Fmt.FormatPeopleReport(c.ReportPeople(period)));
                else if (subCmd == "sla")
                    Console.WriteLine(Fmt.FormatSlaReport(c.ReportSla(repo)));
                else
                    Console.WriteLine(Fmt.FormatReport(c.Report(period, repo)));
                break;
            }
            case "github":
            {
                string period = "30d"; string? repo = null;
                for (int i = 0; i < rest.Count; i++)
                {
                    if (rest[i] == "--period" && i + 1 < rest.Count) period = rest[++i];
                    else if (rest[i] == "--repo" && i + 1 < rest.Count) repo = rest[++i];
                }
                Console.WriteLine(Fmt.FormatRepoMetrics(c.GithubReport(period, repo)));
                break;
            }
            case "stats":
                Console.WriteLine(Fmt.FormatStats(c.Stats()));
                break;
            case "decisions":
            {
                string? repo = null;
                for (int i = 0; i < rest.Count; i++)
                    if (rest[i] == "--repo" && i + 1 < rest.Count) repo = rest[++i];
                Console.WriteLine(Fmt.FormatList(c.Decisions(repo)));
                break;
            }
            case "stale":
            {
                int hours = 24;
                for (int i = 0; i < rest.Count; i++)
                    if (rest[i] is "--hours" or "-h" && i + 1 < rest.Count && int.TryParse(rest[i + 1], out var h)) { hours = h; i++; }
                Console.WriteLine(Fmt.FormatList(c.Stale(hours)));
                break;
            }
            case "blocked":
                Console.WriteLine(Fmt.FormatList(c.Blocked()));
                break;
            case "search":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: search query required"); return 1; }
                Console.WriteLine(Fmt.FormatList(c.Search(string.Join(" ", rest))));
                break;
            }
            case "history":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: item ID/ref required"); return 1; }
                var history = c.History(rest[0]);
                if (history.Count == 0) { Console.WriteLine("No history."); break; }
                foreach (var h in history)
                {
                    var desc = h.Field == "comment"
                        ? h.Comment
                        : $"{h.Field}: {h.OldValue ?? "(none)"} → {h.NewValue ?? "(none)"}";
                    var comment = h.Field != "comment" && !string.IsNullOrEmpty(h.Comment) ? $" — {h.Comment}" : "";
                    Console.WriteLine($"{Fmt.ShortDate(h.ChangedAt)} [{h.ChangedBy}] {desc}{comment}");
                }
                break;
            }
            default:
                Console.Error.WriteLine($"Unknown command: {cmd}");
                PrintUsage();
                return 1;
        }
        return 0;
    }
}
