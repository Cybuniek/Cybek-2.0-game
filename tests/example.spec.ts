import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
  }
}

function readGameState(page: Page) {
  return page.evaluate(() => {
    if (!window.render_game_to_text) throw new Error('render_game_to_text is not available');
    return JSON.parse(window.render_game_to_text());
  });
}

async function clearActiveStoryScene(page: Page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await page.locator('.system-fallback-overlay').isVisible().catch(() => false)) {
      await page.waitForTimeout(80);
      continue;
    }
    if (await page.locator('.cutscene-stage').isVisible().catch(() => false)) {
      await page.locator('.cutscene-stage').click({ force: true });
      await page.waitForTimeout(40);
      continue;
    }
    const state = await readGameState(page);
    if (!state.storyScene?.active) return;
    await page.waitForTimeout(80);
  }
  throw new Error('Aktywna cutscenka VN nie zamknęła się w oczekiwanym czasie');
}

async function finishCurrentRhythmRun(page: Page) {
  await expect.poll(async () => (await readGameState(page)).screen).toBe('rhythm');
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.primary-action')?.click());
  await expect.poll(async () => (await readGameState(page)).screen).toBe('results');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('ustnik-2-state');
    window.localStorage.removeItem('ustnik.neura.voiceDirector.v1');
    window.localStorage.setItem('ustnik.storyScenes.v1', JSON.stringify({
      version: 1,
      queue: [],
      completedSceneIds: ['story.boot.firstCompleted'],
      completedCheckpointIds: ['checkpoint.boot.firstCompleted'],
      highestQueuedPresenceLevel: 0,
    }));
  });
});

