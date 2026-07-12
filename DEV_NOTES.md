# Ustnik 2.0 The Show - The Game / DEV NOTES

## Struktura projektu

- `src/App.tsx` - glowny przeplyw gry: pulpit, okna, generator, szuflada, poprawa szkicu, publikacja, player i ekran rytmiczny.
- `src/styles.css` - prosty styl OS/CRT/neon/glitch.
- `src/types.ts` - wspolne typy stanu, szkicow, publikacji, wynikow i beatmap rytmicznych.
- `src/rhythm.ts` - deterministyczny generator beatmap wedlug dlugosci audio, stan proby rytmicznej, trafienia, rozjazdy, serie i tier jakosci.
- `src/resonance.ts` - czysta logika rezonansu Neury liczona z accuracy i echoCount, z efektami UI/audio oraz opcjonalnym bonusem serii.
- `src/ending.ts` - czysta logika aktualnej trasy endingowej na podstawie statystyk, echo, rezonansu i wiezi z Neura.
- `src/storage.ts` - localStorage, migracja save'a, statystyki, jakosc publikacji i pomocnicze funkcje flow.
- `src/data/tracks.ts` - lista utworow i ich poziomy trudnosci.
- `src/data/uiLabels.ts` - etykiety UI: nazwy okien, aplikacji, ikon, przyciskow, statystyk, statusow i tekstow fallbackowych.
- `src/data/messages.ts` - startowe wiadomosci czatow.
- `src/data/neuraVoiceLines.ts` - teksty, style i identyfikatory kwestii glosowych Neury.
- `src/data/neuraVoiceAssets.ts` - manifest sciezek MP3 dla kwestii Neury.
- `src/data/chatReactions.ts` - dynamiczne reakcje czatu po wyslaniu szkicu i publikacji.
- `src/audio/useSoundscape.ts` - globalne tlo audio pulpitu: ambient OS, losowe glitche, mute i domyslne poziomy glosnosci.
- `src/audio/useRhythmSfx.ts` - runtime efektow SFX sekcji rytmicznej: tapy, petle holdow, fade overlay i cleanup aktywnych holdow.

## Nowy model flow

Generator `anh://www.ustno.ai/create` sluzy tylko do stworzenia pierwszej wersji utworu na najnizszym dostepnym poziomie. Po zapisaniu, wyslaniu do Pawla albo publikacji tytul trafia do `createdTrackIds` i znika z generatora.

Szuflada `anh://www.ustno.ai/szkice` pokazuje stworzone, nieopublikowane szkice. Szkic ma aktualny poziom, najlepszy wynik i status:

- `inDrawer` - szkic jest w szufladzie.
- `sentToPawel` - szkic zostal wyslany do Pawla, ale nadal mozna go opublikowac lub poprawiac.

Poprawa szkicu dziala tylko z poziomu szuflady. Uruchamia probe na poziomie o +1 wyzszym niz aktualny poziom szkicu. Jesli stary albo recznie zmieniony save zawiera poziom spoza listy poziomow danego utworu, aplikacja nie przeskakuje do pierwszego poziomu, tylko blokuje kolejna poprawke. Po probie ekran wynikow pokazuje porownanie obecnego szkicu z nowa proba: poprzednia zgodnosc z rytmem, nowa zgodnosc, roznica i werdykt. Gracz nadal moze nadpisac slabsza wersja, bo wersja do poprawy moze byc swiadoma decyzja fabularna.

Publikacja jest jednorazowa per `trackId`. Po publikacji szkic znika z szuflady, a na pulpicie pojawia sie ikona pliku. Klikniecie ikony otwiera `Annihilation player.exe`.

Szuflada dodatkowo blokuje przycisk publikacji dla tytulu, ktory w zapisie jest juz oznaczony jako opublikowany. Sama funkcja publikacji sprawdza to ponownie wewnatrz aktualizacji stanu, zeby szybkie podwojne klikniecie nie dopisalo drugi raz reakcji czatu.

## Player

`Annihilation player.exe` pokazuje:

- tytul opublikowanego utworu,
- poziom opublikowanej wersji,
- ocene i dokladnosc,
- wersje jakosciowa,
- realny odtwarzacz scalonego pliku audio.

Jesli stary save wskazuje opublikowany utwor, ktorego nie ma juz w `src/data/tracks.ts`, player nadal pokazuje metadane publikacji i jasny komunikat o braku pasujacego audio zamiast znikac.

## Glos Neury

Neura ma osobny workflow glosowy oparty o statyczne pliki audio w `public/audio/neura`. Format podstawowy to OGG/Opus dla mniejszych plikow mowy, a fallbackiem jest MP3 dla kompatybilnosci. Aplikacja nie wywoluje ElevenLabs z przegladarki i nie zna klucza API. Pierwsze automatyczne odtworzenie komentarza jest ignorowane do czasu interakcji uzytkownika, zeby respektowac polityke autoplay przegladarki. Po kliknieciu Neury kolejne komentarze moga byc odtwarzane automatycznie. Odtwarzacz ma jeden aktywny glos i jeden slot kolejki dla komentarza systemowego. Reakcje wyzwalane przez gracza nie sa kolejkowane; jesli w danej chwili gra inna kwestia, kliknieta reakcja zostaje pominieta.

