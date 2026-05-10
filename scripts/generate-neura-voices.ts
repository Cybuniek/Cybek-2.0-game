import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neuraVoiceLines } from '../src/data/neuraVoiceLines.ts';

const ELEVENLABS_VOICE_ID = 'Zv1ztCl7Qbbb5F07Yrud';
const ELEVENLABS_MODEL_ID = 'eleven_v3';
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const outputDir = join(rootDir, 'public', 'audio', 'neura');

type Options = {
  dryRun: boolean;
  force: boolean;
  formats: VoiceOutputKind[];
  only?: string;
};

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    formats: args.includes('--mp3-only') ? ['mp3'] : args.includes('--with-fallback') ? ['opus', 'mp3'] : ['opus'],
  };
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
  line: (typeof neuraVoiceLines)[number],
  output: (typeof VOICE_OUTPUTS)[VoiceOutputKind],
  outputPath: string,
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Brak ELEVENLABS_API_KEY w środowisku albo .env.local.');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=${output.outputFormat}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: `${line.styleTag} ${line.text}`,
        model_id: ELEVENLABS_MODEL_ID,
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

async function main() {
  const options = parseOptions();
  loadLocalEnv();
  mkdirSync(outputDir, { recursive: true });

  const selectedLines = options.only
    ? neuraVoiceLines.filter((line) => line.id === options.only)
    : neuraVoiceLines;

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
