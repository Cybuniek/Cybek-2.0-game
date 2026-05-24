import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neuraVoiceLines as legacyNeuraVoiceLines } from '../src/data/neuraVoiceLines.ts';
import { neuraVoiceLinesV2 } from '../src/data/dialogue/neuraVoiceLines.ts';

const DEFAULT_ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
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
type VoiceSource = 'legacy' | 'dialogue-v2';
type VoiceLineForGeneration = {
  id: string;
  text: string;
  styleTag: string;
  phase?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const outputDir = join(rootDir, 'public', 'audio', 'neura');

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
    if (source !== 'legacy' && source !== 'dialogue-v2') {
      throw new Error(`Nieznane źródło głosu: ${source}. Użyj legacy albo dialogue-v2.`);
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
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL_ID;
  console.log(`voice request: ${line.id} / model=${modelId} / voice=${voiceId} / tag=${line.styleTag}`);

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
  const sourceLines = options.source === 'dialogue-v2'
    ? neuraVoiceLinesV2.map((line) => ({
        id: line.audio.id,
        text: line.text,
        styleTag: styleTagFromAudioIntent(line.audioIntent),
        phase: line.phase,
      }))
    : legacyNeuraVoiceLines.map((line) => ({
        id: line.id,
        text: line.text,
        styleTag: line.styleTag,
      }));

  let lines = options.phase ? sourceLines.filter((line) => line.phase === options.phase) : sourceLines;

  if (options.fromId) {
    const startIndex = lines.findIndex((line) => line.id === options.fromId);
    if (startIndex === -1) throw new Error(`Nie znaleziono startowego id: ${options.fromId}`);
    lines = lines.slice(startIndex);
  }

  if (options.only) lines = lines.filter((line) => line.id === options.only);
  return lines;
}

function styleTagFromAudioIntent(intent: (typeof neuraVoiceLinesV2)[number]['audioIntent']) {
  if (intent === 'whisper') return '[whispers]';
  if (intent === 'glitch') return '[glitchy]';
  if (intent === 'ambient') return '[curious]';
  return '[calm]';
}

async function main() {
  const options = parseOptions();
  loadLocalEnv();
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