Zrodlem prawdy dla kwestii jest `src/data/neuraVoiceLines.ts`. Nowa kwestia wymaga:

- dodania stabilnego `id`,
- wpisania tekstu po polsku bez prefiksu mowcy, np. bez `Neura:`; UI tez pokazuje sama kwestie,
- dobrania `styleTag` zgodnego z ElevenLabs V3,
- ustawienia `trigger` na `comment` albo `reaction`.

Manifest `src/data/neuraVoiceAssets.ts` mapuje kazde `id` na podstawowe `/audio/neura/<id>.ogg` i fallbackowe `/audio/neura/<id>.mp3`. Brak pliku nie blokuje UI; odtwarzanie po prostu konczy sie bez widocznego bledu, a tekst kwestii bez dostepnego audio nie jest pokazywany jako osobny dymek.

`src/neura/NeuraVoiceDirector.ts` jest pierwszym data-driven routerem narracyjnego glosu Neury. Eventy gry nie odtwarzaja audio bezposrednio: emituja event fabularny, director aktualizuje kolejke i wybiera nastepna linie. Runtime odpala eventy dla startu sesji, zapisu szkicu, wysylki do Pawla, publikacji oraz spike'a glitcha przy wysokiej presji czatu. Dodatkowy story beat pulpitu probuje dobrac ambient tylko wtedy, gdy kolejka jest pusta i cooldown pozwala. Stan directora zapisuje sie przez `src/neura/neuraVoiceDirectorStorage.ts`, a `render_game_to_text` pokazuje aktywna linie, kolejke, odblokowane paczki i diagnostyke odrzuconych kandydatow.

Nowe data-driven dialogi mieszkaja w `src/data/dialogue/neuraVoiceLines.ts`. Ich `audio.id` moze wskazywac osobny plik `/audio/neura/<audio.id>.ogg`, niezaleznie od starego manifestu kompatybilnosci dla `NeuraPet`. Generator `scripts/generate-neura-voices.ts` obsluguje nowe zrodlo przez `--source dialogue-v2`, filtr fazy przez `--phase` i start od konkretnego id przez `--from-id`.

Checkpoint 2026-07-07: wczesny ambient Neury w `neuraVoiceLinesV2` zostal przepiety na istniejace lokalne assety audio z `src/data/neuraVoiceLines.ts`, zeby tekst w UI nie rozjezdzal sie ze statycznym glosem. Nie zmieniaj samego tekstu linii korzystajacych z lokalnego `audio.id`, jesli nie generujesz odpowiadajacego mu nowego OGG/MP3. `scripts/neura-voice-director.dev-test.ts` pilnuje zgodnosci glownego szlaku ambientowego i blokuje powrot oderwanych zartow technicznych do pierwszego odbioru gry.

Niepomijalne sceny Cybek/Neura mieszkaja w `src/data/dialogue/storyScenes.ts`, a ich kolejka i jednorazowe checkpointy w `src/neura/StorySceneDirector.ts`. Sa to pelne sceny overlayowe, nie ambientowe komentarze: blokuja UI, przechodza kliknieciem po zakonczonym audio albo po wyswietleniu tekstowej kwestii i zapisuje sie je w `localStorage` pod `ustnik.storyScenes.v1`. Audio scen lezy w `/audio/story-scenes/<audioId>.ogg` z fallbackiem MP3; `audioId` jest opcjonalne dla kwestii poprawionych tekstowo, ktore czekaja na nowe nagranie. Pierwsza petla fabularna obejmuje boot, pierwsze wykonanie, pierwszy nadpisany szkic, wysylke do Pawla i publikacje na czacie. Sceny udostepnienia sa jednorazowe per utwor i kanal: osobno Pawel, osobno czat glowny.

Checkpoint 2026-06-01/2026-07-07: sceny fabularne dzialaja tez w trybie tekstowym. Jesli OGG/MP3 jest niedostepne, przegladarka blokuje autoplay albo kwestia nie ma jeszcze `audioId`, overlay pokazuje fabularny status `Cisza w kadrze` i odblokowuje `Dalej`. Nie generujemy w tym kroku nowych glosow przez ElevenLabs; zamiast tego nie przypinamy nowych tekstow do starych plikow audio.

Checkpoint 2026-06-07: runtime scen fabularnych uzywa teraz `src/neura/cutscene/CutsceneStage.tsx` zamiast `StorySceneOverlay`. Rezyser scen, kolejka, dane dialogow i zapis `ustnik.storyScenes.v1` zostaja bez zmian. Stage renderuje układ Visual Novel: Cybek jest skladany przez `CybekWebcam`, a portret Neury laduje manifest ekspresji z `public/pets/neura/cutscene/<expression>/manifest.json` i strip `strip.png`. Legacy `public/pets/neura/neura-miny.png` zostaje materialem zrodlowym workflow assetow, ale nie jest juz runtime'owym portretem cutscenek.

Checkpoint 2026-07-07: VN nie pokazuje juz surowych `audioIntent` typu `calm`, `dry`, `tired`, `curious` ani `glitch`. `CutsceneStage` tlumaczy je na krotkie etykiety kadru (`spokojny sygnal`, `suchy ton`, `zmeczony glos`, `pytanie w kadrze`, `zaklocony sygnal`), bo te wartosci sa sterowaniem assetow i glosu, nie tekstem dla gracza. Regresja Playwright w bootowej cutscence blokuje powrot surowych etykiet.

