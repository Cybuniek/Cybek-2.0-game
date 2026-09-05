import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ hasTouch: true });

const checkpoints = [...readFileSync('src/data/dialogue/storyScenes.ts', 'utf8').matchAll(/checkpointId: '([^']+)'/g)].map((match) => match[1]);
const testMap = {
  trackId: 'wystep-czekamy-czekamy', bpm: 240, sourceStartMs: 0, sourceEndMs: 12000, durationMs: 12000,
  notes: [
    { id: 'miss', lane: 'S', timeMs: 1000 },
    { id: 'return-tap', lane: 'D', timeMs: 4200 },
    { id: 'return-hold', lane: 'K', timeMs: 6000, kind: 'hold', durationMs: 2200 },
    { id: 'finish', lane: 'L', timeMs: 8500 },
  ],
};

async function state(page: Page) { return page.evaluate(() => JSON.parse(window.render_game_to_text!())); }
async function saved(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('ustnik-2-state')!)); }
async function prepare(page: Page, fixture = true) {
  await page.addInitScript((ids) => {
    if (!localStorage.getItem('ustnik-2-state')) {
      localStorage.setItem('ustnik.storyScenes.v1', JSON.stringify({ version: 1, queue: [], completedSceneIds: [], completedCheckpointIds: ids, highestQueuedPresenceLevel: 3 }));
    }
  }, checkpoints);
  if (fixture) await page.route('**/src/data/manualBeatmaps.json*', (route) => route.fulfill({
    contentType: 'application/javascript', body: `export default ${JSON.stringify({ schemaVersion: 2, tracks: { [testMap.trackId]: { 'Łatwy': testMap } } })}`,
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  await expect.poll(() => state(page).then((s) => s.screen)).toBe('desktop');
  await page.getByRole('button', { name: 'Messenger' }).click();
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await page.getByRole('button', { name: 'Ustno.ai Utwórz' }).click();
}
async function start(page: Page) {
  await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
  await expect.poll(() => state(page).then((s) => s.phase)).toBe('playing');
}
async function atAudio(page: Page, seconds: number) {
  await page.waitForFunction((time) => (document.querySelector<HTMLAudioElement>('.stage-audio')?.currentTime ?? 0) >= time, seconds, { polling: 'raf' });
}

test('występ: prawdziwy zegar audio, powrót, pauza w przytrzymaniu i reakcja następnego dnia', async ({ page }) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.getByRole('radio', { name: /Na żywo/ }).check();
  await page.getByLabel('Najazd przed występem').selectOption('calm');
  await page.screenshot({ path: 'test-results/performance-intent.png' });
  await start(page);
  expect((await state(page)).beatmapSource).toBe('manual');
  expect(await page.locator('.lanes').evaluate((lanes) => [...lanes.children].every((lane) => {
    const rect = lane.getBoundingClientRect();
    return lane.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height * .82));
  }))).toBe(true);
  await expect(page.getByLabel('Najazd sygnałów')).toHaveValue('calm');
  await atAudio(page, 4.18);
  await page.keyboard.press('d');
  await atAudio(page, 5.98);
  await page.keyboard.down('k');
  await atAudio(page, 6.2);
  await page.keyboard.press('Escape');
  const paused = await state(page);
  expect(paused.phase).toBe('paused');
  const audioAtPause = await page.locator('.stage-audio').evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.waitForTimeout(350);
  expect((await state(page)).elapsedMs).toBe(paused.elapsedMs);
  expect(await page.locator('.stage-audio').evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(audioAtPause);
  await page.keyboard.up('k');
  await page.getByRole('button', { name: 'Wznów występ' }).click();
  await page.keyboard.down('k');
  await expect.poll(() => state(page).then((s) => s.phase)).toBe('playing');
  await atAudio(page, 8.25);
  await page.keyboard.up('k');
  await expect(page.getByLabel('Bieżąca fraza')).toContainText('Wracasz w rytm');
  expect((await state(page)).score.phrases[1].comeback).toBe(true);
  await page.screenshot({ path: 'test-results/performance-comeback.png' });
  await atAudio(page, 8.48);
  await page.keyboard.press('l');
  await expect.poll(() => state(page).then((s) => s.screen), { timeout: 7000 }).toBe('results');
  await expect(page.getByLabel('Ślad wykonania')).toContainText('Pierwszy powrót: fraza 2');
  await page.screenshot({ path: 'test-results/performance-results.png', fullPage: true });
  await page.getByRole('button', { name: 'Wyślij szkic do Pawła', exact: true }).click();
  const sent = await saved(page);
  expect(sent.settledIntentTrackIds).toEqual([testMap.trackId]);
  expect(sent.pendingPerformanceReaction.text).toContain('wróciłeś');
  await page.getByRole('button', { name: 'Rozpocznij dzień 2' }).click();
  await expect(page.getByText(/Na żywo: W frazie 2 wróciłeś/)).toBeVisible();
  const received = await saved(page);
  expect(received.pendingPerformanceReaction).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Przejdź do bootowania' }).click();
  await page.evaluate(() => window.advanceTime?.(5000));
  expect((await saved(page)).settledIntentTrackIds).toEqual([testMap.trackId]);
  await page.getByRole('button', { name: 'Messenger' }).click();
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await page.getByRole('button', { name: 'Ustno.ai Szkice' }).click();
  const before = await saved(page);
  await page.getByRole('button', { name: 'Opublikuj na czacie głównym' }).click();
  const after = await saved(page);
  expect(after.pendingPerformanceReaction.channel).toBe('group');
  expect(after.settledIntentTrackIds).toEqual(before.settledIntentTrackIds);
  expect(after.publishedTracks[0].lastPerformance.intent).toBe('live');
  expect(errors).toEqual([]);
});

test('wejście jest oceniane według audio również pomiędzy klatkami', async ({ page }) => {
  await prepare(page);
  await start(page);
  const outcome = await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>('.stage-audio')!;
    const previous = JSON.parse(window.render_game_to_text!()).elapsedMs;
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 1 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true }));
    const after = JSON.parse(window.render_game_to_text!());
    delete (audio as unknown as Record<string, unknown>).currentTime;
    return { previous, after };
  });
  expect(outcome.previous).toBeLessThan(800);
  expect(outcome.after.elapsedMs).toBe(1000);
  expect(outcome.after.score.perfectHits).toBe(1);
});

