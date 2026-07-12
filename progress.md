Original prompt: Stworz minimalny, grywalny szkielet dla prototypu webowego o nazwie "Ustnik 2.0 The Show - The Game".

Postep:
- Dodano wersje 2 stanu gry z czternastodniowa petla: komunikacja przed praca, podsumowanie dnia, wiek szkicow, zobowiazania publikacji, dzienny tick presji, krytyczne blokady statystyk i odrzucenia ze sladem.
- Dodano `src/dayCycle.ts`, deterministyczne modyfikatory rytmu zalezne od Cybart.exe/Presji oraz podglad skutkow decyzji w Messengerze i raporcie proby.
- Rozszerzono testy o `npm run test:day-cycle` i zaktualizowano smoke E2E pod obowiazkowy komunikat przed praca.
- Utworzono szkielet React + TypeScript + Vite.
- Dodano pulpit Cybek OS, Neure, okna Messenger/Ustno.ai, placeholder rytmiczny, wyniki, localStorage i DEV_NOTES.md.
- Zaimplementowano grywalną sekcję rytmiczną: tory `S/D/K/L`, czas próby zależny od długości bazowego audio lub metadanych ładowanego utworu, BPM pobierany z pełnej wersji utworu, poziomy trudności sterujące gęstością nut przez mnożniki `Łatwy=0.5`, `Normalny=0.7`, `Cybart=1.0`, feedback `Too fast/Good/Great/Perfect/Too late/Miss`, combo z mnożnikiem jakości i wynik w tierach `F/E/D/C/B/A/S`.
- Dodano developerski test logiki rytmu uruchamiany przez `npm run test:rhythm`.
- Dodano porównanie remixu z obecnym draftem przed nadpisaniem: poprzedni wynik, nowy wynik, różnica i werdykt ryzyka.
- Rozbudowano publikację o reakcje czatu zależne od jakości pliku i dokładności wykonania.
- Podmieniono placeholder Neury na interaktywną wersję z custom pet Codexa: atlas `public/pets/neura/spritesheet.webp`, animacje stanów, kliknięcia, przyciski reakcji i przeciąganie po pulpicie.
- Rozszerzono sekcję rytmiczną o typy nut `tap`, `hold` i `smash`, ręczne beatmapy z fallbackiem do generatora oraz testy scenariuszy przytrzymania i mashowania.
- Weryfikacja: `npm run build` przechodzi po uruchomieniu poza sandboxem; dev server działa na `http://127.0.0.1:5173/`; zrzut headless Chrome potwierdził widoczny sprite Neury i panel reakcji. Playwright z umiejętności nie został uruchomiony, bo pakiet `playwright` nie jest zainstalowany.
- Weryfikacja rytmu: `npm run test:rhythm` przechodzi po ujednoliceniu poziomu `Łatwy` w teście developerskim.
- Weryfikacja rytmu po rozszerzeniu nut: `npm run test:rhythm` przechodzi dla tap/hold/smash oraz loadera ręcznych beatmap.
- Dodano format ręcznych beatmap `schemaVersion: 2`: `sourceStartMs/sourceEndMs` per poziom, nuty liczone od początku wycinka, legacy `durationMs` nie skraca już audio bez jawnego zakresu.
- Naprawiono mapę `wystep-czekamy-czekamy/Łatwy`, która miała przypadkowe `durationMs: 47213`; obecnie eksportowana jest z pełnym zakresem audio.
- Dodano webowy `Rhythm debug`: przycisk na ekranie rytmu oraz skróty `F8`/`F9`, a `render_game_to_text` pokazuje `audioDurationMs`, `sourceStartMs`, `sourceEndMs`, `beatmapDurationMs` i typ mapy.
- Rozbudowano `RhythmSectionEditor`: wydzielone modele/ViewModel zakresu, start/koniec z playhead, puste mapy z przyciskiem generowania bazy, backup przed eksportem, blokada eksportu przy poważnych błędach, prosty playtest `S/D/K/L` i formularz importu nowego utworu do `tracks.ts`.
- Weryfikacja: `npm run test:rhythm` przechodzi; `npm run build` przechodzi po uruchomieniu poza sandboxem; `dotnet build -c Debug -p:Platform=x64` dla `RhythmSectionEditor` przechodzi po restore poza sandboxem.
- Próba uruchomienia WinUI przez `dotnet run` i bezpośredni EXE kończy się natychmiast bez utrzymanego procesu; build jest poprawny, ale start okna wymaga jeszcze ręcznej weryfikacji w środowisku desktopowym.

TODO:
- Jeśli projekt ma dalej korzystać z testów przeglądarkowych z umiejętności `develop-web-game`, dodać `playwright` jako dev dependency albo wskazać wspólną instalację.
- Kolejny krok rytmu: ręcznie sprawdzić start okna WinUI, potem ułożyć pełne autorskie mapy dla trzech utworów i ewentualnie dodać kalibrację input laga.

Porzadki onboardingu 2026-06-23:
- Usunieto overlayowa prowadnice Neury z runtime'u, dokumentacji i testow developerskich.
- Decyzja projektowa: funkcje onboardingowe maja wrocic tylko jako jedna petla cutscenek obejmujaca start gry, pierwsze stworzenie piosenki, pierwszy remix, wyslanie do Pawla i publikacje na czacie.

Petla cutscenkowa 2026-06-23:
- Dodano checkpoint pierwszego nadpisanego remixu (`remix.firstOverwritten`) i test pilnujacy petli: boot -> pierwszy utwor -> pierwszy remix -> Pawel -> czat.
- Ujednolicono aktywne UI/dane/testy na nazwe `Pawel` zamiast zdrobnienia.
- Rozbito bundle na chunki `rhythm-data`, `story-data`, `BeatmapEditor` i `CutsceneStage`; glowny chunk spadl ponizej 500 kB.
- `npm run test:e2e` korzysta z wlasnego runnera Vite i konczy proces po zielonych testach.

Beatmap Editor 2026-05-25:
- Po audycie YunYunEditor wdrożono pakiet P0/P1 bez migracji formatu: undo/redo, snap BPM, multi-select, clipboard, nudge, markery edytorskie, mocniejszą walidację i widoczną listę skrótów.
- `RhythmBeatmap` obsługuje teraz `inputOffsetMs` per mapa oraz `markers`; runtime używa offsetu tylko do oceny wejścia, a markery ignoruje w gameplayu.
- Beatmap Editor ma prosty metronom ćwierćnutowy podczas playbacku, bez przenoszenia go do właściwej gry.
- Dodano `npm run test:editor` i podpięto go do `npm run test`.

