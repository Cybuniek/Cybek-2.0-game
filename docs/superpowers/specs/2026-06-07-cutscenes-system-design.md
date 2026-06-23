# Projekt: System cutscenek (Visual Novel) — Cybek 2.0

Data: 2026-06-07
Gałąź robocza: `proba-scalenia`
Status: zaakceptowany standard assetów; implementacja systemu do omówienia po przygotowaniach

## 1. Cel i zakres

Zastąpić obecne proste okienka dialogowe (`StorySceneOverlay`) cutscenkami w stylu
Visual Novel. Ta iteracja przygotowuje standard grafik Neury i dokumentuje przyszły
runtime. Treść scen, wyzwalacze, kolejka reżysera i zapis postępu pozostają bez zmian.

## 2. Zatwierdzone decyzje

- **Styl:** Visual Novel — duże portrety, mówiący podświetlony, drugi przyciemniony.
- **Neura:** portret korzysta z manifestu ekspresji w `public/pets/neura/cutscene/manifest.json`, nie z jednego paska min.
- **Assety Neury:** 6 ekspresji, każda jako osobny folder z `manifest.json`, `strip.png`, `preview.png` i klatkami `frames/*.png`.
- **Normalizacja:** finalne klatki mają `512×512`, przezroczyste tło, wspólną skalę i kotwicę `bottom-center`.
- **Źródło/generacja:** bazą identyfikacji był `public/pets/neura/neura-miny.png` (4000×724, 10 klatek po 400×724, zielone tło), a finalne assety powstały przez kontrolowany workflow OpenAI Image API z limitem kosztu `$3` i stopem roboczym około `$2.40`.
- **Cybek:** renderowany przez istniejący `CybekWebcam`, stany `idle/rhythm/published/glitch/review`.
- **Oprawa:** BAZA + Kinowy (letterbox + ruch kamery) + Glitch/CRT.
- **Poza zakresem tej iteracji:** tła scen, pełne endingi, audio sync ponad obecny fallback, rozbudowana gra rytmiczna.

## 3. Standard plików assetów

Indeks główny:

```json
{
  "character": "Neura",
  "frameWidth": 512,
  "frameHeight": 512,
  "anchor": "bottom-center",
  "expressions": [
    { "name": "calm", "frames": 3, "fps": 4 },
    { "name": "curious", "frames": 4, "fps": 5 },
    { "name": "tired", "frames": 3, "fps": 3 },
    { "name": "dry", "frames": 3, "fps": 4 },
    { "name": "delighted", "frames": 5, "fps": 6 },
    { "name": "glitch", "frames": 5, "fps": 8 }
  ]
}
```

Manifest ekspresji:

```json
{
  "name": "curious",
  "frameWidth": 512,
  "frameHeight": 512,
  "frames": 4,
  "fps": 5,
  "loop": true,
  "anchor": "bottom-center",
  "strip": "strip.png",
  "framesDir": "frames",
  "preview": "preview.png"
}
```

Reguły:
- `strip.png` ma rozmiar `frameWidth * frames` na `frameHeight`.
- `preview.png` jest tylko do przeglądu wizualnego, nie do runtime.
- `frames/*.png` są źródłem debugowym i awaryjnym; runtime może użyć stripu.
- Tło finalnych assetów jest przezroczyste. Zielone tło z `neura-miny.png` jest tylko legacy/source.

## 4. Mapowanie emocji

`audioIntent` → ekspresja Neury:

| `audioIntent` | ekspresja | opis |
|---|---|---|
| `calm` / brak | `calm` | neutralna obecność, spokojny oddech |
| `curious` | `curious` | zaciekawienie, dłoń przy twarzy/klatce |
| `tired` | `tired` | zmęczona, wolniejsza pętla |
| `dry` | `dry` | przekąs, skrzyżowane ręce |
| `glitch` | `glitch` | przekąs + narastający RGB/glitch |
| moment „udany” | `delighted` | radość/sukces, do użycia przy publikacji lub nagrodzie |

Cybek — `CybekWebcamEvent`:

| `audioIntent` | `eventName` |
|---|---|
| `calm` / `dry` / `tired` / brak | `idle` |
| `curious` | `review` |
| `glitch` | `glitch` |
| moment „udany” | `published` |

## 5. Architektura runtime

Nowy kod powinien mieszkać w `src/neura/cutscene/` i zachować małe moduły:

