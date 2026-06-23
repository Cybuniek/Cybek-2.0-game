# Cutscenki (Visual Novel) — Plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić `StorySceneOverlay` cutscenkami Visual Novel z portretami Neury z manifestu ekspresji oraz Cybkiem renderowanym przez `CybekWebcam`.

**Architecture:** Assety Neury są przygotowane jako znormalizowane stripy `512×512` w `public/pets/neura/cutscene/`. Runtime ładuje manifest, mapuje `audioIntent` na ekspresję i odtwarza pętlę o `fps` z manifestu. Reżyser scen, kolejka, treść dialogów i zapis postępu pozostają bez zmian.

**Tech Stack:** React 19 + TypeScript + Vite; CSS/Canvas do portretów i efektów; testy Node dla czystej logiki; Playwright smoke po wpięciu sceny.

---

## Aktualny standard assetów

Przygotowane foldery:

- `public/pets/neura/cutscene/manifest.json`
- `public/pets/neura/cutscene/calm/`
- `public/pets/neura/cutscene/curious/`
- `public/pets/neura/cutscene/tired/`
- `public/pets/neura/cutscene/dry/`
- `public/pets/neura/cutscene/delighted/`
- `public/pets/neura/cutscene/glitch/`

Każda ekspresja ma:
- `manifest.json`
- `strip.png`
- `preview.png`
- `frames/01.png` itd.

Standard techniczny:
- `frameWidth = 512`
- `frameHeight = 512`
- `anchor = bottom-center`
- `strip.width = frameWidth * frames`
- tło przezroczyste

Ekspresje:

| ekspresja | klatki | fps | użycie |
|---|---:|---:|---|
| `calm` | 3 | 4 | `calm`, brak intencji |
| `curious` | 4 | 5 | `curious` |
| `tired` | 3 | 3 | `tired` |
| `dry` | 3 | 4 | `dry` |
| `delighted` | 5 | 6 | moment udany/publikacja |
| `glitch` | 5 | 8 | `glitch` |

Assety powstały z kontrolowanego workflow OpenAI Image API:
- `gpt-image-1.5 low` do tanich prób,
- `gpt-image-2 high` tylko do finalnych stripów,
- stop roboczy około `$2.40`, limit absolutny `$3`.

---

## Task 1: Walidacja i kontrakt assetów

**Files:**
- Create: `src/neura/cutscene/assetManifest.ts`
- Create: `scripts/cutscene-assets.dev-test.ts`
- Modify: `package.json`

- [x] Dodać typy `CutsceneExpressionManifest`, `CutsceneAssetIndex`, `CutsceneExpressionName`.
- [x] Dodać stałe nazw ekspresji: `calm`, `curious`, `tired`, `dry`, `delighted`, `glitch`.
- [x] Zaimplementować walidację: dodatnie `frameWidth/frameHeight/frames/fps`, `anchor === "bottom-center"`, znane ekspresje.
- [x] Dodać test Node sprawdzający przykładowy manifest i odrzucający błędne wymiary.
- [x] Podpiąć test pod `npm run test` jako `test:cutscene-assets`.

## Task 2: Mapowanie intencji na ekspresje

**Files:**
- Create: `src/neura/cutscene/expressionMapping.ts`
- Modify: `scripts/cutscene-assets.dev-test.ts`

- [x] Zaimplementować `neuraExpressionForIntent(intent?: string): CutsceneExpressionName`.
- [x] Zaimplementować `cybekEventForIntent(intent?: string)`.
- [x] Mapować `calm/brak -> calm`, `curious -> curious`, `tired -> tired`, `dry -> dry`, `glitch -> glitch`.
- [x] Dodać helper dla momentów sukcesu: `success -> delighted` jako opcjonalna ścieżka przyszła, bez zmian w danych scen.
- [x] Dodać testy wszystkich mapowań.

## Task 3: Portret Neury z manifestu

**Files:**
- Create: `src/neura/cutscene/NeuraPortrait.tsx`
- Modify: `src/styles.css`

- [x] Komponent przyjmuje `expression`, `active`, `lowFx`, `glitchLevel`.
- [x] Ładuje `strip.png` z folderu ekspresji i odtwarza klatki z `fps`.
- [x] Przy `lowFx` lub `prefers-reduced-motion` zatrzymuje się na klatce 1.
- [x] Dla `glitch` pozwala CSS dodać rozjazd RGB, ale nie zmienia pliku assetu.
- [x] Style utrzymują portret w kotwicy `bottom-center` i nie rozciągają go poza scenę.

## Task 4: CutsceneStage

**Files:**
- Create: `src/neura/cutscene/CybekPortrait.tsx`
- Create: `src/neura/cutscene/useTypewriter.ts`
- Create: `src/neura/cutscene/CutsceneStage.tsx`
- Modify: `src/styles.css`

- [x] Zachować propsy zgodne z overlayem: `scene`, `lineIndex`, `onAdvance`.
- [x] Przenieść obecny fallback audio: OGG → MP3 → tekst po opóźnieniu.
- [x] Klik/spacja: najpierw pokazuje cały tekst, potem przechodzi dalej, gdy audio jest zakończone lub niedostępne.
- [x] Portret mówiącego jest aktywny, drugi przyciemniony.
- [x] Dodać letterbox, scanlines, delikatny ruch kamery i krótkie glitch transition.

## Task 5: Wpięcie i sprzątanie

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `DEV_NOTES.md`
- Modify: `progress.md`

- [x] Zamienić `StorySceneOverlay` na `CutsceneStage`.
- [x] Nie zmieniać `StorySceneDirector`, `storyScenes`, triggerów ani zapisu postępu.
- [x] Usunąć stare style `.story-scene-*` dopiero po potwierdzeniu, że nowa scena działa.
- [x] Zaktualizować notatki: portrety Neury korzystają z manifestu ekspresji, nie z legacy `neura-miny.png`.

## Test plan

- `python scripts/neura-cutscene-assets.py validate`
- `npm run test`
- `npm run build`
- `npm run test:e2e` po wpięciu UI
- Manualnie: obejrzeć `preview.png` każdej ekspresji oraz scenę w dev serverze.

## Ryzyka

- **Drift postaci:** runtime powinien korzystać tylko z zaakceptowanych assetów w `public/pets/neura/cutscene/`.
- **Czarne tło po generacji:** cleanup assetów usuwa tylko tło połączone z krawędzią; nie stosować agresywnego usuwania czerni, bo uszkadza strój.
- **Zakres:** nie dodawać nowych scen, endingów, rytmiki ani audio syncu poza obecnym fallbackiem.
- **Git:** nie robić commita bez zgody.
