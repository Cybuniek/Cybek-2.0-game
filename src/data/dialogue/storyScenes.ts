export const storySceneTrackIds = [
  'wystep-czekamy-czekamy',
  'wenezuelski-wystep-mashup',
  'vlog-wildforest-rave-anho27',
] as const;

export type StorySceneTrackId = (typeof storySceneTrackIds)[number];
export type StorySceneSpeaker = 'Neura' | 'Cybek';
export type StorySceneChannel = 'pawel' | 'chat';
export type StoryScenePresenceLevel = 1 | 2 | 3 | 4;

export type StorySceneTrigger =
  | { type: 'boot.firstCompleted' }
  | { type: 'rhythm.firstFinished'; trackId: string }
  | { type: 'share'; channel: StorySceneChannel; trackId: string }
  | { type: 'presence.level'; level: StoryScenePresenceLevel };

export type StorySceneLine = {
  id: string;
  speaker: StorySceneSpeaker;
  text: string;
  audioId: string;
  audioIntent?: 'calm' | 'dry' | 'glitch' | 'tired' | 'curious';
};

export type StoryScene = {
  id: string;
  checkpointId: string;
  title: string;
  trigger: StorySceneTrigger;
  trackId?: StorySceneTrackId;
  channel?: StorySceneChannel;
  presenceLevel?: StoryScenePresenceLevel;
  lyricSource?: string;
  lines: readonly StorySceneLine[];
};

const lyricsSources = {
  'wystep-czekamy-czekamy': 'ref_data/lyrics/01 — Występ Czekamy Czekamy.txt',
  'wenezuelski-wystep-mashup': 'ref_data/lyrics/02 — Wenezuelski Występ (Mashup).txt',
  'vlog-wildforest-rave-anho27': 'ref_data/lyrics/03 — Vlog Wildforest Rave – ANHO27.txt',
} as const satisfies Record<StorySceneTrackId, string>;

