import type { DraftTrack, PerformanceResult, PublishedTrack } from '../types';

export const chatAuthors = {
  cybek: 'Cybek',
};

export function pawelDraftMessage(result: PerformanceResult | DraftTrack) {
  const accuracy = 'accuracy' in result ? result.accuracy : result.bestAccuracy;
  const grade = 'grade' in result ? result.grade : result.bestGrade;
  return `Wysylam draft: ${result.trackTitle} (${accuracy}%, ${grade}).`;
}

export function groupPublishMessage(published: PublishedTrack) {
  return `Publikacja: ${published.trackTitle}. ${published.quality}. Proba ${published.accuracy}%, ocena ${published.grade}.`;
}
