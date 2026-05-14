# Notatki implementacyjne

## Proponowana architektura komponentów

```text
src/
  app/
    GameRoot.tsx
    gameState.ts
    gameReducer.ts
  desktop/
    DesktopHub.tsx
    DesktopIcon.tsx
    TodoPanel.tsx
    StatsPanel.tsx
    DialogueWindow.tsx
    NewsOverlay.tsx
  music/
    SongSelect.tsx
    SongInfoPanel.tsx
    ConfirmModal.tsx
  rhythm/
    RhythmGame.tsx
    Lane.tsx
    Note.tsx
    HitJudgement.ts
    rhythmScoring.ts
    beatmapTypes.ts
  tutorial/
    TutorialOverlay.tsx
    tutorialSteps.ts
  postSong/
    CardSelection.tsx
    GeneratedTextList.tsx
    PublishPanel.tsx
  results/
    ResultSummary.tsx
    RankBar.tsx
    AchievementList.tsx
  social/
    SocialInterpretation.tsx
    WorldMapReaction.tsx
  data/
    tracks.ts
    beatmaps.ts
    cards.ts
    generatedTexts.ts
    dialogue.ts
    labels.ts
```

## Maszyna stanów — minimum

```ts
type Phase =
  | { name: 'desktop' }
  | { name: 'song_select' }
  | { name: 'confirm_start'; trackId: string; difficulty: string }
  | { name: 'tutorial'; trackId?: string }
  | { name: 'rhythm'; trackId: string; difficulty: string }
  | { name: 'post_song_selection'; rhythmResultId: string }
  | { name: 'result_summary'; rhythmResultId: string }
  | { name: 'social_reaction'; publishId: string }
  | { name: 'narrative_aftermath'; eventId: string };
```

## Scoring rytmiczny — szkic

- Każda nuta daje bazowe punkty zależnie od jakości trafienia.
- Combo zwiększa wynik bieżący, ale finalny progres najlepiej liczyć po zakończeniu utworu.
- Dane końcowe powinny zawierać surowy wynik, accuracy/rate, rank, maxCombo, fullCombo i timingError.
- `fast`/`late` traktować jako diagnostykę timingu, nie jako oddzielną karę narracyjną, chyba że projekt tego wymaga.

## Tutorial notes

Samouczek można zrobić jako tablicę kroków:

```ts
type TutorialStep = {
  id: string;
  title: string;
  body: string;
  demoNoteType: 'tap' | 'hold' | 'rapid';
  requiredAction?: 'next' | 'try_input' | 'confirm_exit';
};
```

## Dane zamiast hardcode'u

Warto trzymać słowniki oddzielnie:

- `labels.ts` — etykiety UI,
- `dialogue.ts` — dialogi i komentarze,
- `tracks.ts` — lista tracków, trudności, metadane,
- `beatmaps.ts` — nuty i timing,
- `cards.ts` — karty/post-song modifiers,
- `generatedTexts.ts` — możliwe teksty/posty po piosence,
- `events.ts` — reakcje społeczne/newsowe.

## Pseudoflow eventów

```text
START_GAME
OPEN_MUSIC_APP
SELECT_TRACK
CONFIRM_TRACK
START_RHYTHM
FINISH_RHYTHM -> save RhythmResult
OPEN_POST_SONG_SELECTION
SELECT_PUBLICATION_ITEMS
PUBLISH_ITEMS -> calculate SocialReaction
SHOW_RESULT_SUMMARY
SHOW_SOCIAL_REACTION
SHOW_NARRATIVE_AFTERMATH
UNLOCK_NEW_TRAINING_ITEMS
RETURN_TO_DESKTOP
```
