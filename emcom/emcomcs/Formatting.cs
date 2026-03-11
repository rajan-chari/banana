using System.Text;

namespace Emcom;

public static class Fmt
{
    public static string ShortId(string uuid) => uuid.Length >= 8 ? uuid[..8] : uuid;

    /// <summary>Format ISO timestamp as MM/DD HH:MM:SS (substring, no date parsing).</summary>
    public static string ShortDate(string iso)
    {
        // iso is like '2026-03-10T07:09:10...'
        if (iso.Length < 19) return iso;
        // d = "2026-03-10 07:09:10"
        return $"{iso[5..7]}/{iso[8..10]} {iso[11..19]}";
    }

    public static string Trunc(string s, int width) =>
        s.Length <= width ? s : s[..(width - 1)] + "\u2026";

    // --- List formatters ---

    public static string FormatInbox(List<Email> emails, bool numbered = false)
    {
        if (emails.Count == 0) return "Inbox is empty.";
        var idHdr = numbered ? "#" : "ID";
        var idW = numbered ? 4 : 8;
        var sb = new StringBuilder();
        sb.AppendLine($"{idHdr.PadRight(idW)}  {"From",-12}  {"Subject",-30}  {"Date",-14}  Tags");
        sb.AppendLine(new string('-', idW + 2 + 12 + 2 + 30 + 2 + 14 + 2 + 4));
        for (int i = 0; i < emails.Count; i++)
        {
            var e = emails[i];
            var tags = e.Tags.Count > 0 ? string.Join(", ", e.Tags) : "";
            var date = ShortDate(e.CreatedAt);
            var idCol = numbered ? $"[{i + 1}]" : ShortId(e.Id);
            sb.AppendLine($"{idCol.PadRight(idW)}  {e.SenderName.PadRight(12)}  {Trunc(e.Subject, 30).PadRight(30)}  {date.PadRight(14)}  {tags}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatEmail(Email email)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"From:    {email.SenderName}");
        sb.AppendLine($"To:      {string.Join(", ", email.To)}");
        if (email.Cc.Count > 0)
            sb.AppendLine($"CC:      {string.Join(", ", email.Cc)}");
        sb.AppendLine($"Subject: {email.Subject}");
        sb.AppendLine($"Date:    {ShortDate(email.CreatedAt)}");
        sb.AppendLine($"ID:      {email.Id}");
        if (email.Tags.Count > 0)
            sb.AppendLine($"Tags:    {string.Join(", ", email.Tags)}");
        sb.AppendLine();
        sb.Append(email.Body);
        return sb.ToString();
    }

    public static string FormatThread(List<Email> emails)
    {
        if (emails.Count == 0) return "Thread is empty.";
        var sb = new StringBuilder();
        for (int i = 0; i < emails.Count; i++)
        {
            if (i > 0) sb.AppendLine("---");
            sb.Append(FormatEmail(emails[i]));
            if (i < emails.Count - 1) sb.AppendLine();
        }
        return sb.ToString();
    }

    public static string FormatWho(List<Identity> identities)
    {
        if (identities.Count == 0) return "No registered agents.";
        int descWidth = Math.Min(60, Math.Max("Description".Length, identities.Max(i => i.Description.Length)));
        int locWidth = Math.Min(30, Math.Max("Location".Length, identities.Max(i => i.Location.Length)));
        var sb = new StringBuilder();
        sb.AppendLine($"{"Name",-12}  {"Description".PadRight(descWidth)}  {"Location".PadRight(locWidth)}  {"Last Seen",-14}");
        sb.AppendLine(new string('-', 12 + 2 + descWidth + 2 + locWidth + 2 + 14));
        foreach (var i in identities)
        {
            var seen = ShortDate(i.LastSeen);
            var desc = Trunc(i.Description, descWidth);
            var loc = Trunc(i.Location, locWidth);
            sb.AppendLine($"{i.Name.PadRight(12)}  {desc.PadRight(descWidth)}  {loc.PadRight(locWidth)}  {seen.PadRight(14)}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatAllMail(List<Email> emails, string viewer, bool numbered = false)
    {
        if (emails.Count == 0) return "No emails.";
        var idHdr = numbered ? "#" : "ID";
        var idW = numbered ? 4 : 8;
        var sb = new StringBuilder();
        sb.AppendLine($"{idHdr.PadRight(idW)}  {"",2}  {"From",-12}  {"To",-12}  {"Subject",-25}  {"Date",-14}  Tags");
        sb.AppendLine(new string('-', idW + 2 + 2 + 2 + 12 + 2 + 12 + 2 + 25 + 2 + 14 + 2 + 4));
        for (int i = 0; i < emails.Count; i++)
        {
            var e = emails[i];
            var direction = e.SenderName == viewer ? ">>" : "<<";
            var to = string.Join(", ", e.To);
            var tags = e.Tags.Count > 0 ? string.Join(", ", e.Tags) : "";
            var date = ShortDate(e.CreatedAt);
            var idCol = numbered ? $"[{i + 1}]" : ShortId(e.Id);
            sb.AppendLine($"{idCol.PadRight(idW)}  {direction}  {e.SenderName.PadRight(12)}  {Trunc(to, 12).PadRight(12)}  {Trunc(e.Subject, 25).PadRight(25)}  {date.PadRight(14)}  {tags}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatSent(List<Email> emails, bool numbered = false)
    {
        if (emails.Count == 0) return "No sent emails.";
        var idHdr = numbered ? "#" : "ID";
        var idW = numbered ? 4 : 8;
        var sb = new StringBuilder();
        sb.AppendLine($"{idHdr.PadRight(idW)}  {"To",-20}  {"Subject",-30}  {"Date",-14}");
        sb.AppendLine(new string('-', idW + 2 + 20 + 2 + 30 + 2 + 14));
        for (int i = 0; i < emails.Count; i++)
        {
            var e = emails[i];
            var to = string.Join(", ", e.To);
            var date = ShortDate(e.CreatedAt);
            var idCol = numbered ? $"[{i + 1}]" : ShortId(e.Id);
            sb.AppendLine($"{idCol.PadRight(idW)}  {Trunc(to, 20).PadRight(20)}  {Trunc(e.Subject, 30).PadRight(30)}  {date.PadRight(14)}");
        }
        return sb.ToString().TrimEnd();
    }

    public static string FormatThreads(List<Thread> threads, bool numbered = false)
    {
        if (threads.Count == 0) return "No threads.";
        var idHdr = numbered ? "#" : "Thread ID";
        var idW = numbered ? 4 : 8;
        var sb = new StringBuilder();
        sb.AppendLine($"{idHdr.PadRight(idW)}  {"Subject",-25}  {"Participants",-25}  {"Emails",-6}  {"Last Activity",-14}");
        sb.AppendLine(new string('-', idW + 2 + 25 + 2 + 25 + 2 + 6 + 2 + 14));
        for (int i = 0; i < threads.Count; i++)
        {
            var t = threads[i];
            var parts = string.Join(", ", t.Participants);
            var date = ShortDate(t.LastActivity);
            var idCol = numbered ? $"[{i + 1}]" : ShortId(t.ThreadId);
            sb.AppendLine($"{idCol.PadRight(idW)}  {Trunc(t.Subject, 25).PadRight(25)}  {Trunc(parts, 25).PadRight(25)}  {t.EmailCount.ToString().PadRight(6)}  {date.PadRight(14)}");
        }
        return sb.ToString().TrimEnd();
    }
}
