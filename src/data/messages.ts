import type { ChatMessage } from '../types';
export { neuraComments } from './neuraVoiceLines';

export const initialPawelMessages: ChatMessage[] = [
  { author: 'Paweł', text: 'Podepnij mi wersję roboczą, tylko bez finalnego napięcia.' },
  { author: 'Cybek', text: 'Najpierw sprawdzę, czy rytm się trzyma.' },
];

export const initialGroupMessages: ChatMessage[] = [
  { author: 'Sztuka za Sztukę', text: 'Występy Cybarta wracają po przerwie technicznej.' },
  { author: 'Anon', text: 'Czy Cybart.exe dzisiaj odpali bez dymu?' },
];
