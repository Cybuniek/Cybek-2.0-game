import { useCallback, useEffect, useRef, useState } from 'react';

export const soundscapeConfig = {
  masterStorageKey: 'ustnik.soundscape.muted',
  musicDefaultVolume: 0.8,
  ambient: {
    source: '/audio/bgs/BGS-ambientOS.mp3',
    volume: 0.6,
  },
  glitch: {
    sources: [
      '/audio/bgs/BGS-glitch_a.mp3',
      '/audio/bgs/BGS-glitch_b.mp3',
      '/audio/bgs/BGS-glitch_c.mp3',
      '/audio/bgs/BGS-glitch_d.mp3',
      '/audio/bgs/BGS-glitch_e.mp3',
    ],
    volume: 0.58,
    maxActive: 2,
    minDelayMs: 4000,
    maxDelayMs: 12000,
    minFadeInMs: 800,
    maxFadeInMs: 1800,
    minPeakMs: 1000,
    maxPeakMs: 3000,
    minFadeOutMs: 1000,
    maxFadeOutMs: 2500,
  },
} as const;

type ActiveGlitch = {
  audio: HTMLAudioElement;
  frameId: number | null;
};

export function useSoundscape() {
  const [isMuted, setIsMutedState] = useState(() => readStoredMute());
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeGlitchCount, setActiveGlitchCount] = useState(0);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const activeGlitchesRef = useRef<Set<ActiveGlitch>>(new Set());
  const mutedRef = useRef(isMuted);
  const unlockedRef = useRef(isUnlocked);

  const stopGlitch = useCallback((glitch: ActiveGlitch) => {
    if (!activeGlitchesRef.current.has(glitch)) return;

    if (glitch.frameId !== null) window.cancelAnimationFrame(glitch.frameId);
    glitch.audio.pause();
    glitch.audio.currentTime = 0;
    activeGlitchesRef.current.delete(glitch);
    setActiveGlitchCount(activeGlitchesRef.current.size);
  }, []);

  const stopAllGlitches = useCallback(() => {
    Array.from(activeGlitchesRef.current).forEach((glitch) => stopGlitch(glitch));
  }, [stopGlitch]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    setIsMutedState(muted);
    try {
      window.localStorage.setItem(soundscapeConfig.masterStorageKey, muted ? '1' : '0');
    } catch {
      // localStorage may be unavailable in strict browser privacy modes.
    }
  }, []);

  const triggerGlitch = useCallback(() => {
    if (mutedRef.current || !unlockedRef.current) return false;
    if (activeGlitchesRef.current.size >= soundscapeConfig.glitch.maxActive) return false;

    const source = pickRandom(soundscapeConfig.glitch.sources);
    const audio = new Audio(source);
    const fadeInMs = randomBetween(soundscapeConfig.glitch.minFadeInMs, soundscapeConfig.glitch.maxFadeInMs);
    const peakMs = randomBetween(soundscapeConfig.glitch.minPeakMs, soundscapeConfig.glitch.maxPeakMs);
    const fadeOutMs = randomBetween(soundscapeConfig.glitch.minFadeOutMs, soundscapeConfig.glitch.maxFadeOutMs);
    const totalMs = fadeInMs + peakMs + fadeOutMs;
    const startedAt = performance.now();
    const glitch: ActiveGlitch = { audio, frameId: null };

    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('ended', () => stopGlitch(glitch), { once: true });
    audio.addEventListener('error', () => stopGlitch(glitch), { once: true });

    activeGlitchesRef.current.add(glitch);
    setActiveGlitchCount(activeGlitchesRef.current.size);

    const animate = (now: number) => {
      if (!activeGlitchesRef.current.has(glitch)) return;

      const elapsed = now - startedAt;
      audio.volume = soundscapeConfig.glitch.volume * glitchEnvelope(elapsed, fadeInMs, peakMs, fadeOutMs);
      if (elapsed >= totalMs) {
        stopGlitch(glitch);
        return;
      }
      glitch.frameId = window.requestAnimationFrame(animate);
    };

    audio.play().then(() => {
      glitch.frameId = window.requestAnimationFrame(animate);
    }).catch(() => stopGlitch(glitch));

    return true;
  }, [stopGlitch]);

  const unlock = useCallback(() => {
    unlockedRef.current = true;
    setIsUnlocked(true);
  }, []);

  useEffect(() => {
    mutedRef.current = isMuted;
    if (isMuted) stopAllGlitches();
  }, [isMuted, stopAllGlitches]);

  useEffect(() => {
    unlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    const ambient = new Audio(soundscapeConfig.ambient.source);
    ambient.loop = true;
    ambient.preload = 'auto';
    ambient.volume = soundscapeConfig.ambient.volume;
    ambientRef.current = ambient;

    return () => {
      ambient.pause();
      ambient.src = '';
      ambientRef.current = null;
      stopAllGlitches();
    };
  }, [stopAllGlitches]);

  useEffect(() => {
    const ambient = ambientRef.current;
    if (!ambient) return;

    if (!isUnlocked || isMuted) {
      ambient.pause();
      return;
    }

    ambient.volume = soundscapeConfig.ambient.volume;
    ambient.play().catch(() => undefined);
  }, [isMuted, isUnlocked]);

  useEffect(() => {
    if (isUnlocked) return;

    const unlockFromInteraction = () => unlock();
    window.addEventListener('pointerdown', unlockFromInteraction, { once: true });
    window.addEventListener('keydown', unlockFromInteraction, { once: true });
    window.addEventListener('touchstart', unlockFromInteraction, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockFromInteraction);
      window.removeEventListener('keydown', unlockFromInteraction);
      window.removeEventListener('touchstart', unlockFromInteraction);
    };
  }, [isUnlocked, unlock]);

  useEffect(() => {
    if (!isUnlocked || isMuted) return;

    let timeoutId = 0;
    let cancelled = false;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        triggerGlitch();
        schedule();
      }, randomBetween(soundscapeConfig.glitch.minDelayMs, soundscapeConfig.glitch.maxDelayMs));
    };

    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isMuted, isUnlocked, triggerGlitch]);

  return {
    isMuted,
    isUnlocked,
    activeGlitchCount,
    setMuted,
    toggleMuted: () => setMuted(!mutedRef.current),
    unlock,
    triggerGlitch,
  };
}

function readStoredMute() {
  try {
    return window.localStorage.getItem(soundscapeConfig.masterStorageKey) === '1';
  } catch {
    return false;
  }
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function glitchEnvelope(elapsedMs: number, fadeInMs: number, peakMs: number, fadeOutMs: number) {
  if (elapsedMs <= fadeInMs) return elapsedMs / fadeInMs;
  if (elapsedMs <= fadeInMs + peakMs) return 1;
  return Math.max(0, 1 - (elapsedMs - fadeInMs - peakMs) / fadeOutMs);
}
