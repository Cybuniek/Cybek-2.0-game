import { useEffect, useState } from 'react';
import { getNeuraPresencePreset } from '../data/neuraPresence.ts';
import type { CSSProperties } from 'react';
import type { NeuraPresenceState } from '../types.ts';

type MotionVars = CSSProperties & {
  '--neura-jitter-x': string;
  '--neura-jitter-y': string;
  '--neura-eye-drift-x': string;
  '--neura-ghost-opacity': number;
  '--neura-glitch-slice-opacity': number;
  '--neura-render-delay': string;
};

export function useNeuraAvatarMotion(presenceState: NeuraPresenceState): MotionVars {
  const [vars, setVars] = useState<MotionVars>(() => createStillVars(presenceState));

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || presenceState.lowFxMode || presenceState.avatarInstability <= 0.05) {
      setVars(createStillVars(presenceState));
      return;
    }

    let frameId = 0;
    let nextUpdateAt = 0;
    const preset = getNeuraPresencePreset(presenceState.powerLevel);

    const tick = (now: number) => {
      if (now >= nextUpdateAt) {
        const instability = presenceState.avatarInstability;
        setVars({
          '--neura-jitter-x': `${randomSigned(preset.avatar.jitterPx * instability).toFixed(2)}px`,
          '--neura-jitter-y': `${randomSigned(preset.avatar.jitterPx * instability).toFixed(2)}px`,
          '--neura-eye-drift-x': `${randomSigned(preset.avatar.eyeDriftPx * instability).toFixed(2)}px`,
          '--neura-ghost-opacity': round(preset.avatar.ghostOpacity * instability),
          '--neura-glitch-slice-opacity': round(preset.avatar.glitchSliceOpacity * instability),
          '--neura-render-delay': `${Math.round(randomBetween(0, preset.avatar.renderDelayMs * instability))}ms`,
        });
        nextUpdateAt = now + randomBetween(110, 280);
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [presenceState]);

  return vars;
}

function createStillVars(presenceState: NeuraPresenceState): MotionVars {
  const preset = getNeuraPresencePreset(presenceState.powerLevel);
  const lowFxGhost = presenceState.lowFxMode ? 0 : preset.avatar.ghostOpacity * 0.12;

  return {
    '--neura-jitter-x': '0px',
    '--neura-jitter-y': '0px',
    '--neura-eye-drift-x': '0px',
    '--neura-ghost-opacity': round(lowFxGhost),
    '--neura-glitch-slice-opacity': 0,
    '--neura-render-delay': '0ms',
  };
}

function randomSigned(max: number) {
  return (Math.random() * 2 - 1) * max;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
