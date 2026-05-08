import type { ChatMessage } from '../types';

export const initialPawelMessages: ChatMessage[] = [
  { author: 'Pawel', text: 'Podepnij mi wersje robocza, tylko bez finalnego napiecia.' },
  { author: 'Cybek', text: 'Najpierw sprawdze, czy rytm sie trzyma.' },
];

export const initialGroupMessages: ChatMessage[] = [
  { author: 'Sztuka za Sztuke', text: 'Wystepy Cybarta wracaja po przerwie technicznej.' },
  { author: 'Anon', text: 'Czy Cybart.exe dzisiaj odpali bez dymu?' },
];

export const neuraComments = [
  'Neura: pulpit oddycha, ale jeszcze sie trzyma.',
  'Neura: nie publikuj dwa razy tego samego tytulu.',
  'Neura: szuflada jest bezpieczna, czat juz mniej.',
  'Neura: wersja robocza dla Pawla zmniejsza chaos tylko pozornie.',
];
