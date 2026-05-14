# Brief dla Agenta Codex

## Cel

Na podstawie dostarczonych kadrów i opisów zbudować lub uporządkować lekką implementację/prototyp pętli rytmiczno-desktopowej. Materiał pokazuje, jak podobna gra prowadzi gracza przez:

1. hub w formie pulpitu,
2. wybór aktywności/utworu,
3. samouczek lub rozgrywkę rytmiczną,
4. podsumowanie wyniku,
5. wybór/publikację wygenerowanych treści,
6. reakcję świata/systemu,
7. powrót do huba z odblokowaniami i zmianą statystyk.

## Główna pętla ekranów

```text
DesktopHub
  -> SongSelect
  -> ConfirmStart
  -> RhythmGameplay
  -> PostSongCardSelection / GeneratedTextSelection
  -> ResultSummary
  -> SocialInterpretation / WorldReaction
  -> NarrativeDesktopAftermath
  -> TrainingOrUnlockList
  -> DesktopHub
```

## Systemy, które warto wydzielić w kodzie

### 1. Desktop / Hub

- Ikony aplikacji po lewej stronie.
- Główne okno postaci/AI po prawej.
- Widżety statystyk: kilka parametrów procentowych/liczbowych.
- TODO/quest box z aktualnym celem.
- Panele dialogowe nakładane na desktop.
- Możliwe aplikacje: wybór utworów, eksploracja, todo, zdrowie, social, pamiętnik/wiki/obrazy.

### 2. Wybór utworu

- Lista utworów po lewej.
- Panel informacji o utworze po prawej: tytuł, autorzy, poziomy trudności, beatmapa, rekord/ranga.
- Modal potwierdzenia startu.
- Kategorie/zakładki trudności.

### 3. Rhythm gameplay

- Cztery tory przypisane do klawiszy: `S`, `D`, `K`, `L`.
- Linia trafienia przy receptorach.
- Typy nut:
  - pojedyncza: kliknięcie w oknie trafienia,
  - długa: przytrzymanie od początku do końca nuty,
  - pędząca/rapid: wielokrotne wciskanie w trakcie trwania nuty.
- Oceny trafienia: `PERFECT`, `GREAT`, `GOOD`, `MISS`.
- Statystyki w czasie gry: score, combo, max combo, perfect/great/good/miss, fast/late, timing error.
- Boost mnożnika widoczny jako osobny panel (`x1` do `x5`).
- Pasek postępu utworu na dole.
- Dialog/subtitle box może działać równolegle z rytmem.

### 4. Post-song selection / publikacja

- Po utworze gra przechodzi do wyboru kart/treści.
- Karty mają kategorie/statystyki, gwiazdki/rzadkość i wpływ na parametry.
- Gracz wybiera określoną liczbę elementów do publikacji.
- Lista wygenerowanych tekstów/postów ma poziom, ocenę gwiazdkową i status typu `CLEAR`/`NEW`.
- Akcja finalna: `Opublikuj`.

### 5. Result summary

- Końcowy ekran pokazuje:
  - score i rekord,
  - rate/celność,
  - combo/max combo,
  - rangę na skali `C B A S`,
  - achievementy: pierwszy clear, ranga, full combo, celność 95%+.

### 6. Social/world reaction

- Po publikacji pojawia się ekran interpretacji lub reakcji świata.
- Wideo pokazuje mapę świata i pytanie: jak ludzie zinterpretowali post.
- Wybory są krótkimi etykietami/hasłami i wpływają na dalszy odbiór/parametry.
- Następuje desktopowa scena narracyjna z newsami, oknami dialogowymi i zmianą statystyk.

## Priorytet implementacyjny

1. Zrobić prostą maszynę stanów ekranów.
2. Wydzielić dane do JSON/TS: tracks, beatmaps, tutorialSteps, cards, generatedTexts, stats.
3. Nie mieszać logiki rytmu z logiką desktopu.
4. Najpierw ma działać przepływ, potem balans wartości.
5. UI powinien być komponentowy: łatwo podmienić etykiety, dialogi i zasady punktacji.

## Minimalny model danych

```ts
type GamePhase =
  | 'desktop'
  | 'song_select'
  | 'confirm_start'
  | 'tutorial'
  | 'rhythm'
  | 'post_song_selection'
  | 'result_summary'
  | 'social_reaction'
  | 'narrative_aftermath';

type NoteType = 'tap' | 'hold' | 'rapid';
type LaneKey = 'S' | 'D' | 'K' | 'L';

type BeatNote = {
  timeMs: number;
  lane: LaneKey;
  type: NoteType;
  durationMs?: number;
  requiredHits?: number;
};

type RhythmStats = {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  fast: number;
  late: number;
  averageTimingErrorMs: number;
};
```

## Czego nie robić

- Nie kopiować nazw, grafik, tekstów ani konkretnych lore z materiału źródłowego.
- Nie robić jednej wielkiej funkcji obsługującej cały loop.
- Nie zapisywać beatmapy na sztywno w komponencie Reacta, jeśli projekt ma rosnąć.
- Nie liczyć finalnego progresu bez osobnego kroku podsumowania wyniku.