Mapowanie `audioIntent` mieszka w `src/neura/cutscene/expressionMapping.ts`: `calm/brak`, `curious`, `tired`, `dry`, `glitch` ida na odpowiadajace ekspresje Neury, a przyszle `success` mapuje sie na `delighted`. `scripts/cutscene-assets.dev-test.ts` waliduje kontrakt manifestow, znane ekspresje oraz wymiary PNG bez zaleznosci od Pythona/PIL.

Dialogi moga byc teraz warunkowane przez `minEchoCount`, `minResonanceLevel`, `bondWithNeura` i `endingRoute`. Echo po publikacji doklada do kolejki linie, w ktorych Neura powtarza fragment decyzji gracza, a rezonans pozwala odblokowac kwestie zalezne od aktualnej wiezi.

## Echo, Resonance i EVENTS 2026-05-26

Echo zapisuje sie w `GameState.echo`. Zawiera `echoCount`, ostatnia fraze decyzji, krotka liste `EchoMessage` i opcjonalne `activeCutsceneId`. Publikacja utworu przechodzi przez `triggerEchoAfterPublish()` w `src/gameFlow.ts`, ktore zwieksza echo i zapisuje fraze publikacji jako impuls fabularny.

Rezonans siedzi w `src/resonance.ts`. `calculateResonance(accuracy, echoCount)` wylicza poziom `silent/low/medium/high/overload`, `updateResonanceState()` zapisuje wynik oraz `bondWithNeura`, a `applyResonanceEffects()` lagodnie wzmacnia statystyke Cybarta. Efekty wizualne rezonansu sa przechowywane w stanie jako `ResonanceVisualEffects`: bloom, glitch intensity, ui highlight, timer scale i opcjonalny `comboBonus` dla sekcji rytmicznej.

Ending jest logiczny, bez cinematic assetow. `src/ending.ts` wylicza trase `quietArchive/neuraBond/publicSpiral/offlineBreak` na podstawie `performance`, `chatPressure`, `cybart`, `echoCount`, `resonance` i `bondWithNeura`. `GameState.ending` trzyma aktualna trase, etykiete oraz prosty rozklad wplywow do debugowania.

Checkpoint 2026-07-07: finalny `EVENTS` nie pokazuje juz technicznych identyfikatorow `events.*` ani raw tras `quietArchive/neuraBond/publicSpiral/offlineBreak`. Runtime mapuje je na krotki status kanalu i etykiete endingowa. Na desktopie scena domyka dolna krawedz viewportu, zeby webcam nie przebijal pod finalem; na mobile 390x844 `Wystep domkniety`, decyzje, panel Neury i `Impuls koncowy` mieszcza sie w pierwszym kadrze bez poziomego overflow.

`EVENTS` nie jest juz normalna ikona pulpitu. Zamiast tego `EventCutsceneStage` w `src/App.tsx` renderuje kontrolowana makiete pulpitu pod cutscenki, gdy `echo.activeCutsceneId` jest aktywne. Stage pokazuje echo tekstowe, podswietlone decyzje, status Neury i aktualna trase endingowa. To narzedzie narracyjne, nie osobna aplikacja gracza.

## Decyzje porzadkowe

Checkpoint 2026-06-23: usunieto prowadzony panel Neury oraz jego test developerski. Pierwszy obieg gracza ma docelowo przejac jedna petla cutscenek: start gry, pierwsze stworzenie piosenki, pierwsza poprawa szkicu, pierwsze wyslanie do Pawla i pierwsza publikacja na czacie. Nie wracamy do osobnego overlayu prowadzacego.

Checkpoint 2026-07-04: prowadzenie gracza przez fabule jest liczone z `src/data/dialogue/mainStory.ts`. Plik opisuje beaty od bootu, przez pierwszy utwor, poprawę szkicu, bufor Pawla, pierwsza publikacje, domkniecie repertuaru i most finalowy. Panel `Plan Wystepu` oraz `render_game_to_text.mainStory` korzystaja z tego samego stanu, wiec UI, testy i diagnostyka nie rozjezdzaja sie z katalogiem cutscenek. `story.final.ready` jest tylko mostem pod pozniejszy final, nie implementacja pelnych endingow.

Checkpoint 2026-07-07: mobile pulpit traktuje webcam jak element przeplywu, nie fixed overlay. Na waskich viewportach kamera laduje pod ikonami, core loop i okna ida dalej w pionie, a `Ustniki` renderuja jednoslupkowe karty. Nie przywracaj fixed webcam na mobile bez testu klikniecia ikon, bo poprzednio blokowal wejscie do `Ustniki`. Regresja siedzi w `tests/example.spec.ts` jako mobile 390x844 + brak poziomego overflow.

Generowanie glosow:

