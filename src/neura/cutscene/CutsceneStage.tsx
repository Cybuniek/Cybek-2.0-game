import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';
import { assetPath } from '../../assetPaths.ts';
import type { StoryScene } from '../../data/dialogue/storyScenes.ts';
import { CybekPortrait } from './CybekPortrait.tsx';
import { NeuraPortrait } from './NeuraPortrait.tsx';
import { cybekEventForIntent, neuraExpressionForIntent } from './expressionMapping.ts';
import { useTypewriter } from './useTypewriter.ts';

type AudioStatus = 'loading' | 'playing' | 'ended' | 'error';

const STORY_SCENE_AUDIO_BASE_PATH = assetPath('audio/story-scenes');
const TEXT_FALLBACK_DELAY_MS = 900;
const DEFAULT_TYPEWRITER_SPEED_MS = 22;
const LOW_FX_TYPEWRITER_SPEED_MS = 10;
const MIN_TYPEWRITER_SPEED_MS = 8;

export function CutsceneStage({
  scene,
  lineIndex,
  onAdvance,
  lowFx = false,
  glitchLevel = 0,
}: {
  scene: StoryScene;
  lineIndex: number;
  onAdvance: () => void;
  lowFx?: boolean;
  glitchLevel?: number;
}) {
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('loading');
  const fallbackTypewriterSpeedMs = lowFx ? LOW_FX_TYPEWRITER_SPEED_MS : DEFAULT_TYPEWRITER_SPEED_MS;
  const [typewriterSpeedMs, setTypewriterSpeedMs] = useState(fallbackTypewriterSpeedMs);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const playbackTokenRef = useRef(0);
  const line = scene.lines[lineIndex] ?? scene.lines[0];
  const isNeuraSpeaking = line.speaker === 'Neura';
  const neuraExpression = isNeuraSpeaking ? neuraExpressionForIntent(line.audioIntent) : 'calm';
  const cybekEvent = isNeuraSpeaking ? 'idle' : cybekEventForIntent(line.audioIntent);
  const typewriter = useTypewriter(line.text, { speedMs: typewriterSpeedMs });
  const progressLabel = `${lineIndex + 1}/${scene.lines.length}`;
  const statusLabel = getAudioStatusLabel(audioStatus);

  const sources = useMemo(() => ({
    primary: `${STORY_SCENE_AUDIO_BASE_PATH}/${line.audioId}.ogg`,
    fallback: `${STORY_SCENE_AUDIO_BASE_PATH}/${line.audioId}.mp3`,
  }), [line.audioId]);

  const requestAdvance = useCallback(() => {
    if (!typewriter.isComplete) {
      typewriter.revealAll();
      return;
    }

    stopCurrentAudio(audioRef);
    setAudioStatus('ended');
    onAdvance();
  }, [onAdvance, typewriter]);

  useEffect(() => {
    stageRef.current?.focus();
  }, [line.id]);

  useEffect(() => {
    setTypewriterSpeedMs(fallbackTypewriterSpeedMs);
  }, [fallbackTypewriterSpeedMs, line.id]);

  useEffect(() => {
    let cancelled = false;
    let triedFallback = false;
    const playbackToken = playbackTokenRef.current + 1;
    playbackTokenRef.current = playbackToken;
    const audio = new Audio(sources.primary);
    audioRef.current = audio;
    setAudioStatus('loading');
    setTypewriterSpeedMs(fallbackTypewriterSpeedMs);
    const fallbackTimer = window.setTimeout(() => finishWith('error'), TEXT_FALLBACK_DELAY_MS);
    const startTimer = window.setTimeout(() => playCurrent(audio), 0);

    function finishWith(status: AudioStatus) {
      if (!cancelled && playbackTokenRef.current === playbackToken) {
        window.clearTimeout(fallbackTimer);
        setAudioStatus(status);
      }
    }

    function tryFallback() {
      if (cancelled || playbackTokenRef.current !== playbackToken) return;
      if (triedFallback) {
        finishWith('error');
        return;
      }
      triedFallback = true;
      const fallbackAudio = new Audio(sources.fallback);
      audioRef.current = fallbackAudio;
      playCurrent(fallbackAudio);
    }

    function playCurrent(nextAudio: HTMLAudioElement) {
      if (cancelled || playbackTokenRef.current !== playbackToken) return;
      nextAudio.preload = 'auto';
      nextAudio.addEventListener('loadedmetadata', () => syncTypewriterSpeed(nextAudio), { once: true });
      nextAudio.addEventListener('playing', () => finishWith('playing'), { once: true });
      nextAudio.addEventListener('ended', () => finishWith('ended'), { once: true });
      nextAudio.addEventListener('error', tryFallback, { once: true });
      syncTypewriterSpeed(nextAudio);
      nextAudio.play().catch(tryFallback);
    }

    function syncTypewriterSpeed(nextAudio: HTMLAudioElement) {
      if (cancelled || playbackTokenRef.current !== playbackToken) return;
      const durationMs = nextAudio.duration * 1000;
      setTypewriterSpeedMs(resolveAudioSyncedTypewriterSpeedMs(
        line.text,
        durationMs,
        fallbackTypewriterSpeedMs,
      ));
    }

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(fallbackTimer);
      if (playbackTokenRef.current === playbackToken) stopCurrentAudio(audioRef);
    };
  }, [fallbackTypewriterSpeedMs, line.text, sources.fallback, sources.primary]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      requestAdvance();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestAdvance]);

  function handleStageClick(event: MouseEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    requestAdvance();
  }

  return (
    <section
      className="cutscene-stage"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cutscene-title"
      ref={stageRef}
      tabIndex={-1}
      onClick={handleStageClick}
    >
      <div className="cutscene-letterbox top" aria-hidden="true" />
      <div className="cutscene-camera" key={line.id}>
        <div className="cutscene-vignette" aria-hidden="true" />
        <div className="cutscene-scanlines" aria-hidden="true" />
        <div className="cutscene-transition" aria-hidden="true" />

        <div className="cutscene-character cutscene-character-cybek" data-active={!isNeuraSpeaking}>
          <CybekPortrait active={!isNeuraSpeaking} eventName={cybekEvent} />
        </div>
        <div className="cutscene-character cutscene-character-neura" data-active={isNeuraSpeaking}>
          <NeuraPortrait
            expression={neuraExpression}
            active={isNeuraSpeaking}
            lowFx={lowFx}
            glitchLevel={glitchLevel}
          />
        </div>

        <article className={`cutscene-dialogue speaker-${line.speaker.toLowerCase()}`}>
          <header className="cutscene-header">
            <span>{progressLabel}</span>
            <strong id="cutscene-title">{scene.title}</strong>
            <em>{statusLabel}</em>
          </header>
          <div className="cutscene-speaker-row">
            <span className="cutscene-speaker-name">{line.speaker}</span>
            <span className="cutscene-intent">{line.audioIntent ?? 'calm'}</span>
          </div>
          <p className="cutscene-text">
            {typewriter.visibleText}
            {!typewriter.isComplete && <span className="cutscene-caret" aria-hidden="true" />}
          </p>
          <footer className="cutscene-footer">
            <button
              type="button"
              onClick={requestAdvance}
            >
              {typewriter.isComplete ? 'Dalej' : 'Pokaż tekst'}
            </button>
          </footer>
        </article>
      </div>
      <div className="cutscene-letterbox bottom" aria-hidden="true" />
    </section>
  );
}

function stopCurrentAudio(audioRef: MutableRefObject<HTMLAudioElement | null>) {
  const audio = audioRef.current;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audioRef.current = null;
}

export function resolveAudioSyncedTypewriterSpeedMs(
  text: string,
  durationMs: number,
  fallbackSpeedMs = DEFAULT_TYPEWRITER_SPEED_MS,
) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return fallbackSpeedMs;
  return Math.max(MIN_TYPEWRITER_SPEED_MS, durationMs / Math.max(1, text.length));
}

function getAudioStatusLabel(status: AudioStatus) {
  if (status === 'error') return 'Audio niedostępne';
  if (status === 'ended') return 'Gotowe';
  if (status === 'playing') return 'Odtwarzanie...';
  return 'Ładowanie...';
}
