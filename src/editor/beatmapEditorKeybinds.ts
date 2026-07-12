export type BeatmapEditorKeybind = {
  keys: string[];
  action: string;
};

export type BeatmapEditorKeybindGroup = {
  title: string;
  items: BeatmapEditorKeybind[];
};

export const KEYBIND_GROUPS: BeatmapEditorKeybindGroup[] = [
  {
    title: 'Transport',
    items: [
      { keys: ['Spacja'], action: 'odtwórz / pauza' },
      { keys: ['S', 'D', 'K', 'L'], action: 'nagrywanie lub test torów' },
      { keys: ['Shift', 'S/D/K/L'], action: 'nagrywanie hold z pulsem' },
    ],
  },
  {
    title: 'Edycja',
    items: [
      { keys: ['Ctrl', 'Z'], action: 'cofnij' },
      { keys: ['Ctrl', 'Shift', 'Z'], action: 'ponów' },
      { keys: ['Ctrl', 'Y'], action: 'ponów' },
      { keys: ['Delete'], action: 'usuń zaznaczone sygnały' },
      { keys: [','], action: 'przesuń zaznaczenie w lewo' },
      { keys: ['.'], action: 'przesuń zaznaczenie w prawo' },
    ],
  },
  {
    title: 'Kopia',
    items: [
      { keys: ['Ctrl', 'C'], action: 'kopiuj zaznaczone sygnały' },
      { keys: ['Ctrl', 'V'], action: 'wklej przy aktualnym czasie' },
      { keys: ['Shift', 'klik'], action: 'dodaj lub usuń sygnał z zaznaczenia' },
    ],
  },
];
