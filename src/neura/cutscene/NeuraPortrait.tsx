import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { assetPath } from '../../assetPaths.ts';
import {
  validateCutsceneExpressionManifest,
  type CutsceneExpressionManifest,
  type CutsceneExpressionName,
} from './assetManifest.ts';

type NeuraPortraitProps = {
  expression: CutsceneExpressionName;
  active: boolean;
  lowFx?: boolean;
  glitchLevel?: number;
};

const NEURA_CUTSCENE_BASE_PATH = 'pets/neura/cutscene';
const expressionSpecs: Record<CutsceneExpressionName, { frames: number; fps: number }> = {
  calm: { frames: 3, fps: 4 },
  curious: { frames: 4, fps: 5 },
  tired: { frames: 3, fps: 3 },
  dry: { frames: 3, fps: 4 },
  delighted: { frames: 5, fps: 6 },
  glitch: { frames: 5, fps: 8 },
};

export function NeuraPortrait({
  expression,
  active,
  lowFx = false,
  glitchLevel = 0,
}: NeuraPortraitProps) {
  const [manifest, setManifest] = useState(() => createFallbackManifest(expression));
  const [frame, setFrame] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const shouldAnimate = active && !lowFx && !reducedMotion;
  const frameDelayMs = Math.max(80, Math.round(1000 / manifest.fps));
  const stripSource = assetPath(`${NEURA_CUTSCENE_BASE_PATH}/${expression}/${manifest.strip}`);

  useEffect(() => {
    let cancelled = false;
    setFrame(0);
    setManifest(createFallbackManifest(expression));

    fetch(assetPath(`${NEURA_CUTSCENE_BASE_PATH}/${expression}/manifest.json`))
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => validateCutsceneExpressionManifest(payload))
      .then((nextManifest) => {
        if (!cancelled) setManifest(nextManifest);
      })
      .catch((error) => {
        console.warn(`[cutscene] Nie udalo sie wczytac manifestu ekspresji "${expression}".`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [expression]);

  useEffect(() => {
    if (!shouldAnimate) {
      setFrame(0);
      return undefined;
    }

    const id = window.setInterval(() => {
      setFrame((current) => {
        if (!manifest.loop && current >= manifest.frames - 1) return current;
        return (current + 1) % manifest.frames;
      });
    }, frameDelayMs);

    return () => window.clearInterval(id);
  }, [frameDelayMs, manifest.frames, manifest.loop, shouldAnimate]);

  return (
    <div
      className={`cutscene-portrait cutscene-neura-portrait${active ? ' active' : ''}`}
      data-expression={expression}
      role="img"
      aria-label={`Neura: ${expression}`}
      style={{
        '--neura-cutscene-frame': frame,
        '--neura-cutscene-frames': manifest.frames,
        '--neura-cutscene-glitch': clamp01(glitchLevel),
      } as CSSProperties}
    >
      <span className="cutscene-neura-frame">
        <img
          className="cutscene-neura-strip"
          src={stripSource}
          alt=""
          draggable={false}
        />
      </span>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

function createFallbackManifest(expression: CutsceneExpressionName): CutsceneExpressionManifest {
  const spec = expressionSpecs[expression];

  return {
    name: expression,
    frameWidth: 512,
    frameHeight: 512,
    frames: spec.frames,
    fps: spec.fps,
    loop: true,
    anchor: 'bottom-center',
    strip: 'strip.png',
    framesDir: 'frames',
    preview: 'preview.png',
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