- **`assetManifest.ts`** — ładuje/normalizuje manifest ekspresji, waliduje wymiary i fallbacki.
- **`expressionMapping.ts`** — mapuje `audioIntent` na nazwę ekspresji Neury i event Cybka.
- **`NeuraPortrait.tsx`** — odtwarza strip ekspresji w pętli `fps`, z zatrzymaniem na pierwszej klatce przy Low FX/reduced motion.
- **`CybekPortrait.tsx`** — cienka nakładka na `CybekWebcam`.
- **`useTypewriter.ts`** — czysta logika odsłaniania tekstu.
- **`CutsceneStage.tsx`** — składa portrety, dialog, audio fallback, letterbox, kamerę i wejście gracza.

Interfejs `CutsceneStage` pozostaje zgodny z obecnym overlayem:

```ts
type CutsceneStageProps = {
  scene: StoryScene;
  lineIndex: number;
  onAdvance: () => void;
  presenceLevel?: OperationalPowerLevel;
  lowFx?: boolean;
};
```

## 6. Dostępność i fallbacki

- `prefers-reduced-motion` oraz Low FX zatrzymują animację Neury na pierwszej klatce ekspresji, wyłączają ruch kamery i mocny glitch.
- Brak manifestu lub stripu: portret Neury pokazuje prosty placeholder, scena nadal działa.
- Brak OGG/MP3 lub blokada autoplay: tekst działa po krótkim fallbacku, bez blokowania gry.
- Legacy `neura-miny.png` może zostać jako źródło porównawcze, ale runtime powinien preferować `public/pets/neura/cutscene/`.

## 7. Workflow assetów

Wykonany pipeline:

1. Audyt `public/pets/neura/neura-miny.png`: 4000×724, 10 klatek, zielone tło z alfą 255.
2. Przygotowanie transparentnego reference boardu i edit canvasów w `tmp/neura-cutscene/`.
3. Tanie próby `gpt-image-1.5 low` dla 6 ekspresji.
4. Finalne stripy `gpt-image-2 high` tylko po potwierdzeniu, że model trzyma styl Neury.
5. Lokalny cleanup tła, cięcie, normalizacja do `512×512`, manifesty i preview przez `scripts/neura-cutscene-assets.py`.
6. Stop kosztowy: nie wykonywać kolejnego calla, jeśli estymacja przekroczyłaby `$2.40`; absolutny limit `$3`.

## 8. Pliki

Nowe/przygotowane assety:
- `public/pets/neura/cutscene/manifest.json`
- `public/pets/neura/cutscene/<expression>/manifest.json`
- `public/pets/neura/cutscene/<expression>/strip.png`
- `public/pets/neura/cutscene/<expression>/preview.png`
- `public/pets/neura/cutscene/<expression>/frames/*.png`

Narzędzie przygotowujące:
- `scripts/neura-cutscene-assets.py`

Planowane pliki runtime:
- `src/neura/cutscene/assetManifest.ts`
- `src/neura/cutscene/expressionMapping.ts`
- `src/neura/cutscene/NeuraPortrait.tsx`
- `src/neura/cutscene/CybekPortrait.tsx`
- `src/neura/cutscene/useTypewriter.ts`
- `src/neura/cutscene/CutsceneStage.tsx`

## 9. Testy i weryfikacja

- `python scripts/neura-cutscene-assets.py validate` — sprawdza manifesty, wymiary stripów, alfę i brak zielonego tła.
- Obejrzeć `preview.png` każdej ekspresji: serduszkowe oczy, gogle, strój, skala, kotwica.
- `npm run test` — regresja logiki gry.
- `npm run build` — kompilacja produkcyjna.
- Po implementacji runtime: test czystego mapowania ekspresji oraz smoke w Playwright dla uruchomienia sceny.

## 10. Ryzyka i mitygacje

- **Drift postaci w AI** → nie akceptować low-passów, finalizować tylko stripy trzymające serduszkowe oczy, gogle i strój.
- **Tło wygenerowane zamiast alfy** → lokalny cleanup tylko dla tła z krawędzi; nie usuwać czarnych elementów stroju agresywnym progiem.
- **Koszt API** → prowadzić ręczny ledger, trzymać stop roboczy `$2.40`.
- **Wydajność runtime** → używać stripów i CSS/Canvas; pętle mają 3–8 fps, więc są lekkie.
- **Kompatybilność z grą** → nie zmieniać danych scen ani reżysera w tej iteracji.
