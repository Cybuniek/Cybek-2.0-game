import { useCallback, useEffect, useRef, useState } from 'react';
import { createResult } from '../storage';
import type { Difficulty, PerformanceResult, RhythmSummary, Track } from '../types';

export type SessionScreen = 'title' | 'boot' | 'desktop' | 'rhythm' | 'results' | 'editor';

export type ActiveRun = {
  track: Track;
  difficulty: Difficulty;
  mode: 'create' | 'remix';
  draftId?: string;
};

export const SESSION_BOOT_DURATION_MS = 4500;
export const SESSION_BOOT_SKIP_AFTER_MS = 1000;

type SessionControllerOptions = {
  initialScreen: SessionScreen;
  onBootCompleted?: () => void;
  onRunStarted?: () => void;
  onRunFinished?: (activeRun: ActiveRun) => void;
  onReset?: () => void;
};

export function useSessionController({
  initialScreen,
  onBootCompleted,
  onRunStarted,
  onRunFinished,
  onReset,
}: SessionControllerOptions) {
  const initialScreenRef = useRef(initialScreen);
  const [currentScreen, setCurrentScreen] = useState<SessionScreen>(initialScreen === 'editor' ? 'editor' : 'title');
  const [bootElapsedMs, setBootElapsedMs] = useState(0);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [result, setResult] = useState<PerformanceResult | null>(null);

  const goToScreen = useCallback((screen: SessionScreen) => {
    setCurrentScreen(screen);
  }, []);

  const startSession = useCallback(() => {
    setBootElapsedMs(0);
    setCurrentScreen('boot');
  }, []);

  const completeBoot = useCallback(() => {
    setBootElapsedMs(SESSION_BOOT_DURATION_MS);
    setCurrentScreen((screen) => (screen === 'boot' ? initialScreenRef.current : screen));
    onBootCompleted?.();
  }, [onBootCompleted]);

  const advanceBoot = useCallback((ms: number) => {
    setBootElapsedMs((elapsedMs) => {
      const nextElapsedMs = Math.min(SESSION_BOOT_DURATION_MS, elapsedMs + Math.max(0, ms));
      if (nextElapsedMs >= SESSION_BOOT_DURATION_MS) window.setTimeout(completeBoot, 0);
      return nextElapsedMs;
    });
  }, [completeBoot]);

  useEffect(() => {
    if (currentScreen !== 'boot') return;

    const id = window.setInterval(() => advanceBoot(150), 150);
    return () => window.clearInterval(id);
  }, [advanceBoot, currentScreen]);

  useEffect(() => {
    if (currentScreen !== 'boot') return;

    function skipBoot() {
      if (bootElapsedMs >= SESSION_BOOT_SKIP_AFTER_MS) completeBoot();
    }

    window.addEventListener('pointerdown', skipBoot);
    window.addEventListener('keydown', skipBoot);
    return () => {
      window.removeEventListener('pointerdown', skipBoot);
      window.removeEventListener('keydown', skipBoot);
    };
  }, [bootElapsedMs, completeBoot, currentScreen]);

  const startRun = useCallback((track: Track, difficulty: Difficulty, mode: ActiveRun['mode'], draftId?: string) => {
    onRunStarted?.();
    setActiveRun({ track, difficulty, mode, draftId });
    setResult(null);
    setCurrentScreen('rhythm');
  }, [onRunStarted]);

  const finishRun = useCallback((summary: RhythmSummary) => {
    if (!activeRun) return;

    onRunFinished?.(activeRun);
    setResult(createResult(activeRun.track.id, activeRun.track.title, activeRun.difficulty, summary));
    setCurrentScreen('results');
  }, [activeRun, onRunFinished]);

  const returnToDesktop = useCallback(() => {
    setCurrentScreen('desktop');
    setActiveRun(null);
    setResult(null);
  }, []);

  const resetSession = useCallback(() => {
    onReset?.();
    initialScreenRef.current = 'desktop';
    setBootElapsedMs(0);
    setCurrentScreen('title');
    setActiveRun(null);
    setResult(null);
  }, [onReset]);

  return {
    currentScreen,
    bootTargetScreen: initialScreenRef.current,
    bootElapsedMs,
    activeRun,
    result,
    startSession,
    resetSession,
    goToScreen,
    completeBoot,
    advanceBoot,
    startRun,
    finishRun,
    returnToDesktop,
  };
}
