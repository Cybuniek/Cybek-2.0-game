# Projekt: System cutscenek (Visual Novel) — Cybek 2.0

Data: 2026-06-07
Gałąź robocza: `proba-scalenia`
Status: zaakceptowany (do realizacji)

## 1. Cel i zakres

Zastąpić obecne proste okienka dialogowe (`StorySceneOverlay`) ładnie animowanymi
cutscenkami w stylu Visual Novel. Zmiana dotyczy **warstwy prezentacji** scen
fabularnych. Treść scen, ich wyzwalacze, reżyser kolejki i zapis postępu
**pozostają bez zmian**.

## 2. Zatwierdzone decyzje

- **Styl:** Visual Novel — duże portrety postaci, mówiący podświetlony, drugi przyciemniony.
- **Neura:** 6 min z paska `public/pets/neura/neura-miny.png` (2172×724 px = 6 klatek po 362×724). Zielone tło wycinane w kodzie (chroma key) — zatwierdzone wizualnie.
- **Cybek:** renderowany przez istniejący komponent `CybekWebcam` (kadr z kamerki w ramce), stany `idle/rhythm/published/glitch/review`.
- **Oprawa:** BAZA + **Kinowy** (letterbox + ruch kamery) + **Glitch/CRT** (skanlinie, rozjazd RGB, glitchowe cięcia).
- **Tła scen:** poza zakresem tej iteracji (możliwe rozszerzenie później).
- **Asymetria fabularna:** Cybek = człowiek na kamerce (z ramką/tłem); Neura = wycięta postać-AI nakładana na świat.

## 3. Doświadczenie gracza (przebieg pojedynczej sceny)

1. Start sceny: ciemne tło, czarne pasy (letterbox) wjeżdżają z góry i dołu, pojawiają się skanlinie CRT.
2. Portret mówiącego wjeżdża z boku (slide + fade), podświetlony i lekko z przodu; druga postać przyciemniona i cofnięta.
3. Tekst kwestii wypisuje się litera po literze, tempo zsynchronizowane z czasem trwania audio.
4. Mina mówiącego dobrana do `audioIntent`; Neura ma delikatny „oddech" (mikroruch), przy intencji glitch — rozjazd RGB.
5. Kamera robi powolny najazd/odjazd w stronę mówiącego.
6. Przejście do kolejnej kwestii: krótkie glitchowe cięcie + zmiana podświetlonego mówiącego.
7. Koniec sceny: pasy znikają, scena znika, sterowanie wraca do gry.

## 4. Architektura

Nowy kod w katalogu `src/neura/cutscene/`. Każdy moduł ma jedną odpowiedzialność,
komunikuje się przez jawne propsy/typy i daje się testować niezależnie.

### 4.1. Moduły

- **`chromaKey.ts`** (czysta logika) — funkcja przetwarzająca `ImageData`: usuwa zieleń dominującą nad czerwonym/niebieskim (próg miękki/twardy + redukcja zielonej poświaty). Zatwierdzone parametry z prototypu: `MIN_G=85`, `SOFT=40`, `HARD=95`. Zależności: brak (czysty JS/canvas API). Testowalna na syntetycznych pikselach.
- **`useChromaKeyedStrip.ts`** (hook) — wczytuje obraz paska, raz wycina tło i tnie na N klatek, zwraca gotowe klatki (canvas/ImageBitmap). Wynik cache'owany na poziomie modułu, więc przetwarzanie dzieje się raz na sesję. Zależność: `chromaKey.ts`.
- **`expressionMapping.ts`** (czysta logika) — mapuje `(speaker, audioIntent)` na indeks klatki Neury oraz na `CybekWebcamEvent`. Tabela w jednym miejscu, łatwa do strojenia. Testowalna.
- **`NeuraPortrait.tsx`** — rysuje aktualną klatkę Neury (canvas) z mikroruchem „oddechu" i opcjonalną niestabilnością glitch (intensywność z propsa). Zależności: `useChromaKeyedStrip`.
- **`CybekPortrait.tsx`** — cienka nakładka na istniejący `CybekWebcam`, ustawia `eventName` z mapowania. Zależność: `src/cybekWebcam.tsx`.
- **`useTypewriter.ts`** (hook) — odsłania tekst w czasie dopasowanym do audio; metoda „pokaż całość natychmiast". Czysta logika czasu, bez I/O.
- **`CutsceneStage.tsx`** — komponent nadrzędny zastępujący `StorySceneOverlay`. Składa portrety, dymek, letterbox, skanlinie, kamerę i przejścia; obsługuje audio (logika przeniesiona z obecnego overlayu: OGG → MP3 → fallback tekstowy) oraz wejście gracza (klik/spacja).
- **CSS** — sekcja `.cutscene-*` w `src/styles.css` (zastępuje rolę `.story-scene-*`).

