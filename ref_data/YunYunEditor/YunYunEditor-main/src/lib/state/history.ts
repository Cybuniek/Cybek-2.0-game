import { get } from 'svelte/store';
import { chart, type ChartState } from './chartStore';

const HISTORY_LIMIT = 50;

interface Snapshot {
  state: ChartState;
}

const past: Snapshot[] = [];
const future: Snapshot[] = [];

function snapshot(): Snapshot {
  // Deep-clone via JSON — chart state is plain data (numbers, strings, arrays of plain objects).
  return { state: JSON.parse(JSON.stringify(get(chart))) as ChartState };
}

// song.Icon is an IndexedDB-backed asset (bytes keyed by CURRENT_ID), not undoable document
// state — same model as audio. Keep the live song.Icon when time-travelling so undo/redo can't
// roll the JSON reference back/forward out of sync with the stored bytes (a dangling reference
// exports a song.json pointing at a missing file; a stale one writes the wrong image).
function withLiveAssets(target: ChartState, live: ChartState): ChartState {
  return { ...target, song: { ...target.song, Icon: live.song.Icon } };
}

export function pushHistory(): void {
  past.push(snapshot());
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
}

export function undo(): boolean {
  if (past.length === 0) return false;
  const cur = snapshot();
  const prev = past.pop()!;
  future.push(cur);
  chart.set(withLiveAssets(prev.state, cur.state));
  return true;
}

export function redo(): boolean {
  if (future.length === 0) return false;
  const cur = snapshot();
  const next = future.pop()!;
  past.push(cur);
  chart.set(withLiveAssets(next.state, cur.state));
  return true;
}

export function clearHistory(): void {
  past.length = 0;
  future.length = 0;
}
