import type { EndingRoute, GameState } from './types';

export type EndingProfile = {
  route: EndingRoute;
  label: string;
  description: string;
};

const endingProfiles: Record<EndingRoute, EndingProfile> = {
  quietArchive: {
    route: 'quietArchive',
    label: 'Ciche archiwum',
    description: 'Cybek zostawia ślady w plikach, ale nie oddaje steru ani tłumowi, ani Neurze.',
  },
  neuraBond: {
    route: 'neuraBond',
    label: 'Bonding z Neurą',
    description: 'Echo decyzji składa się w relację, której Neura nie umie już udawać jako zwykłego widgetu.',
  },
  publicSpiral: {
    route: 'publicSpiral',
    label: 'Spirala publiczności',
    description: 'Presja czatu przejmuje tempo publikacji, a pulpit staje się transmisją awarii.',
  },
  offlineBreak: {
    route: 'offlineBreak',
    label: 'Offline break',
    description: 'Cybek wycina sygnał i zostaje z ciszą, która jest mniej pusta niż feed.',
  },
};

export function calculateEndingRoute(state: GameState): EndingRoute {
  const echoCount = state.echo?.echoCount ?? 0;
  const bond = state.resonance?.bondWithNeura ?? 'distant';
  const resonanceLevel = state.resonance?.level ?? 'silent';

  if (echoCount >= 6 && resonanceLevel === 'overload' && (bond === 'merged' || bond === 'attuned')) {
    return 'neuraBond';
  }

  if (state.stats.chatPressure >= 85 && bond !== 'attuned' && bond !== 'merged') {
    return 'publicSpiral';
  }

  if (state.stats.performance >= 12 && state.stats.performance <= 25 && state.stats.cybart <= 25 && state.stats.chatPressure <= 30) {
    return 'offlineBreak';
  }

  return 'quietArchive';
}

export function updateEndingState(state: GameState): GameState {
  const route = calculateEndingRoute(state);
  const profile = getEndingProfile(route);
  return {
    ...state,
    ending: {
      route,
      label: profile.label,
      influence: {
        performance: state.stats.performance,
        chatPressure: state.stats.chatPressure,
        cybart: state.stats.cybart,
        echo: (state.echo?.echoCount ?? 0) * 14,
        resonance: state.resonance?.score ?? 0,
        bond: bondScore(state.resonance?.bondWithNeura ?? 'distant'),
      },
      updatedAt: new Date().toISOString(),
    },
  };
}

export function getEndingProfile(route: EndingRoute): EndingProfile {
  return endingProfiles[route] ?? endingProfiles.quietArchive;
}

function bondScore(bond: GameState['resonance']['bondWithNeura']) {
  if (bond === 'merged') return 100;
  if (bond === 'attuned') return 72;
  if (bond === 'curious') return 36;
  return 0;
}