Beatmap Editor UX 2026-05-25:
- Dopasowano szerokość nut w edytorze do runtime'u: nuty ponownie wypełniają tor zamiast wyglądać jak osobny, węższy podgląd.
- Dodano przewijanie czasu mapy kółkiem myszy po planszy edytora, tylko przy zatrzymanym playbacku.
- Statyczne paski tła toru zastąpiono ruchomą siatką BPM liczona z czasu mapy; linie płyną razem z nutami.
- BPM można edytować per mapa, a eksport i runtime zachowują ręczne BPM zamiast nadpisywać je BPM-em utworu.
- Edytor odtwarza osobne ścieżki instrumental/vocal i ma suwaki głośności dla miksu, instrumentalu, wokalu oraz metronomu.

Refaktor SFX rytmu 2026-05-26:
- Audyt przed zmianą: `git status --short` był czysty, `npm test` i `npm run build` przechodziły, a `src/App.tsx` miał 2286 linii.
- Wydzielono runtime SFX sekcji rytmicznej do `src/audio/useRhythmSfx.ts`; `App.tsx` tylko pobiera kontroler `useRhythmSfx()` i wywołuje `playTap/startHold/fadeOverlay/stopHold/stopAllHolds`.
- Rozszerzono `npm run test:rhythm` o regresje zegara `syncRhythmSessionToElapsed`, automatyczne kończenie sesji z missami oraz próg pustych uderzeń resetujących combo.
- Weryfikacja: `npm run test:rhythm`, `npm test` i `npm run build` przechodzą; smoke test przez headless Chrome/CDP przeszedł flow title -> boot -> desktop -> create -> rhythm z tapem i holdem bez błędów konsoli.

Neura Echo + Resonance + EVENTS 2026-05-26:
- Dodano `EchoState`, `EchoMessage`, `NeuraEchoEffect`, `ResonanceState`, `ResonanceLevel`, `NeuraResonanceEffect`, `BondWithNeura`, `EndingState` i `EndingRoute` do wspólnego modelu gry.
- Publikacja wywołuje `triggerEchoAfterPublish()`, zwiększa `echoCount`, zapisuje frazę decyzji gracza, aktualizuje rezonans i przelicza logiczną trasę endingową.
- `EVENTS` przestał być normalną ikoną pulpitu; `EventCutsceneStage` odpala się ze stanu `echo.activeCutsceneId` jako makieta pulpitu pod cutscenki.
- `src/resonance.ts` i `src/ending.ts` trzymają czystą logikę, a sekcja rytmiczna przyjmuje opcjonalny `comboBonus` z efektów rezonansu.
- Rozszerzono dialogi Neury o warunki echo/rezonansu/wiezi/endingu oraz dodano linie powtarzające decyzje gracza jako echo.
- Dodano testy `scripts/echo.dev-test.ts`, `scripts/resonance.dev-test.ts`, `scripts/ending.dev-test.ts`; rozszerzono testy state, rhythm, presence i voice director.
- Weryfikacja: `npm test` i `npm run build` przechodzą; smoke test headless Chrome/CDP potwierdził publikację, `echoCount=1`, widoczny stage EVENTS, brak ikony Event na pulpicie i brak błędów konsoli.

Beatmap Editor 2026-05-14:
- Audyt: webowy edytor jest najlepszym docelowym workflow, bo siedzi obok runtime'u gry, ale brakowało mu jawnego importu pełnego `manualBeatmaps.json`, widocznego odzyskiwania backupów z `localStorage` i prostego eksportu katalogu pod docelową nazwą pliku.
- Zmieniono mały zakres: edytor trzyma roboczy katalog beatmap w stanie Reacta, import/restore aktualizują bieżącą mapę, eksport pobiera `manualBeatmaps.json` i zapisuje backup w `localStorage`.
- Dokumentacja: `DEV_NOTES.md` opisuje teraz praktyczny workflow developerski oraz nadal jawnie wskazuje ograniczenia względem WinUI.
- Następny krok: rozważyć dopiero później File System Access API albo mały skrypt do podmiany pobranego JSON-a w repo, jeśli ręczna podmiana będzie zbyt uciążliwa.

Runtime rytmu 2026-05-14:
- Naprawiono wizualne "hamowanie" długich nut: pozycja nut w `getVisibleRhythmNotes` nie jest już zaciskana do dolnego progu toru, więc `hold/smash` jadą liniowo dalej, a znikanie robi naturalne przycięcie przez `overflow: hidden`.
- Dodano test developerski pilnujący, że długa nuta po minięciu linii trafienia nadal zachowuje liniową prędkość.
- Ujednolicono język wizualny gry i edytora: szerokie nuty zostały w edytorze i trafiły do runtime'u, a obszar nut w `Beatmap Editor` ma tory, linię trafienia i klawisze bliższe właściwej sekcji gry.
- Doprecyzowano zgodność edytora z runtime'em: nuty w `Beatmap Editor` są renderowane wewnątrz konkretnych torów i używają bazowej klasy `.note`, żeby edycja dawała lepsze odniesienie do efektu docelowego w grze.
- Po porównaniu screenów dopasowano edytor do układu runtime'u: cztery osobne tory z przerwami, osobne linie trafienia, klawisze w kolumnach oraz brak etykiet `tap` na samych nutach.
- Naprawiono proporcje i nagrywanie edytora: `Zoom` zmienia okno czasu zamiast skalować DOM, okno `x1` bazuje na gameplayowym `travelMs`, zwykłe tapy powstają od razu na `keydown`, hold robi live preview podczas trzymania, a smash wymaga świadomego `Shift+S/D/K/L`.

Patrol stabilizacyjny 2026-05-17:
- Przywrócono środowisko przez `npm ci`; wcześniejszy `npm run build` nie startował, bo w worktree brakowało `node_modules` i lokalnego `tsc`.
- Wydzielono czyste helpery flow do `src/gameFlow.ts`, bez zmiany zachowania generatora, szuflady, remixu i publikacji.
- Dodano `migrateSavedState` oraz `npm run test:state` dla migracji legacy save, `publishedTrackIds`, reveal tytułów i fallbacku tieru jakości.
- Rozszerzono `npm run test:rhythm` o walidację realnego `src/data/manualBeatmaps.json`, żeby ręczne mapy wskazywały istniejące utwory/poziomy i resolve'owały się jako `manual`.
- Beatmap Editor ma guard niezapisanych zmian: zmiana utworu/poziomu, import i wyjście do pulpitu wymagają `Eksport + backup` albo `Porzuć zmiany`.
- `Annihilation player.exe` pozostaje realnym odtwarzaczem scalonego audio i ma fallback dla starszych publikacji bez pasującego wpisu w katalogu utworów.
- Ujednolicono etykietę szuflady jako `Ustno.ai Me`.

