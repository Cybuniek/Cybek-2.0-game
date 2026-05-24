# Cybek Webcam Style-Test Notes

Cel: pojedynczy test stylu dla animacji `idle beat` w realnym oknie webcam.

Zrodla referencyjne:
- `template-background.png`
- `template-cybek.png`
- `template-desk-keyboard.png`
- `template-hands.png`
- `template-crt-fx.png`
- `template-frame.png`

Kontrakt runtime:
- statyczne warstwy: `320x240`,
- animowane warstwy: `2560x240`,
- 8 klatek po `320x240`,
- 8 FPS,
- kolejnosc warstw: `background`, `cybek`, `desk-keyboard`, `hands`, `crt-fx`, `frame`.

Kierunek ruchu:
- `cybek.png`: subtelny frame-by-frame headbob glowy i tulowia,
- `hands.png`: lekkie naprzemienne pukanie dloni, bez agresywnego pisania,
- `crt-fx.png`: drobne scanlines, pyl i krotkie poziome zaklocenia,
- `background.png`, `desk-keyboard.png`, `frame.png`: statyczne.

Ustawienie warstw w aktualnym style-tescie:
- `desk-keyboard.png` jest przesuniete nizej i celowo moze wychodzic poza dol viewportu,
- `hands.png` jest przesuniete i przeskalowane pod obnizona klawiature,
- `cybek.png` pozostaje stabilny, z ruchem glowy/tulowia zamiast przesuwania calego obrazu.

Uwagi produkcyjne:
- Warstwy runtime zostaly przygotowane z referencji `TEMPLATE` jako techniczny style-test.
- `composite-preview-strip.png` sluzy tylko do oceny klatek zlozonych, nie jest uzywany przez runtime.