### 4.2. Interfejs `CutsceneStage`

```ts
type CutsceneStageProps = {
  scene: StoryScene;        // bez zmian
  lineIndex: number;        // bez zmian
  onAdvance: () => void;    // bez zmian
  presenceLevel?: OperationalPowerLevel; // 0–4, skaluje glitch
  lowFx?: boolean;          // tryb Low FX / mniej animacji
};
```

Interfejs `scene/lineIndex/onAdvance` jest zgodny z obecnym `StorySceneOverlay`,
więc wpięcie w `App.tsx` to zamiana komponentu plus przekazanie dwóch nowych,
opcjonalnych propsów. Reżyser scen (`StorySceneDirector`) i logika `advanceStoryScene`
pozostają nietknięte.

## 5. Model danych

Bez zmian wymaganych. `StoryScene` i `StorySceneLine` (`speaker`, `text`, `audioId`,
`audioIntent`) wystarczają — zachowanie wizualne wyprowadzamy z `speaker` + `audioIntent`.
Wszystkie 14 istniejących scen działa bez edycji treści.

Opcjonalne (niewymagane teraz): pola na poziomie linii do nadpisania reżyserii
(np. wymuszona mina, efekt, kierunek kamery). Dodawane jako pola opcjonalne,
gdyby zaszła potrzeba — nie blokują iteracji.

## 6. Mapowanie emocji (`expressionMapping.ts`)

Neura — indeksy klatek z paska (0–5):

| `audioIntent` | klatka Neury |
|---|---|
| `calm` | 0 (spokojna) |
| `curious` | 2 (podekscytowana) |
| `dry` | 4 (ręce skrzyżowane) |
| `glitch` | 4 + efekt glitch |
| `tired` | 5 (smutna) |
| brak / inne | 0 |

