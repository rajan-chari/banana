namespace Tracker;

public static class BuildInfo
{
    public const string Version = "1.0.0";

    public static string BuildTime
    {
        get
        {
            try
            {
                var exePath = Environment.ProcessPath;
                if (exePath != null && File.Exists(exePath))
                    return File.GetLastWriteTimeUtc(exePath).ToString("yyyy-MM-dd HH:mm:ss UTC");
            }
            catch { }
            return "unknown";
        }
    }
}
