# Gameplay Context z filmów

## Materiał 1: `game-loop.mp4`

Długość: około 5:11. Rozdzielczość: 1920×1080. FPS: 60.

Film pokazuje pełną pętlę gry od pulpitu do powrotu na pulpit po rozegraniu utworu.

### 00:00–00:10 — start i desktop hub

Gra otwiera się z ciemnego ekranu tytułowego, potem pokazuje pulpit/hub. Układ:

- górny pasek z opcjami typu zapis/wczytanie/ustawienia/pomoc,
- ikony aplikacji po lewej,
- centralna/postaciowa ilustracja tła,
- okno postaci/AI po prawej,
- panel statystyk z trzema parametrami,
- żółty TODO box z aktywnym celem,
- dialog box na dole okna postaci.

Kluczowa obserwacja: hub nie jest zwykłym menu. To diegetyczny pulpit, czyli interfejs gry udaje środowisko komputera.

### 00:10–00:25 — wybór utworu

Po wejściu w aplikację muzyczną pojawia się lista utworów i panel informacji. Widoczne są:

- lista tracków z kategoriami/tagami,
- panel informacji o muzyce,
- zakładki trudności,
- informacja o beatmapie,
- modal potwierdzający start.

To jest dobry wzorzec na oddzielenie `SongSelect` od samego `RhythmGameplay`.

### 00:30–03:00 — rhythm gameplay

Rdzeń gry rytmicznej:

- cztery tory: `S`, `D`, `K`, `L`,
- receptory/linia trafienia w dolnej części okna,
- nuty jako świecące belki/przesuwające się kształty,
- feedback `PERFECT`/`GREAT`/`GOOD`/`MISS`,
- licznik combo nad postacią,
- panel wyników po lewej,
- panel boost po prawej,
- pasek postępu na dole,
- teksty/dialogi lecą równolegle z rozgrywką.

Warto zauważyć, że gameplay rytmiczny jest równocześnie mechaniką i nośnikiem narracji. Dialog nie blokuje gry, tylko towarzyszy akcji.

### 03:10–03:40 — wybór treści po utworze

Po zakończeniu rytmu pojawia się ekran wyboru kart/treści. Gra prosi o wybranie 3 tekstów do opublikowania. Widoczne są:

- rząd kart u góry,
- sloty wyboru na dole,
- panel statystyk wyniku z rytmu po lewej,
- postać-asystent po prawej,
- przyciski trybu wyboru typu automat/polecane,
- lista wygenerowanych tekstów z poziomami i gwiazdkami.

Ta część wygląda jak most między wynikiem rytmicznym a konsekwencjami społeczno-narracyjnymi.

### 03:50–04:10 — wynik i ranga

Ekran wyniku prezentuje:

- `NEW RECORD`,
- score,
- liczbę perfect/great/good/miss,
- fast/late,
- max combo,
- średni timing error,
- pasek rangi `C B A S`,
- ekran `FULL COMBO`,
- achievementy/odznaki.

Ważny wzorzec: wynik nie jest tylko liczbą. Wynik jest osobnym eventem UI, który może odblokować achievementy, statystyki i dalsze opcje.

### 04:00–04:50 — reakcja świata i scena desktopowa

Po publikacji gra przechodzi do mapy świata i interpretacji reakcji społecznej. Potem wraca do pulpitu, gdzie pojawiają się:

- okna dialogowe,
- okna newsów,
- panele typu support/komentarze,
- rozmowa między postaciami,
- zmiany parametrów/progresu.

To sugeruje system eventów po publikacji: `publish -> reaction -> narrative scene -> stat update`.

### 05:00–05:10 — odblokowania/trening i powrót do huba

Pod koniec widoczna jest lista elementów treningowych/treści z poziomami, gwiazdkami i oznaczeniem `NEW`. Następnie gra wraca do głównego pulpitu z aktualizowanymi statystykami.

## Materiał 2: `nuty-tutorial.mp4`

Długość: około 0:47. Rozdzielczość: 1920×1080. FPS: 60.

Film pokazuje samouczek osadzony bezpośrednio na ekranie rytmu.

### Typy nut

1. **Pojedyncze nuty** — gracz wciska odpowiedni klawisz, gdy krótka nuta dotrze do linii trafienia.
2. **Długie nuty** — gracz przytrzymuje klawisz przez czas trwania nuty.
3. **Pędzące nuty** — gracz uderza w klawisz określoną liczbę razy podczas trwania segmentu.

### UX samouczka

- Samouczek jest overlayem na normalnym ekranie gry.
- Ma przycisk `Dalej` oraz progres/pasek postępu.
- Pokazuje animowany przykład nuty w kontekście właściwych torów.
- Zakończenie wymaga potwierdzenia w modalu `Zakończyć samouczek?`.

## Najważniejsze wnioski dla projektu docelowego

- Desktop jako hub jest mocny, bo scala menu, narrację i progres.
- Rytm powinien być osobnym modułem, który zwraca wynik, a nie decyduje samodzielnie o całym progresie fabularnym.
- Samouczek najlepiej działa jako overlay nad realnym ekranem rytmu.
- Po utworze dobrze działa dodatkowa decyzja gracza: co opublikować, co zachować, co odrzucić.
- Reakcje świata powinny być osobnym etapem po publikacji.
- Statystyki i odblokowania powinny być widoczne w huba, żeby gracz czuł konsekwencje pętli.