- utworz lokalny `.env.local` na podstawie `.env.example`,
- ustaw `ELEVENLABS_API_KEY`,
- ustaw `ELEVENLABS_NEURA_VOICE_ID` dla Neury i `ELEVENLABS_CYBEK_VOICE_ID` dla tymczasowego glosu Cybka,
- uruchom `npm run voice:neura:dry-run`, zeby zobaczyc plan dla OGG/Opus,
- uruchom `npm run voice:neura`, zeby wygenerowac brakujace pliki OGG/Opus,
- uzyj `npm run voice:neura:force`, zeby nadpisac OGG/Opus,
- uzyj `npm run voice:neura:with-fallback`, jesli swiadomie chcesz wygenerowac OGG/Opus i MP3,
- uzyj `npm run voice:story-scenes:dry-run`, zeby sprawdzic pelny plan scen Cybek/Neura,
- uzyj `npm run voice:story-scenes:with-fallback`, zeby wygenerowac pelne udzwiekowienie scen do `public/audio/story-scenes`,
- uzyj `node --experimental-strip-types scripts/generate-neura-voices.ts --force --with-fallback`, jesli chcesz odswiezyc komplet OGG/Opus i MP3 fallbackow,
- uzyj `npm run voice:neura:mp3`, jesli chcesz dogenerowac tylko fallback MP3,
- opcjonalnie uruchom `node --experimental-strip-types scripts/generate-neura-voices.ts --only <id>`.

Skrypt uzywa `voice_id` dobranego po speakerze, `model_id: eleven_v3`, `language_code: pl`, `output_format=opus_48000_32` dla OGG/Opus, `output_format=mp3_44100_128` dla fallbacku i kreatywnego profilu `voice_settings`. Legacy `ELEVENLABS_VOICE_ID` jest tylko opcjonalnym fallbackiem dla Neury; nowy workflow go nie wymaga. Klucza API nie wolno commitowac; `.env.local` jest ignorowany przez git. Klucz wklejony poza repo warto obrocic w panelu ElevenLabs.

## Soundscape pulpitu

Systemowe tlo audio siedzi w `src/audio/useSoundscape.ts`, a assety w `public/audio/bgs`. `BGS-ambientOS.mp3` jest preloadowany, zapetlony i startuje dopiero po pierwszej interakcji uzytkownika, z domyslna glosnoscia `0.6`. Konfiguracja ma tez `musicDefaultVolume: 0.8`, zeby przyszle utwory gameplayowe byly naturalnie wyzej niz ambient.

Glitche sa losowane z `BGS-glitch_a.mp3` - `BGS-glitch_e.mp3`. Scheduler odpala je co 4-12 sekund po odblokowaniu audio, z fade in, krotkim szczytem i fade out. Limit aktywnych glitchy to 2, a `triggerGlitch()` jest zwracany z hooka do pozniejszego podpinania eventow fabularnych albo UI. Mute jest globalny, zapisuje sie w `localStorage`, pauzuje ambient i czysci aktywne glitche.

## Sekcja rytmiczna

Ekran rytmiczny ma cztery tory na klawiszach `S`, `D`, `K`, `L`. Sygnały spadają do linii trafienia, a wynik jest liczony z wejść gracza. W UI kategorie są pokazane jako `czyste wejścia`, `pewne wejścia`, `złapane wejścia` i `rozjazdy`; techniczne identyfikatory scoringu zostają w kodzie jako:

- `perfect` - trafienie do 45 ms,
- `great` - trafienie do 85 ms,
- `good` - trafienie do 130 ms,
- `miss` - nuta pominięta ponad 170 ms po czasie trafienia.

Obsługiwane typy nut:

- `tap` - pojedyncze trafienie, także domyślny typ dla starszych beatmap bez pola `kind`,
- `hold` - trafienie początku i trzymanie klawisza do końca `durationMs`,
- `smash` - trafienie początku i mash tego samego klawisza do osiągnięcia `requiredPresses`.

Efekty trafien sekcji rytmicznej sa statycznymi MP3 w `public/audio/sfx/rhythm`, a ich runtime siedzi w `src/audio/useRhythmSfx.ts`. `App.tsx` nie zarzadza juz szczegolami audio, tylko wywoluje kontroler hooka. Tap i puste uderzenie losuja jeden wariant `SE-tap_note-keyboard_typing00..07.mp3`. Hold uruchamia dwie petle: `SE-hold_loop-keyboard_typing.mp3` i `SE-hold_loop-overlay_effect.mp3`. Gdy koniec holda minie linie trafienia, overlay schodzi fadeoutem, a warstwa keyboard typing zostaje aktywna do faktycznego puszczenia klawisza.

Accuracy liczy się jako `(perfect + great * 0.85 + good * 0.65) / totalNotes * 100`. Grade jest tierem jakości `F/E/D/C/B/A/S`, wyliczanym z jakości próby, poziomu trudności i wzmocnienia serii. Próba trwa tyle, ile bazowy plik audio; jeśli metadane audio nie są jeszcze dostępne, runtime używa estymacji z BPM i liczby beatów tylko jako fallbacku.

Przy aktywnym rezonansie `getRhythmSummary(session, resonanceEffects)` moze dostac opcjonalny `comboBonus`. Runtime przekazuje aktualne efekty z `GameState.resonance`, a czysta logika pozostaje testowalna bez Reacta.

Beatmapy mogą być ręczne albo generowane. Runtime najpierw próbuje wczytać mapę z `src/data/manualBeatmaps.json`, a jeśli jej brakuje albo nie przechodzi walidacji, używa deterministycznego generatora z seedów w `src/data/tracks.ts`. Format ręczny `schemaVersion: 2` obsługuje `sourceStartMs` i `sourceEndMs` per poziom trudności. Nuty są liczone od początku wycinka, więc `timeMs: 0` oznacza `sourceStartMs` w pliku audio. Stare mapy bez jawnego zakresu nie mogą przypadkiem skrócić utworu samym `durationMs`; runtime migruje je do pełnego czasu audio. BPM pochodzi z pełnej wersji bazowego utworu, a poziomy trudności nie zmieniają BPM-u, tylko gęstość nut: `Łatwy=0.5`, `Normalny=0.7`, `Cybart=1.0`.

