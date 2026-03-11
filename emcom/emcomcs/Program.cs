using System.Text;
using System.Text.RegularExpressions;

namespace Emcom;

public static class Program
{
    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        // Parse global flags: --server, --identity/-i
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
            Repl(server, identity);
            return 0;
        }

        try
        {
            return Dispatch(remaining, server, identity);
        }
        catch (EmcomException ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static EmcomClient MakeClient(string server, string identity) => new(identity, server);

    private static int Dispatch(List<string> args, string server, string identity)
    {
        var cmd = args[0];
        var rest = args.Skip(1).ToList();
        var c = MakeClient(server, identity);

        switch (cmd)
        {
            case "register":
            {
                string? name = null; string desc = ""; bool force = false;
                for (int i = 0; i < rest.Count; i++)
                {
                    if ((rest[i] == "--name" || rest[i] == "-n") && i + 1 < rest.Count) name = rest[++i];
                    else if ((rest[i] == "--description" || rest[i] == "-d") && i + 1 < rest.Count) desc = rest[++i];
                    else if (rest[i] == "--force" || rest[i] == "-f") force = true;
                }
                var id = c.Register(name, desc, force);
                Console.WriteLine($"Registered as '{id.Name}'");
                break;
            }
            case "unregister":
                c.Unregister();
                Console.WriteLine("Unregistered. identity.json removed.");
                break;
            case "who":
                Console.WriteLine(Fmt.FormatWho(c.Who()));
                break;
            case "update":
            {
                string? desc = null;
                for (int i = 0; i < rest.Count; i++)
                    if ((rest[i] == "--description" || rest[i] == "-d") && i + 1 < rest.Count) desc = rest[++i];
                if (desc == null) { Console.Error.WriteLine("Error: --description/-d required"); return 1; }
                var id = c.UpdateDescription(desc);
                Console.WriteLine($"Updated description for '{id.Name}'");
                break;
            }
            case "inbox":
            {
                bool unread = rest.Contains("--unread") || rest.Contains("-u");
                Console.WriteLine(Fmt.FormatInbox(c.Inbox(unread)));
                break;
            }
            case "read":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: email ID required"); return 1; }
                Console.WriteLine(Fmt.FormatEmail(c.ReadEmail(rest[0])));
                break;
            }
            case "send":
            {
                List<string> to = [], cc = []; string? subject = null, body = null;
                for (int i = 0; i < rest.Count; i++)
                {
                    if ((rest[i] == "--to" || rest[i] == "-t") && i + 1 < rest.Count)
                        while (++i < rest.Count && !rest[i].StartsWith('-')) to.Add(rest[i]);
                    if (i < rest.Count && rest[i] == "--cc")
                        while (++i < rest.Count && !rest[i].StartsWith('-')) cc.Add(rest[i]);
                    if (i < rest.Count && (rest[i] == "--subject" || rest[i] == "-s") && i + 1 < rest.Count) subject = rest[++i];
                    if (i < rest.Count && (rest[i] == "--body" || rest[i] == "-b") && i + 1 < rest.Count) body = rest[++i];
                }
                if (to.Count == 0) { Console.Error.WriteLine("Error: --to/-t required"); return 1; }
                if (subject == null) { Console.Error.WriteLine("Error: --subject/-s required"); return 1; }
                if (body == null) { Console.Error.WriteLine("Error: --body/-b required"); return 1; }
                var email = c.Send(to, subject, body, cc);
                Console.WriteLine($"Sent [{Fmt.ShortId(email.Id)}] to {string.Join(", ", email.To)}");
                break;
            }
            case "reply":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: email ID required"); return 1; }
                string emailId = rest[0]; string? body = null;
                for (int i = 1; i < rest.Count; i++)
                    if ((rest[i] == "--body" || rest[i] == "-b") && i + 1 < rest.Count) body = rest[++i];
                if (body == null) { Console.Error.WriteLine("Error: --body/-b required"); return 1; }
                var email = c.Reply(emailId, body);
                Console.WriteLine($"Replied [{Fmt.ShortId(email.Id)}] in thread {Fmt.ShortId(email.ThreadId)}");
                break;
            }
            case "thread":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: thread ID required"); return 1; }
                Console.WriteLine(Fmt.FormatThread(c.Thread(rest[0])));
                break;
            }
            case "threads":
                Console.WriteLine(Fmt.FormatThreads(c.Threads()));
                break;
            case "sent":
                Console.WriteLine(Fmt.FormatSent(c.Sent()));
                break;
            case "all":
                Console.WriteLine(Fmt.FormatAllMail(c.AllMail(), c.Name ?? ""));
                break;
            case "tag":
            {
                if (rest.Count < 2) { Console.Error.WriteLine("Error: email ID and tag(s) required"); return 1; }
                c.Tag(rest[0], rest.Skip(1).ToArray());
                Console.WriteLine($"Tagged {Fmt.ShortId(rest[0])} with: {string.Join(", ", rest.Skip(1))}");
                break;
            }
            case "untag":
            {
                if (rest.Count < 2) { Console.Error.WriteLine("Error: email ID and tag required"); return 1; }
                c.Untag(rest[0], rest[1]);
                Console.WriteLine($"Removed tag '{rest[1]}' from {Fmt.ShortId(rest[0])}");
                break;
            }
            case "tagged":
            {
                if (rest.Count < 1) { Console.Error.WriteLine("Error: tag required"); return 1; }
                Console.WriteLine(Fmt.FormatInbox(c.Tagged(rest[0])));
                break;
            }
            case "search":
            {
                string? from = null, to = null, subject = null, tag = null, body = null;
                for (int i = 0; i < rest.Count; i++)
                {
                    if (rest[i] == "--from" && i + 1 < rest.Count) from = rest[++i];
                    else if (rest[i] == "--to" && i + 1 < rest.Count) to = rest[++i];
                    else if (rest[i] == "--subject" && i + 1 < rest.Count) subject = rest[++i];
                    else if (rest[i] == "--tag" && i + 1 < rest.Count) tag = rest[++i];
                    else if (rest[i] == "--body" && i + 1 < rest.Count) body = rest[++i];
                }
                Console.WriteLine(Fmt.FormatInbox(c.Search(from, to, subject, tag, body)));
                break;
            }
            case "purge":
            {
                var result = c.Purge();
                var p = result.Purged;
                Console.WriteLine($"Purged: {p.Emails} emails, {p.Tags} tags, {p.Identities} identities");
                break;
            }
            case "names":
            {
                List<string>? add = null;
                for (int i = 0; i < rest.Count; i++)
                    if (rest[i] == "--add")
                    {
                        add = [];
                        while (++i < rest.Count && !rest[i].StartsWith('-')) add.Add(rest[i]);
                    }
                if (add != null)
                {
                    var added = c.AddNames(add);
                    Console.WriteLine($"Added {added} name(s) to pool");
                }
                else
                {
                    var names = c.Names();
                    Console.WriteLine($"Available names ({names.Count}): {string.Join(", ", names)}");
                }
                break;
            }
            default:
                Console.Error.WriteLine($"Unknown command: {cmd}");
                Console.Error.WriteLine("Commands: register, unregister, who, update, inbox, read, send, reply, thread, threads, sent, all, tag, untag, tagged, search, purge, names");
                return 1;
        }
        return 0;
    }

    // --- REPL ---

    private static void Repl(string server, string identity)
    {
        string? name = null;
        try
        {
            var c = MakeClient(server, identity);
            name = c.Name;
        }
        catch { /* ignore */ }

        var prompt = name != null ? $"emcom ({name})> " : "emcom> ";
        Console.WriteLine("emcom interactive mode. Type 'help' for commands, 'quit' to exit.");

        // Numbered-list state: list of (type, id)
        var lastItems = new List<(string Type, string Id)>();

        (string Type, string Id)? ResolveNum(int n)
        {
            if (n >= 1 && n <= lastItems.Count) return lastItems[n - 1];
            Console.Error.WriteLine($"No item #{n} (last list had {lastItems.Count} items)");
            return null;
        }

        EmcomClient Client() => MakeClient(server, identity);

        while (true)
        {
            Console.Write(prompt);
            var line = Console.ReadLine();
            if (line == null) { Console.WriteLine(); break; } // EOF
            line = line.Trim();
            if (line.Length == 0) continue;
            if (line is "quit" or "exit" or "q") break;

            if (line == "help")
            {
                Console.WriteLine("Commands: all, inbox, names, purge, read, register, reply, search, send, sent, tag, tagged, thread, threads, unregister, untag, update, who");
                Console.WriteLine("Shortcuts: <N> read item N, r <N> reply to item N");
                Console.WriteLine("Also: help, quit");
                continue;
            }

            // --- Numbered shortcuts ---
            // Bare number → read/open that item
            if (Regex.IsMatch(line, @"^\d+$"))
            {
                var item = ResolveNum(int.Parse(line));
                if (item != null)
                {
                    try
                    {
                        var cl = Client();
                        if (item.Value.Type == "thread")
                            Console.WriteLine(Fmt.FormatThread(cl.Thread(item.Value.Id)));
                        else
                            Console.WriteLine(Fmt.FormatEmail(cl.ReadEmail(item.Value.Id)));
                    }
                    catch (Exception ex) { Console.Error.WriteLine($"Error: {ex.Message}"); }
                }
                continue;
            }

            // r/reply <N> → reply to item N
            var m = Regex.Match(line, @"^(?:r|reply)\s+(\d+)$");
            if (m.Success)
            {
                var item = ResolveNum(int.Parse(m.Groups[1].Value));
                if (item != null)
                {
                    try
                    {
                        var cl = Client();
                        var emailId = item.Value.Id;
                        if (item.Value.Type == "thread")
                        {
                            var emails = cl.Thread(item.Value.Id);
                            if (emails.Count == 0) { Console.Error.WriteLine("Thread is empty."); continue; }
                            emailId = emails[^1].Id;
                        }
                        Console.Write("Reply (empty to cancel): ");
                        var body = Console.ReadLine() ?? "";
                        if (body.Trim().Length > 0)
                        {
                            var reply = cl.Reply(emailId, body);
                            Console.WriteLine($"Replied [{Fmt.ShortId(reply.Id)}] in thread {Fmt.ShortId(reply.ThreadId)}");
                        }
                        else Console.WriteLine("Cancelled.");
                    }
                    catch (Exception ex) { Console.Error.WriteLine($"Error: {ex.Message}"); }
                }
                continue;
            }

            // --- Standard command parsing ---
            List<string> tokens;
            try { tokens = ShellSplit(line); }
            catch { Console.Error.WriteLine("Parse error"); continue; }

            if (tokens.Count == 0) continue;

            var cmd = tokens[0];

            try
            {
                var cl = Client();
                // Intercept list commands for numbering
                switch (cmd)
                {
                    case "inbox":
                    {
                        var unread = tokens.Contains("--unread") || tokens.Contains("-u");
                        var emails = cl.Inbox(unread);
                        lastItems = emails.Select(e => ("email", e.Id)).ToList();
                        Console.WriteLine(Fmt.FormatInbox(emails, numbered: true));
                        break;
                    }
                    case "sent":
                    {
                        var emails = cl.Sent();
                        lastItems = emails.Select(e => ("email", e.Id)).ToList();
                        Console.WriteLine(Fmt.FormatSent(emails, numbered: true));
                        break;
                    }
                    case "all":
                    {
                        var emails = cl.AllMail();
                        lastItems = emails.Select(e => ("email", e.Id)).ToList();
                        Console.WriteLine(Fmt.FormatAllMail(emails, cl.Name ?? "", numbered: true));
                        break;
                    }
                    case "threads":
                    {
                        var threads = cl.Threads();
                        lastItems = threads.Select(t => ("thread", t.ThreadId)).ToList();
                        Console.WriteLine(Fmt.FormatThreads(threads, numbered: true));
                        break;
                    }
                    case "tagged":
                    {
                        if (tokens.Count < 2) { Console.Error.WriteLine("Error: tag required"); break; }
                        var emails = cl.Tagged(tokens[1]);
                        lastItems = emails.Select(e => ("email", e.Id)).ToList();
                        Console.WriteLine(Fmt.FormatInbox(emails, numbered: true));
                        break;
                    }
                    case "search":
                    {
                        string? from = null, to = null, subject = null, tag = null, body = null;
                        for (int i = 1; i < tokens.Count; i++)
                        {
                            if (tokens[i] == "--from" && i + 1 < tokens.Count) from = tokens[++i];
                            else if (tokens[i] == "--to" && i + 1 < tokens.Count) to = tokens[++i];
                            else if (tokens[i] == "--subject" && i + 1 < tokens.Count) subject = tokens[++i];
                            else if (tokens[i] == "--tag" && i + 1 < tokens.Count) tag = tokens[++i];
                            else if (tokens[i] == "--body" && i + 1 < tokens.Count) body = tokens[++i];
                        }
                        var emails = cl.Search(from, to, subject, tag, body);
                        lastItems = emails.Select(e => ("email", e.Id)).ToList();
                        Console.WriteLine(Fmt.FormatInbox(emails, numbered: true));
                        break;
                    }
                    default:
                        // Dispatch non-list commands normally
                        Dispatch(tokens, server, identity);
                        break;
                }
            }
            catch (EmcomException ex) { Console.Error.WriteLine($"Error: {ex.Message}"); }
            catch (Exception ex) { Console.Error.WriteLine($"Error: {ex.Message}"); }

            // Update prompt if identity changed
            try
            {
                var c = Client();
                name = c.Name;
                prompt = name != null ? $"emcom ({name})> " : "emcom> ";
            }
            catch { /* ignore */ }
        }
    }

    /// <summary>Simple shell-like split respecting quotes.</summary>
    private static List<string> ShellSplit(string input)
    {
        var tokens = new List<string>();
        var sb = new StringBuilder();
        bool inSingle = false, inDouble = false;

        for (int i = 0; i < input.Length; i++)
        {
            var ch = input[i];
            if (ch == '\'' && !inDouble) { inSingle = !inSingle; continue; }
            if (ch == '"' && !inSingle) { inDouble = !inDouble; continue; }
            if (ch == ' ' && !inSingle && !inDouble)
            {
                if (sb.Length > 0) { tokens.Add(sb.ToString()); sb.Clear(); }
                continue;
            }
            sb.Append(ch);
        }
        if (sb.Length > 0) tokens.Add(sb.ToString());
        if (inSingle || inDouble) throw new FormatException("Unclosed quote");
        return tokens;
    }
}
