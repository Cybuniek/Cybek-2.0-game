using System.Text.Json;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using RhythmSectionEditor.Models;
using RhythmSectionEditor.ViewModels;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.System;
using IOPath = System.IO.Path;

namespace RhythmSectionEditor;

public sealed partial class MainPage : Page
{
    private const int LaneHeight = 86;
    private const int HeatmapHeight = 44;
    private const int TimelinePadding = 48;
    private const int MinimumLongNoteDurationMs = 240;
    private const int ExportSchemaVersion = 2;

    private readonly List<TrackDefinition> _tracks =
    [
        new("wystep-czekamy-czekamy", 1, "Występ Czekamy Czekamy", 122, 98535, "01 — Występ Czekamy Czekamy", "Występ Czekamy Czekamy", ["Łatwy", "Normalny", "Cybart"]),
        new("wenezuelski-wystep-mashup", 2, "Wenezuelski Występ (Mashup)", 128, 230913, "02 — Wenezuelski Występ (Mashup)", "Wenezuelski Występ (Mashup)", ["Łatwy", "Normalny", "Cybart"]),
        new("vlog-wildforest-rave-anho27", 3, "Vlog Wildforest Rave – ANHO27", 144, 318153, "03 — Vlog Wildforest Rave – ANHO27", "Vlog Wildforest Rave – ANHO27", ["Normalny", "Cybart"]),
    ];

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    private readonly Stack<string> _history = new();
    private readonly Stack<string> _redo = new();
    private readonly RhythmEditorViewModel _viewModel = new();
    private readonly MediaPlayer _audioPlayer = new();
    private ManualBeatmapFile _catalog = new();
    private List<BeatmapNote> _notes = [];
    private string? _selectedNoteId;
    private string _workspaceRoot = string.Empty;
    private string _selectedToolKind = "tap";
    private string? _draggedNoteId;
    private bool _isPlaytesting;
    private int _playtestHits;
    private int _playtestMisses;
    private bool _isLoadingMap;
    private bool _isUpdatingInspector;
    private bool _hasExplicitRange;

    public MainPage()
    {
        InitializeComponent();
    }

    private TrackDefinition? CurrentTrack => TrackComboBox.SelectedItem as TrackDefinition;

    private string? CurrentDifficulty => DifficultyComboBox.SelectedItem as string;

    private BeatmapNote? SelectedNote => _notes.FirstOrDefault(note => note.Id == _selectedNoteId);

    private int DurationMs => _viewModel.DurationMs;

    private string ManualBeatmapsPath => IOPath.Combine(_workspaceRoot, "src", "data", "manualBeatmaps.json");

    private void Page_Loaded(object sender, RoutedEventArgs e)
    {
        _workspaceRoot = FindGameWorkspace() ?? Directory.GetCurrentDirectory();
        WorkspacePathBox.Text = _workspaceRoot;
        AudioPreview.SetMediaPlayer(_audioPlayer);
        _audioPlayer.MediaOpened += AudioPreview_MediaOpened;
        Focus(FocusState.Programmatic);

        TrackComboBox.ItemsSource = _tracks.OrderBy(track => track.Order).ToList();
        TrackComboBox.DisplayMemberPath = nameof(TrackDefinition.DisplayName);
        TrackComboBox.SelectedIndex = 0;

        LoadCatalog();
        LoadCurrentMap();
    }

    private void LoadWorkspaceButton_Click(object sender, RoutedEventArgs e)
    {
        var requestedPath = WorkspacePathBox.Text.Trim();
        if (Directory.Exists(requestedPath))
        {
            _workspaceRoot = requestedPath;
            LoadCatalog();
            LoadCurrentMap();
            SetStatus("Workspace wczytany", "Ścieżka projektu gry została ustawiona.", InfoBarSeverity.Success);
            return;
        }

        SetStatus("Nie znaleziono workspace", "Podana ścieżka nie istnieje.", InfoBarSeverity.Error);
    }

    private void ImportButton_Click(object sender, RoutedEventArgs e)
    {
        LoadCatalog();
        LoadCurrentMap();
        SetStatus("Import zakończony", "Wczytano ręczne beatmapy z manualBeatmaps.json.", InfoBarSeverity.Success);
    }

    private void ExportButton_Click(object sender, RoutedEventArgs e)
    {
        SaveCurrentMapToCatalog();
        var exportProblems = RhythmEditorViewModel.ValidateExport(CurrentTrack, CurrentDifficulty, _notes, _viewModel.SourceStartMs, _viewModel.SourceEndMs);
        if (exportProblems.Count > 0)
        {
            SetStatus("Eksport zablokowany", string.Join(" | ", exportProblems.Take(4)), InfoBarSeverity.Error);
            return;
        }

        Directory.CreateDirectory(IOPath.GetDirectoryName(ManualBeatmapsPath)!);
        CreateBackup();
        File.WriteAllText(ManualBeatmapsPath, JsonSerializer.Serialize(_catalog, _jsonOptions));
        SetStatus("Eksport zakończony", $"Zapisano {ManualBeatmapsPath}.", InfoBarSeverity.Success);
    }

    private void UndoButton_Click(object sender, RoutedEventArgs e)
    {
        if (_history.Count == 0) return;

        _redo.Push(SerializeNotes(_notes));
        _notes = DeserializeNotes(_history.Pop());
        _selectedNoteId = _notes.FirstOrDefault()?.Id;
        RefreshEditor();
    }