`RhythmSectionEditor` jest narzędziem developerskim WinUI. Obsługuje zakres start/koniec z playhead, puste mapy z przyciskiem generowania bazy, backupy eksportu w `backups/manualBeatmaps`, blokadę eksportu przy poważnych problemach, prosty playtest `S/D/K/L` oraz formularz importu istniejących plików audio do katalogu gry i `src/data/tracks.ts`.

Webowe `Strojenie rytmu` jest traktowane jako docelowy codzienny workflow edycji beatmap, bo działa w tej samej aplikacji co runtime gry. Aktualny zakres:

- wybór utworu i poziomu trudności,
- edycja, przeciąganie, usuwanie i inspekcja nut `tap/hold`,
- nagrywanie nut z klawiatury podczas playbacku,
- tryb `Próba` z tym samym wejściem `S/D/K/L`, którego używa ekran rytmiczny,
- undo/redo, multi-select, kopiowanie/wklejanie nut oraz przesuwanie zaznaczenia skrótami,
- snap do siatki BPM (`off`, `1/4`, `1/8`, `1/16`, `1/32`) przy klikaniu, przeciąganiu, resize, paste i nudge,
- edycja BPM per mapa; BPM wpływa na snap, metronom i siatkę, ale nie przesuwa istniejących nut zapisanych w milisekundach,
- ruchoma siatka BPM renderowana z czasu mapy, więc płynie razem z nutami zamiast być statycznym tłem,
- przewijanie czasu mapy kółkiem myszy po planszy edytora, tylko gdy playback jest zatrzymany,
- osobne ścieżki audio instrumental/vocal z suwakami głośności i głównym suwakiem miksu,
- per-mapa `inputOffsetMs`, czyli kalibracja wejścia stosowana w ocenie trafień bez przesuwania audio ani wizualizacji,
- markery edytorskie na timeline, zapisywane w `manualBeatmaps.json`, ale ignorowane przez gameplay,
- prosty metronom ćwierćnutowy działający tylko podczas playbacku w edytorze,
- walidacja przed eksportem z błędami blokującymi i ostrzeżeniami dla duplikatów, kolizji, ekstremalnego offsetu oraz markerów poza mapą,
- import pełnego `manualBeatmaps.json`,
- eksport pełnego katalogu jako `manualBeatmaps.json`,
- backup eksportu w `localStorage` i przywracanie backupu z poziomu UI.
- guard niezapisanych zmian: po edycji nuty zmiana utworu/poziomu, import i powrot do pulpitu wymagaja najpierw `Zapisz katalog` albo `Porzuc zmiany`.
- widoczna lista skrótów generowana z `src/editor/beatmapEditorKeybinds.ts`.

Widoczne etykiety webowego strojenia nie używają już surowych nazw `Edit Mode`, `Test Mode`, `Play`, `Audio`, `Schowek`, `Backup localStorage`, `Import manualBeatmaps` ani `Eksport + backup`. Bieżący język UI to `Układanie`, `Próba`, `Odtwórz`, `Siatka rytmu`, `Podkład`, `Wokal`, `Kopia`, `Kopia lokalna`, `Wczytaj katalog rytmu`, `Pobierz katalog rytmu` i `Zapisz katalog`. Playwright sprawdza zarówno desktop, jak i mobile 390x844 bez poziomego overflow.

Widok nut w edytorze powinien być odniesieniem do właściwej gry, nie osobną wizualizacją. Dlatego tory są renderowane jako cztery osobne kolumny, nuty używają tej samej bazowej klasy `.note` co runtime i mają pełną szerokość toru, a domyślne okno czasu przy `zoom x1` wynika z gameplayowego `travelMs` danego poziomu trudności. Suwak `Zoom` zawęża albo rozszerza okno czasu, ale nie rozciąga DOM-u pionowo.

Nagrywanie klawiaturą podczas playbacku działa tak:

- zwykłe `S/D/K/L` tworzy widoczny `tap` od razu przy naciśnięciu,
- przytrzymany klawisz po progu holda aktualizuje tę samą nutę do `hold` jeszcze przed puszczeniem klawisza,
- puszczenie klawisza ustala finalną długość `hold`,
- szybkie `Tap Tap` pozostaje dwoma tapami,
- `Shift+S/D/K/L` służy do świadomego nagrywania/rozszerzania `smash`, bez zgadywania na podstawie zwykłych szybkich tapów.

Praktyczny workflow developerski:

