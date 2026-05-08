import type { ChatMessage } from '../types';

export const initialPawelMessages: ChatMessage[] = [
  { author: 'Paweł', text: 'Podepnij mi wersję roboczą, tylko bez finalnego napięcia.' },
  { author: 'Cybek', text: 'Najpierw sprawdzę, czy rytm się trzyma.' },
];

export const initialGroupMessages: ChatMessage[] = [
  { author: 'Sztuka za Sztukę', text: 'Występy Cybarta wracają po przerwie technicznej.' },
  { author: 'Anon', text: 'Czy Cybart.exe dzisiaj odpali bez dymu?' },
];

export const neuraComments = [
  'Neura: pulpit oddycha, ale jeszcze się trzyma.',
  'Neura: nie publikuj dwa razy tego samego tytułu.',
  'Neura: szuflada jest bezpieczna, czat już mniej.',
  'Neura: wersja robocza dla Pawła zmniejsza chaos tylko pozornie.',
];