UI polish 2026-05-17:
- Uporządkowano warstwę wizualną przez zmienne CSS dla kolorów, ramek, paneli i glow oraz przygaszono tło pulpitu, żeby okna, ikony i prawa kolumna były czytelniejsze.
- Wzmocniono game feel sekcji rytmicznej: mocniejsza linia trafienia, stan aktywnego toru, czytelniejszy countdown, wyraźniejsze `Perfect/Great/Good/Miss` i bardziej zwarty HUD.
- Ekran wyników ma czytelniejszą hierarchię akcji, a player wygląda bardziej jak archiwum opublikowanego Występu.
- Beatmap Editor dostał wyraźniejszy status niezapisanych zmian, lepszą separację paneli i tory spójniejsze z runtime'em.
- Dodano podstawowe breakpointy dla węższych viewportów oraz `prefers-reduced-motion` dla efektów animowanych.

Neura 2.0 2026-05-19:
- Podmieniono `public/pets/neura/spritesheet.webp` na poprawiony wariant awatara.
- Neura nie renderuje już panelu dialogowego; jest niezależnym awatarem nad pulpitem, którego można kliknąć, przeciągnąć i który lekko patroluje dolną część ekranu.
- Teksty kwestii bez istniejącej ścieżki audio nie są pokazywane w UI, a odtwarzanie głosu pomija linie bez realnego pliku.
- Pełny zestaw głosów Neury ma być generowany przez ElevenLabs do OGG/Opus oraz MP3 fallbacków; w tej sesji generator zatrzymał się na braku lokalnego `ELEVENLABS_API_KEY`.

SFX rytmu 2026-05-21:
- Dodano sample MP3 dla tapów i holdów w `public/audio/sfx/rhythm`.
- Tap trafiony oraz puste uderzenie losują jeden wariant `SE-tap_note-keyboard_typing00..07.mp3`.
- Hold uruchamia zapętlone warstwy `SE-hold_loop-keyboard_typing.mp3` oraz `SE-hold_loop-overlay_effect.mp3`; overlay schodzi fadeoutem po końcu nuty, a keyboard typing zatrzymuje się dopiero po puszczeniu klawisza.
- Weryfikacja: do uruchomienia po zmianach `npm run test:rhythm`, `npm run test:state` i `npm run build`.

Soundscape pulpitu 2026-05-21:
- Dodano globalny hook `src/audio/useSoundscape.ts` dla ambientu OS, losowych fal glitcha, mute i przyszłych warstw audio.
- Assety tła trafiły do `public/audio/bgs`: `BGS-ambientOS.mp3` oraz `BGS-glitch_a.mp3` - `BGS-glitch_e.mp3`.
- Ambient startuje po pierwszej interakcji użytkownika, zapętla się z głośnością `0.6`, a przyszła muzyka ma domyślny punkt odniesienia `0.8` w konfiguracji.
- Glitche losują plik i obwiednię fade in / peak / fade out, startują co 4-12 sekund po odblokowaniu audio i mają limit 2 aktywnych warstw.
- Pulpit dostał prosty globalny przycisk `Dźwięk: wł./wył.` zapisujący mute w `localStorage`.
- Weryfikacja: `npm run test:rhythm` i `npm run test:state` przeszły; `npm run build` przeszedł po ponowieniu poza sandboxem z powodu znanego błędu Vite/esbuild `Cannot read directory "../.."`.

Neura Presence 2026-05-21:
- Dodano `OperationalPowerLevel` 0-4 oraz `NeuraPresenceState`, żeby audio, avatar, UI i debug korzystały z jednego modelu obecności.
- Dodano data-driven presety w `src/data/neuraPresence.ts`: progi fabularne, parametry soundscape, avatara i autonomii UI oraz tagi `maskotka`, `niestabilny widget`, `proces`, `operator`, `martwy pulpit`.
- Dodano czysty manager `src/neura/NeuraPresenceManager.ts`; obecność wynika z publikacji, draftów, jakości, presji czatu i eventów, a nie z samego upływu czasu.
- `useSoundscape` reaguje na presence state: ambient robi się głębszy, a glitche zmieniają częstotliwość, głośność i limit aktywnych warstw.
- Awatar Neury przeniesiono do `src/neura/NeuraPet.tsx`, a mikro-jitter/ghost/glitch slice do `src/neura/useNeuraAvatarMotion.ts`.
- Dodano `src/neura/useEnvironmentalUiEvents.ts` dla subtelnych reakcji pulpitu oraz panel debugowy `F10` z override poziomu i Low FX.
- Dodano test `npm run test:neura-presence` i podpięto go do `npm run test`.
- Weryfikacja: `npm run test` przeszedł; `npm run build` przeszedł po ponowieniu poza sandboxem z powodu znanego błędu Vite/esbuild `Cannot read directory "../.."`; podgląd na `127.0.0.1:5173` renderuje pulpit, Neurę i panel debugowy F10 bez błędów aplikacji w konsoli.

Neura Voice Director + prolog 2026-05-22:
- Dodano data-driven katalog dialogów `src/data/dialogue/*`, kolejkę `src/neura/NeuraVoiceDirector.ts` i storage directora w `localStorage`.
- Eventy gry nie odtwarzają głosu bezpośrednio: zapis draftu, wysyłka do Pawcia, publikacja, spike glitcha i start sesji aktualizują kolejkę, a director wybiera następną linię.
- Dodano 12 prologowych linii Neury oraz wygenerowane pliki OGG w `public/audio/neura/prologue-003-*.ogg` - `prologue-014-*.ogg`.
- Generator głosów obsługuje `--source dialogue-v2`, `--phase prologue` i skrypty `voice:neura:dialogue:*`.
- Weryfikacja: `npm run test` przechodzi dla rytmu, state, presence i Neura Voice Director.