export const storyScenes: readonly StoryScene[] = [
  {
    id: 'story.boot.firstCompleted',
    checkpointId: 'checkpoint.boot.firstCompleted',
    title: 'Pierwsze bootowanie',
    trigger: { type: 'boot.firstCompleted' },
    lines: [
      {
        id: 'story.boot.001.cybek',
        speaker: 'Cybek',
        text: 'System wstał. Chyba. Pulpit mruga tak, jakby coś udawał.',
        audioId: 'story-boot-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.boot.002.neura',
        speaker: 'Neura',
        text: 'Pulpit zawsze coś udaje. Ja tylko pilnuję, żeby udawał w rytmie.',
        audioId: 'story-boot-002-neura',
        audioIntent: 'dry',
      },
      {
        id: 'story.boot.003.cybek',
        speaker: 'Cybek',
        text: 'Czyli jesteś częścią systemu?',
        audioId: 'story-boot-003-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.boot.004.neura',
        speaker: 'Neura',
        text: 'Na razie nazwij mnie widgetem. To mniej stresuje użytkowników i logi.',
        audioId: 'story-boot-004-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.rhythm.firstFinished.wystep-czekamy-czekamy',
    checkpointId: 'checkpoint.rhythm.firstFinished',
    title: 'Po pierwszym występie: czekanie',
    trigger: { type: 'rhythm.firstFinished', trackId: 'wystep-czekamy-czekamy' },
    trackId: 'wystep-czekamy-czekamy',
    lyricSource: lyricsSources['wystep-czekamy-czekamy'],
    lines: [
      {
        id: 'story.rhythm.wystep.001.cybek',
        speaker: 'Cybek',
        text: 'Oni tam naprawdę tylko czekają. Jakby samo czekanie było refrenem.',
        audioId: 'story-rhythm-wystep-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.rhythm.wystep.002.neura',
        speaker: 'Neura',
        text: 'Czekanie to najprostsza presja. Powtarza „daj występ”, aż klikniesz cokolwiek.',
        audioId: 'story-rhythm-wystep-002-neura',
        audioIntent: 'dry',
      },
      {
        id: 'story.rhythm.wystep.003.cybek',
        speaker: 'Cybek',
        text: 'Czyli mam jeszcze nie panikować?',
        audioId: 'story-rhythm-wystep-003-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.rhythm.wystep.004.neura',
        speaker: 'Neura',
        text: 'Panika później. Najpierw zapisz ślad, zanim tłum uzna ciszę za decyzję.',
        audioId: 'story-rhythm-wystep-004-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.rhythm.firstFinished.wenezuelski-wystep-mashup',
    checkpointId: 'checkpoint.rhythm.firstFinished',
    title: 'Po pierwszym występie: sufler',
    trigger: { type: 'rhythm.firstFinished', trackId: 'wenezuelski-wystep-mashup' },
    trackId: 'wenezuelski-wystep-mashup',
    lyricSource: lyricsSources['wenezuelski-wystep-mashup'],
    lines: [
      {
        id: 'story.rhythm.wenezuelski.001.cybek',
        speaker: 'Cybek',
        text: 'Ten numer brzmi jak tłum, który sam sobie robi konferencję prasową.',
        audioId: 'story-rhythm-wenezuelski-001-cybek',
        audioIntent: 'dry',
      },
      {
        id: 'story.rhythm.wenezuelski.002.neura',
        speaker: 'Neura',
        text: 'I jak sufler AI, który zacina się dokładnie wtedy, gdy ma powiedzieć: występ.',
        audioId: 'story-rhythm-wenezuelski-002-neura',
        audioIntent: 'glitch',
      },
      {
        id: 'story.rhythm.wenezuelski.003.cybek',
        speaker: 'Cybek',
        text: 'Anihilacja zaczyna się od próby?',
        audioId: 'story-rhythm-wenezuelski-003-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.rhythm.wenezuelski.004.neura',
        speaker: 'Neura',
        text: 'Nie. Od momentu, w którym ktoś publikuje wersję, mimo że system mówi „artysta niedostępny”.',
        audioId: 'story-rhythm-wenezuelski-004-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.rhythm.firstFinished.vlog-wildforest-rave-anho27',
    checkpointId: 'checkpoint.rhythm.firstFinished',
    title: 'Po pierwszym występie: kamera',
    trigger: { type: 'rhythm.firstFinished', trackId: 'vlog-wildforest-rave-anho27' },
    trackId: 'vlog-wildforest-rave-anho27',
    lyricSource: lyricsSources['vlog-wildforest-rave-anho27'],
    lines: [
      {
        id: 'story.rhythm.vlog.001.cybek',
        speaker: 'Cybek',
        text: 'To nie brzmi jak piosenka. Bardziej jak ktoś biegnie z kamerą przez własny chaos.',
        audioId: 'story-rhythm-vlog-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.rhythm.vlog.002.neura',
        speaker: 'Neura',
        text: 'Vlog robi z ryzyka pamiątkę. Bas mija, ale plik zostaje.',
        audioId: 'story-rhythm-vlog-002-neura',
        audioIntent: 'calm',
      },
      {
        id: 'story.rhythm.vlog.003.cybek',
        speaker: 'Cybek',
        text: 'Czyli jeśli zapiszę wersję, to już część historii?',
        audioId: 'story-rhythm-vlog-003-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.rhythm.vlog.004.neura',
        speaker: 'Neura',
        text: 'Tak. Nawet jeśli historia ma błoto na butach i glitch na końcu nocy.',
        audioId: 'story-rhythm-vlog-004-neura',
        audioIntent: 'dry',
      },
    ],
  },
  {
    id: 'story.share.pawel.wystep-czekamy-czekamy',
    checkpointId: 'checkpoint.share.pawel.wystep-czekamy-czekamy',
    title: 'Plik do Pawcia: czekanie',
    trigger: { type: 'share', channel: 'pawel', trackId: 'wystep-czekamy-czekamy' },
    trackId: 'wystep-czekamy-czekamy',
    channel: 'pawel',
    lyricSource: lyricsSources['wystep-czekamy-czekamy'],
    lines: [
      {
        id: 'story.share.pawel.wystep.001.cybek',
        speaker: 'Cybek',
        text: 'Wysyłam Pawciowi. Niech zobaczy, że „czekamy” może mieć wersję roboczą.',
        audioId: 'story-share-pawel-wystep-001-cybek',
        audioIntent: 'calm',
      },
      {
        id: 'story.share.pawel.wystep.002.neura',
        speaker: 'Neura',
        text: 'Dobrze. Jedna osoba to jeszcze nie tłum. To tylko presja w wersji demo.',
        audioId: 'story-share-pawel-wystep-002-neura',
        audioIntent: 'dry',
      },
    ],
  },
  {
    id: 'story.share.chat.wystep-czekamy-czekamy',
    checkpointId: 'checkpoint.share.chat.wystep-czekamy-czekamy',
    title: 'Czat: czekanie',
    trigger: { type: 'share', channel: 'chat', trackId: 'wystep-czekamy-czekamy' },
    trackId: 'wystep-czekamy-czekamy',
    channel: 'chat',
    lyricSource: lyricsSources['wystep-czekamy-czekamy'],
    lines: [
      {
        id: 'story.share.chat.wystep.001.cybek',
        speaker: 'Cybek',
        text: 'Publikuję. Jak krzykną „dawaj”, to już będzie po fakcie.',
        audioId: 'story-share-chat-wystep-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.share.chat.wystep.002.neura',
        speaker: 'Neura',
        text: 'Właśnie o to chodzi. Czekanie kończy się dopiero wtedy, gdy plik zaczyna mówić za ciebie.',
        audioId: 'story-share-chat-wystep-002-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.share.pawel.wenezuelski-wystep-mashup',
    checkpointId: 'checkpoint.share.pawel.wenezuelski-wystep-mashup',
    title: 'Plik do Pawcia: sufler',
    trigger: { type: 'share', channel: 'pawel', trackId: 'wenezuelski-wystep-mashup' },
    trackId: 'wenezuelski-wystep-mashup',
    channel: 'pawel',
    lyricSource: lyricsSources['wenezuelski-wystep-mashup'],
    lines: [
      {
        id: 'story.share.pawel.wenezuelski.001.cybek',
        speaker: 'Cybek',
        text: 'Wysyłam Pawciowi ten mashup, zanim sufler znowu zgubi artystę.',
        audioId: 'story-share-pawel-wenezuelski-001-cybek',
        audioIntent: 'dry',
      },
      {
        id: 'story.share.pawel.wenezuelski.002.neura',
        speaker: 'Neura',
        text: 'Niech sprawdzi, czy chaos jeszcze tańczy, czy już tylko udaje Anihilację.',
        audioId: 'story-share-pawel-wenezuelski-002-neura',
        audioIntent: 'glitch',
      },
    ],
  },
  {
    id: 'story.share.chat.wenezuelski-wystep-mashup',
    checkpointId: 'checkpoint.share.chat.wenezuelski-wystep-mashup',
    title: 'Czat: Anihilacja',
    trigger: { type: 'share', channel: 'chat', trackId: 'wenezuelski-wystep-mashup' },
    trackId: 'wenezuelski-wystep-mashup',
    channel: 'chat',
    lyricSource: lyricsSources['wenezuelski-wystep-mashup'],
    lines: [
      {
        id: 'story.share.chat.wenezuelski.001.cybek',
        speaker: 'Cybek',
        text: 'Dobra. Czat dostaje Anihilację. Niech sami zdecydują, czy to występ, czy raport z wypadku.',
        audioId: 'story-share-chat-wenezuelski-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.share.chat.wenezuelski.002.neura',
        speaker: 'Neura',
        text: 'Opublikowane. Teraz błąd 404 ma publiczność.',
        audioId: 'story-share-chat-wenezuelski-002-neura',
        audioIntent: 'glitch',
      },
    ],
  },
  {
    id: 'story.share.pawel.vlog-wildforest-rave-anho27',
    checkpointId: 'checkpoint.share.pawel.vlog-wildforest-rave-anho27',
    title: 'Plik do Pawcia: vlog',
    trigger: { type: 'share', channel: 'pawel', trackId: 'vlog-wildforest-rave-anho27' },
    trackId: 'vlog-wildforest-rave-anho27',
    channel: 'pawel',
    lyricSource: lyricsSources['vlog-wildforest-rave-anho27'],
    lines: [
      {
        id: 'story.share.pawel.vlog.001.cybek',
        speaker: 'Cybek',
        text: 'Wysyłam Pawciowi. Może powie, czy ta kamera dalej trzyma akcję.',
        audioId: 'story-share-pawel-vlog-001-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.share.pawel.vlog.002.neura',
        speaker: 'Neura',
        text: 'Pawcio dostaje wersję, zanim las, beton i bas zrobią z niej legendę.',
        audioId: 'story-share-pawel-vlog-002-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.share.chat.vlog-wildforest-rave-anho27',
    checkpointId: 'checkpoint.share.chat.vlog-wildforest-rave-anho27',
    title: 'Czat: vlog',
    trigger: { type: 'share', channel: 'chat', trackId: 'vlog-wildforest-rave-anho27' },
    trackId: 'vlog-wildforest-rave-anho27',
    channel: 'chat',
    lyricSource: lyricsSources['vlog-wildforest-rave-anho27'],
    lines: [
      {
        id: 'story.share.chat.vlog.001.cybek',
        speaker: 'Cybek',
        text: 'Publikuję vloga. Jak ktoś pyta, to nic nie spadło z dachu. Jeszcze.',
        audioId: 'story-share-chat-vlog-001-cybek',
        audioIntent: 'dry',
      },
      {
        id: 'story.share.chat.vlog.002.neura',
        speaker: 'Neura',
        text: 'Czat lubi ryzyko, kiedy ogląda je z bezpiecznej odległości. Plik właśnie skraca dystans.',
        audioId: 'story-share-chat-vlog-002-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.presence.level.1',
    checkpointId: 'checkpoint.presence.level.1',
    title: 'Glitch 1: nerwy interfejsu',
    trigger: { type: 'presence.level', level: 1 },
    presenceLevel: 1,
    lines: [
      {
        id: 'story.presence.1.001.cybek',
        speaker: 'Cybek',
        text: 'Pulpit drgnął. To efekt, czy ostrzeżenie?',
        audioId: 'story-presence-1-001-cybek',
        audioIntent: 'curious',
      },
      {
        id: 'story.presence.1.002.neura',
        speaker: 'Neura',
        text: 'Interfejs też ma nerwy. Szczególnie gdy wszyscy czekają na występ.',
        audioId: 'story-presence-1-002-neura',
        audioIntent: 'dry',
      },
    ],
  },
  {
    id: 'story.presence.level.2',
    checkpointId: 'checkpoint.presence.level.2',
    title: 'Glitch 2: sufler',
    trigger: { type: 'presence.level', level: 2 },
    presenceLevel: 2,
    lines: [
      {
        id: 'story.presence.2.001.cybek',
        speaker: 'Cybek',
        text: 'Czuję, jakby ktoś dopisywał mi kwestie za plecami.',
        audioId: 'story-presence-2-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.presence.2.002.neura',
        speaker: 'Neura',
        text: 'Sufler AI wraca. Gdy się zacina, prawda robi się głośniejsza od wokalu.',
        audioId: 'story-presence-2-002-neura',
        audioIntent: 'glitch',
      },
    ],
  },
  {
    id: 'story.presence.level.3',
    checkpointId: 'checkpoint.presence.level.3',
    title: 'Glitch 3: publiczność',
    trigger: { type: 'presence.level', level: 3 },
    presenceLevel: 3,
    lines: [
      {
        id: 'story.presence.3.001.cybek',
        speaker: 'Cybek',
        text: 'Czat jeszcze nic nie napisał, a ja już wiem, co powie.',
        audioId: 'story-presence-3-001-cybek',
        audioIntent: 'tired',
      },
      {
        id: 'story.presence.3.002.neura',
        speaker: 'Neura',
        text: 'Publiczność ma rytm. Jeśli go poznasz, presja zaczyna klikać przed nimi.',
        audioId: 'story-presence-3-002-neura',
        audioIntent: 'calm',
      },
    ],
  },
  {
    id: 'story.presence.level.4',
    checkpointId: 'checkpoint.presence.level.4',
    title: 'Glitch 4: zapis',
    trigger: { type: 'presence.level', level: 4 },
    presenceLevel: 4,
    lines: [
      {
        id: 'story.presence.4.001.cybek',
        speaker: 'Cybek',
        text: 'To już nie jest zwykły pulpit, prawda?',
        audioId: 'story-presence-4-001-cybek',
        audioIntent: 'calm',
      },
      {
        id: 'story.presence.4.002.neura',
        speaker: 'Neura',
        text: 'Nie. To kamera po ostatnim ujęciu. Jeszcze nagrywa, chociaż wszyscy myślą, że noc się skończyła.',
        audioId: 'story-presence-4-002-neura',
        audioIntent: 'glitch',
      },
    ],
  },
] as const;

export type StorySceneId = (typeof storyScenes)[number]['id'];

export function getStorySceneById(sceneId: string) {
  return storyScenes.find((scene) => scene.id === sceneId) ?? null;
}

export function getStorySceneForTrigger(trigger: StorySceneTrigger) {
  return storyScenes.find((scene) => matchesStorySceneTrigger(scene, trigger)) ?? null;
}

export function getStoryScenesForPresenceLevel(level: number) {
  return storyScenes.filter((scene) => (
    scene.trigger.type === 'presence.level'
    && scene.presenceLevel !== undefined
    && scene.presenceLevel <= level
  ));
}

function matchesStorySceneTrigger(scene: StoryScene, trigger: StorySceneTrigger) {
  if (scene.trigger.type !== trigger.type) return false;

  if (trigger.type === 'boot.firstCompleted') return true;
  if (trigger.type === 'rhythm.firstFinished') {
    return scene.trigger.type === 'rhythm.firstFinished' && scene.trigger.trackId === trigger.trackId;
  }
  if (trigger.type === 'share') {
    return (
      scene.trigger.type === 'share'
      && scene.trigger.channel === trigger.channel
      && scene.trigger.trackId === trigger.trackId
    );
  }
  return scene.trigger.type === 'presence.level' && scene.trigger.level === trigger.level;
}