Klatki 1 (czuła) i 3 (zauroczona) zostają jako rezerwa na specjalne bity (np. „published").

Cybek — `CybekWebcamEvent`:

| `audioIntent` | `eventName` (→ animacja) |
|---|---|
| `calm` | `idle` (idle) |
| `curious` | `review` (think) |
| `dry` | `idle` (idle) |
| `glitch` | `glitch` (shock) |
| `tired` | `idle` (idle) |
| moment „udany" | `published` (happy) |

## 7. Wycinanie tła Neury (chroma key)

Wykonywane raz przy starcie (hook `useChromaKeyedStrip`), wynik trzymany w pamięci.
Algorytm (zatwierdzony prototypem): dla piksela `excess = G − max(R,B)`; jeśli
`G ≥ 85` i `excess > 40` → tło (alfa liniowo 1→0 w paśmie 40..95, pełna przezroczystość
od 95) z redukcją zielonej poświaty na krawędziach. Neura nie zawiera zieleni
(włosy niebieskie, ciało białe, ubranie niebiesko-czarne), więc postać pozostaje nietknięta.

Jeśli w przyszłości pojawi się PNG z gotową alfą, hook pomija wycinanie.

## 8. Efekty: Kinowy + Glitch

- **Kinowy:** animowane pasy letterbox; delikatny ruch kamery (transform scale/translate sceny w stronę mówiącego); tekst może być pokazywany jako napis filmowy.
- **Glitch/CRT:** nakładka skanlinii; rozjazd RGB portretu (CSS drop-shadow magenta/cyan); glitchowe cięcie przy zmianie kwestii. **Intensywność skalowana `presenceLevel` (0–4)** — im wyższy poziom obecności Neury, tym mocniejszy glitch.
- Efekty są domyślnie włączone; trzymane w małym obiekcie konfiguracji, by łatwo je stroić/wyłączać.

## 9. Dostępność

- `prefers-reduced-motion`: wycisza/wyłącza ruch kamery, glitch i animacje wejścia (tekst i portrety nadal działają).
- Tryb **Low FX** (istniejący, `ustnik.neura.lowFxMode`, przełącznik F10): analogicznie stonowane efekty.

## 10. Tempo i sterowanie

- Tekst leci w tempie audio. Klik / spacja: jeśli tekst wciąż się pisze → pokaż całość; w przeciwnym razie → „Dalej".
- Sceny niepomijalne (jak obecnie). Bez przycisku „Pomiń scenę" w tej iteracji.
- „Dalej" aktywne, gdy tekst odsłonięty w całości **oraz** audio skończone/niedostępne.

## 11. Fallbacki

- Brak OGG/MP3 lub blokada autoplay: po krótkim czasie (jak dziś, ~900 ms) tekst i tak działa, status „Audio niedostępne", `Dalej` odblokowane. Modal nie blokuje gry.
- Brak/uszkodzony pasek Neury: portret Neury degraduje się łagodnie (placeholder + log), scena nadal grywalna.

## 12. Pliki

Nowe:
- `src/neura/cutscene/chromaKey.ts`
- `src/neura/cutscene/useChromaKeyedStrip.ts`
- `src/neura/cutscene/expressionMapping.ts`
- `src/neura/cutscene/NeuraPortrait.tsx`
- `src/neura/cutscene/CybekPortrait.tsx`
- `src/neura/cutscene/useTypewriter.ts`
- `src/neura/cutscene/CutsceneStage.tsx`
- `scripts/cutscene.dev-test.ts` (testy czystej logiki: chroma key, mapowanie, typewriter)
- asset: `public/pets/neura/neura-miny.png` (dodany)

Zmieniane:
- `src/App.tsx` — zamiana `StorySceneOverlay` na `CutsceneStage` + przekazanie `presenceLevel`, `lowFx`.
- `src/styles.css` — sekcja `.cutscene-*` (stare `.story-scene-*` do usunięcia po migracji).
- `package.json` — skrypt `test:cutscene` podpięty do `npm run test`.
- `DEV_NOTES.md`, `progress.md` — opis nowego systemu.

Usuwane po migracji:
- `src/neura/StorySceneOverlay.tsx` (zastąpiony przez `CutsceneStage`).

## 13. Testy / weryfikacja

- `npm run test:cutscene` — czysta logika: chroma key na syntetycznych pikselach (zieleń znika, biel/niebieski zostają), mapowanie emocji, harmonogram typewritera.
- `npm run test` — całość zielona (regresja istniejących systemów).
- `npm run build` — przechodzi.
- `npm run test:e2e` — smoke: scena startuje, da się ją przejść klikiem, fallback tekstowy działa bez audio.
- Weryfikacja wizualna w dev serverze: wjazd portretów, miny wg intencji, letterbox, glitch skalujący się z poziomem Neury, tryb Low FX.

## 14. Poza zakresem (świadomie)

- Tła scen (mood per scena).
- Przycisk „Pomiń scenę".
- Nowe sceny/treści dialogów i generowanie nowych głosów ElevenLabs.
- Portrety Cybka inne niż kamerka.

## 15. Ryzyka i mitygacje

- **Resztkowa zielona poświata na włosach** → strojenie progów chroma key; zapas: ramki CRT lub PNG z alfą.
- **Wydajność canvas** → przetwarzanie raz + cache; efekty głównie CSS.
- **Synchronizacja typewriter ↔ audio** → tempo z `audio.duration`; gdy brak metadanych, stałe tempo + odblokowanie po `ended/error`.
- **Spójność z istniejącymi systemami** (presence, Low FX, voice director) → reużycie istniejących wejść, brak zmian w reżyserze scen.
