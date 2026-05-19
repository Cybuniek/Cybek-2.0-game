import type { Track } from '../types';

const audioRoot = '/audio/music/ustno';

function orderFromFolder(folder: string) {
  return Number.parseInt(folder.match(/^\d+/)?.[0] ?? '0', 10);
}

function audioFiles(folder: string, title: string) {
  return {
    instrumental: `${audioRoot}/${folder}/[Instrumental] ${title}.ogg`,
    vocals: `${audioRoot}/${folder}/[Lead Vocals] ${title}.ogg`,
    merged: `${audioRoot}/${folder}/${title}.ogg`,
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
    audio: audioFiles(wystepFolder, 'Występ Czekamy Czekamy'),
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
    audio: audioFiles(wenezuelskiFolder, 'Wenezuelski Występ (Mashup)'),
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
    audio: audioFiles(vlogFolder, 'Vlog Wildforest Rave – ANHO27'),
  },
];

export const tracks: Track[] = [...unsortedTracks].sort((left, right) => left.order - right.order);
