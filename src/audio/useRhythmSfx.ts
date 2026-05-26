import { useCallback, useEffect, useMemo, useRef } from 'react';
import { assetPath } from '../assetPaths.ts';
import type { RhythmLane } from '../types.ts';

const RHYTHM_TAP_SFX_SOURCES = [
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing00.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing01.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing02.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing03.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing04.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing05.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing06.mp3'),
  assetPath('audio/sfx/rhythm/SE-tap_note-keyboard_typing07.mp3'),
] as const;

const RHYTHM_HOLD_KEYBOARD_SFX_SOURCE = assetPath('audio/sfx/rhythm/SE-hold_loop-keyboard_typing.mp3');
const RHYTHM_HOLD_OVERLAY_SFX_SOURCE = assetPath('audio/sfx/rhythm/SE-hold_loop-overlay_effect.mp3');
const RHYTHM_HOLD_OVERLAY_FADE_MS = 260;
const RHYTHM_TAP_SFX_VOLUME = 0.72;
const RHYTHM_HOLD_KEYBOARD_SFX_VOLUME = 0.42;
const RHYTHM_HOLD_OVERLAY_SFX_VOLUME = 0.5;

type HoldLoop = {
  keyboard: HTMLAudioElement;
  overlay: HTMLAudioElement;
  overlayFadeFrame: number | null;
  overlayFaded: boolean;
};

export type RhythmSfxController = {
  playTap: () => void;
  startHold: (lane: RhythmLane) => void;
  fadeOverlay: (lane: RhythmLane) => void;
  stopHold: (lane: RhythmLane) => void;
  stopAllHolds: () => void;
};

export function useRhythmSfx(): RhythmSfxController {
  const holdLoopsRef = useRef<Map<RhythmLane, HoldLoop>>(new Map());

  const stopAudio = useCallback((audio: HTMLAudioElement) => {
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const stopHold = useCallback((lane: RhythmLane) => {
    const loop = holdLoopsRef.current.get(lane);
    if (!loop) return;

    if (loop.overlayFadeFrame !== null) {
      window.cancelAnimationFrame(loop.overlayFadeFrame);
    }
    stopAudio(loop.keyboard);
    stopAudio(loop.overlay);
    holdLoopsRef.current.delete(lane);
  }, [stopAudio]);

  const stopAllHolds = useCallback(() => {
    Array.from(holdLoopsRef.current.keys()).forEach((lane) => stopHold(lane));
  }, [stopHold]);

  useEffect(() => stopAllHolds, [stopAllHolds]);

  const playTap = useCallback(() => {
    const source = RHYTHM_TAP_SFX_SOURCES[Math.floor(Math.random() * RHYTHM_TAP_SFX_SOURCES.length)];
    const audio = new Audio(source);
    audio.volume = RHYTHM_TAP_SFX_VOLUME;
    audio.play().catch(() => undefined);
  }, []);

  const startHold = useCallback((lane: RhythmLane) => {
    if (holdLoopsRef.current.has(lane)) return;

    const keyboard = new Audio(RHYTHM_HOLD_KEYBOARD_SFX_SOURCE);
    const overlay = new Audio(RHYTHM_HOLD_OVERLAY_SFX_SOURCE);
    keyboard.loop = true;
    overlay.loop = true;
    keyboard.volume = RHYTHM_HOLD_KEYBOARD_SFX_VOLUME;
    overlay.volume = RHYTHM_HOLD_OVERLAY_SFX_VOLUME;

    holdLoopsRef.current.set(lane, {
      keyboard,
      overlay,
      overlayFadeFrame: null,
      overlayFaded: false,
    });
    keyboard.play().catch(() => undefined);
    overlay.play().catch(() => undefined);
  }, []);

  const fadeOverlay = useCallback((lane: RhythmLane) => {
    const loop = holdLoopsRef.current.get(lane);
    if (!loop || loop.overlayFaded) return;

    loop.overlayFaded = true;
    const startedAt = performance.now();
    const startVolume = loop.overlay.volume;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / RHYTHM_HOLD_OVERLAY_FADE_MS);
      loop.overlay.volume = startVolume * (1 - progress);
      if (progress < 1 && holdLoopsRef.current.get(lane) === loop) {
        loop.overlayFadeFrame = window.requestAnimationFrame(step);
        return;
      }

      loop.overlayFadeFrame = null;
      stopAudio(loop.overlay);
    };

    loop.overlayFadeFrame = window.requestAnimationFrame(step);
  }, [stopAudio]);

  return useMemo(() => ({
    playTap,
    startHold,
    fadeOverlay,
    stopHold,
    stopAllHolds,
  }), [fadeOverlay, playTap, startHold, stopAllHolds, stopHold]);
}
