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

Remix dziala tylko z poziomu szuflady. Uruchamia probe na poziomie o +1 wyzszym niz aktualny poziom draftu. Po remixie ekran wynikow pokazuje porownanie obecnego draftu z nowa proba: poprzednia dokladnosc, nowa dokladnosc, roznica i werdykt. Gracz nadal moze nadpisac slabsza wersja, bo nieudany numer moze byc swiadoma decyzja fabularna.

Publikacja jest jednorazowa per `trackId`. Po publikacji draft znika z szuflady, a na pulpicie pojawia sie ikona pliku. Klikniecie ikony otwiera `Annihilation player.exe`.

## Player

`Annihilation player.exe` pokazuje:

- tytul opublikowanego utworu,
- poziom opublikowanej wersji,
- ocene i dokladnosc,
- wersje jakosciowa,
- placeholder odsluchu.

Przycisk `Odtworz` zmienia stan placeholdera na `Odtwarzanie...`. Nie ma jeszcze prawdziwego audio.

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

Accuracy liczy się jako `(perfect + great * 0.85 + good * 0.65) / totalNotes * 100`. Grade jest tierem jakości `F/E/D/C/B/A/S`, wyliczanym z jakości próby, poziomu trudności i mnożnika combo. Próba trwa tyle, ile bazowy plik audio; jeśli metadane audio nie są jeszcze dostępne, runtime używa estymacji z BPM i liczby beatów tylko jako fallbacku.

Beatmapy są na razie deterministycznie generowane z seedów w `src/data/tracks.ts`. BPM pochodzi z pełnej wersji bazowego utworu, a poziomy trudności nie zmieniają BPM-u, tylko gęstość nut: `Łatwy=0.5`, `Normalny=0.7`, `Cybart=1.0`.

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

- Gra rytmiczna ma ukryty element audio, countdown i synchronizuje nuty względem czasu audio, ale nadal nie ma kalibracji input laga ani edytora beatmap.
- Beatmapy są losowe, ale stabilne dla danego utworu, BPM-u, długości audio, poziomu i seeda.
- Remix kumuluje progres tieru jakości zamiast zaczynać każdą próbę od zera.
- Player opublikowanego utworu odtwarza scalony plik audio. Głos Neury jest osobnym systemem statycznych OGG/Opus z fallbackiem MP3.
- Neura i WebCam Cybka sa prostymi figurami CSS, nie finalnymi assetami.
- Okna mozna przenosic za pasek tytulu; pozycja zyje tylko w stanie sesji Reacta.

## Sugerowane kolejne kroki

1. Podmienic generowane beatmapy na autorskie dane dla prawdziwych utworow.
2. Zrobic wersjonowana migracje save'a, gdy model danych ustabilizuje sie bardziej.
