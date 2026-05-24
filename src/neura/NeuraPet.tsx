import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { assetPath } from '../assetPaths.ts';
import { getNeuraPresencePreset } from '../data/neuraPresence.ts';
import { NEURA_VOICE_BASE_PATH, neuraVoiceAssets } from '../data/neuraVoiceAssets';
import { neuraVoiceLinesV2 } from '../data/dialogue/neuraVoiceLines';
import { neuraReactionVoiceLineIds, type NeuraVoiceLine, type NeuraVoiceLineId } from '../data/neuraVoiceLines';
import type { NeuraPresenceEventId, NeuraPresenceState } from '../types.ts';
import { useNeuraAvatarMotion } from './useNeuraAvatarMotion.ts';

type Point = { x: number; y: number };
type NeuraPetMood = 'idle' | 'waving' | 'jumping' | 'failed' | 'waiting' | 'running' | 'review';
type NeuraAnimation = {
  row: number;
  frames: number;
  duration: string;
  label: string;
};

const NEURA_SPRITESHEET_PATH = assetPath('pets/neura/spritesheet.webp');
const NEURA_MANUAL_PAUSE_MS = 6500;
const NEURA_ANIMATIONS: Record<NeuraPetMood, NeuraAnimation> = {
  idle: { row: 0, frames: 6, duration: '1.1s', label: 'czuwanie' },
  running: { row: 7, frames: 6, duration: '0.82s', label: 'przeciąganie' },
  waving: { row: 3, frames: 4, duration: '0.84s', label: 'kontakt' },
  jumping: { row: 4, frames: 5, duration: '0.92s', label: 'impuls' },
  failed: { row: 5, frames: 8, duration: '1.28s', label: 'glitch' },
  waiting: { row: 6, frames: 6, duration: '1.16s', label: 'nasłuch' },
  review: { row: 8, frames: 6, duration: '1.22s', label: 'analiza' },
};
const NEURA_REACTION_SEQUENCE: NeuraPetMood[] = ['waving', 'review', 'failed'];
const LEGACY_NEURA_VOICE_LINE_IDS = Object.keys(neuraVoiceAssets) as NeuraVoiceLineId[];
const DIALOGUE_NEURA_VOICE_LINE_IDS = neuraVoiceLinesV2.map((line) => line.audio.id);
const NEURA_VOICE_LINE_IDS = [...LEGACY_NEURA_VOICE_LINE_IDS, ...DIALOGUE_NEURA_VOICE_LINE_IDS];

