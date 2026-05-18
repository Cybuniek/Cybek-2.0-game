# Ustnik 2.0 The Show - The Game / DEV NOTES

## Struktura projektu

- `src/App.tsx` - glowny przeplyw prototypu: pulpit, okna, generator, szuflada, remix, publikacja, player i ekran rytmiczny.
- `src/styles.css` - prosty styl OS/CRT/neon/glitch.
- `src/types.ts` - wspolne typy stanu, draftow, publikacji, wynikow i beatmap rytmicznych.
- `src/rhythm.ts` - deterministyczny generator beatmap wedlug dlugosci audio, stan proby rytmicznej, trafienia, missy, combo i tier jakosci.
- `src/storage.ts` - localStorage, migracja save'a, statystyki, jakosc publikacji i pomocnicze funkcje flow.
- `src/data/tracks.ts` - lista utworow i ich poziomy trudnosci.
- `src/data/uiLabels.ts` - etykiety UI: nazwy okien, aplikacji, ikon, przyciskow, statystyk, statusow i placeholderow.
- `src/data/messages.ts` - startowe wiadomosci czatow.
- `src/data/neuraVoiceLines.ts` - teksty, style i identyfikatory kwestii glosowych Neury.
- `src/data/neuraVoiceAssets.ts` - manifest sciezek MP3 dla kwestii Neury.
- `src/data/chatReactions.ts` - dynamiczne reakcje czatu po wyslaniu draftu i publikacji.

## Nowy model flow

Generator `anh://www.ustno.ai/create` sluzy tylko do stworzenia pierwszej wersji utworu na najnizszym dostepnym poziomie. Po zapisaniu, wyslaniu do Pawcia albo publikacji tytul trafia do `createdTrackIds` i znika z generatora.

Szuflada `anh://www.ustno.ai/me` pokazuje stworzone, nieopublikowane drafty. Draft ma aktualny poziom, najlepszy wynik i status:

- `inDrawer` - draft jest w szufladzie.
- `sentToPawel` - draft zostal wyslany do Pawcia, ale nadal mozna go opublikowac lub remiksowac.

Remix dziala tylko z poziomu szuflady. Uruchamia probe na poziomie o +1 wyzszym niz aktualny poziom draftu. Jesli stary albo recznie zmieniony save zawiera poziom spoza listy poziomow danego utworu, aplikacja nie przeskakuje do pierwszego poziomu, tylko blokuje kolejny remix. Po remixie ekran wynikow pokazuje porownanie obecnego draftu z nowa proba: poprzednia dokladnosc, nowa dokladnosc, roznica i werdykt. Gracz nadal moze nadpisac slabsza wersja, bo nieudany numer moze byc swiadoma decyzja fabularna.

Publikacja jest jednorazowa per `trackId`. Po publikacji draft znika z szuflady, a na pulpicie pojawia sie ikona pliku. Klikniecie ikony otwiera `Annihilation player.exe`.

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

Neura ma osobny workflow glosowy oparty o statyczne pliki audio w `public/audio/neura`. Format podstawowy to OGG/Opus dla mniejszych plikow mowy, a fallbackiem jest MP3 dla kompatybilnosci. Aplikacja nie wywoluje ElevenLabs z przegladarki i nie zna klucza API. Pierwsze automatyczne odtworzenie komentarza jest ignorowane do czasu interakcji uzytkownika, zeby respektowac polityke autoplay przegladarki. Po kliknieciu Neury albo przycisku reakcji kolejne komentarze moga byc odtwarzane automatycznie. Odtwarzacz ma jeden aktywny glos i jeden slot kolejki dla komentarza systemowego. Reakcje wyzwalane przez gracza nie sa kolejkowane; jesli w danej chwili gra inna kwestia, kliknieta reakcja zostaje pominieta.

Zrodlem prawdy dla kwestii jest `src/data/neuraVoiceLines.ts`. Nowa kwestia wymaga:

- dodania stabilnego `id`,
- wpisania tekstu po polsku bez prefiksu mowcy, np. bez `Neura:`; UI tez pokazuje sama kwestie,
- dobrania `styleTag` zgodnego z ElevenLabs V3,
- ustawienia `trigger` na `comment` albo `reaction`.

Manifest `src/data/neuraVoiceAssets.ts` mapuje kazde `id` na podstawowe `/audio/neura/<id>.ogg` i fallbackowe `/audio/neura/<id>.mp3`. Brak pliku nie blokuje UI; odtwarzanie po prostu konczy sie bez widocznego bledu.