1. Otwórz `Strojenie rytmu` w webowej aplikacji.
2. Jeśli zaczynasz od pliku z dysku, użyj `Wczytaj katalog rytmu`.
3. Edytuj mapę dla wybranego utworu i poziomu.
4. Jeśli układasz ręcznie, ustaw BPM mapy, włącz snap i opcjonalny metronom; jeśli mapa nie trafia w audio, skoryguj `Offset wejścia ms`.
5. Do większych refrenów użyj multi-select, `Ctrl+C` / `Ctrl+V`, markerów i nudge `,` / `.`.
6. Użyj `Zapisz katalog`; przeglądarka pobierze pełny `manualBeatmaps.json`, a kopia trafi do `localStorage`.
7. Podmień `src/data/manualBeatmaps.json` pobranym plikiem dopiero po sprawdzeniu mapy.
8. Jeśli edycja poszła w złą stronę, użyj undo/redo albo wybierz backup z listy i użyj `Przywróć`, potem ponownie wykonaj eksport.
9. Jeśli chcesz zmienić utwór albo poziom bez zapisywania bieżących zmian, użyj `Porzuć zmiany`.

Audyt 2026-05-25: po analizie YunYunEditor przejęto lekkie wzorce workflow, ale bez migracji na Svelte, ZIP paczki, waveform albo pełną tempo mapę. Nadal ręcznie podmieniamy pobrany `manualBeatmaps.json` w repo, żeby webowa wersja gry nie udawała dostępu do systemu plików i nie nadpisywała danych bez kontroli.

## Jakosc wersji i reakcje czatu

Jakosc tieru jest liczona w `src/rhythm.ts` i kumulowana w `src/storage.ts` na podstawie poprzedniego stanu szkicu, wyniku podejścia, poziomu trudności oraz serii. Tekstowa jakosc publikacji w `getPublishedQuality` jest teraz pochodną tieru:

- `F/E/D`: `szkic publiczny`,
- `C/B`: `lepsza wersja`,
- `A/S`: `cudeńko`.

Jakosc jest widoczna w playerze i w wiadomosci publikacji na czacie glownym. Po publikacji `groupPublishMessages` w `src/data/chatReactions.ts` dodaje tez reakcje czatu zalezne od jakosci pliku i zgodnosci wykonania z rytmem. Slabszy wynik nie blokuje historii, tylko zmienia ton komentarzy.

## Zapis stanu

Stan jest zapisywany w localStorage pod kluczem `ustnik-2-state`. Save ma `saveVersion: 1`.

Zapisywane sa:

- statystyki,
- `echo` - licznik i ostatnie echo decyzji gracza oraz aktywna cutscenka EVENTS,
- `resonance` - poziom rezonansu, wynik, ostatnia accuracy, wiez z Neura i efekty runtime,
- `ending` - aktualna trasa endingowa oraz wplywy decyzyjne,
- `createdTrackIds` - utwory juz stworzone w generatorze,
- `drafts` - techniczna lista szkicow w szufladzie,
- aktualny poziom szkicu,
- najlepszy wynik szkicu,
- `publishedTracks` - opublikowane wersje z poziomem, ocena, dokladnoscia i jakoscia,
- `publishedTrackIds` - blokada jednorazowej publikacji,
- zaktualizowane wiadomosci Pawla,
- zaktualizowane wiadomosci czatu grupowego.

Migracja w `storage.ts` probuje zachowac starsze save'y z poprzedniego modelu `drawer` / `PerformanceResult`.

## Statystyki

Zmiany statystyk sa liczone przez `getStatDelta` w `src/storage.ts` i zaleza od dokladnosci oraz poziomu trudnosci.

- Zapis szkicu lekko podnosi `Presja Czatu`.
- Wyslanie szkicu do Pawla podnosi `Presja Czatu`.
- Publikacja podnosi `Wystep`, `Cybart.exe` i `Presja Czatu`.

Wartosci sa ograniczane do zakresu 0-100 przez `clampStat`.

## Aktualne ograniczenia wersji gry

- Gra rytmiczna ma ukryty element audio, countdown i synchronizuje nuty względem czasu audio, ale nadal nie ma kalibracji input laga.
- Beatmapy generowane są losowe, ale stabilne dla danego utworu, BPM-u, długości audio, poziomu i seeda.
- Poprawa szkicu kumuluje ślad jakości zamiast zaczynać każdą próbę od zera.
- Player opublikowanego utworu odtwarza scalony plik audio. Głos Neury jest osobnym systemem statycznych OGG/Opus z fallbackiem MP3.
- Neura korzysta z atlasu `public/pets/neura/spritesheet.webp` i dziala jako niezalezny, przeciagalny awatar nad pulpitem. WebCam Cybka jest manifestowym rendererem warstwowym opisanym nizej.
- Okna mozna przenosic za pasek tytulu; pozycja zyje tylko w stanie sesji Reacta.

## Testy przegladarkowe checkpointu

`npm run test:e2e` uruchamia lokalny smoke test Playwright na Chromium. Konfiguracja startuje Vite przez `webServer` pod `http://127.0.0.1:5173`, czysci lokalny zapis testowy i sprawdza tytul, boot, pulpit, generator oraz podstawowy stan z `window.render_game_to_text`. Test nie wchodzi na zewnetrzne strony i nie wymaga internetu.

`ref_data/YunYunEditor` zostaje na razie w repo jako material referencyjny do edytora beatmap. Przed merge'em do glownej galezi warto osobno zdecydowac, czy trzymamy pelny import, czy przenosimy go do dokumentacji/linku zewnetrznego, bo jest duzy i nie jest czescia runtime'u gry.

## Cybek WebCam 2026-05-24

WebCam Cybka nie uzywa juz jednego plaskiego spritesheetu w runtime. System laduje katalog animacji z `public/pets/cybek-webcam/<nazwa>/` i sklada obraz z warstw opisanych w `manifest.json`.

