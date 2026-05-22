import type { OperationalPowerLevel } from '../types.ts';

export type NeuraPresencePreset = {
  level: OperationalPowerLevel;
  narrativeTag: string;
  minPresenceScore: number;
  audio: {
    ambientDepth: number;
    glitchIntensity: number;
    glitchVolume: number;
    minDelayMs: number;
    maxDelayMs: number;
    maxActive: number;
  };
  avatar: {
    instability: number;
    jitterPx: number;
    ghostOpacity: number;
    eyeDriftPx: number;
    glitchSliceOpacity: number;
    renderDelayMs: number;
    patrolIntervalMs: number;
  };
  ui: {
    autonomy: number;
    minDelayMs: number;
    maxDelayMs: number;
    windowDriftPx: number;
    staleReplyChance: number;
  };
};

export const neuraPresencePresets = [
  {
    level: 0,
    narrativeTag: 'maskotka',
    minPresenceScore: 0,
    audio: {
      ambientDepth: 0.12,
      glitchIntensity: 0.06,
      glitchVolume: 0.28,
      minDelayMs: 15000,
      maxDelayMs: 28000,
      maxActive: 1,
    },
    avatar: {
      instability: 0.04,
      jitterPx: 0.2,
      ghostOpacity: 0,
      eyeDriftPx: 0,
      glitchSliceOpacity: 0,
      renderDelayMs: 0,
      patrolIntervalMs: 7200,
    },
    ui: {
      autonomy: 0,
      minDelayMs: 18000,
      maxDelayMs: 30000,
      windowDriftPx: 0,
      staleReplyChance: 0,
    },
  },
  {
    level: 1,
    narrativeTag: 'niestabilny widget',
    minPresenceScore: 25,
    audio: {
      ambientDepth: 0.28,
      glitchIntensity: 0.22,
      glitchVolume: 0.42,
      minDelayMs: 9500,
      maxDelayMs: 17000,
      maxActive: 1,
    },
    avatar: {
      instability: 0.22,
      jitterPx: 0.8,
      ghostOpacity: 0.1,
      eyeDriftPx: 0.8,
      glitchSliceOpacity: 0.08,
      renderDelayMs: 40,
      patrolIntervalMs: 6200,
    },
    ui: {
      autonomy: 0.12,
      minDelayMs: 12000,
      maxDelayMs: 22000,
      windowDriftPx: 3,
      staleReplyChance: 0.08,
    },
  },
  {
    level: 2,
    narrativeTag: 'proces',
    minPresenceScore: 48,
    audio: {
      ambientDepth: 0.48,
      glitchIntensity: 0.45,
      glitchVolume: 0.52,
      minDelayMs: 6200,
      maxDelayMs: 12500,
      maxActive: 2,
    },
    avatar: {
      instability: 0.45,
      jitterPx: 1.4,
      ghostOpacity: 0.18,
      eyeDriftPx: 1.8,
      glitchSliceOpacity: 0.16,
      renderDelayMs: 90,
      patrolIntervalMs: 5200,
    },
    ui: {
      autonomy: 0.28,
      minDelayMs: 8500,
      maxDelayMs: 16000,
      windowDriftPx: 7,
      staleReplyChance: 0.18,
    },
  },
  {
    level: 3,
    narrativeTag: 'operator',
    minPresenceScore: 72,
    audio: {
      ambientDepth: 0.72,
      glitchIntensity: 0.68,
      glitchVolume: 0.62,
      minDelayMs: 4400,
      maxDelayMs: 9000,
      maxActive: 3,
    },
    avatar: {
      instability: 0.7,
      jitterPx: 2.1,
      ghostOpacity: 0.28,
      eyeDriftPx: 3,
      glitchSliceOpacity: 0.25,
      renderDelayMs: 140,
      patrolIntervalMs: 4300,
    },
    ui: {
      autonomy: 0.52,
      minDelayMs: 5600,
      maxDelayMs: 11000,
      windowDriftPx: 12,
      staleReplyChance: 0.32,
    },
  },
  {
    level: 4,
    narrativeTag: 'martwy pulpit',
    minPresenceScore: 94,
    audio: {
      ambientDepth: 0.95,
      glitchIntensity: 0.9,
      glitchVolume: 0.7,
      minDelayMs: 3000,
      maxDelayMs: 6800,
      maxActive: 3,
    },
    avatar: {
      instability: 0.92,
      jitterPx: 2.8,
      ghostOpacity: 0.38,
      eyeDriftPx: 4.5,
      glitchSliceOpacity: 0.36,
      renderDelayMs: 220,
      patrolIntervalMs: 3600,
    },
    ui: {
      autonomy: 0.74,
      minDelayMs: 3600,
      maxDelayMs: 8200,
      windowDriftPx: 18,
      staleReplyChance: 0.48,
    },
  },
] as const satisfies readonly NeuraPresencePreset[];

export function getNeuraPresencePreset(level: OperationalPowerLevel) {
  return neuraPresencePresets.find((preset) => preset.level === level) ?? neuraPresencePresets[0];
}

export function getOperationalPowerLevel(score: number): OperationalPowerLevel {
  return neuraPresencePresets.reduce<OperationalPowerLevel>((level, preset) => (
    score >= preset.minPresenceScore ? preset.level : level
  ), 0);
}
