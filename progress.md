Original prompt: Stworz minimalny, grywalny szkielet dla prototypu webowego o nazwie "Ustnik 2.0 The Show - The Game".

Postep:
- Utworzono szkielet React + TypeScript + Vite.
- Dodano pulpit Cybek OS, Neure, okna Messenger/Ustno.ai, placeholder rytmiczny, wyniki, localStorage i DEV_NOTES.md.
- Zaimplementowano grywalną sekcję rytmiczną: tory `S/D/K/L`, czas próby zależny od długości bazowego audio lub metadanych ładowanego utworu, BPM pobierany z pełnej wersji utworu, poziomy trudności sterujące gęstością nut przez mnożniki `Łatwy=0.5`, `Normalny=0.7`, `Cybart=1.0`, feedback `Too fast/Good/Great/Perfect/Too late/Miss`, combo z mnożnikiem jakości i wynik w tierach `F/E/D/C/B/A/S`.
- Dodano developerski test logiki rytmu uruchamiany przez `npm run test:rhythm`.
- Dodano porównanie remixu z obecnym draftem przed nadpisaniem: poprzedni wynik, nowy wynik, różnica i werdykt ryzyka.
- Rozbudowano publikację o reakcje czatu zależne od jakości pliku i dokładności wykonania.
- Podmieniono placeholder Neury na interaktywną wersję z custom pet Codexa: atlas `public/pets/neura/spritesheet.webp`, animacje stanów, kliknięcia, przyciski reakcji i przeciąganie po pulpicie.
- Weryfikacja: `npm run build` przechodzi po uruchomieniu poza sandboxem; dev server działa na `http://127.0.0.1:5173/`; zrzut headless Chrome potwierdził widoczny sprite Neury i panel reakcji. Playwright z umiejętności nie został uruchomiony, bo pakiet `playwright` nie jest zainstalowany.
- Weryfikacja rytmu: `npm run test:rhythm` przechodzi po ujednoliceniu poziomu `Łatwy` w teście developerskim.

TODO:
- Jeśli projekt ma dalej korzystać z testów przeglądarkowych z umiejętności `develop-web-game`, dodać `playwright` jako dev dependency albo wskazać wspólną instalację.
- Kolejny krok rytmu: dopracować ręcznie beatmapy dla konkretnych utworów i ewentualną kalibrację input laga.