Root `public/pets/cybek-webcam/animations.json` wskazuje:

- `defaultAnimation` - domyslna animacja,
- `idleVariants` - warianty bezczynnosci zmieniane cyklicznie,
- `eventMap` - mapowanie zdarzen aplikacji na animacje, np. `rhythm -> work`.

Minimalny katalog animacji ma taka strukture:

```txt
public/pets/cybek-webcam/idle/
  background.png
  cybek.png
  desk-keyboard.png
  hands.png
  crt-fx.png
  frame.png
  manifest.json
```

Kolejnosc warstw w rendererze:

1. `background`
2. `cybek`
3. `desk-keyboard`
4. `hands`
5. `crt-fx`
6. `frame`

Warstwa statyczna jest zwyklym PNG o wymiarze `frameWidth x frameHeight`. Warstwa animowana jest paskiem klatek: szerokosc pliku musi wynosic `frameWidth * frames`, a wysokosc `frameHeight`. Renderer przesuwa pasek klatek przez `transform`, korzystajac z jednej wspolnej klatki dla wszystkich animowanych warstw danego manifestu.

Od migracji kwadratowego webcam z 2026-05-24 runtime assetow uzywamy kontraktu `320x320`. Animowane paski maja `2560x320` przy 8 klatkach, a stare wersje `320x240` sa zachowane w `_legacy` wewnatrz katalogow animacji. Nowe warstwy zostaly wyprowadzone z `public/pets/cybek-webcam/TEMPLATE/`, bez uzywania poprzednich roboczych zrodel jako zrodla.

Przyklad manifestu:

```json
{
  "name": "idle",
  "frameWidth": 320,
  "frameHeight": 320,
  "frames": 8,
  "fps": 8,
  "loop": true,
  "layers": [
    { "id": "background", "file": "background.png", "animated": false },
    { "id": "cybek", "file": "cybek.png", "animated": true },
    { "id": "desk-keyboard", "file": "desk-keyboard.png", "animated": false },
    { "id": "hands", "file": "hands.png", "animated": true, "variant": "normal" },
    { "id": "crt-fx", "file": "crt-fx.png", "animated": true },
    { "id": "frame", "file": "frame.png", "animated": false }
  ]
}
```

Fallbacki sa celowo lagodne: brak `animations.json`, brak manifestu lub niepoprawne wymiary wypisuja ostrzezenie i probuja wrocic do `idle`. Brak pojedynczej warstwy nie wysypuje aplikacji; warstwa jest pomijana, a w oknie webcam pojawia sie maly debug label.

## UI polish 2026-05-17

Zakres byl wizualny i bez zmiany logiki gry. `src/styles.css` ma teraz wspolne zmienne dla neonowych kolorow, paneli, ramek i glow. Tlo pulpitu zostalo przygaszone, ikony maja czytelniejsze podpisy, aktywne okno mocniejszy focus, a prawa kolumna z WebCam/statystykami/Neura mniej zlewa sie z pulpitem.

Sekcja rytmiczna zachowuje te same dane i input, ale ma mocniejsza linie trafienia, wyrazniejszy aktywny tor, bardziej czytelny countdown i dodatkowy feedback wizualny dla czystych, pewnych, złapanych i rozjechanych wejść. Efekty sa ograniczone przez `prefers-reduced-motion`.

Ekran wynikow dostal jasniejsza hierarchie akcji, remix comparison jest bardziej skanowalny, a `Annihilation player.exe` wyglada jak archiwum opublikowanego Wystepu z realnym odtwarzaczem audio. `Strojenie rytmu` ma mocniej widoczny status niezapisanych zmian, panele oddzielone od playfieldu i tory spojne z runtime'em.

## Neura 2.0 2026-05-19

Neura zostala odczepiona od panelu UI. Komponent renderuje tylko klikalny i przeciagalny sprite, ktory lekko patroluje dolna czesc pulpitu i pauzuje patrol po recznym przeciaganiu. Tekst dialogu nie jest stale renderowany; komentarz glosowy zostaje odtworzony dopiero po odblokowaniu audio przez interakcje i tylko wtedy, gdy dla danej kwestii istnieje statyczny plik OGG albo MP3.

Spritesheet Neury zostal podmieniony na poprawiony wariant w `public/pets/neura/spritesheet.webp`. Pelny komplet glosow nalezy odswiezac lokalnym skryptem przez ElevenLabs do OGG/Opus oraz MP3 fallbackow; skrypt wymaga `ELEVENLABS_API_KEY` w srodowisku albo `.env.local`.

## Neura Presence 2026-05-21

Warstwa `tezGdop-PeT` ma teraz osobny, maly system obecnosci Neury. Czysty manager siedzi w `src/neura/NeuraPresenceManager.ts`, a data-driven progi i presety w `src/data/neuraPresence.ts`. Glowne wyjscie to `NeuraPresenceState`: `OperationalPowerLevel` 0-4, intensywnosc glitchy, glebia ambientu, niestabilnosc avatara, autonomia UI, ostatni event, override debugowy i tryb low FX.