Boot Cybek OS + merge 2026-05-22:
- Dodano ekran startowy `Cybek OS v0.7.0`: terminal, lista `[OK]`, pasek ładowania, logi systemowe, logo CSS/HTML i przejście do pulpitu albo `#editor`.
- Boot trwa ok. 4.5 sekundy, można go pominąć po pierwszej sekundzie kliknięciem albo dowolnym klawiszem; `window.advanceTime(ms)` przyspiesza go w testach.
- `render_game_to_text` raportuje boot jako `screen: "boot"` z procentem, widocznymi krokami i statusem skipu.
- Gałąź `NEURA_fabularne-skrypty` została włączona fast-forwardem do obecnej gałęzi bez commita. Konflikty po przywróceniu lokalnego stasha rozwiązano tak, żeby zachować boot, Neura Presence i data-driven story actions.
- Weryfikacja po scaleniu: `npm run test` przeszedł; `npm run build` przeszedł po ponowieniu poza sandboxem z powodu znanego błędu Vite/esbuild `Cannot read directory "../.."`.

Patrol repozytorium 2026-05-12:
- Audyt bez zmian: porównano aktualny kod z `DEV_NOTES.md`, `progress.md` i `ustnik_2_0_the_show_the_game_wizja.md`.
- Kategorie problemów: krytyczne - brak nowych blokad po buildzie; ważne - jednorazowa publikacja oparta głównie o stan z renderu, remix dla niezgodnego/starego poziomu draftu, szuflada powinna komunikować blokadę publikacji; kosmetyczne - drobne niespójności etykiet `Pawła/Pawcia` i `Ustno.ai Ja/Me`; odłożyć - warianty audio zależne od poziomu, większa walidacja save'ów, testy przeglądarkowe.
- Naprawiono mały zakres: dodatkowy guard publikacji wewnątrz `setGameState`, disabled/tekst blokady publikacji w szufladzie dla opublikowanych tytułów, `getNextDifficulty` zwraca `null` dla poziomu spoza listy utworu.
- Weryfikacja przed zmianami: `npm run test:rhythm` przeszedł; `npm run build` przeszedł po uruchomieniu poza sandboxem, bo zwykły sandbox zwrócił odmowę dostępu przy Vite/esbuild.
- Następna mała sesja: uporządkować słownik etykiet UI oraz zdecydować, czy `Annihilation player.exe` ma pozostać zwykłym odtwarzaczem audio, czy wrócić do opisanego wcześniej placeholdera z przyciskiem `Odtwórz`.

Sceny dialogowe Neura/Cybek 2026-05-27:
- Utworzono gałąź `CODEX/sceny-dialogowe-neura-cybek` i wdrożono osobny system niepomijalnych scen: `src/data/dialogue/storyScenes.ts`, `src/neura/StorySceneDirector.ts` oraz `src/neura/StorySceneOverlay.tsx`.
- Sceny odpalają się raz na checkpoint: po bootowaniu, po pierwszym ukończeniu minigry, per utwór/per kanał udostępnienia (`pawel` i `chat`) oraz przy poziomach obecności/glitchy Neury 1-4.
- Dialogi odnoszą się do tekstów z `ref_data/lyrics` przez motywy i krótkie frazy: czekanie na występ, presję „daj występ”, suflera AI, Anihilację, kamerę, ryzyko i zapis historii.
- Rozszerzono generator `scripts/generate-neura-voices.ts` o `--source story-scenes`, dwa głosy speakerów (`ELEVENLABS_NEURA_VOICE_ID`, `ELEVENLABS_CYBEK_VOICE_ID`) oraz output do `public/audio/story-scenes`.
- Dodano test `scripts/story-scenes.dev-test.ts`, skrypt `npm run test:story-scenes` i wpięcie do `npm run test`.
- Weryfikacja: `npm run test`, `npm run build` i `npm run voice:story-scenes:dry-run` przeszły. Dev server działa pod `http://127.0.0.1:5173/`.
- Ograniczenie: właściwe `npm run voice:story-scenes:with-fallback` zostało zablokowane przez warstwę bezpieczeństwa, bo wysyła nowe dialogi do zewnętrznego ElevenLabs. Assety audio trzeba wygenerować po jawnej zgodzie na eksport treści do tej usługi.
- Ograniczenie: test przeglądarkowy z klienta `develop-web-game` nie ruszył, bo w środowisku nie ma paczki `playwright`.

Stabilny checkpoint 2026-06-01:
- Dodano lokalny smoke test Playwright pod `npm run test:e2e`; test startuje Vite, przechodzi przez title -> boot -> desktop i sprawdza generator oraz `render_game_to_text` bez wejścia na zewnętrzne strony.
- `playwright.config.ts` używa lokalnego `webServer` i Chromium jako minimalnej przeglądarki checkpointu.
- Sceny fabularne mają tekstowy fallback: brak OGG/MP3 albo blokada autoplay nie zatrzymuje modala, tylko odblokowuje `Dalej` ze statusem `Audio niedostępne`.
- Dawna overlayowa prowadnica Neury zostala usunieta pozniej na rzecz planowanej petli cutscenkowej pierwszego obiegu.
- `ref_data/YunYunEditor` zostaje świadomie jako materiał referencyjny; ewentualne usunięcie/przeniesienie to osobny cleanup przed merge'em.

Cutscenki Visual Novel 2026-06-07:
- Zastąpiono runtime `StorySceneOverlay` nowym `CutsceneStage`, zachowując `StorySceneDirector`, dane scen, triggerowanie oraz zapis postępu.
- Dodano moduły `src/neura/cutscene/*`: kontrakt manifestu assetów, mapowanie `audioIntent`, portret Neury ze stripów, portret Cybka przez `CybekWebcam`, typewriter i stage VN.
- Neura korzysta z `public/pets/neura/cutscene/<expression>/manifest.json` oraz `strip.png`; `neura-miny.png` zostaje tylko źródłem/legacy workflow, nie portretem runtime cutscenek.
- Dodano `scripts/cutscene-assets.dev-test.ts`, `npm run test:cutscene-assets` i wpięcie do `npm run test`; test sprawdza też wymiary PNG bez Pythona.
- Dodano smoke Playwright dla bootowej cutscenki VN.
- Weryfikacja: `npm run test`, `npm run build` i `npm run test:e2e` przeszły. `python scripts/neura-cutscene-assets.py validate` nie ruszył w tej sesji, bo środowisko nie ma działającego Pythona/PIL.

