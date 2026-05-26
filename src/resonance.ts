import type {
  BondWithNeura,
  GameState,
  ResonanceLevel,
  ResonanceState,
  ResonanceVisualEffects,
} from './types';

const resonanceEffectsByLevel: Record<ResonanceLevel, ResonanceVisualEffects> = {
  silent: { bloom: 0, glitchIntensity: 0, uiHighlight: 0, timerScale: 1, comboBonus: 0 },
  low: { bloom: 0.08, glitchIntensity: 0.12, uiHighlight: 0.08, timerScale: 0.94, comboBonus: 0.03 },
  medium: { bloom: 0.24, glitchIntensity: 0.28, uiHighlight: 0.22, timerScale: 0.84, comboBonus: 0.07 },
  high: { bloom: 0.55, glitchIntensity: 0.68, uiHighlight: 0.52, timerScale: 0.7, comboBonus: 0.12 },
  overload: { bloom: 0.72, glitchIntensity: 0.86, uiHighlight: 0.7, timerScale: 0.55, comboBonus: 0.18 },
};

export function calculateResonance(accuracy: number, echoCount: number): ResonanceLevel {
  const score = calculateResonanceScore(accuracy, echoCount);
  if (score >= 125) return 'overload';
  if (score >= 85) return 'high';
  if (score >= 55) return 'medium';
  if (score >= 35) return 'low';
  return 'silent';
}

export function updateResonanceState(state: GameState, accuracy = inferLastAccuracy(state)): GameState {
  const echoCount = state.echo?.echoCount ?? 0;
  const score = calculateResonanceScore(accuracy, echoCount);
  const level = calculateResonance(accuracy, echoCount);
  return {
    ...state,
    resonance: {
      level,
      score,
      lastAccuracy: Math.round(clamp(accuracy, 0, 100)),
      bondWithNeura: bondFromLevel(level),
      effects: getResonanceEffects(level),
    },
  };
}

export function applyResonanceEffects(state: GameState): GameState {
  const effects = getResonanceEffects(state.resonance);
  const cybartLift = state.resonance.level === 'high' || state.resonance.level === 'overload' ? 2 : 0;
  return {
    ...state,
    stats: {
      ...state.stats,
      cybart: clampStat(state.stats.cybart + cybartLift),
      chatPressure: clampStat(state.stats.chatPressure + Math.round(effects.glitchIntensity * 2)),
    },
  };
}

export function getResonanceEffects(source: ResonanceLevel | ResonanceState = 'silent'): ResonanceVisualEffects {
  const level = typeof source === 'string' ? source : source.level;
  return resonanceEffectsByLevel[level] ?? resonanceEffectsByLevel.silent;
}

function calculateResonanceScore(accuracy: number, echoCount: number) {
  return Math.round(clamp(accuracy, 0, 100) * 0.8 + Math.max(0, echoCount) * 9);
}

function bondFromLevel(level: ResonanceLevel): BondWithNeura {
  if (level === 'overload') return 'merged';
  if (level === 'high') return 'attuned';
  if (level === 'medium') return 'curious';
  return 'distant';
}

function inferLastAccuracy(state: GameState) {
  return state.publishedTracks[0]?.accuracy ?? state.drafts[0]?.bestAccuracy ?? state.resonance?.lastAccuracy ?? 0;
}

function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