Generowanie glosow:

- utworz lokalny `.env.local` na podstawie `.env.example`,
- ustaw `ELEVENLABS_API_KEY`,
- uruchom `npm run voice:neura:dry-run`, zeby zobaczyc plan dla OGG/Opus,
- uruchom `npm run voice:neura`, zeby wygenerowac brakujace pliki OGG/Opus,
- uzyj `npm run voice:neura:force`, zeby nadpisac OGG/Opus,
- uzyj `npm run voice:neura:with-fallback`, jesli swiadomie chcesz wygenerowac OGG/Opus i MP3,
- uzyj `npm run voice:neura:mp3`, jesli chcesz dogenerowac tylko fallback MP3,
- opcjonalnie uruchom `node --experimental-strip-types scripts/generate-neura-voices.ts --only <id>`.

Skrypt uzywa `voice_id` Neury, `model_id: eleven_v3`, `language_code: pl`, `output_format=opus_48000_32` dla OGG/Opus, `output_format=mp3_44100_128` dla fallbacku i kreatywnego profilu `voice_settings`. Klucza API nie wolno commitowac; `.env.local` jest ignorowany przez git. Klucz wklejony poza repo warto obrocic w panelu ElevenLabs.

## Sekcja rytmiczna

Ekran rytmiczny ma cztery tory na klawiszach `S`, `D`, `K`, `L`. Nuty spadają do linii trafienia, a wynik jest liczony z wejść gracza:

- `perfect` - trafienie do 45 ms,
- `great` - trafienie do 85 ms,
- `good` - trafienie do 130 ms,
- `miss` - nuta pominięta ponad 170 ms po czasie trafienia.

Obsługiwane typy nut:

- `tap` - pojedyncze trafienie, także domyślny typ dla starszych beatmap bez pola `kind`,
- `hold` - trafienie początku i trzymanie klawisza do końca `durationMs`,
- `smash` - trafienie początku i mash tego samego klawisza do osiągnięcia `requiredPresses`.

Accuracy liczy się jako `(perfect + great * 0.85 + good * 0.65) / totalNotes * 100`. Grade jest tierem jakości `F/E/D/C/B/A/S`, wyliczanym z jakości próby, poziomu trudności i mnożnika combo. Próba trwa tyle, ile bazowy plik audio; jeśli metadane audio nie są jeszcze dostępne, runtime używa estymacji z BPM i liczby beatów tylko jako fallbacku.

Beatmapy mogą być ręczne albo generowane. Runtime najpierw próbuje wczytać mapę z `src/data/manualBeatmaps.json`, a jeśli jej brakuje albo nie przechodzi walidacji, używa deterministycznego generatora z seedów w `src/data/tracks.ts`. Format ręczny `schemaVersion: 2` obsługuje `sourceStartMs` i `sourceEndMs` per poziom trudności. Nuty są liczone od początku wycinka, więc `timeMs: 0` oznacza `sourceStartMs` w pliku audio. Stare mapy bez jawnego zakresu nie mogą przypadkiem skrócić utworu samym `durationMs`; runtime migruje je do pełnego czasu audio. BPM pochodzi z pełnej wersji bazowego utworu, a poziomy trudności nie zmieniają BPM-u, tylko gęstość nut: `Łatwy=0.5`, `Normalny=0.7`, `Cybart=1.0`.

`RhythmSectionEditor` jest narzędziem developerskim WinUI. Obsługuje zakres start/koniec z playhead, puste mapy z przyciskiem generowania bazy, backupy eksportu w `backups/manualBeatmaps`, blokadę eksportu przy poważnych problemach, prosty playtest `S/D/K/L` oraz formularz importu istniejących plików audio do katalogu gry i `src/data/tracks.ts`.

Webowy `Beatmap Editor` jest traktowany jako docelowy codzienny workflow edycji beatmap, bo działa w tej samej aplikacji co runtime gry. Aktualny zakres:

- wybór utworu i poziomu trudności,
- edycja, przeciąganie, usuwanie i inspekcja nut `tap/hold/smash`,
- nagrywanie nut z klawiatury podczas playbacku,
- `Test Mode` z tym samym wejściem `S/D/K/L`, którego używa ekran rytmiczny,
- walidacja przed eksportem,
- import pełnego `manualBeatmaps.json`,
- eksport pełnego katalogu jako `manualBeatmaps.json`,
- backup eksportu w `localStorage` i przywracanie backupu z poziomu UI.
- guard niezapisanych zmian: po edycji nuty zmiana utworu/poziomu, import i powrot do pulpitu wymagaja najpierw `Eksport + backup` albo `Porzuc zmiany`.

