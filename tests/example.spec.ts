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
