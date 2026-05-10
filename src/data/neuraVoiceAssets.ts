import { neuraVoiceLines, type NeuraVoiceLineId } from './neuraVoiceLines';

export const NEURA_VOICE_BASE_PATH = '/audio/neura';

export const neuraVoiceAssets = Object.fromEntries(
  neuraVoiceLines.map((line) => [
    line.id,
    {
      primary: `${NEURA_VOICE_BASE_PATH}/${line.id}.ogg`,
      fallback: `${NEURA_VOICE_BASE_PATH}/${line.id}.mp3`,
    },
  ]),
) as Record<NeuraVoiceLineId, { primary: string; fallback: string }>;
