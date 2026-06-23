import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cutsceneExpressionNames,
  validateCutsceneAssetIndex,
  validateCutsceneExpressionManifest,
  type CutsceneExpressionManifest,
} from '../src/neura/cutscene/assetManifest.ts';
import { cybekEventForIntent, neuraExpressionForIntent } from '../src/neura/cutscene/expressionMapping.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertThrows(run: () => unknown, message: string) {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(message);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
}

function readPngSize(path: string) {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`plik nie jest PNG: ${path}`);

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const cutsceneRoot = join(process.cwd(), 'public', 'pets', 'neura', 'cutscene');

{
  const sample = validateCutsceneExpressionManifest({
    name: 'calm',
    frameWidth: 512,
    frameHeight: 512,
    frames: 3,
    fps: 4,
    loop: true,
    anchor: 'bottom-center',
    strip: 'strip.png',
    framesDir: 'frames',
    preview: 'preview.png',
  });

  assertEqual(sample.name, 'calm', 'przykladowy manifest zachowuje nazwe ekspresji');
  assertThrows(
    () => validateCutsceneExpressionManifest({ ...sample, frameWidth: 0 }),
    'manifest odrzuca zerowa szerokosc klatki',
  );
  assertThrows(
    () => validateCutsceneExpressionManifest({ ...sample, anchor: 'center' }),
    'manifest odrzuca nieznany anchor',
  );
}

{
  const index = validateCutsceneAssetIndex(readJson(join(cutsceneRoot, 'manifest.json')));
  assertEqual(index.frameWidth, 512, 'index assetow ma szerokosc 512');
  assertEqual(index.frameHeight, 512, 'index assetow ma wysokosc 512');
  assertEqual(index.anchor, 'bottom-center', 'index assetow uzywa kotwicy bottom-center');
  assertEqual(index.expressions.length, cutsceneExpressionNames.length, 'index zawiera wszystkie ekspresje');

  for (const expressionName of cutsceneExpressionNames) {
    const manifest = validateCutsceneExpressionManifest(
      readJson(join(cutsceneRoot, expressionName, 'manifest.json')),
    );
    assertEqual(manifest.name, expressionName, `manifest ${expressionName} ma zgodna nazwe`);
    assertEqual(manifest.frameWidth, index.frameWidth, `manifest ${expressionName} ma zgodna szerokosc`);
    assertEqual(manifest.frameHeight, index.frameHeight, `manifest ${expressionName} ma zgodna wysokosc`);
    assert(
      index.expressions.some((expression) => (
        expression.name === manifest.name
        && expression.frames === manifest.frames
        && expression.fps === manifest.fps
      )),
      `index zgadza sie z manifestem ${expressionName}`,
    );

    const stripSize = readPngSize(join(cutsceneRoot, expressionName, manifest.strip));
    assertEqual(
      stripSize.width,
      manifest.frameWidth * manifest.frames,
      `strip ${expressionName} ma szerokosc frameWidth * frames`,
    );
    assertEqual(stripSize.height, manifest.frameHeight, `strip ${expressionName} ma wysokosc frameHeight`);
    assert(existsSync(join(cutsceneRoot, expressionName, manifest.preview)), `preview ${expressionName} istnieje`);

    const framesDir = manifest.framesDir ?? 'frames';
    for (let frame = 1; frame <= manifest.frames; frame += 1) {
      const framePath = join(cutsceneRoot, expressionName, framesDir, `${String(frame).padStart(2, '0')}.png`);
      const frameSize = readPngSize(framePath);
      assertEqual(frameSize.width, manifest.frameWidth, `klatka ${expressionName}/${frame} ma zgodna szerokosc`);
      assertEqual(frameSize.height, manifest.frameHeight, `klatka ${expressionName}/${frame} ma zgodna wysokosc`);
    }
  }
}

{
  const cases: Array<[string | undefined, ReturnType<typeof neuraExpressionForIntent>]> = [
    [undefined, 'calm'],
    ['calm', 'calm'],
    ['curious', 'curious'],
    ['tired', 'tired'],
    ['dry', 'dry'],
    ['glitch', 'glitch'],
    ['success', 'delighted'],
    ['unknown', 'calm'],
  ];

  for (const [intent, expected] of cases) {
    assertEqual(neuraExpressionForIntent(intent), expected, `intent ${intent ?? 'brak'} mapuje ekspresje Neury`);
  }
}

{
  assertEqual(cybekEventForIntent(), 'idle', 'brak intencji zostawia Cybka idle');
  assertEqual(cybekEventForIntent('calm'), 'idle', 'calm zostawia Cybka idle');
  assertEqual(cybekEventForIntent('curious'), 'review', 'curious daje Cybkowi review');
  assertEqual(cybekEventForIntent('tired'), 'review', 'tired daje Cybkowi review');
  assertEqual(cybekEventForIntent('dry'), 'review', 'dry daje Cybkowi review');
  assertEqual(cybekEventForIntent('glitch'), 'glitch', 'glitch daje Cybkowi glitch');
  assertEqual(cybekEventForIntent('success'), 'published', 'success daje Cybkowi published');
}
