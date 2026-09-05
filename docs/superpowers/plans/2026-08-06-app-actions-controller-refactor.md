# Refaktoryzacja kontrolera akcji `App.tsx` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wydzielić orkiestrację akcji cyklu dnia, draftów, publikacji i Dev Menu z `src/App.tsx` do jawnie zależnego kontrolera bez zmiany zachowania gry.

**Architecture:** `src/controllers/gameActions.ts` będzie bezstanową fabryką, która otrzymuje aktualne dane sesji oraz callbacki efektów i zwraca handlery używane przez istniejący JSX. `App.tsx` pozostanie właścicielem React state, renderowania i efektów UI; logika domenowa nadal będzie pochodzić z `dayCycle`, `storage`, `ending`, `resonance` i `gameFlow`.

**Tech Stack:** React, TypeScript, Vite, istniejące skrypty Node z `--experimental-strip-types`, Playwright.

## Global Constraints

- Zachować istniejące zachowanie gry, teksty UI, kontrakty `render_game_to_text` i przepływ sesji.
- Nie zmieniać zasad `src/dayCycle.ts`, `src/storage.ts`, `src/rhythm.ts`, endingów ani synchronizacji audio.
- Zachować istniejącą modyfikację `.codex/environments/environment.toml` i nie stage'ować ani commitować zmian.
- Po edycji uruchomić pełne `npm test`, `npm run build`, `npm run test:e2e` oraz `git diff --check`.

---

### Task 1: Utworzenie kontrolera akcji

**Files:**
- Create: `src/controllers/gameActions.ts`
- Test: istniejące `npm test` i `npm run build` jako kontrola kontraktu TypeScript

**Interfaces:**
- Consumes: `GameState`, `PerformanceResult`, `ActiveRun`, typy akcji z `src/types.ts`, callbacki narracji/Neury/sesji.
- Produces: `GameWindowId`, `GameActionDependencies`, `createGameActions()` oraz handlery: `sendCommunication`, `restForDay`, `continueAfterDaySummary`, `startCreate`, `startRemix`, `saveInitialDraft`, `overwriteDraft`, `sendDraftToPawel`, `publishInitialResult`, `publishDraft`, `discardInitialResult`, `discardDraft`, `cancelPendingWork`, `openPlayer`, `returnToDesktop`, `applyDevOperation`, `triggerDevNeuraEvent`.

- [x] **Step 1: Przenieść importy domenowe i zdefiniować jawne zależności.**

  Kontroler ma importować funkcje używane obecnie w handlerach: `applyCommunicationAction`, `applyStatsDelta`, `advanceDaySummary`, `beginWork`, `canPublish`, `canStartWork`, `cancelWork`, `finishDay`, `getDecisionDelta`, funkcje `gameFlow`, `ending`, `resonance`, `storage`, dane chatowe i `tracks`. Nie może importować `App.tsx` ani Reacta.

- [x] **Step 2: Przenieść `recordDayCycleEvents` i `commitDay`.**

  Zachować kolejność efektów: setter stanu, eventy cyklu dnia, efekty narracyjne oraz powrót do pulpitu dokładnie tak, jak w aktualnym `App.tsx`.

- [x] **Step 3: Przenieść handlery komunikacji, pracy, draftów, publikacji i Dev Menu.**

  Zachować guardy fazy dnia, blokady publikacji, wyliczanie `nextState`, kolejność `runStoryAction`, `queueStoryScene`, `recordNeuraPresenceEvent`, `showEnvironmentalEcho` i ustawiania zakładek.

- [x] **Step 4: Uruchomić kompilację kontrolera.**

  Run: `npm run build`

  Expected: exit code 0, bez błędów TypeScript/Vite.

### Task 2: Podłączenie `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createGameActions()` i `GameWindowId` z Task 1.
- Produces: istniejące callbacki przekazane do `RhythmScreen`, `ResultsScreen`, `MessengerWindow`, `CreateWindow`, `MeWindow` i `DevMenu`, bez zmiany ich typów ani JSX.

- [x] **Step 1: Usunąć przeniesione importy i lokalny duplikat `WindowId`.**

- [x] **Step 2: Utworzyć `gameActions` po zdefiniowaniu callbacków narracji i sesji.**

  Przekazać aktualne `gameState`, `result`, `activeRun`, `activeWindow`, `corruptionTick`, setter stanu, setter zakładki, setter aktywnego okna, `startRun`, `clearSessionToDesktop` oraz istniejące callbacki efektów.

- [x] **Step 3: Zastąpić lokalne handlery wynikami kontrolera.**

  Podłączyć te same nazwy callbacków do istniejącego JSX i usunąć stary blok handlerów z `App.tsx`. Pozostawić `getDisplayTitle`, obliczenia widoku oraz komponenty UI w pliku.

- [x] **Step 4: Sprawdzić różnicę i format patcha.**

  Run: `git diff -- src/App.tsx src/controllers/gameActions.ts`

  Expected: zmiana ograniczona do importów, jawnego utworzenia kontrolera i usunięcia zduplikowanego bloku; brak zmian w `src/dayCycle.ts`, `src/storage.ts`, `src/rhythm.ts` i CSS.

### Task 3: Weryfikacja zachowania i stanu repozytorium

**Files:**
- Modify: brak dalszych plików, chyba że świeża weryfikacja ujawni błąd kompilacji wymagający korekty kontrolera/App.
- Test: `npm test`, `npm run build`, `npm run test:e2e`, `git diff --check`

- [x] **Step 1: Uruchomić pełny zestaw testów domenowych.**

  Run: `npm test`

  Expected: wszystkie istniejące skrypty testowe kończą się kodem 0.

- [x] **Step 2: Uruchomić build TypeScript/Vite.**

  Run: `npm run build`

  Expected: exit code 0.

- [x] **Step 3: Uruchomić test przeglądarkowy.**

  Run: `npm run test:e2e`

  Expected: istniejący smoke test przechodzi dla bootu, pulpitu, generatora, próby rytmicznej, wyniku i publikacji.

- [x] **Step 4: Sprawdzić whitespace i zakres zmian.**

  Run: `git diff --check` oraz `git status --short --branch`

  Expected: brak błędów whitespace; wcześniejszy `.codex/environments/environment.toml` pozostaje nietknięty, a nowe zmiany są ograniczone do kontrolera, `App.tsx` i dokumentacji planu/specyfikacji.