export function NeuraPet({
  comment,
  presenceState,
  onPresenceEvent,
  storyVoiceLineId,
}: {
  comment: NeuraVoiceLine;
  presenceState: NeuraPresenceState;
  onPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  storyVoiceLineId?: string | null;
}) {
  const [mood, setMood] = useState<NeuraPetMood>('idle');
  const [position, setPosition] = useState<Point>(() => getDefaultNeuraPosition());
  const dragRef = useRef<{ startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  const reactionIndexRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  const patrolTimerRef = useRef<number | null>(null);
  const manualPauseUntilRef = useRef(0);
  const availableVoiceLineIds = useAvailableNeuraVoiceIds();
  const playNeuraVoice = useNeuraVoice(availableVoiceLineIds);
  const animation = NEURA_ANIMATIONS[mood];
  const hasCommentAudio = availableVoiceLineIds.has(comment.id);
  const hasStoryAudio = storyVoiceLineId ? availableVoiceLineIds.has(storyVoiceLineId) : false;
  const motionVars = useNeuraAvatarMotion(presenceState);
  const preset = getNeuraPresencePreset(presenceState.powerLevel);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => clampNeuraPosition(current));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    if (patrolTimerRef.current !== null) window.clearInterval(patrolTimerRef.current);
  }, []);

  useEffect(() => {
    if (!hasCommentAudio) return;
    playNeuraVoice(comment.id, 'comment');
  }, [comment.id, hasCommentAudio, playNeuraVoice]);

  useEffect(() => {
    if (!storyVoiceLineId || !hasStoryAudio) return;
    manualPauseUntilRef.current = Date.now() + NEURA_MANUAL_PAUSE_MS;
    settleMood('review', 1300);
    playNeuraVoice(storyVoiceLineId, 'story');
  }, [hasStoryAudio, playNeuraVoice, storyVoiceLineId]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    if (patrolTimerRef.current !== null) window.clearInterval(patrolTimerRef.current);
    patrolTimerRef.current = window.setInterval(() => {
      if (dragRef.current || Date.now() < manualPauseUntilRef.current) return;

      setMood('running');
      setPosition(getNextNeuraPatrolPosition(presenceState.avatarInstability));
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(() => {
        setMood('idle');
        settleTimerRef.current = null;
      }, 1200);
    }, presenceState.lowFxMode ? Math.round(preset.avatar.patrolIntervalMs * 1.8) : preset.avatar.patrolIntervalMs);

    return () => {
      if (patrolTimerRef.current !== null) window.clearInterval(patrolTimerRef.current);
      patrolTimerRef.current = null;
    };
  }, [presenceState.avatarInstability, presenceState.lowFxMode, preset.avatar.patrolIntervalMs]);

  function settleMood(nextMood: NeuraPetMood, delayMs = 1500) {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    setMood(nextMood);
    settleTimerRef.current = window.setTimeout(() => {
      setMood('idle');
      settleTimerRef.current = null;
    }, delayMs);
  }

  function playReaction(nextMood: NeuraPetMood) {
    const reactionLineId = neuraReactionVoiceLineIds[nextMood as keyof typeof neuraReactionVoiceLineIds];
    if (!reactionLineId || !availableVoiceLineIds.has(reactionLineId)) return;
    manualPauseUntilRef.current = Date.now() + NEURA_MANUAL_PAUSE_MS;
    onPresenceEvent('manualReaction');
    settleMood(nextMood);
    playNeuraVoice(reactionLineId, 'reaction');
  }

  function cycleReaction() {
    const nextMood = NEURA_REACTION_SEQUENCE[reactionIndexRef.current % NEURA_REACTION_SEQUENCE.length];
    reactionIndexRef.current += 1;
    playReaction(nextMood);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      moved: false,
    };
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    manualPauseUntilRef.current = Date.now() + NEURA_MANUAL_PAUSE_MS;
    setMood('running');
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragRef.current.moved = true;
    setPosition(clampNeuraPosition({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;

    const wasMoved = dragRef.current.moved;
    dragRef.current = null;
    manualPauseUntilRef.current = Date.now() + NEURA_MANUAL_PAUSE_MS;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (wasMoved) {
      onPresenceEvent('manualReaction');
      settleMood('jumping', 900);
      return;
    }
    cycleReaction();
  }

  const style = useMemo(() => ({
    '--neura-x': `${position.x}px`,
    '--neura-y': `${position.y}px`,
    '--neura-row': animation.row,
    '--neura-frames': animation.frames,
    '--neura-duration': animation.duration,
    '--neura-sprite': `url("${NEURA_SPRITESHEET_PATH}")`,
    ...motionVars,
  }) as CSSProperties, [animation.duration, animation.frames, animation.row, motionVars, position.x, position.y]);

  return (
    <aside
      className={`neura neura-${mood} neura-power-${presenceState.powerLevel}`}
      data-neura-stage={presenceState.narrativeTag}
      style={style}
      aria-live="polite"
    >
      <button
        className="neura-sprite-pad"
        type="button"
        onPointerDown={beginDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="Neura: kliknij lub przeciągnij"
        title="Kliknij lub przeciągnij Neurę"
      >
        <span className="neura-sprite" aria-hidden="true" />
      </button>
    </aside>
  );
}

function useAvailableNeuraVoiceIds() {
  const [availableIds, setAvailableIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();

    async function hasAudio(path: string) {
      try {
        const response = await fetch(path, { method: 'HEAD', signal: controller.signal });
        return response.ok;
      } catch {
        return false;
      }
    }

    async function resolveAvailability() {
      const entries = await Promise.all(
        NEURA_VOICE_LINE_IDS.map(async (lineId) => {
          const sources = getNeuraVoiceSources(lineId);
          const hasPrimary = await hasAudio(sources.primary);
          const hasFallback = hasPrimary ? false : await hasAudio(sources.fallback);
          return [lineId, hasPrimary || hasFallback] as const;
        }),
      );

      if (!controller.signal.aborted) {
        setAvailableIds(new Set(entries.filter(([, isAvailable]) => isAvailable).map(([lineId]) => lineId)));
      }
    }

    void resolveAvailability();
    return () => controller.abort();
  }, []);

  return availableIds;
}

function useNeuraVoice(availableVoiceLineIds: ReadonlySet<string>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUnlockedRef = useRef(false);
  const canPlayOpusRef = useRef<boolean | null>(null);
  const queuedLineIdRef = useRef<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  function canPlayOpus() {
    if (canPlayOpusRef.current !== null) return canPlayOpusRef.current;
    const audio = document.createElement('audio');
    canPlayOpusRef.current = audio.canPlayType('audio/ogg; codecs="opus"') !== '';
    return canPlayOpusRef.current;
  }

  const createAudio = useCallback((lineId: string) => {
    const sources = getNeuraVoiceSources(lineId);
    if (!sources || !availableVoiceLineIds.has(lineId)) return null;
    return new Audio(canPlayOpus() ? sources.primary : sources.fallback);
  }, [availableVoiceLineIds]);

  const playQueuedLine = useCallback(() => {
    const queuedLineId = queuedLineIdRef.current;
    queuedLineIdRef.current = null;
    if (!queuedLineId) return;

    const audio = createAudio(queuedLineId);
    if (!audio) return;

    audioRef.current = audio;
    audio.addEventListener('ended', playQueuedLine, { once: true });
    audio.addEventListener('error', playQueuedLine, { once: true });
    audio.play().catch(() => {
      const sources = getNeuraVoiceSources(queuedLineId);
      if (!sources || audio.src.endsWith(sources.fallback)) {
        playQueuedLine();
        return;
      }
      const fallbackAudio = new Audio(sources.fallback);
      audioRef.current = fallbackAudio;
      fallbackAudio.addEventListener('ended', playQueuedLine, { once: true });
      fallbackAudio.addEventListener('error', playQueuedLine, { once: true });
      fallbackAudio.play().catch(() => undefined);
    });
  }, [createAudio]);

  return useCallback((lineId: string, source: 'comment' | 'reaction' | 'story') => {
    if (source === 'reaction' || source === 'story') isUnlockedRef.current = true;
    if (!isUnlockedRef.current || !availableVoiceLineIds.has(lineId)) return;

    const currentAudio = audioRef.current;
    if (currentAudio && !currentAudio.paused && !currentAudio.ended) {
      if (source === 'reaction') return;
      queuedLineIdRef.current = lineId;
      return;
    }

    queuedLineIdRef.current = lineId;
    playQueuedLine();
  }, [availableVoiceLineIds, playQueuedLine]);
}

function getNeuraVoiceSources(lineId: string) {
  return neuraVoiceAssets[lineId as NeuraVoiceLineId] ?? {
    primary: `${NEURA_VOICE_BASE_PATH}/${lineId}.ogg`,
    fallback: `${NEURA_VOICE_BASE_PATH}/${lineId}.mp3`,
  };
}

function getDefaultNeuraPosition(): Point {
  return clampNeuraPosition({
    x: window.innerWidth * 0.4,
    y: window.innerHeight * 0.7,
  });
}

function getNextNeuraPatrolPosition(instability: number): Point {
  const minX = Math.max(24, Math.floor(window.innerWidth * (0.5 - instability * 0.08)));
  const maxX = Math.max(minX, window.innerWidth - 178);
  const minY = Math.max(74, Math.floor(window.innerHeight * (0.6 - instability * 0.1)));
  const maxY = Math.max(minY, window.innerHeight - 184);

  return clampNeuraPosition({
    x: minX + Math.random() * (maxX - minX),
    y: minY + Math.random() * (maxY - minY),
  });
}

function clampNeuraPosition(position: Point): Point {
  const maxX = Math.max(24, window.innerWidth - 156);
  const maxY = Math.max(66, window.innerHeight - 174);

  return {
    x: Math.max(24, Math.min(maxX, position.x)),
    y: Math.max(66, Math.min(maxY, position.y)),
  };
}
