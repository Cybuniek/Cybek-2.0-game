import type { ChatMessage, CommunicationAction, DraftTrack, PerformanceResult, PublishedTrack } from '../types';

export const chatAuthors = {
  cybek: 'Cybek',
  anon: 'Anon',
  sztukaZaSztuke: 'Sztuka za Sztukę',
  pawel: 'Paweł',
};

export function pawelDraftMessage(result: PerformanceResult | DraftTrack, displayTitle = result.trackTitle) {
  const accuracy = 'accuracy' in result ? result.accuracy : result.bestAccuracy;
  const grade = 'grade' in result ? result.grade : result.bestGrade;
  return `Podeślę szkic Pawłowi: ${displayTitle}. Próba ${accuracy}%, ocena ${grade}.`;
}

export function groupPublishMessage(published: PublishedTrack) {
  return `Publikuję: ${published.trackTitle}. Status: ${published.quality}. Próba ${published.accuracy}%, ocena ${published.grade}.`;
}

export function groupPublishMessages(published: PublishedTrack): ChatMessage[] {
  return [
    { author: chatAuthors.cybek, text: groupPublishMessage(published) },
    ...publishReactionMessages(published),
  ];
}

export function communicationMessage(
  action: CommunicationAction,
  day: number,
  displayTitle?: string,
): ChatMessage {
  const target = displayTitle ? `: ${displayTitle}` : '';
  const text = {
    silence: 'Nie wysyłam nic. Czat dostaje ciszę bez opakowania.',
    status: 'Krótki status: pracuję nad Występem, ale nie obiecuję terminu.',
    teaser: `Pokazuję fragment${target}. To jeszcze nie jest publikacja, tylko ślad z pracowni.`,
    promise: `Zapowiadam publikację${target} w ciągu dwóch dni. Czat może zacząć odliczać.`,
    break: 'Ogłaszam przerwę. Dzisiaj silnik ma nie udawać, że jest transmisją.',
    live: 'Włączam live. Nie mam gotowego numeru, ale mam otwarty pulpit i kilka ryzykownych minut.',
  }[action];

  return {
    author: chatAuthors.cybek,
    text: `[Dzień ${day}] ${text}`,
    day,
    kind: action,
  };
}

function publishReactionMessages(published: PublishedTrack): ChatMessage[] {
  if (published.quality === 'cudeńko' && published.accuracy >= 85) {
    return [
      { author: chatAuthors.anon, text: 'To już nie brzmi jak szkic. To jest numer, który ktoś będzie cytował na czacie.' },
      { author: chatAuthors.sztukaZaSztuke, text: 'Czat zapisuje ten moment jako punkt zwrotny Występu.' },
    ];
  }

  if (published.quality === 'cudeńko') {
    return [
      { author: chatAuthors.anon, text: 'Plik ma już ciężar finału, nawet jeśli ręce Cybka jeszcze zostawiły ślady.' },
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
      { author: chatAuthors.anon, text: 'Szkic jeszcze trzeszczy, ale zagranie trzyma go za kark.' },
      { author: chatAuthors.sztukaZaSztuke, text: 'Czat nie jest pewien, czy to błąd, czy stylistyka.' },
    ];
  }

  return [
    { author: chatAuthors.anon, text: 'To brzmi jak szkic wrzucony zanim ręce przestały drżeć.' },
    { author: chatAuthors.pawel, text: 'Zostawiam. Nawet nierówna wersja mówi, gdzie zaczyna się prawdziwy Występ.' },
  ];
}
