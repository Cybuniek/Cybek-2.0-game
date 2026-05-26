// Mirrors YunYunLoader/ModdedScoreData.cs and ModdedLevelData.cs (the JSON-faced fields).
// The loader rejects ANY null field via reflection, so non-emptiness here is load-bearing.

export interface SongLevelRef {
  Editor: string;
  Difficulty: number;
  Path: string;
}

// ListArtist and Icon were added in YunYunLoader 0.4.1 — older mods don't carry them. Unlike the
// strict string fields above (ID..Arranger), parseSongJson coerces these to "" instead of
// hard-rejecting so pre-0.4.1 mods still import; export validation flags an empty ListArtist.
// Icon is optional (a .png/.jpg/.jpeg filename, "" when unset) and its bytes follow the audio
// lifecycle (zip → IndexedDB → drafts → export).
export interface SongJson {
  ID: string;
  Audio: string;
  Title: string;
  Artist: string;
  ListArtist: string;
  Lyricist: string;
  Composer: string;
  Arranger: string;
  Icon: string;
  Levels: SongLevelRef[];
}

// Single source of truth for the lenient 0.4.1-field coercion. Any path that revives a SongJson
// from outside the editor — zip import (parseSongJson) or a persisted draft/current autosave
// (readDraft) — must run it through here: drafts written before 0.4.1 carry no ListArtist/Icon,
// and JSON.stringify drops `undefined`, so an un-normalized song exports a song.json missing a
// field the loader rejects. validateForExport remains the gate for an *empty* ListArtist.
export function normalizeSong(raw: SongJson): SongJson {
  return {
    ...raw,
    ListArtist: typeof raw.ListArtist === 'string' ? raw.ListArtist : '',
    Icon: typeof raw.Icon === 'string' ? raw.Icon : '',
  };
}

export function emptySong(): SongJson {
  return {
    ID: '',
    Audio: '',
    Title: '',
    Artist: '',
    ListArtist: '',
    Lyricist: '',
    Composer: '',
    Arranger: '',
    Icon: '',
    Levels: [],
  };
}