test('podkład zablokowany: brak cichego startu i skuteczne ponowienie', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let rejected = false;
    HTMLMediaElement.prototype.play = function () {
      if (this.classList.contains('stage-audio') && !rejected) { rejected = true; return Promise.reject(new DOMException('Test blokady', 'NotAllowedError')); }
      return original.call(this);
    };
  });
  await prepare(page);
  await page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first().click();
  await expect(page.getByText('Podkład nie ruszył. Próba czeka.')).toBeVisible();
  expect((await state(page)).elapsedMs).toBe(0);
  await page.waitForTimeout(250);
  expect((await state(page)).elapsedMs).toBe(0);
  await page.getByRole('button', { name: 'Ponów odtwarzanie' }).click();
  await expect.poll(() => state(page).then((s) => s.phase)).toBe('playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).phase).toBe('paused');
  await page.getByRole('button', { name: 'Wyjdź do pulpitu' }).click();
  await expect.poll(() => state(page).then((s) => s.dayCycle.phase)).toBe('work');
  await expect(page.getByRole('button', { name: 'Stwórz pierwszą wersję' }).first()).toBeEnabled();
});

test('dotyk: mobilny występ i raport mieszczą się w 390 × 844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await start(page);
  const lane = await page.locator('.lane').first().boundingBox();
  expect(lane).not.toBeNull();
  expect(lane!.y + lane!.height).toBeLessThan(844);
  await atAudio(page, .97);
  await page.touchscreen.tap(lane!.x + lane!.width / 2, lane!.y + lane!.height * .82);
  const outcome = await state(page);
  expect(outcome.score.perfectHits + outcome.score.greatHits + outcome.score.goodHits).toBe(1);
  await page.screenshot({ path: 'test-results/performance-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.primary-action').click();
  await expect(page.getByLabel('Ślad wykonania')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const source of ['manual', 'generated'] as const) {
  test(`playtest lokalnego utworu: mapa ${source}, realne audio i sekwencja wejść`, async ({ page }) => {
    test.setTimeout(30000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (source === 'generated') await page.route('**/src/data/manualBeatmaps.json*', (route) => route.fulfill({
      contentType: 'application/javascript', body: 'export default {schemaVersion:2,tracks:{}}',
    }));
    await prepare(page, false);
    await start(page);
    expect((await state(page)).beatmapSource).toBe(source);
    const playing = page.evaluate(async () => {
      // Import z lokalnego Vite: gramy w istniejący repertuar, bez zastępowania podkładu.
      const rhythmPath = '/src/rhythm.ts';
      const tracksPath = '/src/data/tracks.ts';
      const rhythm = await import(rhythmPath);
      const catalog = await import(tracksPath);
      const audio = document.querySelector<HTMLAudioElement>('.stage-audio')!;
      const map = rhythm.resolveRhythmBeatmap(catalog.tracks[0], 'Łatwy', Math.round(audio.duration * 1000));
      const pressed = new Set<string>();
      const released = new Set<string>();
      const begun = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const time = audio.currentTime * 1000 - (map.sourceStartMs ?? 0) + (map.inputOffsetMs ?? 0);
          for (const note of map.notes) {
            if (time >= note.timeMs && !pressed.has(note.id)) {
              pressed.add(note.id);
              window.dispatchEvent(new KeyboardEvent('keydown', { key: note.lane.toLowerCase(), code: `Key${note.lane}`, bubbles: true }));
            }
            if (pressed.has(note.id) && !released.has(note.id) && time >= note.timeMs + (note.durationMs ?? 0)) {
              released.add(note.id);
              window.dispatchEvent(new KeyboardEvent('keyup', { key: note.lane.toLowerCase(), code: `Key${note.lane}`, bubbles: true }));
            }
          }
          if (performance.now() - begun >= 15000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `test-results/playtest-${source}.png`, fullPage: true });
    await playing;
    const played = await state(page);
    expect(played.elapsedMs).toBeGreaterThan(14000);
    expect(played.score.perfectHits + played.score.greatHits + played.score.goodHits).toBeGreaterThan(5);
    expect(played.score.phrases.some((phrase: { complete: boolean }) => phrase.complete)).toBe(true);
    await page.locator('.primary-action').click();
    await expect(page.getByLabel('Ślad wykonania')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
