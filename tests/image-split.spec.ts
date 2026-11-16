import { test, expect, type Page } from '@playwright/test';
import { menu } from './ui';

async function ready(page: Page) { await page.waitForFunction(() => !!(window as any).__paint && !(window as any).__paint.busy); }
// 200×100 image of four solid quadrants: red, green / blue, yellow.
async function quadrants(page: Page) {
  const base64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; const g = c.getContext('2d')!;
    for (const [i, color] of ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].entries()) { g.fillStyle = color; g.fillRect(i % 2 * 100, Math.floor(i / 2) * 50, 100, 50); } return c.toDataURL('image/png').split(',')[1]; });
  return { name: 'quadrants.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
const state = (page: Page) => page.evaluate(() => { const p = (window as any).__paint; return { cuts: p.story.cuts.map((c: any) => c.name), current: p.story.current.name, layers: p.app.layers.map((l: any) => l.name), active: p.app.selected.name, history: p.app.history.past.length, source: p.app.layers[0].imageSource ?? null }; });
const pixel = (page: Page, x: number, y: number, layer: number) => page.evaluate(({x,y,layer}) => Array.from((window as any).__paint.app.layers[layer].canvas.getContext('2d').getImageData(x, y, 1, 1).data), {x,y,layer});
const signature = (page: Page) => page.evaluate(() => (window as any).__paint.app.layers.map((l: any) => l.canvas.toDataURL()));
test.beforeEach(async ({page}) => { await page.goto('/'); await ready(page); await menu(page,'new'); await page.locator('#newWidth').fill('120'); await page.locator('#newHeight').fill('80'); await page.locator('#createDocument').click(); });

test('4조각 중 2·4번만 새 컷: 원본 레이어+빈 레이어, 기존 컷 불변, 저장·복구', async ({page}) => {
  await page.evaluate(() => { const a = (window as any).__paint.app; a.begin(10, 10, 6, '#000000', 1, false); a.point(40, 30); a.end(); });
  const original = await signature(page); await expect(page.locator('#splitImport')).toBeHidden();
  await page.locator('#splitInput').setInputFiles(await quadrants(page)); await expect(page.locator('#splitDialog')).toBeVisible(); await expect(page.locator('#splitPieces input')).toHaveCount(4);
  await expect(page.locator('#createSplit')).toHaveText('선택한 4개 조각으로 컷 만들기');
  await page.locator('#splitPieces input').nth(0).uncheck();
  const box = (await page.locator('#splitPreview').boundingBox())!; await page.mouse.click(box.x + box.width * .25, box.y + box.height * .75);
  await expect(page.locator('#splitPieces input').nth(2)).not.toBeChecked(); await expect(page.locator('#createSplit')).toHaveText('선택한 2개 조각으로 컷 만들기');
  await page.locator('#createSplit').click(); await ready(page); await expect(page.locator('#splitDialog')).toBeHidden(); await expect(page.locator('#cutCount')).toHaveText('3'); await expect(page.locator('#toast')).toContainText('2개 조각');
  expect(await state(page)).toEqual({ cuts: ['컷 1', '조각 2', '조각 4'], current: '조각 2', layers: ['원본 조각 2', '다시 그리기'], active: '다시 그리기', history: 0, source: { width: 100, height: 50, name: 'quadrants.png' } });
  // A 100×50 piece on a 120×80 canvas is enlarged to 120×60 and centred; the drawing layer stays empty.
  expect(await pixel(page, 60, 40, 0)).toEqual([0, 255, 0, 255]); expect(await pixel(page, 60, 5, 0)).toEqual([0, 0, 0, 0]); expect(await pixel(page, 60, 75, 0)).toEqual([0, 0, 0, 0]); expect(await pixel(page, 60, 40, 1)).toEqual([0, 0, 0, 0]);
  await expect(page.locator('#dirty')).toBeVisible();
  await page.locator('.cut-card').nth(2).click(); await ready(page); expect(await pixel(page, 60, 40, 0)).toEqual([255, 255, 0, 255]); expect((await state(page)).layers).toEqual(['원본 조각 4', '다시 그리기']);
  await page.locator('.cut-card').first().click(); await ready(page); expect(await signature(page)).toEqual(original); expect((await state(page)).history).toBe(1);
  const project = await page.evaluate(async () => (window as any).__paint.story.serialize('분할')); page.on('dialog', d => void d.accept());
  await page.locator('#fileInput').setInputFiles({ name: 'split.mpaint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) }); await ready(page);
  await expect(page.locator('#cutCount')).toHaveText('3'); await page.locator('.cut-card').nth(1).click(); await ready(page); expect(await pixel(page, 60, 40, 0)).toEqual([0, 255, 0, 255]); expect((await state(page)).source).toEqual({ width: 100, height: 50, name: 'quadrants.png' });
  await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료', { timeout: 10000 }); await page.reload(); await page.locator('#restoreRecovery').click(); await ready(page); await expect(page.locator('#cutCount')).toHaveText('3');
});

test('분할선 드래그·칸 수 변경·확대 끄기·취소·잘못된 입력', async ({page}) => {
  await page.locator('#splitInput').setInputFiles(await quadrants(page)); await expect(page.locator('#splitDialog')).toBeVisible();
  const box = (await page.locator('#splitPreview').boundingBox())!, drag = async (fx: number, fy: number, tx: number, ty: number) => { await page.mouse.move(box.x + fx * box.width, box.y + fy * box.height); await page.mouse.down(); await page.mouse.move(box.x + tx * box.width, box.y + ty * box.height, { steps: 3 }); await page.mouse.up(); };
  await drag(.5, .3, .25, .3); await drag(.1, 0, .1, .2);
  const lines = await page.evaluate(() => (window as any).__split.lines); expect(lines.xs[1]).toBeCloseTo(.25, 2); expect(lines.ys[0]).toBeCloseTo(.2, 2);
  await expect(page.locator('#splitPieces input').first()).toBeChecked(); // dragging a line never toggles a piece
  await drag(.25, .3, 2, .3); expect((await page.evaluate(() => (window as any).__split.lines)).xs[1]).toBeCloseTo(.98, 2);
  await page.locator('#splitColumns').fill('3'); await page.locator('#splitRows').fill('1'); await expect(page.locator('#splitPieces input')).toHaveCount(3); expect((await page.evaluate(() => (window as any).__split.lines)).ys).toEqual([0, 1]);
  await page.locator('#splitColumns').fill('9'); await expect(page.locator('#splitPieces input')).toHaveCount(3); await page.locator('#splitColumns').fill('2'); await page.locator('#splitRows').fill('2');
  await page.locator('#splitNone').click(); await expect(page.locator('#createSplit')).toBeDisabled(); await page.locator('#cancelSplit').click(); await expect(page.locator('#splitDialog')).toBeHidden(); await expect(page.locator('#cutCount')).toHaveText('1'); await expect(page.locator('#dirty')).toBeHidden();
  await page.locator('#splitInput').setInputFiles(await quadrants(page)); await drag(.5, .3, .25, .3); await page.locator('#splitNone').click(); await page.locator('#splitPieces input').first().check(); await page.locator('#splitEnlarge').uncheck(); await page.locator('#createSplit').click(); await ready(page);
  // Piece 1 is now 50×50 and keeps its size: centred at (35..85, 15..65).
  expect((await state(page)).source).toEqual({ width: 50, height: 50, name: 'quadrants.png' }); expect(await pixel(page, 60, 40, 0)).toEqual([255, 0, 0, 255]); expect(await pixel(page, 30, 40, 0)).toEqual([0, 0, 0, 0]); expect(await pixel(page, 60, 70, 0)).toEqual([0, 0, 0, 0]);
  await page.locator('#splitInput').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await expect(page.locator('#toast')).toContainText('PNG·JPEG·WebP'); await expect(page.locator('#splitDialog')).toBeHidden();
});

test('컷 한도 초과는 아무 컷도 만들지 않음', async ({page}) => {
  const result = await page.evaluate(async () => { const p = (window as any).__paint, story = p.story, image = document.createElement('canvas'); image.width = image.height = 8;
    const piece = (index: number) => ({ index, sx: 0, sy: 0, sw: 4, sh: 4 }); await story.addImageCuts(image, 'a', Array.from({ length: 28 }, (_, i) => piece(i)), true); const before = story.cuts.length, current = story.current.id;
    let message = ''; try { await story.addImageCuts(image, 'a', [piece(0), piece(1)], true); } catch (e) { message = String(e); }
    return { before, after: story.cuts.length, same: story.current.id === current, message, hot: story.stats.hotCuts }; });
  expect(result.before).toBe(29); expect(result.after).toBe(29); expect(result.same).toBe(true); expect(result.message).toContain('최대 30개'); expect(result.hot).toBeLessThanOrEqual(3);
});
