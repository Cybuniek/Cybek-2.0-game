export const neuraSystemEchoes = {
  queueBlockedAmbient: 'Ambient odrzucony: aktywna kolejka główna.',
  cooldownActive: 'Ambient odrzucony: cooldown aktywny.',
  missingConditions: 'Kandydat odrzucony: warunki nie zostały spełnione.',
  recentlyPlayed: 'Kandydat odrzucony: linia grana zbyt niedawno.',
} as const;

export type NeuraSystemEchoId = keyof typeof neuraSystemEchoes;
