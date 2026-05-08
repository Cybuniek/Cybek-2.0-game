import type { Track } from '../types';

const audioRoot = '/audio/music/ustno';

function orderFromFolder(folder: string) {
  return Number.parseInt(folder.match(/^\d+/)?.[0] ?? '0', 10);
}

function audioFiles(folder: string, title: string) {
  return {
    instrumental: `${audioRoot}/${folder}/[Instrumental] ${title}.wav`,
    vocals: `${audioRoot}/${folder}/[Lead Vocals] ${title}.wav`,
    merged: `${audioRoot}/${folder}/${title}.wav`,
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
    mood: 'sceniczny refren z czekaniem na wejście',
    difficulties: ['Latwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wystepFolder, 'Występ Czekamy Czekamy'),
  },
  {
    id: 'wenezuelski-wystep-mashup',
    order: orderFromFolder(wenezuelskiFolder),
    title: 'Wenezuelski Występ (Mashup)',
    artist: 'Ustno.ai',
    bpm: 128,
    mood: 'mashup z jasnym tanecznym pulsem',
    difficulties: ['Latwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wenezuelskiFolder, 'Wenezuelski Występ (Mashup)'),
  },
  {
    id: 'vlog-wildforest-rave-anho27',
    order: orderFromFolder(vlogFolder),
    title: 'Vlog Wildforest Rave – ANHO27',
    artist: 'Ustno.ai',
    bpm: 144,
    mood: 'leśny rave z vlogowym rozpędem',
    difficulties: ['Normalny', 'Cybart'],
    audio: audioFiles(vlogFolder, 'Vlog Wildforest Rave – ANHO27'),
  },
];

export const tracks: Track[] = [...unsortedTracks].sort((left, right) => left.order - right.order);
