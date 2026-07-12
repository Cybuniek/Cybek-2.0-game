import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getNeuraPresencePreset } from '../data/neuraPresence.ts';
import type { EchoState, NeuraPresenceState, ResonanceState } from '../types.ts';

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
  echoState,
  resonanceState,
  activeWindow,
  setWindowPositions,
  onEcho,
  onGlitch,
}: {
  isDesktop: boolean;
  presenceState: NeuraPresenceState;
  echoState?: EchoState;
  resonanceState?: ResonanceState;
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
      const echoTimerPressure = Math.min(0.35, (echoState?.echoCount ?? 0) * 0.045);
      const timerScale = resonanceState?.effects.timerScale ?? 1;
      const minDelay = Math.max(1800, Math.round(preset.ui.minDelayMs * timerScale * (1 - echoTimerPressure)));
      const maxDelay = Math.max(minDelay + 900, Math.round(preset.ui.maxDelayMs * timerScale * (1 - echoTimerPressure)));

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;

        if (activeWindow && preset.ui.windowDriftPx > 0) {
          const drift = (preset.ui.windowDriftPx + (resonanceState?.effects.uiHighlight ?? 0) * 8) * presenceState.uiAutonomy;
          setWindowPositions((positions) => ({
            ...positions,
            [activeWindow]: clampWindowPosition({
              x: positions[activeWindow].x + randomSigned(drift),
              y: positions[activeWindow].y + randomSigned(drift * 0.65),
            }),
          }));
        }

        const echoChance = Math.min(
          0.78,
          preset.ui.staleReplyChance + (echoState?.echoCount ?? 0) * 0.035 + (resonanceState?.effects.uiHighlight ?? 0) * 0.18,
        );
        if (Math.random() < echoChance) {
          onEcho(echoState?.lastPhrase ? `Echo: ${echoState.lastPhrase}` : pickRandom(neuraEnvironmentalEchoes));
        }

        if (presenceState.glitchIntensity > 0.2) {
          onGlitch(Math.min(1, presenceState.glitchIntensity + 0.1));
        }

        schedule();
      }, randomBetween(minDelay, maxDelay));
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeWindow, echoState, isDesktop, onEcho, onGlitch, presenceState, resonanceState, setWindowPositions]);
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
