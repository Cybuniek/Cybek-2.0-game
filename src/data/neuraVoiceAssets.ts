import { neuraVoiceLines, type NeuraVoiceLineId } from './neuraVoiceLines';
import { assetPath } from '../assetPaths.ts';

export const NEURA_VOICE_BASE_PATH = assetPath('audio/neura');

export const neuraVoiceAssets = Object.fromEntries(
  neuraVoiceLines.map((line) => [
    line.id,
    {
      primary: `${NEURA_VOICE_BASE_PATH}/${line.id}.ogg`,
      fallback: `${NEURA_VOICE_BASE_PATH}/${line.id}.mp3`,
    },
  ]),
) as Record<NeuraVoiceLineId, { primary: string; fallback: string }>;
