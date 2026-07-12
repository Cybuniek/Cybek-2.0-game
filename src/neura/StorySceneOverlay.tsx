import { useEffect, useMemo, useRef, useState } from 'react';
import { assetPath } from '../assetPaths.ts';
import type { StoryScene } from '../data/dialogue/storyScenes.ts';

type AudioStatus = 'loading' | 'playing' | 'ended' | 'error' | 'textOnly';

const STORY_SCENE_AUDIO_BASE_PATH = assetPath('audio/story-scenes');
const TEXT_FALLBACK_DELAY_MS = 900;

export function StorySceneOverlay({
  scene,
  lineIndex,
  onAdvance,
}: {
  scene: StoryScene;
  lineIndex: number;
  onAdvance: () => void;
}) {
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('loading');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const line = scene.lines[lineIndex] ?? scene.lines[0];
  const canAdvance = audioStatus === 'ended' || audioStatus === 'error' || audioStatus === 'textOnly';
  const progressLabel = `${lineIndex + 1}/${scene.lines.length}`;
  const statusLabel = audioStatus === 'error'
    ? 'Cisza w kadrze'
    : audioStatus === 'textOnly'
      ? 'Cisza w kadrze'
      : audioStatus === 'ended'
        ? 'Gotowe'
        : 'Odtwarzanie...';

  const sources = useMemo(() => {
    if (!line.audioId) return null;
    return {
      primary: `${STORY_SCENE_AUDIO_BASE_PATH}/${line.audioId}.ogg`,
      fallback: `${STORY_SCENE_AUDIO_BASE_PATH}/${line.audioId}.mp3`,
    };
  }, [line.audioId]);

  useEffect(() => {
    let cancelled = false;
    let triedFallback = false;
    if (!sources) {
      audioRef.current?.pause();
      audioRef.current = null;
      setAudioStatus('textOnly');
      return () => {
        cancelled = true;
      };
    }
    const activeSources = sources;
    const audio = new Audio(activeSources.primary);
    audioRef.current = audio;
    setAudioStatus('loading');
    const fallbackTimer = window.setTimeout(() => finishWith('error'), TEXT_FALLBACK_DELAY_MS);

    function finishWith(status: AudioStatus) {
      if (!cancelled) {
        window.clearTimeout(fallbackTimer);
        setAudioStatus(status);
      }
    }

    function playCurrent(nextAudio: HTMLAudioElement) {
      nextAudio.preload = 'auto';
      nextAudio.addEventListener('playing', () => finishWith('playing'), { once: true });
      nextAudio.addEventListener('ended', () => finishWith('ended'), { once: true });
      nextAudio.addEventListener('error', () => {
        if (triedFallback) {
          finishWith('error');
          return;
        }
        triedFallback = true;
        const fallbackAudio = new Audio(activeSources.fallback);
        audioRef.current = fallbackAudio;
        playCurrent(fallbackAudio);
      }, { once: true });
      nextAudio.play().catch(() => finishWith('error'));
    }

    playCurrent(audio);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [sources]);

  return (
    <section className="story-scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="story-scene-title">
      <div className="story-scene-panel">
        <header className="story-scene-header">
          <span>{progressLabel}</span>
          <strong id="story-scene-title">{scene.title}</strong>
          <em>{statusLabel}</em>
        </header>
        <div className={`story-scene-speaker speaker-${line.speaker.toLowerCase()}`}>
          <span>{line.speaker}</span>
          <p>{line.text}</p>
        </div>
        <footer className="story-scene-footer">
          <button type="button" onClick={onAdvance} disabled={!canAdvance}>
            Dalej
          </button>
        </footer>
      </div>
    </section>
  );
}
