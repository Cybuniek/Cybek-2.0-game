import type { Track } from '../types';
import { assetPath } from '../assetPaths.ts';

const audioRoot = assetPath('audio/music/ustno');

function orderFromFolder(folder: string) {
  return Number.parseInt(folder.match(/^\d+/)?.[0] ?? '0', 10);
}

function audioFiles(
  folder: string,
  files: { instrumental: string; vocals: string; merged: string },
) {
  return {
    instrumental: `${audioRoot}/${folder}/${files.instrumental}`,
    vocals: `${audioRoot}/${folder}/${files.vocals}`,
    merged: `${audioRoot}/${folder}/${files.merged}`,
  };
}

const wystepFolder = '01 — Występ Czekamy Czekamy';
const wenezuelskiFolder = '02 — Wenezuelski Występ (Mashup)';
const vlogFolder = '03 — Vlog Wildforest Rave – ANHO27';

const unsortedTracks: Track[] = [
  {
    id: 'wystep-czekamy-czekamy',
    order: orderFromFolder(wystepFolder),
    title: 'Występ Czekamy Czekamy',
    artist: 'Ustno.ai',
    bpm: 122,
    durationMs: 98535,
    mood: 'sceniczny refren z czekaniem na wejście',
    beatmapSeed: 122001,
    audioFolder: wystepFolder,
    audioTitle: 'Występ Czekamy Czekamy',
    difficulties: ['Łatwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wystepFolder, {
      instrumental: '03-[Instrumental] Występ Czekamy Czekamy.ogg',
      vocals: '02-[Lead Vocals] Występ Czekamy Czekamy.ogg',
      merged: '01-Występ Czekamy Czekamy.ogg',
    }),
  },
  {
    id: 'wenezuelski-wystep-mashup',
    order: orderFromFolder(wenezuelskiFolder),
    title: 'Wenezuelski Występ (Mashup)',
    artist: 'Ustno.ai',
    bpm: 128,
    durationMs: 230913,
    mood: 'mashup z jasnym tanecznym pulsem',
    beatmapSeed: 128002,
    audioFolder: wenezuelskiFolder,
    audioTitle: 'Wenezuelski Występ (Mashup)',
    difficulties: ['Łatwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wenezuelskiFolder, {
      instrumental: '01-[Instrumental] Wenezuelski Występ (Mashup).ogg',
      vocals: '02-[Lead Vocals] Wenezuelski Występ (Mashup).ogg',
      merged: '03-Wenezuelski Występ (Mashup).ogg',
    }),
  },
  {
    id: 'vlog-wildforest-rave-anho27',
    order: orderFromFolder(vlogFolder),
    title: 'Vlog Wildforest Rave – ANHO27',
    artist: 'Ustno.ai',
    bpm: 144,
    durationMs: 318153,
    mood: 'leśny rave z vlogowym rozpędem',
    beatmapSeed: 144003,
    audioFolder: vlogFolder,
    audioTitle: 'Vlog Wildforest Rave – ANHO27',
    difficulties: ['Normalny', 'Cybart'],
    audio: audioFiles(vlogFolder, {
      instrumental: '03-[Instrumental] Vlog Wildforest Rave – ANHO27.ogg',
      vocals: '02-[Lead Vocals] Vlog Wildforest Rave – ANHO27.ogg',
      merged: '01-Vlog Wildforest Rave – ANHO27.ogg',
    }),
  },
];

export const tracks: Track[] = [...unsortedTracks].sort((left, right) => left.order - right.order);