Poprawki dialogów VN 2026-06-09:
- `CutsceneStage` pozwala teraz przejść dalej drugim kliknięciem nawet podczas aktywnego audio; pierwsze kliknięcie nadal tylko odsłania pełny tekst typewritera.
- `Enter` i `Spacja` korzystają z tej samej ścieżki co klik/przycisk `Dalej`.
- Start audio jest opóźniony do następnego ticka i oznaczony tokenem odtwarzania, żeby devowy React StrictMode nie zostawiał podwójnego startu pierwszej kwestii.
- Dodano regresję Playwright dla kliknięcia, Entera i Spacji przy audio pozostającym w stanie `playing`.
- Typewriter cutscenki synchronizuje prędkość z metadanymi aktualnego audio (`duration / liczba znaków`), z dotychczasowym fallbackiem gdy przeglądarka nie poda czasu pliku.

System fabularny 2026-07-04:
- Audyt przed zmianą: `git status --short` był czysty; istniejący runtime miał osobne cutscenki VN (`storyScenes`/`StorySceneDirector`/`CutsceneStage`) oraz ambientowy `NeuraVoiceDirector`, ale brakowało jednego źródła prawdy dla prowadzenia gracza od początku do końca.
- Zastąpiono luźny `mainStory.ts` pełnym modelem beatów: boot, pierwszy utwór, pierwszy remix, bufor Pawła, pierwsza publikacja, pełny repertuar i most finałowy.
- Panel pulpitu `Plan Występu` oraz `render_game_to_text.mainStory` korzystają z tego samego modelu, więc debug i UI pokazują aktualny cel fabularny.
- Dodano trigger i cutscenkę `story.final.ready` jako most po opublikowaniu całego repertuaru; to nie jest pełny ending, tylko fabularne domknięcie prototypu.
- Rozszerzono `scripts/story-scenes.dev-test.ts` o regresje dla mostu finałowego i progresu `mainStory`.
- Weryfikacja: `npm run test:story-scenes`, `npm test`, `npm run build` i `npm run test:e2e` przechodzą. Dodatkowy smoke Playwright na lokalnym Vite potwierdził `mainStory.currentBeatId = first-song`, brak błędów konsoli i czytelny panel `Plan Występu` na screenie `test-results/story-smoke/02-desktop-story-plan.png`.
- Ograniczenie: klient `develop-web-game` z katalogu `.codex` nie uruchomił się bezpośrednio, bo Node ESM rozwiązywał `playwright` względem katalogu skryptu, nie lokalnego `node_modules`; zastąpiono go lokalnym przebiegiem Playwright z repo.

TODO:
- Po kolejnych utworach lub endingach rozszerzać najpierw `mainStoryBeats`, potem dopiero dane cutscenek.
- Jeśli powstanie właściwy finał, `story.final.ready` powinien zostać bramką do wyboru/endingu, a nie zastępować ending.

World presentation cleanup 2026-07-07:
- Audyt kontynuacyjny: worktree zawierał poprzedni pakiet `mainStory` bez commita; AGENTS.md nadal wymaga małych stabilnych kroków, audytu i sprawdzeń po zmianach.
- Usunięto widoczne sygnały robocze z pierwszego odbioru: topbar mówi teraz `transmisja domowa`, title screen ma status sesji prywatnej, a `placeholder-window-pass` zniknął z logu boot/title.
- `todo.tmp` zmieniono w ikonę `Plan Występu`, spójną z panelem fabularnym.
- Okno `Ustniki / Challenge` przestało być placeholderem `wkrótce`: pokazuje teraz realny dziennik prób Występu liczony z `GameState` (bufor Pawła, pierwsza publikacja, dobra wersja, kontrola presji).
- Podniesiono zwykłe okna nad webcam, bo aktywne okno Ustników było wizualnie zasłaniane przez kamerę i ucinało statusy.
- Dodano regresję Playwright: ekran startowy i Ustniki nie mogą pokazywać `prototyp`, `placeholder`, `WIP` ani `wkrótce` w normalnym flow.
- Weryfikacja: `npm test`, `npm run build`, `npm run test:e2e` przechodzą. Smoke Playwright zapisał `test-results/world-overhaul/01-title.png` i `test-results/world-overhaul/02-ustniki-ledger.png`; drugi screen ręcznie obejrzany przez `view_image`.

TODO:
- Następny pakiet overhaul'u powinien domknąć mobile/responsive: okna działają, ale pełny naturalny feeling na węższych viewportach wymaga osobnego passu.

Ambient Neury / pierwszy odbiór świata 2026-07-07:
- Audyt przed zmianą: `mainStory` i cutscenki VN prowadziły gracza przez boot -> pierwszy numer -> remix -> Pawła -> czat, ale `neuraVoiceLinesV2` nadal mieszało ten łuk z luźnymi technicznymi żartami o cache, localStorage, fallbacku audio i prywatności.
- Przepięto wczesne/middle/late/finalne kwestie Neury na istniejące statyczne audio z `src/data/neuraVoiceLines.ts`: tekst runtime'u i `audio.id` są teraz zgodne dla głównego szlaku ambientowego.
- Usunięto z pierwszej sesji oderwane fragmenty typu `Nie sprzątaj cache`, `stabilne serwery`, `tania licencja`; zastąpiły je linie o buforze Pawła, szufladzie, publicznym śladzie, presji czatu i Neurze jako obecności pulpitu.
- Dodano regresję w `scripts/neura-voice-director.dev-test.ts`, która pilnuje zgodności tekstu ze statycznym audio i zakazuje powrotu tych odklejonych fragmentów do wczesnego ambientu.
- Ograniczenie: nie generowano nowych plików głosu, bo wymagałoby to wysłania dialogów do zewnętrznego ElevenLabs. Użyto wyłącznie istniejących lokalnych assetów audio.

Responsive desktop pass 2026-07-07:
- Audyt przed zmianą: Playwright na 390px wykazał realną blokadę wejścia - fixed webcam zasłaniał ikonę `Ustniki` i przechwytywał kliknięcie.
- Na breakpointach mobile webcam przechodzi teraz do normalnego przepływu pulpitu pod ikonami, zamiast wisieć jako fixed overlay nad wejściami.
- Topbar na małych ekranach zawija tekst i przyciski bez poziomego overflow, a `Ustniki` przechodzą na jednosłupkowe karty z czytelnymi statusami.
- Dodano regresję Playwright `responsive: mobile pozwala otworzyć Ustniki bez zasłonięcia przez webcam`, która sprawdza aktywne okno i brak poziomego overflow przy 390x844.
- Weryfikacja: `npm run test:e2e`, `npm test`, `npm run build` przechodzą. Smoke Playwright zapisał `test-results/responsive-overhaul/mobile-390-ustniki.png` i `test-results/responsive-overhaul/tablet-768-ustniki.png`; oba screeny obejrzane po zmianie.

