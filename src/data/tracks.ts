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
    beatmapSeed: 122001,
    difficulties: ['Łatwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wystepFolder, 'Występ Czekamy Czekamy'),
  },
  {
    id: 'wenezuelski-wystep-mashup',
    order: orderFromFolder(wenezuelskiFolder),
    title: 'Wenezuelski Występ (Mashup)',
    artist: 'Ustno.ai',
    bpm: 128,
    mood: 'mashup z jasnym tanecznym pulsem',
    beatmapSeed: 128002,
    difficulties: ['Łatwy', 'Normalny', 'Cybart'],
    audio: audioFiles(wenezuelskiFolder, 'Wenezuelski Występ (Mashup)'),
  },
  {
    id: 'vlog-wildforest-rave-anho27',
    order: orderFromFolder(vlogFolder),
    title: 'Vlog Wildforest Rave – ANHO27',
    artist: 'Ustno.ai',
    bpm: 144,
    mood: 'leśny rave z vlogowym rozpędem',
    beatmapSeed: 144003,
    difficulties: ['Normalny', 'Cybart'],
    audio: audioFiles(vlogFolder, 'Vlog Wildforest Rave – ANHO27'),
  },
  {
    id: 'szum-w-klatce',
    order: 90,
    title: 'Szum w klatce',
    artist: 'Cybek feat. Neura',
    bpm: 90,
    mood: 'zimny neon, szybki oddech czatu',
    beatmapSeed: 91290,
    difficulties: ['Łatwy', 'Normalny', 'Cybart'],
  },
  {
    id: 'wystep-roboczy',
    order: 160,
    title: 'Występ roboczy 03',
    artist: 'Ustno.ai Draft Band',
    bpm: 160,
    mood: 'demo z folderu, połamany refren',
    beatmapSeed: 316160,
    difficulties: ['Łatwy', 'Normalny'],
  },
  {
    id: 'anh-loop',
    order: 220,
    title: 'anh://loop_pawla',
    artist: 'Cybek',
    bpm: 220,
    mood: 'glitch-pop z komunikatora',
    beatmapSeed: 722220,
    difficulties: ['Normalny', 'Cybart'],
  },
];

export const tracks: Track[] = [...unsortedTracks].sort((left, right) => left.order - right.order);
