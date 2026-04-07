namespace Emcom;

public static partial class BuildInfo
{
    public const string Version = "2.0.0";

    // Build timestamp from the exe file itself
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
