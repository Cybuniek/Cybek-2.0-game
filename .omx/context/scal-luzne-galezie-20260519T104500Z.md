Task statement: Rozeznac lokalne galezie, worktree i stash, a potem zlozyc najlepsze elementy w jedna nowa galaz i przelaczyc checkout na te galaz.

Desired outcome: Nowa galaz robocza startuje z master, zawiera wybrane wartosciowe zmiany z luznych galezi/stasha i ma przejsc podstawowe sprawdzenia.

Known facts/evidence:
- Repo: C:\Users\Cyborg\Documents\Ustnik20TheShowTheGame.
- Jezyk projektu i podsumowan: polski.
- Aktualny branch przed praca: master na d1614d0.
- Istnieje stash@{0}: "Kopia przed cofnieciem do stanu sprzed 3-5 godzin".
- Widoczne dodatkowe worktree sa detached w C:\Users\Cyborg\.codex\worktrees\...

Constraints:
- Nie robic commita bez zgody.
- Unikac agresywnych operacji Git i resetow.
- Preferowac male, modularne, czytelne zmiany.
- Nie rozszerzac zakresu gry bez potrzeby.

Unknowns/open questions:
- Ktore elementy z galezi sa faktycznie najlepsze i kompatybilne z master.
- Czy stare galezie zawieraja kod juz scalony przez merge/upload.

Likely touchpoints:
- git branch/log/show/diff/stash/worktree
- src/rhythm.ts
- src/editor/BeatmapEditor.tsx
- src/editor/beatmapEditorLogic.ts
- src/data/tracks.ts
- src/types.ts
- DEV_NOTES.md
- progress.md
