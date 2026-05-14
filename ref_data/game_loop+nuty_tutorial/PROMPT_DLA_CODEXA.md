# Prompt roboczy dla Codexa

Przeczytaj paczkę `codex_video_reference_pack` i potraktuj ją jako referencję strukturalną dla pętli gry desktop + rhythm + publikacja + reakcje świata.

Nie kopiuj nazw, tekstów, lore ani grafiki z materiału źródłowego. Interesuje nas architektura, przepływ ekranów, typy systemów i sposób rozdzielenia logiki.

Twoje zadanie:

1. Zidentyfikuj obecny stan projektu i miejsca, które odpowiadają za:
   - desktop/hub,
   - wybór utworu lub aktywności,
   - rhythm minigame,
   - scoring,
   - wynik/rangę,
   - publikację/konsekwencje narracyjne,
   - słowniki etykiet/dialogów.
2. Zaproponuj mały plan zmian bez wykonywania destrukcyjnych operacji.
3. Jeśli implementujesz, rób to etapami:
   - najpierw stan gry i przepływ ekranów,
   - potem dane/słowniki,
   - dopiero potem szczegóły balansu i efektów wizualnych.
4. Przed zmianami sprawdź `git status` i nie rób commita bez zgody.
5. Po zmianach wypisz dokładnie, które pliki zmieniono i dlaczego.

Priorytet: przejrzystość, modularność i łatwe dalsze iterowanie. Nie buduj jednego wielkiego potwora-komponentu, bo to potem będzie cybernetyczny bigos z kablami.
