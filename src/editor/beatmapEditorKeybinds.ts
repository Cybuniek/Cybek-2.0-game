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
      { keys: ['Spacja'], action: 'play / pauza' },
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
      { keys: ['Delete'], action: 'usuń zaznaczone nuty' },
      { keys: [','], action: 'przesuń zaznaczenie w lewo' },
      { keys: ['.'], action: 'przesuń zaznaczenie w prawo' },
    ],
  },
  {
    title: 'Schowek',
    items: [
      { keys: ['Ctrl', 'C'], action: 'kopiuj zaznaczone nuty' },
      { keys: ['Ctrl', 'V'], action: 'wklej przy aktualnym czasie' },
      { keys: ['Shift', 'klik'], action: 'dodaj lub usuń nutę z zaznaczenia' },
    ],
  },
];