test('smoke: tytuł, boot, pulpit i generator działają lokalnie', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await expect(page.getByRole('heading', { name: 'Cybek OS / title.sys' })).toBeVisible();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('title');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('boot');

  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await expect(page.getByText('Cybek OS', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
  const desktopState = await readGameState(page);
  expect(desktopState.activeWindow).toBe('create');
  expect(desktopState.stats).toMatchObject({
    performance: expect.any(Number),
    cybart: expect.any(Number),
    chatPressure: expect.any(Number),
  });

  await expect(page.getByText('anh://www.ustno.ai/create')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first()).toBeVisible();
});

test('świat gry: ekran startowy i Ustniki nie pokazują roboczych placeholderów', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await expect(page.getByText(/prototyp|placeholder|WIP/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await expect(page.getByText('Ścieżka Występu:')).toBeVisible();
  await expect(page.getByText(/Core loop|nieudany song|Beatmap Editor|Ustno\.ai Me|Remix|Dialogi fabularne|Lab \/ Ukryte/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Ustniki' }).click();
  await expect(page.getByText('Ustniki rejestrują próby Występu')).toBeVisible();
  await expect(page.getByText('Bufor przed tłumem')).toBeVisible();
  await expect(page.getByText('Pierwszy ślad publiczny')).toBeVisible();
  await expect(page.getByText(/wkrótce|placeholder|WIP/i)).toHaveCount(0);
});

test('świat gry: strojenie rytmu nie pokazuje surowych etykiet edytora', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.getByRole('button', { name: 'Strojenie rytmu' }).click();
  await expect(page.getByRole('button', { name: 'Układanie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próba' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Odtwórz' })).toBeVisible();
  await expect(page.getByText('Sygnały:')).toBeVisible();
  await expect(page.getByText('Zapisz katalog')).toBeVisible();

  const editorText = await page.locator('body').innerText();
  expect(editorText).not.toMatch(/Edit Mode|Test Mode|\bPlay\b|Audio:|Nuty:|Schowek:|Backup localStorage|Import manualBeatmaps|Eksport \+ backup|Reset czasu\/testu|Instrumental|Vocal/i);
});

test('responsive: mobile otwiera strojenie rytmu bez poziomego overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Strojenie rytmu' }).click();
  await expect(page.getByText('Strojenie rytmu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wróć na początek próby' })).toBeVisible();
  await expect(page.getByText('Siatka rytmu')).toBeVisible();
  await expect(page.getByText('Podkład', { exact: true })).toBeVisible();
  await expect(page.getByText('Wokal', { exact: true })).toBeVisible();

  const editorLayout = await page.evaluate(() => ({
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    bodyText: document.body.innerText,
  }));
  expect(editorLayout.scrollY).toBeLessThanOrEqual(1);
  expect(editorLayout.documentWidth).toBeLessThanOrEqual(editorLayout.viewportWidth + 1);
  expect(editorLayout.bodyWidth).toBeLessThanOrEqual(editorLayout.viewportWidth + 1);
  expect(editorLayout.bodyText).not.toMatch(/Edit Mode|Test Mode|\bPlay\b|Audio:|Nuty:|Schowek:|Backup localStorage|Import manualBeatmaps|Eksport \+ backup|Reset czasu\/testu|Instrumental|Vocal/i);
});

test('responsive: mobile pozwala otworzyć Ustniki bez zasłonięcia przez webcam', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.getByRole('button', { name: 'Ustniki' }).click();
  await expect.poll(async () => (await readGameState(page)).activeWindow).toBe('ustniki');
  await expect(page.getByText('Ustniki rejestrują próby Występu')).toBeVisible();
  await expect(page.getByText('Bufor przed tłumem')).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});

test('responsive: mobile prowadzi próbę i wynik od góry ekranu bez overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
  await expect.poll(async () => (await readGameState(page)).activeWindow).toBe('create');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('rhythm');

  const rhythmLayout = await page.evaluate(() => ({
    screen: JSON.parse(window.render_game_to_text?.() ?? '{}').screen,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(rhythmLayout).toMatchObject({ screen: 'rhythm' });
  expect(rhythmLayout.scrollY).toBeLessThanOrEqual(1);
  expect(rhythmLayout.documentWidth).toBeLessThanOrEqual(rhythmLayout.viewportWidth + 1);
  expect(rhythmLayout.bodyWidth).toBeLessThanOrEqual(rhythmLayout.viewportWidth + 1);
  await expect(page.getByText(/Rhythm debug|Neura debug|Beatmap Editor|Perfect|Great|Good|Miss|max combo|progres tieru/i)).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.locator('.primary-action').click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('results');

  const resultsLayout = await page.evaluate(() => ({
    screen: JSON.parse(window.render_game_to_text?.() ?? '{}').screen,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    bodyText: document.body.innerText,
  }));
  expect(resultsLayout).toMatchObject({ screen: 'results' });
  expect(resultsLayout.scrollY).toBeLessThanOrEqual(1);
  expect(resultsLayout.documentWidth).toBeLessThanOrEqual(resultsLayout.viewportWidth + 1);
  expect(resultsLayout.bodyWidth).toBeLessThanOrEqual(resultsLayout.viewportWidth + 1);
  expect(resultsLayout.bodyText).toContain('Raport z próby');
  expect(resultsLayout.bodyText).not.toMatch(/Perfect|Great|Good|Miss|max combo|progres tieru|combo|mnożnik|puste kliknięcia|nuty/i);
  expect(resultsLayout.bodyText).toContain('najdłuższa seria');
  expect(resultsLayout.bodyText).toContain('ślad jakości');
});

test('fabuła: pełny repertuar kończy Plan Występu bez cofania celu', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
  await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
  await finishCurrentRhythmRun(page);
  await clearActiveStoryScene(page);
  await page.getByRole('button', { name: 'Zapisz szkic do szuflady' }).click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');

  await page.getByRole('button', { name: 'Ustno.ai Szkice' }).click();
  await page.getByRole('button', { name: /Popraw szkic/ }).first().click();
  await finishCurrentRhythmRun(page);
  await page.getByRole('button', { name: 'Nadpisz szkic w szufladzie' }).click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await expect(page.getByText('Cisza w kadrze')).toBeVisible();
  await expect(page.getByText(/Audio niedostępne|Tekst sceny/i)).toHaveCount(0);
  await clearActiveStoryScene(page);

  await page.getByRole('button', { name: 'Ustno.ai Szkice' }).click();
  await page.getByRole('button', { name: 'Wyślij szkic do Pawła' }).first().click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await clearActiveStoryScene(page);

  await page.getByRole('button', { name: 'Ustno.ai Szkice' }).click();
  await page.getByRole('button', { name: 'Opublikuj na czacie głównym' }).first().click();
  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await clearActiveStoryScene(page);

  for (let remainingTrack = 0; remainingTrack < 2; remainingTrack += 1) {
    await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
    await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
    await finishCurrentRhythmRun(page);
    await clearActiveStoryScene(page);
    await page.getByRole('button', { name: 'Opublikuj na czacie głównym' }).click();
    await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
    await clearActiveStoryScene(page);
  }

  const finalState = await readGameState(page);
  expect(finalState.mainStory).toMatchObject({
    currentBeatId: 'session-complete',
    completedCount: 7,
    totalCount: 7,
    isComplete: true,
  });
  expect(finalState.storyScene).toMatchObject({ active: false, queue: [] });
  await expect(page.getByText('Po Występie: Sesja domknięta')).toBeVisible();
  await expect(page.getByText('Występ domknięty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publikuj dalej' })).toHaveCount(0);
  const finalLayer = await page.locator('.event-cutscene-window-main').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const stage = element.closest('.event-cutscene-stage');
    const stageRect = stage?.getBoundingClientRect();
    const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      width: rect.width,
      height: rect.height,
      isTopLayer: topElement?.closest('.event-cutscene-stage') !== null,
      stageClassName: stage?.className ?? '',
      stageBottomGap: stageRect ? window.innerHeight - stageRect.bottom : Number.POSITIVE_INFINITY,
    };
  });
  expect(finalLayer.width).toBeGreaterThan(240);
  expect(finalLayer.height).toBeGreaterThan(120);
  expect(finalLayer.isTopLayer).toBe(true);
  expect(finalLayer.stageClassName).toContain('event-cutscene-final');
  expect(finalLayer.stageBottomGap).toBeLessThanOrEqual(1);

  const finalText = await page.locator('body').innerText();
  expect(finalText).not.toMatch(/slaba wersja|kompromitacja|demo uciekło|Core loop|nieudany song/i);
  expect(finalText).not.toMatch(/events\.echo|events\.idle|quietArchive|neuraBond|publicSpiral|offlineBreak|ending:|performance |chat /i);
  await page.screenshot({ path: 'test-results/story-world-smoke/final-events.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFinalLayout = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.event-cutscene-final');
    const statsPanel = document.querySelector<HTMLElement>('.event-cutscene-window-stats');
    const rect = stage?.getBoundingClientRect();
    const statsRect = statsPanel?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      stageWidth: rect?.width ?? 0,
      stageHeight: rect?.height ?? 0,
      statsPanelTop: statsRect?.top ?? Number.POSITIVE_INFINITY,
      statsPanelBottom: statsRect?.bottom ?? Number.POSITIVE_INFINITY,
      bodyText: document.body.innerText,
    };
  });
  expect(mobileFinalLayout.documentWidth).toBeLessThanOrEqual(mobileFinalLayout.viewportWidth + 1);
  expect(mobileFinalLayout.bodyWidth).toBeLessThanOrEqual(mobileFinalLayout.viewportWidth + 1);
  expect(mobileFinalLayout.stageWidth).toBeGreaterThan(320);
  expect(mobileFinalLayout.stageHeight).toBeGreaterThan(520);
  expect(mobileFinalLayout.statsPanelTop).toBeGreaterThanOrEqual(0);
  expect(mobileFinalLayout.statsPanelBottom).toBeLessThanOrEqual(mobileFinalLayout.viewportHeight + 1);
  expect(mobileFinalLayout.bodyText).not.toMatch(/events\.echo|events\.idle|quietArchive|neuraBond|publicSpiral|offlineBreak|ending:|performance |chat /i);
  await page.screenshot({ path: 'test-results/story-world-smoke/mobile-final-events.png', fullPage: true });
  expect(finalState.published.map((track: { quality: string }) => track.quality)).toContain('szkic publiczny');
});

