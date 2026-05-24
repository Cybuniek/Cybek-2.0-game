import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction, SyntheticEvent } from 'react';
import { assetPath } from './assetPaths';
import { appLabels } from './data/uiLabels';

export type CybekWebcamEvent = 'idle' | 'rhythm' | 'published' | 'glitch' | 'review';

type CybekWebcamLayerManifest = {
  id: string;
  file: string;
  animated: boolean;
  variant?: 'normal' | 'work' | string;
  framesOverride?: number;
  fpsOverride?: number;
};

type CybekWebcamAnimationManifest = {
  name: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps?: number;
  frameDurationMs?: number;
  loop: boolean;
  layers: CybekWebcamLayerManifest[];
};

type CybekWebcamAnimationIndex = {
  defaultAnimation: string;
  idleVariants: string[];
  eventMap: Partial<Record<CybekWebcamEvent | string, string>>;
};

type LoadedAnimation = {
  index: CybekWebcamAnimationIndex | null;
  manifest: CybekWebcamAnimationManifest | null;
  animationName: string;
  warnings: string[];
  error: string | null;
};

const CYBEK_WEBCAM_BASE_PATH = 'pets/cybek-webcam';
const CYBEK_WEBCAM_IDLE_ROTATE_MS = 12000;
const FALLBACK_INDEX: CybekWebcamAnimationIndex = {
  defaultAnimation: 'idle',
  idleVariants: ['idle'],
  eventMap: {},
};
const LAYER_ORDER = ['background', 'cybek', 'desk-keyboard', 'hands', 'crt-fx', 'frame'] as const;

