import type { ChatMessage, DraftTrack, PerformanceResult, PublishedTrack } from '../types';

export const chatAuthors = {
  cybek: 'Cybek',
  anon: 'Anon',
  sztukaZaSztuke: 'Sztuka za Sztukę',
  pawel: 'Paweł',
};

export function pawelDraftMessage(result: PerformanceResult | DraftTrack) {
  const accuracy = 'accuracy' in result ? result.accuracy : result.bestAccuracy;
  const grade = 'grade' in result ? result.grade : result.bestGrade;
  return `Wysyłam draft: ${result.trackTitle} (${accuracy}%, ${grade}).`;
}

export function groupPublishMessage(published: PublishedTrack) {
  return `Publikacja: ${published.trackTitle}. ${published.quality}. Próba ${published.accuracy}%, ocena ${published.grade}.`;
}

export function groupPublishMessages(published: PublishedTrack): ChatMessage[] {
  return [
    { author: chatAuthors.cybek, text: groupPublishMessage(published) },
    ...publishReactionMessages(published),
  ];
}

function publishReactionMessages(published: PublishedTrack): ChatMessage[] {
  if (published.quality === 'cudenko' && published.accuracy >= 85) {
    return [
      { author: chatAuthors.anon, text: 'Dobra, to już nie jest demo. To jest materiał na klip.' },
      { author: chatAuthors.sztukaZaSztuke, text: 'Czat zapisuje ten moment jako peak Występu.' },
    ];
  }

  if (published.quality === 'cudenko') {
    return [
      { author: chatAuthors.anon, text: 'Plik brzmi jak final, ale palce Cybka zostawiły ślady na podłodze.' },
      { author: chatAuthors.pawel, text: 'Wersja jest mocna. Timing jeszcze oddycha nierówno.' },
    ];
  }

  if (published.quality === 'lepsza wersja' && published.accuracy >= 75) {
    return [
      { author: chatAuthors.anon, text: 'To już ma refren, który da się spamować bez wstydu.' },
      { author: chatAuthors.sztukaZaSztuke, text: 'Presja czatu rośnie, bo ludzie słyszą progres.' },
    ];
  }

  if (published.quality === 'lepsza wersja') {
    return [
      { author: chatAuthors.anon, text: 'Lepszy plik, ale wykonanie jeszcze walczy z lagiem w głowie.' },
      { author: chatAuthors.pawel, text: 'Nie kasowałbym. To ma brudny urok wersji po nocy.' },
    ];
  }

  if (published.accuracy >= 70) {
    return [
      { author: chatAuthors.anon, text: 'Słaba wersja, ale zagranie trzyma ją za kark.' },
      { author: chatAuthors.sztukaZaSztuke, text: 'Czat nie jest pewien, czy to błąd, czy stylistyka.' },
    ];
  }

  return [
    { author: chatAuthors.anon, text: 'To demo uciekło z szuflady, zanim ktokolwiek zdążył zamknąć okno.' },
    { author: chatAuthors.pawel, text: 'Zostawiam. Kompromitacja też jest jakimś materiałem.' },
  ];
}
