using System.Text.Json.Serialization;

namespace RhythmSectionEditor.Models;

public sealed record TrackDefinition(
    string Id,
    int Order,
    string Title,
    int Bpm,
    int DurationMs,
    string AudioFolder,
    string AudioTitle,
    IReadOnlyList<string> Difficulties)
{
    public string DisplayName => $"{Order:00}. {Title} / {Bpm} BPM";
}

public sealed class ManualBeatmapFile
{
    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; } = 2;

    [JsonPropertyName("tracks")]
    public Dictionary<string, Dictionary<string, BeatmapDocument>> Tracks { get; set; } = [];
}

public sealed class BeatmapDocument
{
    [JsonPropertyName("trackId")]
    public string TrackId { get; set; } = string.Empty;

    [JsonPropertyName("bpm")]
    public int Bpm { get; set; }

    [JsonPropertyName("sourceStartMs")]
    public int SourceStartMs { get; set; }

    [JsonPropertyName("sourceEndMs")]
    public int SourceEndMs { get; set; }

    [JsonPropertyName("durationMs")]
    public int DurationMs { get; set; }

    [JsonPropertyName("notes")]
    public List<BeatmapNote> Notes { get; set; } = [];
}

public sealed class BeatmapNote
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("lane")]
    public string Lane { get; set; } = "S";

    [JsonPropertyName("timeMs")]
    public int TimeMs { get; set; }

    [JsonPropertyName("kind")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Kind { get; set; }

    [JsonPropertyName("durationMs")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? DurationMs { get; set; }

    [JsonPropertyName("requiredPresses")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? RequiredPresses { get; set; }

    [JsonIgnore]
    public string NormalizedKind => string.IsNullOrWhiteSpace(Kind) ? "tap" : Kind;

    [JsonIgnore]
    public int EndMs => TimeMs + (NormalizedKind == "tap" ? 0 : Math.Max(240, DurationMs ?? 0));

    public BeatmapNote Clone() => new()
    {
        Id = Id,
        Lane = Lane,
        TimeMs = TimeMs,
        Kind = Kind,
        DurationMs = DurationMs,
        RequiredPresses = RequiredPresses,
    };

    public BeatmapNote CloneNormalized()
    {
        var clone = Clone();
        if (clone.NormalizedKind == "tap")
        {
            clone.Kind = null;
            clone.DurationMs = null;
            clone.RequiredPresses = null;
        }
        else
        {
            clone.DurationMs = Math.Max(240, clone.DurationMs ?? 700);
            clone.RequiredPresses = clone.NormalizedKind == "smash"
                ? Math.Max(2, clone.RequiredPresses ?? 4)
                : null;
        }

        return clone;
    }
}
