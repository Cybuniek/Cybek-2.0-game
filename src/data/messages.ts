import type { ChatMessage } from '../types';
export { neuraComments } from './neuraVoiceLines.ts';

export const initialPawelMessages: ChatMessage[] = [
  { author: 'Paweł', text: 'Podeślij mi szkic, zanim wrzucisz go ludziom. Niech najpierw oddycha w bezpiecznym miejscu.' },
  { author: 'Cybek', text: 'Najpierw sprawdzę, czy rytm się trzyma.' },
];

export const initialGroupMessages: ChatMessage[] = [
  { author: 'Sztuka za Sztukę', text: 'Występy Cybarta wracają po przerwie technicznej.' },
  { author: 'Anon', text: 'Czy Cybart.exe dzisiaj odpali bez dymu?' },
];
