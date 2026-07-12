import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 5174;
const outputDir = join(process.cwd(), 'docs', 'screenshots');

const storyScenesSeed = {
  version: 1,
  queue: [],
  completedSceneIds: ['story.boot.firstCompleted'],
  completedCheckpointIds: ['checkpoint.boot.firstCompleted'],
  highestQueuedPresenceLevel: 0,
};

const server = await createServer({
  server: {
    host,
    port,
    strictPort: false,
  },
});

await mkdir(outputDir, { recursive: true });
await server.listen();

const resolvedUrl = server.resolvedUrls?.local?.[0] ?? `http://${host}:${port}/`;
const browser = await chromium.launch();
let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

async function readGameState() {
  return page.evaluate(() => {
    if (!window.render_game_to_text) throw new Error('render_game_to_text is not available');
    return JSON.parse(window.render_game_to_text());
  });
}

async function waitForScreen(screen) {
  await expect.poll(async () => (await readGameState()).screen).toBe(screen);
}

async function clearActiveStoryScene() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await page.locator('.system-fallback-overlay').isVisible().catch(() => false)) {
      await page.waitForTimeout(80);
      continue;
    }
    if (await page.locator('.cutscene-stage').isVisible().catch(() => false)) {
      await page.locator('.cutscene-stage').click({ force: true });
      await page.waitForTimeout(50);
      continue;
    }
    const state = await readGameState();
    if (!state.storyScene?.active) return;
    await page.waitForTimeout(80);
  }
  throw new Error('Aktywna cutscenka VN nie zamknęła się w oczekiwanym czasie');
}

async function finishCurrentRhythmRun() {
  await waitForScreen('rhythm');
  await page.locator('.primary-action').click();
  await waitForScreen('results');
}

async function capture(name) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(120);
  const path = join(outputDir, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`captured ${path}`);
}

async function resetStorage({ skipBootScene = true } = {}) {
  await page.addInitScript((seed) => {
    window.localStorage.removeItem('ustnik-2-state');
    window.localStorage.removeItem('ustnik.neura.voiceDirector.v1');
    if (seed) {
      window.localStorage.setItem('ustnik.storyScenes.v1', JSON.stringify(seed));
    } else {
      window.localStorage.removeItem('ustnik.storyScenes.v1');
    }
  }, skipBootScene ? storyScenesSeed : null);
}

try {
  await resetStorage({ skipBootScene: false });
  await page.goto(resolvedUrl);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await waitForScreen('title');
  await capture('01-title-screen.png');

  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await waitForScreen('boot');
  await page.waitForTimeout(900);
  await capture('02-boot-sequence.png');

  await page.evaluate(() => window.advanceTime?.(5000));
  await waitForScreen('desktop');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Messenger')
      ?.click();
  });
  await capture('03-desktop-story-messenger.png');

  await page.close();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await resetStorage({ skipBootScene: true });
  await page.goto(resolvedUrl);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await waitForScreen('desktop');

  await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
  await expect.poll(async () => (await readGameState()).activeWindow).toBe('create');
  await capture('04-generator-masked-tracks.png');

  await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
  await waitForScreen('rhythm');
  await capture('05-rhythm-section.png');

  await finishCurrentRhythmRun();
  await capture('06-results-story.png');
  await clearActiveStoryScene();

  await page.getByRole('button', { name: 'Zapisz szkic do szuflady' }).click();
  await waitForScreen('desktop');
  await page.getByRole('button', { name: 'Ustno.ai Szkice' }).click();
  await expect.poll(async () => (await readGameState()).activeWindow).toBe('me');
  await capture('07-drawer-sketch.png');

  await page.getByRole('button', { name: 'Opublikuj na czacie głównym' }).first().click();
  await waitForScreen('desktop');
  await clearActiveStoryScene();
  await page.getByRole('button', { name: 'Messenger' }).click();
  await page.getByRole('button', { name: 'Sztuka za Sztukę - Występy Cybarta' }).click();
  await expect.poll(async () => (await readGameState()).activeWindow).toBe('messenger');
  await capture('08-publication-chat.png');

  await page.getByRole('button', { name: /plik:/ }).first().click();
  await expect.poll(async () => (await readGameState()).activeWindow).toBe('player');
  await capture('09-annihilation-player.png');
} finally {
  await browser.close();
  await server.close();
}