    private void RedoButton_Click(object sender, RoutedEventArgs e)
    {
        if (_redo.Count == 0) return;

        _history.Push(SerializeNotes(_notes));
        _notes = DeserializeNotes(_redo.Pop());
        _selectedNoteId = _notes.FirstOrDefault()?.Id;
        RefreshEditor();
    }

    private void AddTapButton_Click(object sender, RoutedEventArgs e)
    {
        _selectedToolKind = "tap";
        AddNote("tap");
    }

    private void AddHoldButton_Click(object sender, RoutedEventArgs e)
    {
        _selectedToolKind = "hold";
        AddNote("hold");
    }

    private void AddSmashButton_Click(object sender, RoutedEventArgs e)
    {
        _selectedToolKind = "smash";
        AddNote("smash");
    }

    private void GenerateBaseButton_Click(object sender, RoutedEventArgs e)
    {
        var track = CurrentTrack;
        var difficulty = CurrentDifficulty;
        if (track is null || string.IsNullOrWhiteSpace(difficulty)) return;

        PushHistory();
        _notes = GenerateStarterNotes(track, difficulty, DurationMs);
        _selectedNoteId = _notes.FirstOrDefault()?.Id;
        RefreshEditor();
        SetStatus("Wygenerowano bazę", "Pusta mapa dostała roboczy układ nut.", InfoBarSeverity.Success);
    }

    private void FullRangeButton_Click(object sender, RoutedEventArgs e)
    {
        _hasExplicitRange = false;
        _viewModel.ResetRangeToAudio(_viewModel.AudioDurationMs);
        SyncRangeBoxes();
        RefreshEditor();
    }

    private void SetStartButton_Click(object sender, RoutedEventArgs e)
    {
        _hasExplicitRange = true;
        _viewModel.SetSourceStart((int)Math.Round(PlayheadSlider.Value));
        SyncRangeBoxes();
        RefreshEditor();
    }

    private void SetEndButton_Click(object sender, RoutedEventArgs e)
    {
        _hasExplicitRange = true;
        _viewModel.SetSourceEnd((int)Math.Round(PlayheadSlider.Value));
        SyncRangeBoxes();
        RefreshEditor();
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        var note = SelectedNote;
        if (note is null) return;

        PushHistory();
        var copy = note.Clone();
        copy.Id = CreateNoteId(copy.NormalizedKind);
        copy.TimeMs = Math.Min(DurationMs - 100, copy.TimeMs + 250);
        _notes.Add(copy);
        _selectedNoteId = copy.Id;
        RefreshEditor();
    }

    private void DeleteButton_Click(object sender, RoutedEventArgs e)
    {
        var note = SelectedNote;
        if (note is null) return;

        PushHistory();
        _notes.Remove(note);
        _selectedNoteId = _notes.OrderBy(item => item.TimeMs).FirstOrDefault()?.Id;
        RefreshEditor();
    }

    private void QuantizeButton_Click(object sender, RoutedEventArgs e)
    {
        var track = CurrentTrack;
        if (track is null || _notes.Count == 0) return;

        PushHistory();
        var gridMs = Math.Max(1, (60000.0 / track.Bpm) / 4.0);
        foreach (var note in _notes)
        {
            note.TimeMs = (int)Math.Clamp(Math.Round(note.TimeMs / gridMs) * gridMs, 0, DurationMs);
        }

        RefreshEditor();
        SetStatus("Quantize", "Nuty zostały przyciągnięte do siatki 1/16 beatu.", InfoBarSeverity.Success);
    }

