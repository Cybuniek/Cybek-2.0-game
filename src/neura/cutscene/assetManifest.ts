export const cutsceneExpressionNames = [
  'calm',
  'curious',
  'tired',
  'dry',
  'delighted',
  'glitch',
] as const;

export type CutsceneExpressionName = (typeof cutsceneExpressionNames)[number];

export type CutsceneExpressionManifest = {
  name: CutsceneExpressionName;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  loop: boolean;
  anchor: 'bottom-center';
  strip: string;
  framesDir?: string;
  preview: string;
  source?: string;
};

export type CutsceneAssetIndex = {
  character: string;
  frameWidth: number;
  frameHeight: number;
  anchor: 'bottom-center';
  expressions: readonly {
    name: CutsceneExpressionName;
    frames: number;
    fps: number;
  }[];
};

const cutsceneExpressionNameSet = new Set<string>(cutsceneExpressionNames);

export function isCutsceneExpressionName(value: unknown): value is CutsceneExpressionName {
  return typeof value === 'string' && cutsceneExpressionNameSet.has(value);
}

export function validateCutsceneExpressionManifest(input: unknown): CutsceneExpressionManifest {
  if (!isRecord(input)) throw new Error('Manifest ekspresji musi byc obiektem.');

  const name = input.name;
  if (!isCutsceneExpressionName(name)) {
    throw new Error(`Nieznana ekspresja cutscenki: ${String(name)}.`);
  }

  const frameWidth = requirePositiveInteger(input.frameWidth, `${name}.frameWidth`);
  const frameHeight = requirePositiveInteger(input.frameHeight, `${name}.frameHeight`);
  const frames = requirePositiveInteger(input.frames, `${name}.frames`);
  const fps = requirePositiveNumber(input.fps, `${name}.fps`);
  const anchor = input.anchor;
  if (anchor !== 'bottom-center') {
    throw new Error(`${name}.anchor musi miec wartosc bottom-center.`);
  }

  const strip = requireNonEmptyString(input.strip, `${name}.strip`);
  const preview = requireNonEmptyString(input.preview, `${name}.preview`);

  return {
    name,
    frameWidth,
    frameHeight,
    frames,
    fps,
    loop: input.loop !== false,
    anchor,
    strip,
    framesDir: typeof input.framesDir === 'string' && input.framesDir ? input.framesDir : undefined,
    preview,
    source: typeof input.source === 'string' && input.source ? input.source : undefined,
  };
}

export function validateCutsceneAssetIndex(input: unknown): CutsceneAssetIndex {
  if (!isRecord(input)) throw new Error('Index assetow cutscenki musi byc obiektem.');

  const character = requireNonEmptyString(input.character, 'character');
  const frameWidth = requirePositiveInteger(input.frameWidth, 'frameWidth');
  const frameHeight = requirePositiveInteger(input.frameHeight, 'frameHeight');
  const anchor = input.anchor;
  if (anchor !== 'bottom-center') throw new Error('anchor musi miec wartosc bottom-center.');
  if (!Array.isArray(input.expressions) || input.expressions.length === 0) {
    throw new Error('expressions musi byc niepusta tablica.');
  }

  const seen = new Set<CutsceneExpressionName>();
  const expressions = input.expressions.map((expression, index) => {
    if (!isRecord(expression)) throw new Error(`expressions[${index}] musi byc obiektem.`);
    const name = expression.name;
    if (!isCutsceneExpressionName(name)) {
      throw new Error(`Nieznana ekspresja w indexie: ${String(name)}.`);
    }
    if (seen.has(name)) throw new Error(`Zduplikowana ekspresja w indexie: ${name}.`);
    seen.add(name);

    return {
      name,
      frames: requirePositiveInteger(expression.frames, `${name}.frames`),
      fps: requirePositiveNumber(expression.fps, `${name}.fps`),
    };
  });

  return {
    character,
    frameWidth,
    frameHeight,
    anchor,
    expressions,
  };
}

function requirePositiveInteger(value: unknown, label: string) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} musi byc dodatnia liczba calkowita.`);
  }
  return numberValue;
}

function requirePositiveNumber(value: unknown, label: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${label} musi byc dodatnia liczba.`);
  }
  return numberValue;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} musi byc niepustym tekstem.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