Responsive rhythm/results pass 2026-07-07:
- Audyt przed zmianą: Playwright na 390x844 wykazał, że ekran próby i wyników dziedziczył scroll z pulpitu/tworzenia. Panel wyników potrafił zaczynać się poza górą viewportu, a fallback ładowanej cutscenki doklejał pełnostronicowy blok pod wynikami.
- `App` resetuje teraz scroll do góry przy każdej zmianie `screen`, więc przejście desktop -> rhythm -> results startuje od czytelnego kadru.
- Fallback cutscenki VN ma osobny tryb nakładki (`system-fallback-overlay`), a pełnostronicowy fallback został zachowany dla edytora.
- Drobno zacieśniono mobilny układ rhythm/results: mniejszy dolny padding, czytelniejsze lane'y, pełnoszerokie akcje wyników i stabilne przyciski bez poziomego overflow.
- Po audycie słów roboczych usunięto nieużywane etykiety `todoTitle`/`todoItems` i zastąpiono opis ukrytych okien neutralnym komunikatem diagnostycznym.
- Dodano regresję Playwright `responsive: mobile prowadzi próbę i wynik od góry ekranu bez overflow`, która sztucznie przewija przed przejściami i sprawdza reset scrolla oraz szerokość dokumentu.
- Weryfikacja: `npm run test:e2e`, `npm test`, `npm run build` przechodzą. Smoke Playwright zapisał `test-results/rhythm-mobile-final/mobile-rhythm.png` i `test-results/rhythm-mobile-final/mobile-results.png`; oba screeny obejrzane po zmianie, metryki: `scrollY=0`, `documentWidth=390`, `scrollHeight=1058`, brak błędów konsoli.

Full story playtest 2026-07-07:
- Audyt przed zmianą: pełny Playwright flow title -> boot -> pierwszy draft -> remix -> Paweł -> pierwsza publikacja -> reszta repertuaru -> `story.final.ready` technicznie kończył `mainStory`, ale po checkpointcie finalnym `Plan Występu` nadal pokazywał cel `Przejdź przez ostatni dialog`.
- Dodano stan `session-complete` w `deriveMainStoryProgress`: po ukończeniu wszystkich beatów panel nie cofa już gracza do mostu finałowego, tylko pokazuje `Po Występie: Sesja domknięta`.
- Panel `EVENTS` rozpoznaje ukończony mainStory i zastępuje końcowe `Publikuj dalej` decyzjami po Występie.
- Rozszerzono `scripts/story-scenes.dev-test.ts` o regresję przed/po checkpointcie `checkpoint.final.ready`.
- Dodano e2e `fabuła: pełny repertuar kończy Plan Występu bez cofania celu`, które przechodzi cały repertuar przez UI i sprawdza finalny `session-complete`, pustą kolejkę cutscenek oraz brak przycisku `Publikuj dalej` po domknięciu.
- Weryfikacja: `npm run test:e2e` (7/7), `npm test`, `npm run build` przechodzą. Smoke runtime zapisał `test-results/full-story-final-fixed/final-session-complete.png` i `report.json`; raport potwierdził `currentBeatId=session-complete`, `completedCount=7/7`, `storyScene.queue=[]`, `documentWidth=1280`, brak błędów konsoli i brak tekstu `Publikuj dalej`.

Final EVENTS readability pass 2026-07-07:
- Audyt przed zmianą: screenshot finalny pokazał, że `EVENTS` ma `z-index` niższy niż zwykłe okna i webcam. Finał był logicznie ukończony, ale główna warstwa końcowa była zasłaniana przez Messenger/CybekWebcam.
- Dodano klasę `event-cutscene-final` dla ukończonego mainStory: finalny `EVENTS` ma własny układ, złoty akcent, wyższą warstwę niż okna pulpitu i czytelne decyzje po Występie.
- Na mobile finalny `EVENTS` jest fixed, przewijalny i pojawia się jako pierwszy panel nad pulpitem; Messenger/webcam nie przechwytują już końcowego komunikatu.
- Rozszerzono e2e pełnego repertuaru o `elementFromPoint`, żeby sprawdzać rzeczywistą warstwę głównego panelu finału, a nie tylko obecność tekstu w DOM.
- Weryfikacja: `npm run test:e2e` (7/7), `npm test`, `npm run build` przechodzą. Smoke screenshoty: `test-results/final-event-layer/desktop-final-event.png`, `test-results/final-event-layer/mobile-final-event.png`; raport potwierdził `event-cutscene-final`, `isTopLayer=true`, brak poziomego overflow (`documentWidth` równe viewportowi) i brak `Publikuj dalej`.

Publication/chat language pass 2026-07-07:
- Audyt przed zmianą: pełny flow był już logicznie domknięty, ale publikacje i czat nadal używały roboczych etykiet `slaba wersja`/`cudenko` oraz reakcji brzmiących jak placeholderowy żart.
- Zmieniono kontrakt `PublishedTrack.quality` na `szkic publiczny` / `lepsza wersja` / `cudeńko`, a migracja save'ów normalizuje dawne `slaba wersja`, `słaba wersja` i `cudenko` do nowych wartości.
- Przepisano komunikaty Pawła i czatu głównego wokół publikacji tak, żeby zachowały wynik/ocenę, ale mówiły językiem świata: szkic, prywatny bufor, publiczny ślad i punkt zwrotny Występu.
- Poprawiono etykietę Ustników po wysłaniu szkicu do Pawła na `Paweł ma szkic`.
- Dodano regresje: `scripts/state.dev-test.ts` pilnuje migracji legacy jakości, a e2e pełnego repertuaru zakazuje powrotu fraz `slaba wersja`, `kompromitacja`, `demo uciekło` w finalnym flow.
- Weryfikacja: `npm test`, `npm run build` i ponowione po korekcie `npm run test:e2e` (7/7) przechodzą. Tekstowy smoke `rg` pokazuje stare frazy tylko w celowej migracji legacy i asercjach regresyjnych.

