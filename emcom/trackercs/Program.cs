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

        if (remaining.Count == 0)
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
        Console.WriteLine("  create    Create a work item");
        Console.WriteLine("  update    Update a work item");
        Console.WriteLine("  comment   Add a comment");
        Console.WriteLine("  link      Link two work items");
        Console.WriteLine("  list      List work items (with filters)");
        Console.WriteLine("  view      View a work item with history");
        Console.WriteLine("  queue     Show agent's work queue");
        Console.WriteLine("  stats     Show summary statistics");
        Console.WriteLine("  decisions Show items with decisions");
        Console.WriteLine("  stale     Show stale items");
        Console.WriteLine("  blocked   Show blocked items");
        Console.WriteLine("  search    Search work items");
        Console.WriteLine("  history   Show item history");
    }

    private static int Dispatch(List<string> args, string server, string identity)
    {
        var cmd = args[0];
        var rest = args.Skip(1).ToList();
        var c = MakeClient(server, identity);
        c.EnsureServer();

        switch (cmd)
        {
            case "create":
            {
                string? repo = null, title = null, type = null, severity = null;
                string? assigned = null, notes = null, status = null, dateFound = null;
                int? number = null;
                List<string> labels = [];
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
                    else if (rest[i] == "--labels" && i + 1 < rest.Count)
                        labels.AddRange(rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                    else if (rest[i] == "--notes" && i + 1 < rest.Count) notes = rest[++i];
                }
                if (repo == null) { Console.Error.WriteLine("Error: --repo required"); return 1; }
                if (title == null) { Console.Error.WriteLine("Error: --title required"); return 1; }
                var req = new CreateWorkItemRequest { Repo = repo, Title = title, Number = number };
                if (type != null) req.Type = type;
                if (severity != null) req.Severity = severity;
                if (status != null) req.Status = status;
                req.AssignedTo = assigned;
                req.DateFound = dateFound;
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
                    else if (rest[i] == "--title" && i + 1 < rest.Count) req.Title = rest[++i];
                    else if (rest[i] == "--severity" && i + 1 < rest.Count) req.Severity = rest[++i];
                    else if (rest[i] == "--labels" && i + 1 < rest.Count)
                        req.Labels = [..rest[++i].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
                    else if (rest[i] == "--notes" && i + 1 < rest.Count) req.Notes = rest[++i];
                    else if (rest[i] == "--append-notes" && i + 1 < rest.Count) req.AppendNotes = rest[++i];
                    else if (rest[i] == "--comment" && i + 1 < rest.Count) req.Comment = rest[++i];
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
                var agent = rest.Count > 0 ? rest[0] : c.Name ?? "";
                if (string.IsNullOrEmpty(agent)) { Console.Error.WriteLine("Error: agent name required (or register first)"); return 1; }
                Console.WriteLine(Fmt.FormatList(c.Queue(agent)));
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
