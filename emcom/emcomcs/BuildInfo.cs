using System.Reflection;

namespace Emcom;

public static partial class BuildInfo
{
    private static readonly Dictionary<string, string> _meta = LoadMeta();

    // Populated from AssemblyMetadataAttribute via Directory.Build.props.
    // CI (fellow-agents release.yml) sets BANANA_SHA / RELEASE_TAG / BUILT_AT / BUILD_PLATFORM env vars;
    // local builds get the 'dev' sentinel via the two-line cascade in Directory.Build.props.
    public static string BananaSha  => _meta.GetValueOrDefault("BananaSha", "dev");
    public static string ReleaseTag => _meta.GetValueOrDefault("ReleaseTag", "dev");
    public static string BuiltAt    => _meta.GetValueOrDefault("BuiltAt", "dev");
    public static string Platform   => _meta.GetValueOrDefault("Platform", "dev");

    /// <summary>Composite provenance line — mirrors emcom-server --version format exactly.</summary>
    public static string ProvenanceLine =>
        $"(banana {ShortSha(BananaSha)}, {Platform}, built {BuiltAt})";

    private static string ShortSha(string sha) =>
        (sha.Length > 7 && sha != "dev") ? sha[..7] : sha;

    private static Dictionary<string, string> LoadMeta()
    {
        var dict = new Dictionary<string, string>();
        foreach (var attr in typeof(BuildInfo).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>())
            if (attr.Key is { } k) dict[k] = attr.Value ?? "dev";
        return dict;
    }
}