Progres obecnosci jest liczony z aktualnego stanu gry: publikacji, szkicow, jakosci, presji czatu, Cybarta i odkrywania tytulow. Czas spedzony w aplikacji sam z siebie nie eskaluje Neury. Eventy typu `rhythmStarted`, `rhythmFinished`, `draftSaved`, `sentToPawel`, `published` i `manualReaction` daja tylko lekki kontekstowy impuls.

`useSoundscape` przyjmuje `presenceState`. Ambient nadal respektuje unlock autoplay i globalny mute, ale jego glosnosc i minimalna zmiana tempa wynikaja z `ambientDepth`. Scheduler glitchy korzysta z `glitchIntensity`: zmienia odstepy, glosnosc i limit aktywnych warstw, z twardym limitem 3.

Awatar zostal wydzielony do `src/neura/NeuraPet.tsx`, a proceduralny ruch do `src/neura/useNeuraAvatarMotion.ts`. Spritesheet nadal jest baza, ale CSS variables dodaja subpixel jitter, ghost frame, przesuniecie kontaktu wzrokowego, glitch slice i opoznienie klatki. `prefers-reduced-motion` oraz Low FX ograniczaja te efekty.

Subtelne eventy srodowiskowe siedza w `src/neura/useEnvironmentalUiEvents.ts`. Dzialaja tylko na pulpicie: moga lekko przesunac aktywne okno, pokazac krotki stary tekst Neury i wyzwolic glitch audio. Nie dzialaja w sekcji rytmicznej, zeby nie psuc inputu.

Panel debugowy Neury otwiera `F10`. Pokazuje power level, tag narracyjny, intensywnosc audio/avatara/UI, aktywne glitche i ostatnie eventy. Pozwala wymusic poziom 0-4 albo wrocic do Auto oraz przelaczyc Low FX. Override debugowy nie jest zapisywany do save'a gry; Low FX zapisuje sie osobnym kluczem `ustnik.neura.lowFxMode`.

## Boot Cybek OS 2026-05-22

Aplikacja startuje teraz od krotkiej sekwencji `Cybek OS v0.7.0`, zanim wejdzie na pulpit albo do `#editor`. Boot jest warstwa klimatu, nie osobnym systemem fabularnym: pokazuje terminalowe kroki `[OK]`, pasek ladowania, logi kernela i logo zbudowane z HTML/CSS bez nowych assetow.

Sekwencja trwa okolo 4.5 sekundy. Po pierwszej sekundzie mozna ja pominac kliknieciem albo dowolnym klawiszem. Developerskie `window.advanceTime(ms)` przyspiesza boot, a `render_game_to_text` podczas bootu zwraca `screen: "boot"`, procent, widoczne kroki i informacje, czy skip jest juz dostepny.

Po merge z `NEURA_fabularne-skrypty` zachowane sa oba systemy Neury: presence/soundscape/UI z gałęzi oraz data-driven `NeuraVoiceDirector`. `NeuraPet` nadal obsluguje stary manifest glosow, ale potrafi tez odtworzyc fabularne `storyVoiceLineId` z plikow `/audio/neura/<id>.ogg` z MP3 jako fallbackiem.

## Patrol repozytorium 2026-05-12

Zakres patrolu byl maly i bez rozszerzania gry. Sprawdzone zostaly: generator `anh://www.ustno.ai/create`, szuflada `anh://www.ustno.ai/szkice`, poprawa szkicu o +1 poziom, jednorazowa publikacja, pliki publikacji na pulpicie, `Annihilation player.exe`, slowniki etykiet oraz zgodnosc typow z aktualna logika.

Naprawione:

- guard publikacji wewnatrz `setGameState`, zeby jednorazowa publikacja nie zalezala tylko od stanu z renderu,
- blokada przycisku publikacji w szufladzie dla tytulow juz opublikowanych,
- bezpieczne `getNextDifficulty`: nie zwraca pierwszego poziomu, gdy szkic ma poziom spoza listy utworu.

Celowo odlozone:

- warianty audio zalezne od poziomu publikacji,
- pelna walidacja i czyszczenie historycznych save'ow,
- wieksze testy przegladarkowe z Playwright.

## Patrol stabilizacyjny 2026-05-17

Zakres patrolu byl sredni, ale bez rozbudowy gry poza istniejace systemy. Priorytetem byly: stabilnosc wersji gry, rytm/beatmapy oraz drobna spojnosc UI.

Naprawione:

- male helpery flow zostaly wydzielone z `src/App.tsx` do `src/gameFlow.ts`, zeby logika szkicow, publikacji i porownania poprawki byla testowalna poza komponentem,
- migracja save'a ma publiczny punkt `migrateSavedState`, a `npm run test:state` pilnuje legacy drawer, `publishedTrackIds`, reveal tytulow i fallbacku tieru,
- `npm run test:rhythm` waliduje teraz takze realny `src/data/manualBeatmaps.json`, zeby reczne mapy nie spadaly po cichu do generatora,
- webowe `Strojenie rytmu` blokuje ryzykowne przejscia przy niezapisanych zmianach,
- player obsluguje stare publikacje bez pasujacego wpisu w `tracks.ts`,
- etykieta szuflady zostala ujednolicona jako `Ustno.ai Szkice`.

## Sugerowane kolejne kroki

1. Podmienic generowane beatmapy na autorskie dane dla prawdziwych utworow.
2. Zrobic wersjonowana migracje save'a, gdy model danych ustabilizuje sie bardziej.
