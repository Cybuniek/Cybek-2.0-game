Original prompt: Stworz minimalny, grywalny szkielet dla prototypu webowego o nazwie "Ustnik 2.0 The Show - The Game".

Postep:
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

Patrol repozytorium 2026-05-12:
- Audyt bez zmian: porównano aktualny kod z `DEV_NOTES.md`, `progress.md` i `ustnik_2_0_the_show_the_game_wizja.md`.
- Kategorie problemów: krytyczne - brak nowych blokad po buildzie; ważne - jednorazowa publikacja oparta głównie o stan z renderu, remix dla niezgodnego/starego poziomu draftu, szuflada powinna komunikować blokadę publikacji; kosmetyczne - drobne niespójności etykiet `Pawła/Pawcia` i `Ustno.ai Ja/Me`; odłożyć - warianty audio zależne od poziomu, większa walidacja save'ów, testy przeglądarkowe.
- Naprawiono mały zakres: dodatkowy guard publikacji wewnątrz `setGameState`, disabled/tekst blokady publikacji w szufladzie dla opublikowanych tytułów, `getNextDifficulty` zwraca `null` dla poziomu spoza listy utworu.
- Weryfikacja przed zmianami: `npm run test:rhythm` przeszedł; `npm run build` przeszedł po uruchomieniu poza sandboxem, bo zwykły sandbox zwrócił odmowę dostępu przy Vite/esbuild.
- Następna mała sesja: uporządkować słownik etykiet UI oraz zdecydować, czy `Annihilation player.exe` ma pozostać zwykłym odtwarzaczem audio, czy wrócić do opisanego wcześniej placeholdera z przyciskiem `Odtwórz`.