Widok nut w edytorze powinien być odniesieniem do właściwej gry, nie osobną wizualizacją. Dlatego tory są renderowane jako cztery osobne kolumny, nuty używają tej samej bazowej klasy `.note` co runtime, a domyślne okno czasu przy `zoom x1` wynika z gameplayowego `travelMs` danego poziomu trudności. Suwak `Zoom` zawęża albo rozszerza okno czasu, ale nie rozciąga DOM-u pionowo.

Nagrywanie klawiaturą podczas playbacku działa tak:

- zwykłe `S/D/K/L` tworzy widoczny `tap` od razu przy naciśnięciu,
- przytrzymany klawisz po progu holda aktualizuje tę samą nutę do `hold` jeszcze przed puszczeniem klawisza,
- puszczenie klawisza ustala finalną długość `hold`,
- szybkie `Tap Tap` pozostaje dwoma tapami,
- `Shift+S/D/K/L` służy do świadomego nagrywania/rozszerzania `smash`, bez zgadywania na podstawie zwykłych szybkich tapów.

Praktyczny workflow developerski:

1. Otwórz `Beatmap Editor` w webowym prototypie.
2. Jeśli zaczynasz od pliku z dysku, użyj `Import manualBeatmaps.json`.
3. Edytuj mapę dla wybranego utworu i poziomu.
4. Użyj `Eksport + backup`; przeglądarka pobierze pełny `manualBeatmaps.json`, a kopia trafi do `localStorage`.
5. Podmień `src/data/manualBeatmaps.json` pobranym plikiem dopiero po sprawdzeniu mapy.
6. Jeśli edycja poszła w złą stronę, wybierz backup z listy i użyj `Przywróć`, potem ponownie wykonaj eksport.
7. Jeśli chcesz zmienić utwór albo poziom bez zapisywania bieżących zmian, użyj `Porzuć zmiany`.

Audyt 2026-05-14: webowy edytor ma już bliższy runtime'owi workflow niż WinUI, ale nadal nie ma części wygód desktopowych: nie kopiuje automatycznie pobranego pliku do repo, nie importuje nowych utworów do `tracks.ts`, nie zapisuje backupów w katalogu `backups/manualBeatmaps` i nie ma osobnej kalibracji input laga. Największe tarcie po tej zmianie to ręczny krok podmiany pobranego `manualBeatmaps.json` w repo; jest celowo ręczny, żeby webowy prototyp nie udawał dostępu do systemu plików i nie nadpisywał danych bez kontroli.

## Jakosc wersji i reakcje czatu

Jakosc tieru jest liczona w `src/rhythm.ts` i kumulowana w `src/storage.ts` na podstawie poprzedniego stanu draftu, wyniku podejścia, poziomu trudności oraz combo. Tekstowa jakosc publikacji w `getPublishedQuality` jest teraz pochodną tieru:

- `F/E/D`: `slaba wersja`,
- `C/B`: `lepsza wersja`,
- `A/S`: `cudenko`.

Jakosc jest widoczna w playerze i w wiadomosci publikacji na czacie glownym. Po publikacji `groupPublishMessages` w `src/data/chatReactions.ts` dodaje tez reakcje czatu zalezne od jakosci pliku i dokladnosci wykonania. Slaby wynik nie blokuje historii, tylko zmienia ton komentarzy.

## Zapis stanu

Stan jest zapisywany w localStorage pod kluczem `ustnik-2-state`. Save ma `saveVersion: 1`.

Zapisywane sa:

- statystyki,
- `createdTrackIds` - utwory juz stworzone w generatorze,
- `drafts` - drafty w szufladzie,
- aktualny poziom draftu,
- najlepszy wynik draftu,
- `publishedTracks` - opublikowane wersje z poziomem, ocena, dokladnoscia i jakoscia,
- `publishedTrackIds` - blokada jednorazowej publikacji,
- zaktualizowane wiadomosci Pawla,
- zaktualizowane wiadomosci czatu grupowego.

Migracja w `storage.ts` probuje zachowac starsze save'y z poprzedniego modelu `drawer` / `PerformanceResult`.

## Statystyki

Zmiany statystyk sa liczone przez `getStatDelta` w `src/storage.ts` i zaleza od dokladnosci oraz poziomu trudnosci.