    private void TrackComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isLoadingMap) return;

        var track = CurrentTrack;
        if (track is null) return;

        _isLoadingMap = true;
        DifficultyComboBox.ItemsSource = track.Difficulties;
        DifficultyComboBox.SelectedIndex = 0;
        _isLoadingMap = false;
        LoadCurrentMap();
    }

    private void DifficultyComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isLoadingMap) return;

        LoadCurrentMap();
    }

    private void PlayheadSlider_ValueChanged(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!IsLoaded) return;

        RenderTimeline();
    }

    private void ZoomSlider_ValueChanged(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!IsLoaded) return;

        RenderTimeline();
    }

    private void Inspector_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_isUpdatingInspector) return;

        ApplyInspectorChanges();
    }

    private void Inspector_ValueChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_isUpdatingInspector) return;

        ApplyInspectorChanges();
    }

    private void NoteButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string noteId }) return;

        _selectedNoteId = noteId;
        RefreshEditor();
    }

    private void TimelineCanvas_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        var point = e.GetCurrentPoint(TimelineCanvas).Position;
        PlayheadSlider.Value = TimeFromTimelineX(point.X);
    }

    private void TimelineCanvas_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        var point = e.GetPosition(TimelineCanvas);
        var lane = LaneFromTimelineY(point.Y);
        if (lane is null) return;

        AddNote(_selectedToolKind, lane, TimeFromTimelineX(point.X));
    }

    private void NoteButton_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (sender is not Button { Tag: string noteId } button) return;

        _draggedNoteId = noteId;
        _selectedNoteId = noteId;
        button.CapturePointer(e.Pointer);
        PushHistory();
        e.Handled = true;
    }

    private void NoteButton_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (_draggedNoteId is null) return;

        var note = _notes.FirstOrDefault(item => item.Id == _draggedNoteId);
        if (note is null) return;

        var point = e.GetCurrentPoint(TimelineCanvas).Position;
        note.TimeMs = TimeFromTimelineX(point.X);
        note.Lane = LaneFromTimelineY(point.Y) ?? note.Lane;
        RefreshEditor();
        e.Handled = true;
    }

    private void NoteButton_PointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (sender is Button button) button.ReleasePointerCapture(e.Pointer);
        _draggedNoteId = null;
    }

    private void LoadCatalog()
    {
        if (!File.Exists(ManualBeatmapsPath))
        {
            _catalog = new ManualBeatmapFile();
            return;
        }

        try
        {
            _catalog = JsonSerializer.Deserialize<ManualBeatmapFile>(File.ReadAllText(ManualBeatmapsPath), _jsonOptions) ?? new ManualBeatmapFile();
            _catalog.SchemaVersion = ExportSchemaVersion;
            _catalog.Tracks ??= [];
        }
        catch (JsonException)
        {
            _catalog = new ManualBeatmapFile();
            SetStatus("Błąd importu", "manualBeatmaps.json nie jest poprawnym JSON-em. Edytor używa pustego katalogu.", InfoBarSeverity.Warning);
        }
    }

    private void LoadCurrentMap()
    {
        var track = CurrentTrack;
        var difficulty = CurrentDifficulty;
        if (track is null || string.IsNullOrWhiteSpace(difficulty)) return;

        _history.Clear();
        _redo.Clear();
        _selectedNoteId = null;
        var audioDurationMs = EstimateDurationMs(track);
        _viewModel.ResetRangeToAudio(audioDurationMs);

        if (_catalog.Tracks.TryGetValue(track.Id, out var byDifficulty)
            && byDifficulty.TryGetValue(difficulty, out var document)
            && document is not null)
        {
            _hasExplicitRange = document.SourceEndMs > document.SourceStartMs;
            _viewModel.LoadRange(document, audioDurationMs);
            _notes = document.Notes.Select(note => note.CloneNormalized()).OrderBy(note => note.TimeMs).ToList();
            SetStatus("Mapa ręczna", "Wczytano istniejącą mapę dla wybranego utworu i poziomu.", InfoBarSeverity.Success);
        }
        else
        {
            _hasExplicitRange = false;
            _notes = [];
            SetStatus("Pusta mapa", "Brak ręcznej mapy. Użyj „Wygeneruj bazę” albo dodawaj nuty ręcznie.", InfoBarSeverity.Informational);
        }

        _selectedNoteId = _notes.FirstOrDefault()?.Id;
        PlayheadSlider.Maximum = DurationMs;
        PlayheadSlider.Value = Math.Min(PlayheadSlider.Value, DurationMs);
        SyncRangeBoxes();
        UpdateAudioPreview(track);
        RefreshEditor();
    }

    private void SaveCurrentMapToCatalog()
    {
        var track = CurrentTrack;
        var difficulty = CurrentDifficulty;
        if (track is null || string.IsNullOrWhiteSpace(difficulty)) return;

        if (!_catalog.Tracks.TryGetValue(track.Id, out var byDifficulty))
        {
            byDifficulty = [];
            _catalog.Tracks[track.Id] = byDifficulty;
        }

        byDifficulty[difficulty] = new BeatmapDocument
        {
            TrackId = track.Id,
            Bpm = track.Bpm,
            SourceStartMs = _viewModel.SourceStartMs,
            SourceEndMs = _viewModel.SourceEndMs,
            DurationMs = DurationMs,
            Notes = _notes.Select(note => note.CloneNormalized()).OrderBy(note => note.TimeMs).ThenBy(note => note.Lane).ToList(),
        };
    }

    private void AddNote(string kind, string? laneOverride = null, int? timeOverrideMs = null)
    {
        var track = CurrentTrack;
        if (track is null) return;

        PushHistory();
        var timeMs = (int)Math.Clamp(timeOverrideMs ?? Math.Round(PlayheadSlider.Value), 0, Math.Max(0, DurationMs - 100));
        var note = new BeatmapNote
        {
            Id = CreateNoteId(kind),
            Lane = laneOverride ?? SelectedNote?.Lane ?? "S",
            TimeMs = timeMs,
            Kind = kind == "tap" ? null : kind,
            DurationMs = kind == "tap" ? null : (kind == "hold" ? 700 : 800),
            RequiredPresses = kind == "smash" ? 4 : null,
        };

        _notes.Add(note);
        _selectedNoteId = note.Id;
        RefreshEditor();
    }

    private void ApplyInspectorChanges()
    {
        var note = SelectedNote;
        if (note is null) return;

        PushHistory();
        var kind = ComboValue(KindComboBox);
        note.Kind = kind == "tap" ? null : kind;
        note.Lane = ComboValue(LaneComboBox);
        note.TimeMs = (int)Math.Clamp(NumberOr(TimeBox.Value, note.TimeMs), 0, DurationMs);

        if (kind == "tap")
        {
            note.DurationMs = null;
            note.RequiredPresses = null;
        }
        else
        {
            note.DurationMs = Math.Max(MinimumLongNoteDurationMs, (int)NumberOr(DurationBox.Value, note.DurationMs ?? 700));
            note.RequiredPresses = kind == "smash"
                ? Math.Max(2, (int)NumberOr(RequiredPressesBox.Value, note.RequiredPresses ?? 4))
                : null;
        }

        RefreshEditor();
    }

    private void RefreshEditor()
    {
        SaveCurrentMapToCatalog();
        RenderTimeline();
        UpdateInspector();
        UpdateValidation();
        UpdateStats();
        UndoButton.IsEnabled = _history.Count > 0;
        RedoButton.IsEnabled = _redo.Count > 0;
    }

    private void RenderTimeline()
    {
        if (TimelineCanvas is null) return;

        var track = CurrentTrack;
        if (track is null) return;

        TimelineCanvas.Children.Clear();
        var pixelsPerMs = 0.035 * Math.Max(1, ZoomSlider.Value);
        var width = Math.Max(1400, DurationMs * pixelsPerMs + TimelinePadding * 2);
        var laneAreaHeight = LaneHeight * 4;
        TimelineCanvas.Width = width;
        TimelineCanvas.Height = laneAreaHeight + HeatmapHeight + 36;

        DrawLaneRows(width);
        DrawBeatGrid(track, pixelsPerMs, laneAreaHeight);
        DrawNotes(pixelsPerMs);
        DrawHeatmap(width, pixelsPerMs, laneAreaHeight);
        DrawPlayhead(pixelsPerMs, laneAreaHeight);
    }

    private void DrawLaneRows(double width)
    {
        var lanes = new[] { "S", "D", "K", "L" };
        for (var index = 0; index < lanes.Length; index += 1)
        {
            var top = index * LaneHeight;
            var background = new Border
            {
                Width = width,
                Height = LaneHeight - 6,
                Background = ResourceBrush("LayerFillColorDefaultBrush", Colors.Transparent),
                BorderBrush = ResourceBrush("CardStrokeColorDefaultBrush", Colors.Gray),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
            };

            Canvas.SetLeft(background, 0);
            Canvas.SetTop(background, top);
            TimelineCanvas.Children.Add(background);

            var label = new TextBlock
            {
                Text = lanes[index],
                FontSize = 22,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = ResourceBrush("TextFillColorPrimaryBrush", Colors.White),
            };

            Canvas.SetLeft(label, 14);
            Canvas.SetTop(label, top + 26);
            TimelineCanvas.Children.Add(label);
        }
    }

    private void DrawBeatGrid(TrackDefinition track, double pixelsPerMs, double laneAreaHeight)
    {
        var beatMs = 60000.0 / track.Bpm;
        for (var timeMs = 0.0; timeMs <= DurationMs; timeMs += beatMs)
        {
            var isBar = Math.Round(timeMs / beatMs) % 4 == 0;
            var line = new Rectangle
            {
                Width = isBar ? 2 : 1,
                Height = laneAreaHeight,
                Fill = new SolidColorBrush(isBar ? Colors.DarkGray : Colors.DimGray),
                Opacity = isBar ? 0.38 : 0.22,
            };

            Canvas.SetLeft(line, TimelinePadding + timeMs * pixelsPerMs);
            Canvas.SetTop(line, 0);
            TimelineCanvas.Children.Add(line);
        }
    }

    private void DrawNotes(double pixelsPerMs)
    {
        foreach (var note in _notes.OrderBy(item => item.TimeMs))
        {
            var laneIndex = LaneIndex(note.Lane);
            if (laneIndex < 0) continue;

            var kind = note.NormalizedKind;
            var width = kind == "tap"
                ? 42
                : Math.Max(58, (note.DurationMs ?? MinimumLongNoteDurationMs) * pixelsPerMs);
            var button = new Button
            {
                Tag = note.Id,
                Content = kind == "tap" ? "tap" : kind == "hold" ? "hold" : $"x{note.RequiredPresses ?? 4}",
                Width = width,
                Height = 38,
                Padding = new Thickness(4, 0, 4, 0),
                Background = NoteBrush(kind, note.Id == _selectedNoteId),
                BorderBrush = note.Id == _selectedNoteId
                    ? new SolidColorBrush(Colors.White)
                    : ResourceBrush("CardStrokeColorDefaultBrush", Colors.Gray),
                BorderThickness = new Thickness(note.Id == _selectedNoteId ? 2 : 1),
            };

            ToolTipService.SetToolTip(button, $"{kind} {note.Lane} @ {note.TimeMs} ms");
            button.Click += NoteButton_Click;
            button.PointerPressed += NoteButton_PointerPressed;
            button.PointerMoved += NoteButton_PointerMoved;
            button.PointerReleased += NoteButton_PointerReleased;

            Canvas.SetLeft(button, TimelinePadding + note.TimeMs * pixelsPerMs);
            Canvas.SetTop(button, laneIndex * LaneHeight + 23);
            TimelineCanvas.Children.Add(button);
        }
    }

    private void DrawHeatmap(double width, double pixelsPerMs, double laneAreaHeight)
    {
        var segmentMs = 2000;
        var segments = Math.Max(1, (int)Math.Ceiling(DurationMs / (double)segmentMs));
        for (var segment = 0; segment < segments; segment += 1)
        {
            var startMs = segment * segmentMs;
            var count = _notes.Count(note => note.TimeMs >= startMs && note.TimeMs < startMs + segmentMs);
            var intensity = Math.Min(1.0, count / 12.0);
            var block = new Rectangle
            {
                Width = segmentMs * pixelsPerMs,
                Height = 18 + intensity * 22,
                Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 255, (byte)(210 - intensity * 90), 80)),
                Opacity = 0.25 + intensity * 0.55,
            };

            Canvas.SetLeft(block, TimelinePadding + startMs * pixelsPerMs);
            Canvas.SetTop(block, laneAreaHeight + HeatmapHeight - block.Height);
            TimelineCanvas.Children.Add(block);
        }
    }

    private void DrawPlayhead(double pixelsPerMs, double laneAreaHeight)
    {
        var playhead = new Rectangle
        {
            Width = 3,
            Height = laneAreaHeight + HeatmapHeight,
            Fill = ResourceBrush("AccentFillColorDefaultBrush", Colors.DeepSkyBlue),
            Opacity = 0.9,
        };

        Canvas.SetLeft(playhead, TimelinePadding + PlayheadSlider.Value * pixelsPerMs);
        Canvas.SetTop(playhead, 0);
        TimelineCanvas.Children.Add(playhead);
    }

    private void UpdateInspector()
    {
        _isUpdatingInspector = true;
        var note = SelectedNote;
        var hasNote = note is not null;

        KindComboBox.IsEnabled = hasNote;
        LaneComboBox.IsEnabled = hasNote;
        TimeBox.IsEnabled = hasNote;
        DurationBox.IsEnabled = hasNote && note!.NormalizedKind != "tap";
        RequiredPressesBox.IsEnabled = hasNote && note!.NormalizedKind == "smash";

        if (note is null)
        {
            SelectedNoteText.Text = "Nie wybrano nuty.";
            _isUpdatingInspector = false;
            return;
        }

        SelectComboValue(KindComboBox, note.NormalizedKind);
        SelectComboValue(LaneComboBox, note.Lane);
        TimeBox.Value = note.TimeMs;
        DurationBox.Value = note.DurationMs ?? MinimumLongNoteDurationMs;
        RequiredPressesBox.Value = note.RequiredPresses ?? 4;
        SelectedNoteText.Text = $"{note.NormalizedKind} / tor {note.Lane} / {note.TimeMs} ms";
        _isUpdatingInspector = false;
    }

    private void UpdateValidation()
    {
        var problems = ValidateNotes();
        ValidationText.Text = problems.Count == 0
            ? "Walidacja: OK. Brak kolizji torów i brak nut poza czasem próby."
            : $"Walidacja: {problems.Count} problem(y): {string.Join(" | ", problems.Take(4))}";
    }

    private void UpdateStats()
    {
        var tapCount = _notes.Count(note => note.NormalizedKind == "tap");
        var holdCount = _notes.Count(note => note.NormalizedKind == "hold");
        var smashCount = _notes.Count(note => note.NormalizedKind == "smash");
        var density = DurationMs <= 0 ? 0 : Math.Round(_notes.Count / (DurationMs / 60000.0), 1);
        MapStatsText.Text = $"{_notes.Count} nut | tap {tapCount}, hold {holdCount}, smash {smashCount} | {density} nut/min | czas {DurationMs / 1000}s | audio {FormatTime(_viewModel.AudioDurationMs)}";
    }

    private List<string> ValidateNotes()
    {
        var problems = new List<string>();
        foreach (var note in _notes)
        {
            if (!IsLane(note.Lane)) problems.Add($"{note.Id}: niepoprawny tor");
            if (note.TimeMs < 0 || note.TimeMs > DurationMs) problems.Add($"{note.Id}: poza czasem próby");
            if (note.EndMs > DurationMs) problems.Add($"{note.Id}: kończy się poza czasem próby");
            if (note.NormalizedKind != "tap" && (note.DurationMs is null or < MinimumLongNoteDurationMs)) problems.Add($"{note.Id}: za krótka nuta długa");
            if (note.NormalizedKind == "smash" && (note.RequiredPresses is null or < 2)) problems.Add($"{note.Id}: smash bez minimalnego mashu");
        }

        foreach (var laneGroup in _notes.Where(note => IsLane(note.Lane)).GroupBy(note => note.Lane))
        {
            var previousEnd = -1;
            foreach (var note in laneGroup.OrderBy(note => note.TimeMs))
            {
                if (note.TimeMs < previousEnd + 80) problems.Add($"{note.Id}: kolizja na torze {note.Lane}");
                previousEnd = Math.Max(previousEnd, note.EndMs);
            }
        }

        return problems;
    }

    private void UpdateAudioPreview(TrackDefinition track)
    {
        var audioPath = IOPath.Combine(_workspaceRoot, "public", "audio", "music", "ustno", track.AudioFolder, $"{track.AudioTitle}.wav");
        _audioPlayer.Source = File.Exists(audioPath)
            ? MediaSource.CreateFromUri(new Uri(audioPath))
            : null;
    }

    private void AudioPreview_MediaOpened(Windows.Media.Playback.MediaPlayer sender, object args)
    {
        var duration = sender.PlaybackSession.NaturalDuration;
        if (duration <= TimeSpan.Zero) return;

        var nextAudioDurationMs = (int)Math.Round(duration.TotalMilliseconds);
        DispatcherQueue.TryEnqueue(() =>
        {
            _viewModel.ApplyAudioDuration(nextAudioDurationMs, _hasExplicitRange);
            PlayheadSlider.Maximum = DurationMs;
            PlayheadSlider.Value = Math.Min(PlayheadSlider.Value, DurationMs);
            SyncRangeBoxes();
            RefreshEditor();
        });
    }

    private void SyncRangeBoxes()
    {
        _isUpdatingInspector = true;
        SourceStartBox.Value = _viewModel.SourceStartMs;
        SourceEndBox.Value = _viewModel.SourceEndMs;
        RangeText.Text = $"Zakres: {FormatTime(_viewModel.SourceStartMs)} - {FormatTime(_viewModel.SourceEndMs)} | poziom {FormatTime(DurationMs)}";
        _isUpdatingInspector = false;
    }

    private void Range_ValueChanged(NumberBox sender, NumberBoxValueChangedEventArgs args)
    {
        if (_isUpdatingInspector) return;

        _hasExplicitRange = true;
        _viewModel.SetSourceStart((int)NumberOr(SourceStartBox.Value, _viewModel.SourceStartMs));
        _viewModel.SetSourceEnd((int)NumberOr(SourceEndBox.Value, _viewModel.SourceEndMs));
        PlayheadSlider.Maximum = DurationMs;
        PlayheadSlider.Value = Math.Min(PlayheadSlider.Value, DurationMs);
        SyncRangeBoxes();
        RefreshEditor();
    }

    private void PlaytestButton_Click(object sender, RoutedEventArgs e)
    {
        _isPlaytesting = true;
        _playtestHits = 0;
        _playtestMisses = 0;
        _audioPlayer.PlaybackSession.Position = TimeSpan.FromMilliseconds(_viewModel.SourceStartMs);
        _audioPlayer.Play();
        PlaytestStatusText.Text = "Playtest: gra. Uderzaj S/D/K/L zgodnie z mapą.";
        Focus(FocusState.Programmatic);
    }

    private void ResetPlaytestButton_Click(object sender, RoutedEventArgs e)
    {
        _isPlaytesting = false;
        _playtestHits = 0;
        _playtestMisses = 0;
        _audioPlayer.Pause();
        _audioPlayer.PlaybackSession.Position = TimeSpan.FromMilliseconds(_viewModel.SourceStartMs);
        PlaytestStatusText.Text = "Playtest: gotowy.";
    }

    private void Page_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        var ctrl = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        if (ctrl && e.Key == VirtualKey.S)
        {
            ExportButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
            return;
        }

        if (ctrl && e.Key == VirtualKey.Z)
        {
            UndoButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
            return;
        }

        if (ctrl && e.Key == VirtualKey.Y)
        {
            RedoButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
            return;
        }

        if (e.Key == VirtualKey.Delete)
        {
            DeleteButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
            return;
        }

        if (e.Key == VirtualKey.Space)
        {
            if (_isPlaytesting) ResetPlaytestButton_Click(this, new RoutedEventArgs());
            else PlaytestButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
            return;
        }

        _selectedToolKind = e.Key switch
        {
            VirtualKey.Number1 => "tap",
            VirtualKey.Number2 => "hold",
            VirtualKey.Number3 => "smash",
            _ => _selectedToolKind,
        };

        if (_isPlaytesting)
        {
            var lane = e.Key switch
            {
                VirtualKey.S => "S",
                VirtualKey.D => "D",
                VirtualKey.K => "K",
                VirtualKey.L => "L",
                _ => null,
            };
            if (lane is not null)
            {
                JudgePlaytestLane(lane);
                e.Handled = true;
            }
        }
    }

    private void JudgePlaytestLane(string lane)
    {
        var elapsedMs = (int)Math.Round(_audioPlayer.PlaybackSession.Position.TotalMilliseconds - _viewModel.SourceStartMs);
        var candidate = _notes
            .Where(note => note.Lane == lane)
            .OrderBy(note => Math.Abs(note.TimeMs - elapsedMs))
            .FirstOrDefault();
        if (candidate is null || Math.Abs(candidate.TimeMs - elapsedMs) > 130)
        {
            _playtestMisses += 1;
            PlaytestStatusText.Text = $"Playtest: pudło {lane} @ {elapsedMs} ms | trafienia {_playtestHits}, pudła {_playtestMisses}";
            return;
        }

        _playtestHits += 1;
        PlaytestStatusText.Text = $"Playtest: trafienie {lane} ({Math.Abs(candidate.TimeMs - elapsedMs)} ms) | trafienia {_playtestHits}, pudła {_playtestMisses}";
    }

    private void AddTrackButton_Click(object sender, RoutedEventArgs e)
    {
        var title = NewTitleBox.Text.Trim();
        var artist = string.IsNullOrWhiteSpace(NewArtistBox.Text) ? "Ustno.ai" : NewArtistBox.Text.Trim();
        var mood = NewMoodBox.Text.Trim();
        var bpm = (int)NumberOr(NewBpmBox.Value, 120);
        var mergedPath = NewMergedPathBox.Text.Trim();
        var instrumentalPath = NewInstrumentalPathBox.Text.Trim();
        var vocalsPath = NewVocalsPathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(title) || bpm <= 0 || !File.Exists(mergedPath) || !File.Exists(instrumentalPath) || !File.Exists(vocalsPath))
        {
            SetStatus("Nie dodano utworu", "Uzupełnij tytuł, BPM i trzy istniejące pliki audio.", InfoBarSeverity.Error);
            return;
        }

        var order = _tracks.Count == 0 ? 1 : _tracks.Max(track => track.Order) + 1;
        var folder = $"{order:00} — {title}";
        var destinationDirectory = IOPath.Combine(_workspaceRoot, "public", "audio", "music", "ustno", folder);
        Directory.CreateDirectory(destinationDirectory);
        File.Copy(mergedPath, IOPath.Combine(destinationDirectory, $"{title}{IOPath.GetExtension(mergedPath)}"), overwrite: true);
        File.Copy(instrumentalPath, IOPath.Combine(destinationDirectory, $"[Instrumental] {title}{IOPath.GetExtension(instrumentalPath)}"), overwrite: true);
        File.Copy(vocalsPath, IOPath.Combine(destinationDirectory, $"[Lead Vocals] {title}{IOPath.GetExtension(vocalsPath)}"), overwrite: true);

        var durationMs = TryReadWavDurationMs(instrumentalPath) ?? (int)Math.Round(96 * 60000.0 / bpm);
        var id = Slugify(title);
        var difficulties = NewDifficultiesBox.Text
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(item => item is "Łatwy" or "Normalny" or "Cybart")
            .Distinct()
            .ToArray();
        if (difficulties.Length == 0) difficulties = ["Normalny"];

        AppendTrackToTracksTs(id, order, title, artist, mood, bpm, durationMs, folder, difficulties);
        _tracks.Add(new TrackDefinition(id, order, title, bpm, durationMs, folder, title, difficulties));
        TrackComboBox.ItemsSource = _tracks.OrderBy(track => track.Order).ToList();
        TrackComboBox.SelectedItem = _tracks.First(track => track.Id == id);
        SetStatus("Dodano utwór", "Pliki audio skopiowane, a src/data/tracks.ts dostał nowy wpis.", InfoBarSeverity.Success);
    }

    private void AppendTrackToTracksTs(
        string id,
        int order,
        string title,
        string artist,
        string mood,
        int bpm,
        int durationMs,
        string folder,
        IReadOnlyList<string> difficulties)
    {
        var tracksPath = IOPath.Combine(_workspaceRoot, "src", "data", "tracks.ts");
        var source = File.ReadAllText(tracksPath);
        var difficultyText = string.Join(", ", difficulties.Select(item => $"'{EscapeTs(item)}'"));
        var entry = $$"""
          {
            id: '{{EscapeTs(id)}}',
            order: {{order}},
            title: '{{EscapeTs(title)}}',
            artist: '{{EscapeTs(artist)}}',
            bpm: {{bpm}},
            durationMs: {{durationMs}},
            mood: '{{EscapeTs(mood)}}',
            beatmapSeed: {{Math.Abs(HashCode.Combine(id, bpm, durationMs))}},
            audioFolder: '{{EscapeTs(folder)}}',
            audioTitle: '{{EscapeTs(title)}}',
            difficulties: [{{difficultyText}}],
            audio: audioFiles('{{EscapeTs(folder)}}', '{{EscapeTs(title)}}'),
          },
        """;
        var marker = source.Contains("];\r\n\r\nexport const tracks", StringComparison.Ordinal)
            ? "];\r\n\r\nexport const tracks"
            : "];\n\nexport const tracks";
        var replacement = marker.StartsWith("];\r\n", StringComparison.Ordinal)
            ? $"{entry}\r\n];\r\n\r\nexport const tracks"
            : $"{entry}\n];\n\nexport const tracks";
        File.WriteAllText(tracksPath, source.Replace(marker, replacement, StringComparison.Ordinal));
    }

    private static int? TryReadWavDurationMs(string path)
    {
        if (!string.Equals(IOPath.GetExtension(path), ".wav", StringComparison.OrdinalIgnoreCase)) return null;

        using var stream = File.OpenRead(path);
        using var reader = new BinaryReader(stream);
        if (new string(reader.ReadChars(4)) != "RIFF") return null;
        _ = reader.ReadInt32();
        if (new string(reader.ReadChars(4)) != "WAVE") return null;

        short channels = 0;
        int sampleRate = 0;
        short bitsPerSample = 0;
        int dataSize = 0;
        while (stream.Position + 8 <= stream.Length)
        {
            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();
            var nextChunk = stream.Position + chunkSize;
            if (chunkId == "fmt ")
            {
                _ = reader.ReadInt16();
                channels = reader.ReadInt16();
                sampleRate = reader.ReadInt32();
                _ = reader.ReadInt32();
                _ = reader.ReadInt16();
                bitsPerSample = reader.ReadInt16();
            }
            else if (chunkId == "data")
            {
                dataSize = chunkSize;
            }

            stream.Position = nextChunk + (chunkSize % 2);
        }

        if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0 || dataSize <= 0) return null;
        var bytesPerSecond = sampleRate * channels * (bitsPerSample / 8.0);
        return (int)Math.Round(dataSize / bytesPerSecond * 1000);
    }

    private static string Slugify(string value)
    {
        var letters = value.ToLowerInvariant()
            .Select(character => char.IsLetterOrDigit(character) ? character : '-')
            .ToArray();
        return string.Join('-', new string(letters).Split('-', StringSplitOptions.RemoveEmptyEntries));
    }

    private static string EscapeTs(string value) => value.Replace("\\", "\\\\").Replace("'", "\\'");

    private void CreateBackup()
    {
        if (!File.Exists(ManualBeatmapsPath)) return;

        var backupDirectory = IOPath.Combine(_workspaceRoot, "backups", "manualBeatmaps");
        Directory.CreateDirectory(backupDirectory);
        var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        File.Copy(ManualBeatmapsPath, IOPath.Combine(backupDirectory, $"{timestamp}-manualBeatmaps.json"), overwrite: false);
    }

    private static string FormatTime(int ms)
    {
        var totalSeconds = Math.Max(0, (int)Math.Round(ms / 1000.0));
        return $"{totalSeconds / 60}:{totalSeconds % 60:00}";
    }

    private void PushHistory()
    {
        _history.Push(SerializeNotes(_notes));
        _redo.Clear();
    }

    private static string SerializeNotes(List<BeatmapNote> notes) => JsonSerializer.Serialize(notes);

    private static List<BeatmapNote> DeserializeNotes(string json) =>
        JsonSerializer.Deserialize<List<BeatmapNote>>(json) ?? [];

    private static List<BeatmapNote> GenerateStarterNotes(TrackDefinition track, string difficulty, int durationMs)
    {
        var notes = new List<BeatmapNote>();
        var beatMs = 60000.0 / track.Bpm;
        var density = difficulty switch
        {
            "Łatwy" => 0.5,
            "Cybart" => 1.0,
            _ => 0.7,
        };
        var random = new Random(HashCode.Combine(track.Id, difficulty, track.Bpm, durationMs));
        var lanes = new[] { "S", "D", "K", "L" };

        for (var timeMs = 1000.0; timeMs < durationMs - 850; timeMs += beatMs)
        {
            var beatIndex = (int)Math.Round((timeMs - 1000) / beatMs);
            if (random.NextDouble() > density && beatIndex % 8 != 0) continue;

            var lane = lanes[random.Next(lanes.Length)];
            var roll = random.NextDouble();
            var kind = roll < (difficulty == "Cybart" ? 0.08 : 0.03)
                ? "smash"
                : roll < (difficulty == "Łatwy" ? 0.12 : 0.18) ? "hold" : "tap";

            notes.Add(new BeatmapNote
            {
                Id = $"starter-{track.Id}-{difficulty}-{beatIndex}-{lane}",
                Lane = lane,
                TimeMs = (int)Math.Round(timeMs),
                Kind = kind == "tap" ? null : kind,
                DurationMs = kind == "tap" ? null : (int)Math.Round(beatMs * (kind == "hold" ? 1.5 : 1.25)),
                RequiredPresses = kind == "smash" ? 4 : null,
            });
        }

        return notes;
    }

    private static int EstimateDurationMs(TrackDefinition track) => track.DurationMs > 0
        ? track.DurationMs
        : (int)Math.Round(96 * 60000.0 / track.Bpm);

    private static string? FindGameWorkspace()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(IOPath.Combine(directory.FullName, "src", "data", "tracks.ts"))) return directory.FullName;
            directory = directory.Parent;
        }

        return null;
    }

    private void SetStatus(string title, string message, InfoBarSeverity severity)
    {
        StatusInfoBar.Title = title;
        StatusInfoBar.Message = message;
        StatusInfoBar.Severity = severity;
        StatusInfoBar.IsOpen = true;
    }

    private static Brush ResourceBrush(string resourceKey, Windows.UI.Color fallback)
    {
        return Application.Current.Resources.TryGetValue(resourceKey, out var value) && value is Brush brush
            ? brush
            : new SolidColorBrush(fallback);
    }

    private static Brush NoteBrush(string kind, bool selected)
    {
        if (selected) return new SolidColorBrush(Colors.MediumVioletRed);

        return kind switch
        {
            "hold" => new SolidColorBrush(Colors.Teal),
            "smash" => new SolidColorBrush(Colors.DarkOrange),
            _ => new SolidColorBrush(Colors.SteelBlue),
        };
    }

    private static int LaneIndex(string lane) => lane switch
    {
        "S" => 0,
        "D" => 1,
        "K" => 2,
        "L" => 3,
        _ => -1,
    };

    private static bool IsLane(string lane) => LaneIndex(lane) >= 0;

    private int TimeFromTimelineX(double x)
    {
        var pixelsPerMs = 0.035 * Math.Max(1, ZoomSlider.Value);
        return (int)Math.Clamp(Math.Round((x - TimelinePadding) / pixelsPerMs), 0, DurationMs);
    }

    private static string? LaneFromTimelineY(double y)
    {
        var index = (int)Math.Floor(y / LaneHeight);
        return index switch
        {
            0 => "S",
            1 => "D",
            2 => "K",
            3 => "L",
            _ => null,
        };
    }

    private static string CreateNoteId(string kind) => $"{kind}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Random.Shared.Next(1000, 9999)}";

    private static string ComboValue(ComboBox comboBox)
    {
        return comboBox.SelectedItem is ComboBoxItem item ? item.Content?.ToString() ?? string.Empty : string.Empty;
    }

    private static void SelectComboValue(ComboBox comboBox, string value)
    {
        foreach (var item in comboBox.Items.OfType<ComboBoxItem>())
        {
            if (item.Content?.ToString() == value)
            {
                comboBox.SelectedItem = item;
                return;
            }
        }
    }

    private static double NumberOr(double value, double fallback) => double.IsNaN(value) ? fallback : value;
}