test('smoke: boot otwiera cutscenkę Visual Novel', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('ustnik.storyScenes.v1');
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));

  await expect.poll(async () => (await readGameState(page)).screen).toBe('desktop');
  await expect.poll(async () => (await readGameState(page)).storyScene?.id).toBe('story.boot.firstCompleted');
  await expect(page.getByRole('dialog', { name: 'Pierwsze bootowanie' })).toBeVisible();
  await expect(page.locator('.cutscene-cybek-portrait')).toBeVisible();
  await expect(page.locator('.cutscene-neura-portrait')).toBeVisible();
  await expect(page.getByText('zmęczony głos')).toBeVisible();
  const cutsceneText = await page.locator('body').innerText();
  expect(cutsceneText).not.toMatch(/\b(calm|dry|tired|curious|glitch)\b/i);
  await page.screenshot({ path: 'test-results/story-world-smoke/boot-cutscene.png', fullPage: true });

  await page.locator('.cutscene-stage').click();
  await expect(page.locator('.cutscene-text')).toContainText('System wstał.');
});

test('cutscenka: klik, Enter i Spacja pomijają typewriter oraz aktywne audio', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('ustnik.storyScenes.v1');
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get: () => 8,
    });
    HTMLMediaElement.prototype.play = function playMock() {
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));

  const stage = page.locator('.cutscene-stage');
  await expect(stage).toBeVisible();
  await expect.poll(async () => (await readGameState(page)).storyScene?.lineIndex).toBe(0);

  await expect.poll(async () => (
    await page.locator('.cutscene-text').textContent()
  )?.length ?? 0).toBeGreaterThan(0);
  const partialText = await page.locator('.cutscene-text').textContent();
  expect((partialText ?? '').length).toBeLessThan('System wstał. Chyba. Pulpit mruga tak, jakby coś udawał.'.length);

  await stage.click();
  await expect(page.locator('.cutscene-text')).toContainText('System wstał.');
  await expect.poll(async () => (await readGameState(page)).storyScene?.lineIndex).toBe(0);

  await stage.click();
  await expect.poll(async () => (await readGameState(page)).storyScene?.lineIndex).toBe(1);

  await page.keyboard.press('Enter');
  await expect(page.locator('.cutscene-text')).toContainText('Pulpit zawsze coś udaje.');
  await expect.poll(async () => (await readGameState(page)).storyScene?.lineIndex).toBe(1);

  await page.keyboard.press('Space');
  await expect.poll(async () => (await readGameState(page)).storyScene?.lineIndex).toBe(2);
});
