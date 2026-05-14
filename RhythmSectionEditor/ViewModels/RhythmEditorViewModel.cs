using RhythmSectionEditor.Models;

namespace RhythmSectionEditor.ViewModels;

public sealed class RhythmEditorViewModel
{
    public int AudioDurationMs { get; private set; } = 48000;

    public int SourceStartMs { get; private set; }

    public int SourceEndMs { get; private set; } = 48000;

    public int DurationMs => Math.Max(1000, SourceEndMs - SourceStartMs);

    public void ResetRangeToAudio(int audioDurationMs)
    {
        AudioDurationMs = Math.Max(1000, audioDurationMs);
        SourceStartMs = 0;
        SourceEndMs = AudioDurationMs;
    }

    public void LoadRange(BeatmapDocument? document, int audioDurationMs)
    {
        AudioDurationMs = Math.Max(1000, audioDurationMs);
        if (document is null || document.SourceEndMs <= document.SourceStartMs)
        {
            ResetRangeToAudio(AudioDurationMs);
            return;
        }

        SourceStartMs = Math.Clamp(document.SourceStartMs, 0, AudioDurationMs - 1000);
        SourceEndMs = Math.Clamp(document.SourceEndMs, SourceStartMs + 1000, AudioDurationMs);
    }

    public void SetSourceStart(int sourceStartMs)
    {
        SourceStartMs = Math.Clamp(sourceStartMs, 0, Math.Max(0, SourceEndMs - 1000));
    }

    public void SetSourceEnd(int sourceEndMs)
    {
        SourceEndMs = Math.Clamp(sourceEndMs, SourceStartMs + 1000, AudioDurationMs);
    }

    public void ApplyAudioDuration(int audioDurationMs, bool preserveExplicitRange)
    {
        AudioDurationMs = Math.Max(1000, audioDurationMs);
        if (!preserveExplicitRange)
        {
            ResetRangeToAudio(AudioDurationMs);
            return;
        }

        SourceStartMs = Math.Clamp(SourceStartMs, 0, Math.Max(0, AudioDurationMs - 1000));
        SourceEndMs = Math.Clamp(SourceEndMs, SourceStartMs + 1000, AudioDurationMs);
    }

    public static IReadOnlyList<string> ValidateExport(
        TrackDefinition? track,
        string? difficulty,
        IEnumerable<BeatmapNote> notes,
        int sourceStartMs,
        int sourceEndMs)
    {
        var problems = new List<string>();
        if (track is null) problems.Add("Nie wybrano utworu.");
        if (string.IsNullOrWhiteSpace(difficulty)) problems.Add("Nie wybrano poziomu.");
        if (sourceEndMs <= sourceStartMs) problems.Add("Zakres audio ma koniec przed początkiem.");

        var durationMs = Math.Max(0, sourceEndMs - sourceStartMs);
        foreach (var note in notes)
        {
            if (!new[] { "S", "D", "K", "L" }.Contains(note.Lane)) problems.Add($"{note.Id}: niepoprawny tor");
            if (note.TimeMs < 0 || note.TimeMs > durationMs) problems.Add($"{note.Id}: poza czasem poziomu");
            if (note.EndMs > durationMs) problems.Add($"{note.Id}: kończy się poza czasem poziomu");
        }

        return problems;
    }
}
