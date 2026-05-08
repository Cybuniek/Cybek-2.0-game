# Ustnik 2.0 The Show - The Game / DEV NOTES

## Struktura projektu

- `src/App.tsx` - glowny przeplyw prototypu: pulpit, okna, generator, szuflada, remix, publikacja, player i placeholder rytmiczny.
- `src/styles.css` - prosty styl OS/CRT/neon/glitch.
- `src/types.ts` - wspolne typy stanu, draftow, publikacji i wynikow.
- `src/storage.ts` - localStorage, migracja save'a, statystyki, jakosc publikacji i pomocnicze funkcje flow.
- `src/data/tracks.ts` - lista utworow i ich poziomy trudnosci.
- `src/data/uiLabels.ts` - etykiety UI: nazwy okien, aplikacji, ikon, przyciskow, statystyk, statusow i placeholderow.
- `src/data/messages.ts` - startowe wiadomosci czatow i komentarze Neury.
- `src/data/chatReactions.ts` - dynamiczne reakcje czatu po wyslaniu draftu i publikacji.

## Nowy model flow

Generator `anh://www.ustno.ai/create` sluzy tylko do stworzenia pierwszej wersji utworu na najnizszym dostepnym poziomie. Po zapisaniu, wyslaniu do Pawcia albo publikacji tytul trafia do `createdTrackIds` i znika z generatora.

Szuflada `anh://www.ustno.ai/me` pokazuje stworzone, nieopublikowane drafty. Draft ma aktualny poziom, najlepszy wynik i status:

- `inDrawer` - draft jest w szufladzie.
- `sentToPawel` - draft zostal wyslany do Pawcia, ale nadal mozna go opublikowac lub remiksowac.

Remix dziala tylko z poziomu szuflady. Uruchamia probe na poziomie o +1 wyzszym niz aktualny poziom draftu. Po remixie gracz moze nadpisac draft; dopiero nadpisanie przesuwa draft na wyzszy poziom.

Publikacja jest jednorazowa per `trackId`. Po publikacji draft znika z szuflady, a na pulpicie pojawia sie ikona pliku. Klikniecie ikony otwiera `Annihilation player.exe`.

## Player

`Annihilation player.exe` pokazuje:

- tytul opublikowanego utworu,
- poziom opublikowanej wersji,
- ocene i dokladnosc,
- wersje jakosciowa,
- placeholder odsluchu.

Przycisk `Odtworz` zmienia stan placeholdera na `Odtwarzanie...`. Nie ma jeszcze prawdziwego audio.

## Jakosc wersji

Jakosc jest liczona w `getPublishedQuality` w `src/storage.ts` na podstawie poziomu trudnosci opublikowanej wersji:

- pierwszy/najniszy poziom: `slaba wersja`,
- poziom srodkowy: `lepsza wersja`,
- najwyzszy poziom: `cudenko`.

Jakosc jest widoczna w playerze i w wiadomosci publikacji na czacie glownym.

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

- Gra rytmiczna nadal nie ma detekcji nut, muzyki, timingu ani punktacji opartej o input.
- Wynik probnego wystepu jest losowany.
- Remix jest tylko przeplywem logicznym po poziomach trudnosci.
- Player nie odtwarza audio, tylko zmienia placeholder stanu.
- Neura i WebCam Cybka sa prostymi figurami CSS, nie finalnymi assetami.
- Okna mozna przenosic za pasek tytulu; pozycja zyje tylko w stanie sesji Reacta.

## Sugerowane kolejne kroki

1. Dodac prosty model sekwencji nut bez audio syncu.
2. Dodac porownanie wyniku remixu z obecnym draftem przed nadpisaniem.
3. Rozbudowac reakcje czatu o warianty zalezne od jakosci publikacji.
4. Zrobic wersjonowana migracje save'a, gdy model danych ustabilizuje sie bardziej.
