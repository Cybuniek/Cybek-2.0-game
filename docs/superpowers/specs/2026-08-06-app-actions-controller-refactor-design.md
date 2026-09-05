# Refaktoryzacja orkiestracji akcji `App.tsx` — projekt

## Kontekst

`src/App.tsx` jest głównym kompozytorem aplikacji, ale oprócz renderowania zawiera również obsługę akcji cyklu dnia, draftów, publikacji, sesji rytmicznej i Dev Menu. W aktualnym checkoutcie plik ma około 1360 linii i łączy kilka rodzajów odpowiedzialności. Niedawny `useSessionController` wydzielił już przejścia między ekranami, więc kolejną naturalną granicą jest blok akcji gry znajdujący się pomiędzy obliczeniami widoku a JSX-em.

Audyt nie wskazał potrzeby zmiany `src/dayCycle.ts`, `src/storage.ts` ani `src/rhythm.ts`: są to istniejące moduły domenowe używane przez osobne testy. Refaktoryzacja ma uporządkować przepływ zależności, nie zmieniać reguł gry.

## Cel i granice

Cel: wyodrębnić orkiestrację akcji gry z `App.tsx` do jednego, jawnie zależnego kontrolera, pozostawiając `App.tsx` jako właściciela stanu widoku i kompozycji UI.

Zakres obejmuje:

- akcje komunikacji i przejścia dni,
- rozpoczęcie tworzenia/remiksu,
- zapis, nadpisanie, wysłanie, publikację i odrzucenie draftów,
- powrót z sesji, otwieranie playera,
- zastosowanie operacji Dev Menu i ręcznych eventów Neury,
- aktualizację istniejących importów i dokumentacji.

Poza zakresem pozostają nowe mechaniki, zmiany tekstów, zmiany CSS, nowe endingi, migracje save'a, audio sync i rozbijanie wszystkich komponentów JSX na osobne pliki.

## Rozważone podejścia

1. **Przeniesienie samych helperów i stałych.** Najmniejsze ryzyko, ale nie rozwiązuje głównego problemu, bo handlery nadal pozostałyby w komponencie.
2. **Fabryka kontrolera akcji z jawnymi zależnościami — wybrana.** `src/controllers/gameActions.ts` otrzymuje aktualny `GameState`, wynik sesji, aktywny run i callbacki efektów ubocznych. Zwraca handlery używane przez istniejący JSX. Zmniejsza odpowiedzialność `App.tsx`, zachowuje kolejność operacji i nie wprowadza dodatkowego hooka ani nowego globalnego stanu.
3. **Pełny podział `App.tsx` na komponenty ekranów.** Dałby większy efekt strukturalny, lecz zwiększyłby liczbę kontraktów propsów i zakres regresji. Może być osobnym etapem po ustabilizowaniu kontrolera akcji.

## Projekt techniczny

Nowy moduł `src/controllers/gameActions.ts` będzie eksportował:

```ts
export type GameWindowId =
  | 'messenger'
  | 'create'
  | 'me'
  | 'player'
  | 'event'
  | 'ustniki'
  | 'titleHub'
  | null;

export type GameActionDependencies = {
  gameState: GameState;
  result: PerformanceResult | null;
  activeRun: ActiveRun | null;
  activeWindow: GameWindowId;
  corruptionTick: number;
  setGameState: (nextState: GameState) => void;
  setMessengerTab: (tab: 'pawel' | 'group') => void;
  setSelectedPublishedId: (id: string | null) => void;
  setActiveWindow: (windowId: GameWindowId) => void;
  startRun: (track: Track, difficulty: Difficulty, mode: ActiveRun['mode'], draftId?: string) => void;
  clearSessionToDesktop: () => void;
  recordNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  runStoryAction: (eventId: DialoguePresenceEventId, nextState: GameState) => void;
  queueStoryScene: (trigger: StorySceneTrigger) => void;
  showEnvironmentalEcho: (text: string) => void;
};

export function createGameActions(dependencies: GameActionDependencies): GameActions;
```

Kontroler będzie korzystał z tych samych funkcji domenowych co dotychczas. Każda akcja najpierw zachowa istniejące guardy, następnie wyliczy `nextState`, wywoła istniejące efekty narracyjne/Neury i dopiero zapisze stan przez przekazany setter. Nie będzie bezpośrednio importował Reacta ani renderował JSX.

Przepływ po zmianie:

```text
okno UI w App.tsx
        |
        v
createGameActions(dependencies)
        |
        +--> dayCycle / storage / ending / resonance
        +--> callbacks narracji, Neury i sesji
        +--> setGameState(nextState)
```

## Obsługa błędów i zgodność

Zachowane zostaną obecne zachowania: niepoprawna faza dnia, brak wyniku, brak draftu, blokada publikacji i nieudana operacja Dev Menu pozostają cichymi no-opami tak jak dotychczas. Kontroler nie doda nowych wyjątków ani fallbacków. Typ `GameWindowId` zostanie współdzielony przez kontroler i `App.tsx`, aby nie dublować kontraktu okien.

## Weryfikacja

Przed zmianą bazowy `npm test` przechodzi. Po zmianie należy uruchomić:

```text
npm test
npm run build
npm run test:e2e
git diff --check
git status --short --branch
```

E2E ma potwierdzić istniejący przepływ tworzenie → próba rytmiczna → wynik → draft/publikacja, a nie tylko kompilację nowego modułu.