UI copy polish pass 2026-07-07:
- Audyt przed zmianą: główny runtime nadal pokazywał robocze lub angielskie określenia `Core loop`, `nieudany song`, `draft`, `demo`, `Ustniki / Challenge` i `The Game` w miejscach pierwszego kontaktu z grą.
- Przepisano widoczne etykiety UI na spójny język świata: `Ścieżka Występu`, `szkic`, `Dziennik prób`, `wersja do poprawy`; przyciski zapisu/wysyłki/nadpisania nie mówią już `draft`.
- `Plan Występu` używa teraz tytułów `Popraw szkic` i `Wyślij szkic Pawłowi`, więc cele prowadzące gracza są spójne z Messengerem, Ustnikami i publikacją.
- Rozszerzono e2e o regresję na zwykłym pulpicie oraz finalnym flow: `Core loop` i `nieudany song` nie mogą wrócić jako widoczny tekst.
- Weryfikacja: runtime smoke `rg` w `src` nie znajduje już `Core loop`, `nieudany song`, starych przycisków draftu ani `Wyślij demo Pawłowi`; `npm run test:e2e` (7/7), `npm test` i `npm run build` przechodzą.
- Pozostałe ryzyko: dwie voiced kwestie VN nadal zawierają `draft`/`wersji demo`, bo mają istniejące lokalne audio. Następny pass powinien albo zregenerować audio, albo jawnie odłączyć te konkretne linie od audio przed zmianą tekstu.

Voiced dialogue text polish pass 2026-07-07:
- Audyt przed zmianą: po czyszczeniu UI w katalogu scen VN i ambientu Neury nadal były widoczne kwestie `Nadpisałem draft`, `wersja robocza` i `presja w wersji demo`.
- Poprawiono teksty na język `szkicu` i bezpiecznego bufora, a linie VN bez nowego nagrania nie mają już `audioId`; cutscenka pokazuje dla nich fabularny status `Cisza w kadrze`.
- `CutsceneStage` i starszy `StorySceneOverlay` obsługują teraz tekstowe kwestie bez próby odtworzenia brakującego albo niezgodnego audio.
- Legacy komentarze Neury dostały nowe identyfikatory `comment-szkic-dla-pawla` i `comment-early-sketch-contained`, żeby nie odtwarzać starych plików głosowych z nowym tekstem.
- Generator `scripts/generate-neura-voices.ts` pomija tekstowe kwestie VN bez `audioId`, dopóki nie dostaną docelowego nagrania.
- Dodano regresję `scripts/story-scenes.dev-test.ts`, która blokuje powrót `Nadpisałem draft`, `wersji demo`, `wersja robocza` i `wersję roboczą` do scen VN.
- Weryfikacja: smoke tekstowy nie znajduje już tych fraz w danych dialogowych poza technicznymi nazwami eventów/testów; `npm run test:story-scenes`, `npm test`, `npm run build` i `npm run test:e2e` (7/7) przechodzą.

Cutscene silence status polish 2026-07-07:
- Audyt przed zmianą: tekstowe kwestie VN i błędy odtworzenia audio używały technicznych statusów `Tekst sceny` / `Audio niedostępne`, co brzmiało jak warstwa developerska.
- `CutsceneStage` i legacy `StorySceneOverlay` pokazują teraz wspólny status `Cisza w kadrze` dla kwestii bez głosu oraz dla fallbacku audio.
- Komunikat starego playera publikacji został przepisany na język archiwum: `Pulpit pamięta wynik, ale nie ma już odsłuchu`.
- E2E pełnego repertuaru sprawdza po pierwszym remixie, że tekstowa kwestia pokazuje `Cisza w kadrze` i nie pokazuje `Audio niedostępne` ani `Tekst sceny`.
- Weryfikacja: `npm run test:e2e` (7/7), `npm test`, `npm run build` przechodzą; smoke `rg` pokazuje techniczne statusy tylko w asercjach testowych i historii dokumentacji.

Player-facing tool labels pass 2026-07-07:
- Audyt przed zmianą: normalny pulpit pokazywał `Beatmap Editor`, szuflada nazywała się `Ustno.ai Me`, a ekran próby miał widoczny przycisk `Rhythm debug`.
- Przepisano publiczne etykiety na język świata: `Beatmap Editor` -> `Strojenie rytmu`, `Ustno.ai Me` -> `Ustno.ai Szkice`, ikona szuflady `ME` -> `SZK`, adres szuflady `anh://www.ustno.ai/szkice`.
- Usunięto widoczny przycisk `Rhythm debug` z HUD próby; panel pomiarowy nadal istnieje pod skrótami F8/F9, ale pokazuje się jako `Pomiary rytmu`.
- Zaktualizowano bieżące `DEV_NOTES.md`, żeby workflow edytora i nazwa szuflady nie przywracały dawnych etykiet.
- E2E pilnuje, że desktop nie pokazuje `Beatmap Editor`/`Ustno.ai Me`, a ekran rytmu nie pokazuje `Rhythm debug`.
- Weryfikacja: smoke `rg` znajduje stare widoczne nazwy tylko w asercjach regresyjnych; `npm run test:e2e` (7/7), `npm test` i `npm run build` przechodzą.

Rhythm language polish pass 2026-07-07:
- Audyt przed zmianą: ekran próby, raport wyników i webowe `Strojenie rytmu` nadal pokazywały język scoringu jak narzędzie developerskie: `Perfect/Great/Good/Miss`, `combo`, `max combo`, `mnożnik`, `puste kliknięcia`, `nuty` i `progres tieru`.
- Przepisano publiczne etykiety rytmu na język świata: seria, wzmocnienie serii, czyste/pewne/złapane wejścia, rozjazdy, nerwowe wejścia, sygnały i ślad jakości. Logika scoringu i techniczne uniony pozostały bez zmian.
- Przycisk szuflady `Remix` został zastąpiony przez `Popraw szkic`, a porównanie próby mówi teraz `Porównanie szkicu`.
- Ukryty panel Neury nie pokazuje już tytułu `Neura debug`; widoczny nagłówek to `Panel Neury`, a ostatni event jest opisany jako impuls.
- Rozszerzono e2e mobile rhythm/results o regresję zakazującą powrotu dawnych angielskich i roboczych etykiet w raporcie wyniku.
- Zaktualizowano bieżący kontrakt w `DEV_NOTES.md`, żeby dokumentacja nie przywracała starych nazw szuflady, jakości publikacji ani języka scoringu.
- Weryfikacja: `npm run test:e2e` (7/7), `npm test` i `npm run build` przechodzą.

