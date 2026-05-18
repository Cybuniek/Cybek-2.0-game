import type { DraftTrack, PerformanceResult, PublishedTrack } from './types';

export type RemixComparison = {
  previousAccuracy: number;
  previousGrade: string;
  nextAccuracy: number;
  nextGrade: string;
  accuracyDelta: number;
  verdict: 'better' | 'same' | 'worse';
};

export function addUnique(items: string[], item: string) {
  return items.includes(item) ? items : [...items, item];
}

export function upsertDraft(drafts: DraftTrack[], draft: DraftTrack) {
  return [draft, ...drafts.filter((item) => item.id !== draft.id)];
}

export function upsertPublished(publishedTracks: PublishedTrack[], published: PublishedTrack) {
  return [published, ...publishedTracks.filter((item) => item.id !== published.id)];
}

export function resultFromDraft(draft: DraftTrack): PerformanceResult {
  return {
    id: draft.id,
    trackId: draft.trackId,
    trackTitle: draft.trackTitle,
    difficulty: draft.difficulty,
    accuracy: draft.bestAccuracy,
    grade: draft.bestGrade,
    qualityProgress: draft.qualityProgress,
    comboMultiplier: 1,
    perfectHits: 0,
    greatHits: 0,
    goodHits: 0,
    misses: 0,
    emptyPresses: 0,
    maxCombo: 0,
    totalNotes: 0,
    createdAt: draft.updatedAt,
    status: draft.status,
  };
}

export function createRemixComparison(draft: DraftTrack, result: PerformanceResult): RemixComparison {
  const accuracyDelta = result.accuracy - draft.bestAccuracy;
  const verdict = accuracyDelta > 0 ? 'better' : accuracyDelta < 0 ? 'worse' : 'same';

  return {
    previousAccuracy: draft.bestAccuracy,
    previousGrade: draft.bestGrade,
    nextAccuracy: result.accuracy,
    nextGrade: result.grade,
    accuracyDelta,
    verdict,
  };
}