- Zapis draftu lekko podnosi `Presja Czatu`.
- Wyslanie draftu do Pawcia podnosi `Presja Czatu`.
- Publikacja podnosi `Wystep`, `Cybart.exe` i `Presja Czatu`.

Wartosci sa ograniczane do zakresu 0-100 przez `clampStat`.

## Elementy zastepcze

- Gra rytmiczna ma ukryty element audio, countdown i synchronizuje nuty względem czasu audio, ale nadal nie ma kalibracji input laga.
- Beatmapy generowane są losowe, ale stabilne dla danego utworu, BPM-u, długości audio, poziomu i seeda.
- Remix kumuluje progres tieru jakości zamiast zaczynać każdą próbę od zera.
- Player opublikowanego utworu odtwarza scalony plik audio. Głos Neury jest osobnym systemem statycznych OGG/Opus z fallbackiem MP3.
- Neura i WebCam Cybka sa prostymi figurami CSS, nie finalnymi assetami.
- Okna mozna przenosic za pasek tytulu; pozycja zyje tylko w stanie sesji Reacta.

## UI polish 2026-05-17

Zakres byl wizualny i bez zmiany logiki gry. `src/styles.css` ma teraz wspolne zmienne dla neonowych kolorow, paneli, ramek i glow. Tlo pulpitu zostalo przygaszone, ikony maja czytelniejsze podpisy, aktywne okno mocniejszy focus, a prawa kolumna z WebCam/statystykami/Neura mniej zlewa sie z pulpitem.

Sekcja rytmiczna zachowuje te same dane i input, ale ma mocniejsza linie trafienia, wyrazniejszy aktywny tor, bardziej czytelny countdown i dodatkowy feedback wizualny dla `Perfect/Great/Good/Miss`. Efekty sa ograniczone przez `prefers-reduced-motion`.

Ekran wynikow dostal jasniejsza hierarchie akcji, remix comparison jest bardziej skanowalny, a `Annihilation player.exe` wyglada jak archiwum opublikowanego Wystepu z realnym odtwarzaczem audio. `Beatmap Editor` ma mocniej widoczny status niezapisanych zmian, panele oddzielone od playfieldu i tory spojne z runtime'em.

## Patrol repozytorium 2026-05-12

Zakres patrolu byl maly i bez rozszerzania gry. Sprawdzone zostaly: generator `anh://www.ustno.ai/create`, szuflada `anh://www.ustno.ai/me`, remix +1, jednorazowa publikacja, pliki publikacji na pulpicie, `Annihilation player.exe`, slowniki etykiet oraz zgodnosc typow z aktualna logika.

Naprawione:

- guard publikacji wewnatrz `setGameState`, zeby jednorazowa publikacja nie zalezala tylko od stanu z renderu,
- blokada przycisku publikacji w szufladzie dla tytulow juz opublikowanych,
- bezpieczne `getNextDifficulty`: nie zwraca pierwszego poziomu, gdy draft ma poziom spoza listy utworu.

Celowo odlozone:

- warianty audio zalezne od poziomu publikacji,
- pelna walidacja i czyszczenie historycznych save'ow,
- wieksze testy przegladarkowe z Playwright.

## Patrol stabilizacyjny 2026-05-17

Zakres patrolu byl sredni, ale bez rozbudowy gry poza istniejace systemy. Priorytetem byly: stabilnosc prototypu, rytm/beatmapy oraz drobna spojnosc UI.

Naprawione:

- male helpery flow zostaly wydzielone z `src/App.tsx` do `src/gameFlow.ts`, zeby logika draftow, publikacji i porownania remixu byla testowalna poza komponentem,
- migracja save'a ma publiczny punkt `migrateSavedState`, a `npm run test:state` pilnuje legacy drawer, `publishedTrackIds`, reveal tytulow i fallbacku tieru,
- `npm run test:rhythm` waliduje teraz takze realny `src/data/manualBeatmaps.json`, zeby reczne mapy nie spadaly po cichu do generatora,
- webowy `Beatmap Editor` blokuje ryzykowne przejscia przy niezapisanych zmianach,
- player obsluguje stare publikacje bez pasujacego wpisu w `tracks.ts`,
- etykieta szuflady zostala ujednolicona jako `Ustno.ai Me`.

## Sugerowane kolejne kroki

1. Podmienic generowane beatmapy na autorskie dane dla prawdziwych utworow.
2. Zrobic wersjonowana migracje save'a, gdy model danych ustabilizuje sie bardziej.
