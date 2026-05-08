export type NeuraVoiceLineTrigger = 'comment' | 'reaction';

type NeuraVoiceLineShape = {
  id: string;
  text: string;
  styleTag: string;
  trigger: NeuraVoiceLineTrigger;
};

export const neuraVoiceLines = [
  {
    id: 'comment-pulpit-oddycha',
    text: 'Pulpit oddycha, ale jeszcze się trzyma.',
    styleTag: '[curious]',
    trigger: 'comment',
  },
  {
    id: 'comment-nie-publikuj-dwa-razy',
    text: 'Nie publikuj dwa razy tego samego tytułu.',
    styleTag: '[warning]',
    trigger: 'comment',
  },
  {
    id: 'comment-szuflada-bezpieczna',
    text: 'Szuflada jest bezpieczna, czat już mniej.',
    styleTag: '[whispers]',
    trigger: 'comment',
  },
  {
    id: 'comment-wersja-dla-pawla',
    text: 'Wersja robocza dla Pawła zmniejsza chaos tylko pozornie.',
    styleTag: '[dry]',
    trigger: 'comment',
  },
  {
    id: 'reaction-hej',
    text: 'Jestem. Nie klikaj tak nerwowo.',
    styleTag: '[playful]',
    trigger: 'reaction',
  },
  {
    id: 'reaction-analiza',
    text: 'Analiza trwa. Widzę rytm, widzę presję, widzę zły pomysł.',
    styleTag: '[focused]',
    trigger: 'reaction',
  },
  {
    id: 'reaction-glitch',
    text: 'Glitch kontrolowany. Jeszcze nie uciekam z procesu.',
    styleTag: '[glitchy]',
    trigger: 'reaction',
  },
] as const satisfies readonly NeuraVoiceLineShape[];

export type NeuraVoiceLineId = (typeof neuraVoiceLines)[number]['id'];
export type NeuraVoiceLine = (typeof neuraVoiceLines)[number];

export const neuraComments = neuraVoiceLines.filter((line) => line.trigger === 'comment');

export const neuraReactionVoiceLineIds = {
  waving: 'reaction-hej',
  review: 'reaction-analiza',
  failed: 'reaction-glitch',
} as const satisfies Record<string, NeuraVoiceLineId>;