System/editor naming polish pass 2026-07-07:
- Audyt przed zmianą: słowniki UI nadal trzymały `Event / Dialogi fabularne`, `Lab / Ukryte` i diagnostyczny opis ukrytych kanałów, a webowe `Strojenie rytmu` pokazywało `Edit Mode`, `Test Mode`, `Play`, `Audio`, `Schowek`, `Backup localStorage`, `Import manualBeatmaps` i `Eksport + backup`.
- Przepisano nazwy systemowych kanałów na język świata: `Echo Występu`, `Kanał serwisowy`, `Archiwum ciszy`, `Ślepa transmisja` oraz fabularny opis wyciszonego kanału.
- Edytor strojenia dostał spójne polskie etykiety: `Układanie`, `Próba`, `Odtwórz`, `Katalog`, `Sygnały`, `Kopia`, `Podkład`, `Wczytaj katalog rytmu`, `Pobierz katalog rytmu`, `Zapisz katalog`, `Kopia lokalna`.
- Lista skrótów i komunikaty edytora mówią teraz o odtwarzaniu, kopii i sygnałach zamiast o `play`, schowku i nutach.
- Dodano e2e `świat gry: strojenie rytmu nie pokazuje surowych etykiet edytora`, które otwiera edytor z pulpitu i blokuje powrót dawnych etykiet.
- Weryfikacja: `npm run test:e2e` (8/8), `npm test` i `npm run build` przechodzą.

Mobile editor feel pass 2026-07-07:
- Audyt przed zmianą: regresje mobile obejmowały pulpit, Ustniki, próbę rytmiczną i wyniki, ale nie `Strojenie rytmu`; edytor dalej miał drobne surowe podpisy `Reset czasu/testu`, `Instrumental`, `Vocal`, `off`, komunikaty `Import/Eksport/backup` oraz część tekstów o nutach zamiast sygnałach.
- Przepisano widoczne copy edytora na `Wróć na początek próby`, `Siatka rytmu`, `bez siatki`, `Podkład`, `Wokal`, `Katalog gotowy`, `Można wczytać katalog rytmu`, `Kopiuj sygnały`, `Inspektor sygnału` i komunikaty kopii lokalnej.
- Rozszerzono Playwright o `responsive: mobile otwiera strojenie rytmu bez poziomego overflow`; test otwiera edytor na 390x844, sprawdza reset scrolla, brak poziomego overflow i brak dawnych surowych etykiet.
- Weryfikacja: `npm run test:e2e` (9/9), `npm test` i `npm run build` przechodzą.

VN/EVENTS presentation pass 2026-07-07:
- Audyt przed zmianą: screenshot bootowej cutscenki ujawnił surowe etykiety tonu `tired/calm/dry/...`, a finalny `EVENTS` pokazywał techniczne `events.echo.after-publish`, `ending:` oraz raw trasy zakończeń.
- `CutsceneStage` tłumaczy teraz intencje audio na krótkie etykiety świata (`zmęczony głos`, `suchy ton`, `pytanie w kadrze`, `zakłócony sygnał`, `spokojny sygnał`).
- Finalny `EVENTS` pokazuje status `publikacja`, polskie nazwy statystyk i etykietę zakończenia zamiast ID stanu; desktopowy overlay domyka dolną krawędź, żeby webcam nie prześwitywał pod finałem.
- Mobilny finał dostał kompaktowy układ: kanał, główny komunikat, decyzje, Neura i `Impuls końcowy` mieszczą się w pierwszym kadrze 390x844 bez poziomego overflow.
- Rozszerzono Playwright o screenshoty `test-results/story-world-smoke/boot-cutscene.png`, `final-events.png`, `mobile-final-events.png` oraz regresje blokujące raw `audioIntent`, `events.*`, raw trasy endingów i mobile overflow finału.
- Weryfikacja w trakcie passu: `npm run test:e2e` (9/9) przechodzi po iteracji CSS i asercji mobilnego finału.

Documentation alignment pass 2026-07-08:
- Audyt przed zmianą: README i `docs/dokumentacja_funkcjonalna_ustnik_2_0.md` nadal opisywały pierwszy szkielet, placeholderowe ekrany, `Ustno.ai Me`, `Beatmap Editor`, `Rhythm debug`, `Event / Dialogi fabularne`, `Ustniki / Challenge`, `todo.tmp`, `draft/remix/demo`, `slaba wersja` i `cudenko` jako aktualny kontrakt.
- README ma teraz sekcję `Aktualny pionowy wycinek gry` z obecnym flow: title.sys, boot, pulpit, Messenger, `Ustno.ai Utwórz`, `Ustno.ai Szkice`, rytm, raport próby, publikacja, player, VN i finalny `EVENTS`.
- Dokumentacja funkcjonalna została zaktualizowana pod obecne nazwy i język świata: szkice zamiast draftów, poprawa szkicu zamiast remixu, `Echo Występu`, `Ustniki / Dziennik prób`, `Plan Występu`, `Pomiary rytmu`, `Strojenie rytmu`, `szkic publiczny` / `lepsza wersja` / `cudeńko`.
- Scan bieżących dokumentów nie znajduje już starych nazw jako aktualnego kontraktu poza historycznym `progress.md` i asercjami regresyjnymi.

Documentation screenshots refresh 2026-07-08:
- Audyt przed zmianą: `docs/screenshots/*.png` były starsze od przebudowy fabuły i pokazywały nieaktualną warstwę UI, a dokumentacja wskazywała jeszcze `07-drawer-draft.png`.
- Dodano `npm run docs:screenshots`, które uruchamia lokalny Vite, przechodzi Playwrightem przez title -> boot -> pulpit -> generator -> rytm -> wynik -> szufladę -> publikację -> player i zapisuje dziewięć kadrów dokumentacyjnych.
- Odświeżono screenshoty dokumentacji zgodnie z obecnym językiem świata, w tym nowy kadr `07-drawer-sketch.png`; opis sekcji pulpitu nie zakłada już niedeterministycznie aktywnej cutscenki w tym samym momencie co Messenger.
- Weryfikacja: `npm run docs:screenshots` przechodzi i zapisuje wszystkie dziewięć kadrów w `docs/screenshots`; reprezentatywne kadry obejrzane ręcznie (`01-title-screen`, `03-desktop-story-messenger`, `05-rhythm-section`, `06-results-story`, `07-drawer-sketch`, `08-publication-chat`, `09-annihilation-player`). `npm run test:e2e` (9/9), `npm test` i `npm run build` przechodzą.