export function CybekWebcam({
  eventName = 'idle',
  musicBpm,
}: {
  eventName?: CybekWebcamEvent;
  musicBpm?: number;
}) {
  const idleVariantIndex = useIdleVariantIndex();
  const loaded = useCybekWebcamAnimation(eventName, musicBpm, idleVariantIndex);
  const frame = useSharedAnimationFrame(loaded.manifest);
  const [missingLayers, setMissingLayers] = useState<string[]>([]);

  useEffect(() => {
    setMissingLayers([]);
  }, [loaded.animationName]);

  const sortedLayers = useMemo(() => {
    if (!loaded.manifest) return [];
    return [...loaded.manifest.layers].sort((left, right) => layerPriority(left.id) - layerPriority(right.id));
  }, [loaded.manifest]);
  const activeManifest = loaded.manifest;

  const debugMessages = [
    loaded.error,
    ...loaded.warnings,
    ...missingLayers.map((layer) => `Brak warstwy: ${layer}`),
  ].filter(Boolean);

  return (
    <div
      className="cybek-webcam-panel"
      data-animation={loaded.animationName}
      data-state={eventName}
    >
      <span className="webcam-live">{appLabels.live}</span>
      <div className="cybek-webcam-feed">
        {activeManifest ? (
          <div
            className="cybek-webcam-canvas"
            style={{
              '--cybek-frame-width': activeManifest.frameWidth,
              '--cybek-frame-height': activeManifest.frameHeight,
            } as CSSProperties}
          >
            {sortedLayers.map((layer) => (
              <CybekWebcamLayer
                key={`${loaded.animationName}-${layer.id}`}
                animationName={loaded.animationName}
                frame={frame}
                layer={layer}
                manifest={activeManifest}
                onMissingLayer={setMissingLayers}
              />
            ))}
          </div>
        ) : (
          <div className="cybek-webcam-fallback">
            <strong>WEBCAM OFFLINE</strong>
            <span>{loaded.error ?? 'Nie udalo sie wczytac animacji.'}</span>
          </div>
        )}
      </div>
      {debugMessages.length > 0 && (
        <div className="cybek-webcam-debug" aria-live="polite">
          {debugMessages.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CybekWebcamLayer({
  animationName,
  frame,
  layer,
  manifest,
  onMissingLayer,
}: {
  animationName: string;
  frame: number;
  layer: CybekWebcamLayerManifest;
  manifest: CybekWebcamAnimationManifest;
  onMissingLayer: Dispatch<SetStateAction<string[]>>;
}) {
  const [isMissing, setIsMissing] = useState(false);
  const source = assetPath(`${CYBEK_WEBCAM_BASE_PATH}/${animationName}/${layer.file}`);
  const layerFrames = getLayerFrames(layer, manifest);
  const frameIndex = layer.animated ? frame % layerFrames : 0;

  useEffect(() => {
    setIsMissing(false);
  }, [source]);

  function reportMissing(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.style.display = 'none';
    setIsMissing(true);
    onMissingLayer((current) => (current.includes(layer.id) ? current : [...current, layer.id]));
    console.warn(`[cybek-webcam] Missing layer "${layer.id}" in animation "${animationName}": ${source}`);
  }

  if (isMissing) return null;

  if (!layer.animated) {
    return (
      <img
        className={`cybek-webcam-layer cybek-webcam-layer-${layer.id}`}
        src={source}
        alt=""
        draggable={false}
        onError={reportMissing}
      />
    );
  }

  return (
    <span
      className={`cybek-webcam-layer cybek-webcam-layer-viewport cybek-webcam-layer-${layer.id}`}
      style={{
        '--cybek-layer-frames': layerFrames,
        '--cybek-layer-frame': frameIndex,
      } as CSSProperties}
    >
      <img
        className="cybek-webcam-layer-strip"
        src={source}
        alt=""
        draggable={false}
        onError={reportMissing}
      />
    </span>
  );
}

function useCybekWebcamAnimation(
  eventName: CybekWebcamEvent,
  musicBpm: number | undefined,
  idleVariantIndex: number,
): LoadedAnimation {
  const [indexState, setIndexState] = useState<{
    index: CybekWebcamAnimationIndex | null;
    error: string | null;
  }>({ index: null, error: null });
  const selectedAnimation = getSelectedAnimation(indexState.index ?? FALLBACK_INDEX, eventName, musicBpm, idleVariantIndex);
  const [manifestState, setManifestState] = useState<{
    animationName: string;
    manifest: CybekWebcamAnimationManifest | null;
    error: string | null;
  }>({ animationName: selectedAnimation, manifest: null, error: null });

  useEffect(() => {
    let isMounted = true;

    fetchJson<CybekWebcamAnimationIndex>(assetPath(`${CYBEK_WEBCAM_BASE_PATH}/animations.json`))
      .then((index) => {
        if (!isMounted) return;
        setIndexState({ index: normalizeAnimationIndex(index), error: null });
      })
      .catch((error) => {
        const message = 'Brak lub blad animations.json webcam.';
        console.warn('[cybek-webcam]', message, error);
        if (isMounted) setIndexState({ index: FALLBACK_INDEX, error: message });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadManifest() {
      const defaultAnimation = indexState.index?.defaultAnimation ?? FALLBACK_INDEX.defaultAnimation;
      const loaded = await loadManifestWithFallback(selectedAnimation, defaultAnimation);
      if (!isMounted) return;
      setManifestState(loaded);
    }

    loadManifest();

    return () => {
      isMounted = false;
    };
  }, [indexState.index, selectedAnimation]);

  return {
    index: indexState.index,
    manifest: manifestState.manifest,
    animationName: manifestState.animationName,
    warnings: [indexState.error, manifestState.error].filter(Boolean) as string[],
    error: !manifestState.manifest ? manifestState.error ?? indexState.error : null,
  };
}

function useIdleVariantIndex() {
  const [idleVariantIndex, setIdleVariantIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdleVariantIndex((current) => current + 1);
    }, CYBEK_WEBCAM_IDLE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return idleVariantIndex;
}

function useSharedAnimationFrame(manifest: CybekWebcamAnimationManifest | null) {
  const [frame, setFrame] = useState(0);
  const frameDurationMs = manifest ? getFrameDurationMs(manifest) : 125;

  useEffect(() => {
    setFrame(0);
  }, [manifest?.name]);

  useEffect(() => {
    if (!manifest) return undefined;
    const id = window.setInterval(() => {
      setFrame((current) => {
        if (!manifest.loop && current >= manifest.frames - 1) return current;
        return (current + 1) % manifest.frames;
      });
    }, frameDurationMs);

    return () => window.clearInterval(id);
  }, [frameDurationMs, manifest]);

  return frame;
}

async function loadManifestWithFallback(
  animationName: string,
  fallbackAnimationName: string,
): Promise<{
  animationName: string;
  manifest: CybekWebcamAnimationManifest | null;
  error: string | null;
}> {
  const primary = await loadAnimationManifest(animationName);
  if (primary.manifest) return primary;
  if (animationName === fallbackAnimationName) return primary;

  const fallback = await loadAnimationManifest(fallbackAnimationName);
  if (fallback.manifest) {
    return {
      ...fallback,
      error: `${primary.error ?? `Animacja "${animationName}" niedostepna.`} Uzyto "${fallbackAnimationName}".`,
    };
  }

  return {
    animationName,
    manifest: null,
    error: `${primary.error ?? `Animacja "${animationName}" niedostepna.`} Fallback "${fallbackAnimationName}" tez jest niedostepny.`,
  };
}

async function loadAnimationManifest(animationName: string) {
  try {
    const manifest = await fetchJson<CybekWebcamAnimationManifest>(
      assetPath(`${CYBEK_WEBCAM_BASE_PATH}/${animationName}/manifest.json`),
    );
    const normalized = normalizeManifest(manifest);
    return {
      animationName: normalized.name || animationName,
      manifest: normalized,
      error: null,
    };
  } catch (error) {
    const message = `Brak lub blad manifestu animacji "${animationName}".`;
    console.warn('[cybek-webcam]', message, error);
    return { animationName, manifest: null, error: message };
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function normalizeAnimationIndex(index: CybekWebcamAnimationIndex): CybekWebcamAnimationIndex {
  return {
    defaultAnimation: index.defaultAnimation || FALLBACK_INDEX.defaultAnimation,
    idleVariants: index.idleVariants?.length ? index.idleVariants : FALLBACK_INDEX.idleVariants,
    eventMap: index.eventMap ?? {},
  };
}

function normalizeManifest(manifest: CybekWebcamAnimationManifest): CybekWebcamAnimationManifest {
  const frameWidth = Number(manifest.frameWidth);
  const frameHeight = Number(manifest.frameHeight);
  const frames = Number(manifest.frames);
  const fps = manifest.fps === undefined ? undefined : Number(manifest.fps);
  const frameDurationMs = manifest.frameDurationMs === undefined ? undefined : Number(manifest.frameDurationMs);

  if (!Number.isFinite(frameWidth) || frameWidth <= 0) throw new Error('Niepoprawne frameWidth.');
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) throw new Error('Niepoprawne frameHeight.');
  if (!Number.isInteger(frames) || frames <= 0) throw new Error('Niepoprawne frames.');
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) throw new Error('Niepoprawne fps.');
  if (frameDurationMs !== undefined && (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0)) {
    throw new Error('Niepoprawne frameDurationMs.');
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) throw new Error('Brak warstw.');

  return {
    ...manifest,
    frameWidth,
    frameHeight,
    frames,
    fps,
    frameDurationMs,
    layers: manifest.layers.filter((layer) => layer.id && layer.file),
  };
}

function getSelectedAnimation(
  index: CybekWebcamAnimationIndex,
  eventName: CybekWebcamEvent,
  musicBpm: number | undefined,
  idleVariantIndex: number,
) {
  if (eventName === 'rhythm' || musicBpm) return index.eventMap.rhythm ?? 'work';
  if (eventName !== 'idle') return index.eventMap[eventName] ?? index.defaultAnimation;

  const variants = index.idleVariants.length ? index.idleVariants : [index.defaultAnimation];
  return variants[idleVariantIndex % variants.length] ?? index.defaultAnimation;
}

function getFrameDurationMs(manifest: CybekWebcamAnimationManifest) {
  if (manifest.frameDurationMs) return manifest.frameDurationMs;
  return Math.round(1000 / (manifest.fps ?? 8));
}

function getLayerFrames(layer: CybekWebcamLayerManifest, manifest: CybekWebcamAnimationManifest) {
  const frameCount = layer.framesOverride ?? manifest.frames;
  return Number.isInteger(frameCount) && frameCount > 0 ? frameCount : manifest.frames;
}

function layerPriority(layerId: string) {
  const priority = LAYER_ORDER.indexOf(layerId as (typeof LAYER_ORDER)[number]);
  return priority === -1 ? LAYER_ORDER.length : priority;
}
