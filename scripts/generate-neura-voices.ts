import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neuraVoiceLines as legacyNeuraVoiceLines } from '../src/data/neuraVoiceLines.ts';
import { neuraVoiceLinesV2 } from '../src/data/dialogue/neuraVoiceLines.ts';
import { storyScenes, type StorySceneSpeaker } from '../src/data/dialogue/storyScenes.ts';

const DEFAULT_ELEVENLABS_NEURA_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
const DEFAULT_ELEVENLABS_MODEL_ID = 'eleven_v3';
const LANGUAGE_CODE = 'pl';
const VOICE_OUTPUTS = {
  opus: {
    outputFormat: 'opus_48000_32',
    extension: 'ogg',
  },
  mp3: {
    outputFormat: 'mp3_44100_128',
    extension: 'mp3',
  },
} as const;
type VoiceOutputKind = keyof typeof VOICE_OUTPUTS;
type VoiceSource = 'legacy' | 'dialogue-v2' | 'story-scenes';
type VoiceLineForGeneration = {
  id: string;
  text: string;
  styleTag: string;
  speaker: StorySceneSpeaker;
  phase?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

type Options = {
  dryRun: boolean;
  force: boolean;
  formats: VoiceOutputKind[];
  source: VoiceSource;
  phase?: string;
  fromId?: string;
  only?: string;
};

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    formats: args.includes('--mp3-only') ? ['mp3'] : args.includes('--with-fallback') ? ['opus', 'mp3'] : ['opus'],
    source: 'legacy',
  };
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex !== -1) {
    const source = args[sourceIndex + 1];
    if (source !== 'legacy' && source !== 'dialogue-v2' && source !== 'story-scenes') {
      throw new Error(`Nieznane źródło głosu: ${source}. Użyj legacy, dialogue-v2 albo story-scenes.`);
    }
    options.source = source;
  }
  const phaseIndex = args.indexOf('--phase');
  if (phaseIndex !== -1) options.phase = args[phaseIndex + 1];
  const fromIdIndex = args.indexOf('--from-id');
  if (fromIdIndex !== -1) options.fromId = args[fromIdIndex + 1];
  const onlyIndex = args.indexOf('--only');
  if (onlyIndex !== -1) options.only = args[onlyIndex + 1];
  return options;
}

function loadLocalEnv() {
  const envPath = join(rootDir, '.env.local');
  if (!existsSync(envPath)) return;

  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

async function generateVoiceLine(
  line: VoiceLineForGeneration,
  output: (typeof VOICE_OUTPUTS)[VoiceOutputKind],
  outputPath: string,
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Brak ELEVENLABS_API_KEY w środowisku albo .env.local.');
  const voiceId = getVoiceIdForSpeaker(line.speaker);
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID;
  console.log(`voice request: ${line.id} / speaker=${line.speaker} / model=${modelId} / voice=${voiceId} / tag=${line.styleTag}`);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${output.outputFormat}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: `${line.styleTag} ${line.text}`,
        model_id: modelId,
        language_code: LANGUAGE_CODE,
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75,
          style: 0.65,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ElevenLabs zwrócił ${response.status}: ${details}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, bytes);
  return bytes.length;
}

function getVoiceLines(options: Options): VoiceLineForGeneration[] {
  const sourceLines = getSourceVoiceLines(options.source);

  let lines = options.phase ? sourceLines.filter((line) => line.phase === options.phase) : sourceLines;

  if (options.fromId) {
    const startIndex = lines.findIndex((line) => line.id === options.fromId);
    if (startIndex === -1) throw new Error(`Nie znaleziono startowego id: ${options.fromId}`);
    lines = lines.slice(startIndex);
  }

  if (options.only) lines = lines.filter((line) => line.id === options.only);
  return lines;
}

function getSourceVoiceLines(source: VoiceSource): VoiceLineForGeneration[] {
  if (source === 'story-scenes') {
    return storyScenes.flatMap((scene) => scene.lines.map((line) => ({
      id: line.audioId,
      text: line.text,
      styleTag: styleTagFromStoryLine(line.speaker, line.audioIntent),
      speaker: line.speaker,
    })));
  }

  if (source === 'dialogue-v2') {
    return neuraVoiceLinesV2.map((line) => ({
      id: line.audio.id,
      text: line.text,
      styleTag: styleTagFromAudioIntent(line.audioIntent),
      speaker: 'Neura',
      phase: line.phase,
    }));
  }

  return legacyNeuraVoiceLines.map((line) => ({
    id: line.id,
    text: line.text,
    styleTag: line.styleTag,
    speaker: 'Neura',
  }));
}

function getVoiceIdForSpeaker(speaker: StorySceneSpeaker) {
  if (speaker === 'Cybek') {
    const cybekVoiceId = process.env.ELEVENLABS_CYBEK_VOICE_ID;
    if (!cybekVoiceId) throw new Error('Brak ELEVENLABS_CYBEK_VOICE_ID w środowisku albo .env.local.');
    return cybekVoiceId;
  }

  return process.env.ELEVENLABS_NEURA_VOICE_ID
    || process.env.ELEVENLABS_VOICE_ID
    || DEFAULT_ELEVENLABS_NEURA_VOICE_ID;
}

function styleTagFromAudioIntent(intent: (typeof neuraVoiceLinesV2)[number]['audioIntent']) {
  if (intent === 'whisper') return '[whispers]';
  if (intent === 'glitch') return '[glitchy]';
  if (intent === 'ambient') return '[curious]';
  return '[calm]';
}

function styleTagFromStoryLine(
  speaker: StorySceneSpeaker,
  intent: VoiceLineForGeneration['styleTag'] | undefined,
) {
  if (speaker === 'Cybek') {
    if (intent === 'tired') return '[tired]';
    if (intent === 'dry') return '[dry]';
    if (intent === 'curious') return '[curious]';
    return '[calm]';
  }

  if (intent === 'glitch') return '[glitchy]';
  if (intent === 'dry') return '[dry]';
  if (intent === 'curious') return '[curious]';
  return '[calm]';
}

async function main() {
  const options = parseOptions();
  loadLocalEnv();
  const outputDir = getOutputDir(options.source);
  mkdirSync(outputDir, { recursive: true });

  const selectedLines = getVoiceLines(options);

  if (options.only && selectedLines.length === 0) {
    throw new Error(`Nie znaleziono kwestii Neury o id: ${options.only}`);
  }

  for (const line of selectedLines) {
    for (const format of options.formats) {
      const output = VOICE_OUTPUTS[format];
      const outputPath = join(outputDir, `${line.id}.${output.extension}`);
      const exists = existsSync(outputPath);
      const shouldGenerate = options.force || !exists;
      const status = shouldGenerate ? 'generate' : 'skip';

      console.log(`${status}: ${line.id} (${output.outputFormat}) -> ${outputPath}`);
      if (options.dryRun || !shouldGenerate) continue;

      const size = await generateVoiceLine(line, output, outputPath);
      console.log(`done: ${line.id}.${output.extension} (${size} B)`);
    }
  }
}

function getOutputDir(source: VoiceSource) {
  return source === 'story-scenes'
    ? join(rootDir, 'public', 'audio', 'story-scenes')
    : join(rootDir, 'public', 'audio', 'neura');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
