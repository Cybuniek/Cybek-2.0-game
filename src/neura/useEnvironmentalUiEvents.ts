import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getNeuraPresencePreset } from '../data/neuraPresence.ts';
import type { NeuraPresenceState } from '../types.ts';

type Point = { x: number; y: number };

export const neuraEnvironmentalEchoes = [
  'Już to wpisałeś. Jeszcze nie tutaj.',
  'Okno pamięta poprzedni klik.',
  'Nie ruszam kursorem. Tylko przewiduję.',
  'To nie błąd renderowania. To skrót.',
] as const;

export function useEnvironmentalUiEvents<TWindowId extends string>({
  isDesktop,
  presenceState,
  activeWindow,
  setWindowPositions,
  onEcho,
  onGlitch,
}: {
  isDesktop: boolean;
  presenceState: NeuraPresenceState;
  activeWindow: TWindowId | null;
  setWindowPositions: Dispatch<SetStateAction<Record<TWindowId, Point>>>;
  onEcho: (text: string) => void;
  onGlitch: (intensity: number) => void;
}) {
  useEffect(() => {
    if (!isDesktop || presenceState.lowFxMode || presenceState.uiAutonomy < 0.08) return;

    const preset = getNeuraPresencePreset(presenceState.powerLevel);
    let timeoutId = 0;
    let cancelled = false;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;

        if (activeWindow && preset.ui.windowDriftPx > 0) {
          const drift = preset.ui.windowDriftPx * presenceState.uiAutonomy;
          setWindowPositions((positions) => ({
            ...positions,
            [activeWindow]: clampWindowPosition({
              x: positions[activeWindow].x + randomSigned(drift),
              y: positions[activeWindow].y + randomSigned(drift * 0.65),
            }),
          }));
        }

        if (Math.random() < preset.ui.staleReplyChance) {
          onEcho(pickRandom(neuraEnvironmentalEchoes));
        }

        if (presenceState.glitchIntensity > 0.2) {
          onGlitch(Math.min(1, presenceState.glitchIntensity + 0.1));
        }

        schedule();
      }, randomBetween(preset.ui.minDelayMs, preset.ui.maxDelayMs));
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeWindow, isDesktop, onEcho, onGlitch, presenceState, setWindowPositions]);
}

function clampWindowPosition(position: Point): Point {
  return {
    x: Math.max(120, Math.min(window.innerWidth - 360, Math.round(position.x))),
    y: Math.max(48, Math.min(window.innerHeight - 180, Math.round(position.y))),
  };
}

function randomSigned(max: number) {
  return (Math.random() * 2 - 1) * max;
}

function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
