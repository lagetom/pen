import { test, expect, Page } from '@playwright/test';
const state = async (page: Page) => page.evaluate(() => { const p = (window as any).__paint; return { undo: p.app.history.past.length, redo: p.app.history.future.length, bytes: p.app.history.bytes, layers: p.app.layers.length }; });
async function pixel(page: Page, x: number, y: number, layer?: number) { return page.evaluate(({x,y,layer}) => { const a = (window as any).__paint.app; return Array.from((layer === undefined ? a.selected : a.layers[layer]).canvas.getContext('2d').getImageData(x, y, 1, 1).data); }, { x,y,layer }); }
async function dot(page: Page, x: number, y: number) { const r = await page.locator('#paper').boundingBox(); const z = await page.evaluate(() => (window as any).__paint.zoom); await page.mouse.click(r!.x + x * z, r!.y + y * z); }
test.beforeEach(async ({page}) => { await page.goto('/'); await page.waitForFunction(() => !!(window as any).__paint); });
test('실제 포인터로 점 25개와 작은 원 25개, 빠른 방향 전환', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (let i = 0; i < 25; i++) await dot(page, 80 + (i % 20) * 24, 80 + Math.floor(i / 20) * 24);
  expect((await pixel(page,80,80))[3]).toBe(255); expect((await state(page)).undo).toBe(25);
  const r = (await page.locator('#paper').boundingBox())!, z = await page.evaluate(() => (window as any).__paint.zoom);
  for (let i = 0; i < 25; i++) {
    const x = 90 + i % 20 * 24, y = 270 + Math.floor(i / 20) * 24;
    await page.mouse.move(r.x + (x + 6) * z, r.y + y * z); await page.mouse.down();
    for (let j = 1; j <= 12; j++) await page.mouse.move(r.x + (x + Math.cos(j / 12 * Math.PI * 2) * 6) * z, r.y + (y + Math.sin(j / 12 * Math.PI * 2) * 6) * z);
    await page.mouse.up();
  }
  await page.mouse.move(r.x+600*z,r.y+200*z); await page.mouse.down();
  for (let i=0;i<20;i++) await page.mouse.move(r.x+(600+(i%2?40:0))*z,r.y+(200+i*2)*z);
  await page.mouse.up();
  expect((await pixel(page,96,270))[3]).toBeGreaterThan(0);
  const metrics = await page.evaluate(() => { const p=(window as any).__paint; return { historyMiB: p.app.history.bytes/1048576, renderSamples:p.metrics.frames.length, maxRenderMs:Math.max(...p.metrics.frames), meanInputMs:p.metrics.latencies.reduce((a:number,b:number)=>a+b,0)/p.metrics.latencies.length }; });
  console.log('Measured Chromium software environment:', metrics);
  expect(metrics.historyMiB).toBeLessThanOrEqual(128); expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/drawing.png'});
});
test('8회 Undo/Redo와 새로운 분기, 키보드 포커스 보호', async ({page}) => {
  for(let i=0;i<8;i++) await dot(page,80+i*15,100);
  for(let i=0;i<8;i++) await page.keyboard.press('Control+z');
  expect((await state(page)).redo).toBe(8); expect((await pixel(page,80,100))[3]).toBe(0);
  for(let i=0;i<8;i++) await page.keyboard.press('Control+y');
  expect((await pixel(page,80,100))[3]).toBe(255);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+z'); await dot(page,100,140); expect((await state(page)).redo).toBe(0);
  await page.evaluate(() => { const field = document.createElement('input'); document.body.append(field); field.focus(); }); await page.keyboard.press('e'); await expect(page.locator('#pen')).toHaveAttribute('aria-pressed','true');
});
test('불투명한 획의 중첩 방지, 지우개 투명 복원, 레이어 격리', async ({page}) => {
  await page.locator('#brushOpacity').fill('50'); await page.locator('#brushOpacity').dispatchEvent('input');
  const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);
  await page.mouse.move(r.x+100*z,r.y+100*z);await page.mouse.down(); await page.mouse.move(r.x+120*z,r.y+100*z);await page.mouse.move(r.x+100*z,r.y+100*z);await page.mouse.up();
  const before=await pixel(page,110,100); expect(before[3]).toBeGreaterThanOrEqual(127);expect(before[3]).toBeLessThanOrEqual(128);
  await page.locator('#brushOpacity').fill('100');await page.locator('#brushOpacity').dispatchEvent('input');
  await page.keyboard.press('e');await dot(page,110,100);expect((await pixel(page,110,100))[3]).toBe(0);
  await page.keyboard.press('Control+z');expect(await pixel(page,110,100)).toEqual(before);
  await page.locator('#addLayer').click(); await page.keyboard.press('b');await dot(page,200,200);expect((await pixel(page,200,200,0))[3]).toBe(0);expect((await pixel(page,200,200,1))[3]).toBe(255);
  await page.keyboard.press('Delete');expect((await pixel(page,200,200,1))[3]).toBe(0);await page.keyboard.press('Control+z');expect((await pixel(page,200,200,1))[3]).toBe(255);
});
test('5개 레이어, 구조 및 속성 실행 취소와 히스토리 상한', async ({page}) => {
  for(let i=0;i<4;i++) await page.locator('#addLayer').click();expect((await state(page)).layers).toBe(5);
  const id=await page.evaluate(()=>(window as any).__paint.app.active);
  await page.locator('#layerDown').click();expect(await page.evaluate(()=>(window as any).__paint.app.layers[3].id)).toBe(id);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>(window as any).__paint.app.layers[4].id)).toBe(id);
  await page.locator('#layerOpacity').fill('35');await page.locator('#layerOpacity').dispatchEvent('change');
  expect(await page.evaluate(()=>(window as any).__paint.app.selected.opacity)).toBe(.35);await page.keyboard.press('Control+z');expect(await page.evaluate(()=>(window as any).__paint.app.selected.opacity)).toBe(1);
  await page.locator('.layer-row.selected .eye').click();expect(await page.evaluate(()=>(window as any).__paint.app.selected.visible)).toBe(false);await page.keyboard.press('Control+z');
  await page.locator('#deleteLayer').click();expect((await state(page)).layers).toBe(4);await page.keyboard.press('Control+z');expect((await state(page)).layers).toBe(5);
  expect((await state(page)).bytes).toBeLessThanOrEqual(128*1048576);
});
test('800% 좌표 변환, 펜/지우개 반복, 포인터 취소와 중복 포인터', async ({page}) => {
  await page.evaluate(()=>(window as any).__paint.setZoom(8,0,0));
  await page.evaluate(() => { const p=(window as any).__paint; p.setZoom(.1,0,0); p.setZoom(1,0,0); });
  await page.locator('#fit').click();
  const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);
  await page.mouse.move(r.x+200*z,r.y+200*z);await page.mouse.down();await page.locator('#stage').dispatchEvent('pointerdown',{pointerId:99,clientX:r.x+250*z,clientY:r.y+250*z,button:0});
  await page.locator('#stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();expect((await pixel(page,200,200))[3]).toBe(0);expect((await state(page)).undo).toBe(0);
  for(let i=0;i<3;i++){await page.keyboard.press('b');await dot(page,200,200);await page.keyboard.press('e');await dot(page,200,200);}expect((await pixel(page,200,200))[3]).toBe(0);
  // Anchor the canvas so an original-pixel coordinate remains in the viewport at 800%.
  await page.evaluate(()=>{const p=(window as any).__paint;const r=document.getElementById('paper')!.getBoundingClientRect(),s=document.getElementById('stage')!.getBoundingClientRect();p.setZoom(8,r.x-s.x+40*p.zoom,r.y-s.y+40*p.zoom);});
  await page.keyboard.press('b');await dot(page,40,40);expect((await pixel(page,40,40))[3]).toBe(255);
});
test('프로젝트 라운드트립, PNG 가져오기/투명·흰 배경, 손상 파일 보호', async ({page}) => {
  await dot(page,100,100);await page.locator('#addLayer').click();await dot(page,200,200);
  const project=await page.evaluate(async()=>{const a=(window as any).__paint.app;return await a.serialize('테스트 그림');});
  const expected=await pixel(page,200,200);
  await page.locator('#fileInput').setInputFiles({name:'test.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  page.on('dialog',d=>void d.accept());
  // The open confirmation may occur asynchronously after PNG decoding.
  await expect(page.locator('#docName')).toHaveText('테스트 그림');expect((await state(page)).layers).toBe(2);expect(await pixel(page,200,200)).toEqual(expected);
  const bytes=await page.evaluate(async()=>{const a=(window as any).__paint.app;const p=await a.serialize('png');return p.layers[1].image.split(',')[1];});
  await page.locator('#imageInput').setInputFiles({name:'import.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});await expect(page.locator('#layerCount')).toHaveText('3');await expect(page.locator('#transformControls')).toBeVisible();await page.locator('#applyTransform').click();
  const exportPixels=await page.evaluate(()=>{const a=(window as any).__paint.app;return [false,true].map(white=>Array.from(a.composite(white).getContext('2d').getImageData(0,0,1,1).data));});expect(exportPixels).toEqual([[0,0,0,0],[255,255,255,255]]);
  await page.locator('#fileInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...project,layers:[{image:'data:image/png;base64,bad'}]}))});await expect(page.locator('#toast')).toContainText('이미지');expect((await state(page)).layers).toBe(3);
});
test('IndexedDB 자동 저장과 새로고침 복구', async ({page}) => {
  const expected = [40,55,71,255];
  await dot(page,160,160);expect(await pixel(page,160,160)).toEqual(expected);
  await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:15000});
  // Inspect the committed record separately so input, storage and restore failures are distinguishable.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => { const r=indexedDB.open('mini-paint-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    try {
      const record = await new Promise<any>((resolve,reject) => { const tx=db.transaction('recovery','readonly'),r=tx.objectStore('recovery').get('last');tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error); });
      const { Storyboard } = await import('/src/storyboard.ts');
      const decoded = await Storyboard.decode(record.project);
      try { return Array.from(decoded.story.paint.selected.canvas.getContext('2d')!.getImageData(160,160,1,1).data); }
      finally { decoded.story.dispose(); }
    } finally { db.close(); }
  });
  expect(stored).toEqual(expected);
  page.on('dialog', d=>void d.accept());await page.reload();await expect(page.locator('#recoveryDialog')).toBeVisible();await page.locator('#restoreRecovery').click();
  await expect(page.locator('#toast')).toContainText('작업을 복구했습니다');
  await page.waitForFunction(() => !(window as any).__paint.busy);
  expect(await pixel(page,160,160)).toEqual(expected);await expect(page.locator('#dirty')).toBeVisible();
});
test('프로젝트 다운로드 및 PNG 내보내기 UI', async ({page}) => {
  await page.evaluate(()=>{delete (window as any).showSaveFilePicker;});page.on('dialog',d=>void d.accept('저장 테스트'));
  await dot(page,100,100);const projectDownload=page.waitForEvent('download');await page.locator('#save').click();expect((await projectDownload).suggestedFilename()).toBe('저장 테스트.mpaint');
  await page.locator('#export').click();const png=page.waitForEvent('download');await page.locator('#downloadPng').click();expect((await png).suggestedFilename()).toBe('저장 테스트.png');
});
test('프로덕션 앱 오프라인 새로고침', async ({page,context}) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173');await page.evaluate(async()=>{await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
  await context.setOffline(true);await page.reload();await expect(page.locator('#pen')).toBeVisible();await page.locator('#addLayer').click();await expect(page.locator('#layerCount')).toHaveText('2');expect(errors).toEqual([]);await context.setOffline(false);
});
test('반응형 화면에서 주요 도구 접근', async ({page}) => {await page.setViewportSize({width:760,height:800});await expect(page.locator('#addLayer')).toBeVisible();await expect(page.locator('#stage')).toBeVisible();await page.screenshot({path:'test-results/compact.png'});});
test('타일 경계와 캔버스 이탈, 합성 펜 입력 및 지우개 복원', async ({page}) => {
  const session=await page.context().newCDPSession(page);const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);
  const dispatch=async(type:string,x:number,y:number,button='left',buttons=1)=>session.send('Input.dispatchMouseEvent',{type,x:r.x+x*z,y:r.y+y*z,button,buttons,pointerType:'pen',force:.7});
  await dispatch('mousePressed',126,126);await dispatch('mouseMoved',132,132);await dispatch('mouseReleased',132,132,'left',0);
  expect((await pixel(page,128,128))[3]).toBeGreaterThan(0);const before=await pixel(page,128,128);
  await page.keyboard.press('e');await dot(page,128,128);expect((await pixel(page,128,128))[3]).toBe(0);await page.keyboard.press('Control+z');expect(await pixel(page,128,128)).toEqual(before);
  await page.keyboard.press('Control+z');expect((await pixel(page,128,128))[3]).toBe(0);await page.keyboard.press('Control+y');expect(await pixel(page,128,128)).toEqual(before);
  await page.keyboard.press('b');await page.mouse.move(r.x+2*z,r.y+500*z);await page.mouse.down();await page.mouse.move(r.x-20,r.y+520*z);await page.mouse.up();expect((await pixel(page,0,500))[3]).toBeGreaterThan(0);
});
test('직접 파일 저장 오류와 저장 중 편집 리비전 보호', async ({page}) => {
  await page.evaluate(()=>{const w=window as any;w.__writes=[];w.showSaveFilePicker=async()=>({name:'직접 저장.mpaint',createWritable:async()=>({write:async(b:Blob)=>{w.__writes.push(JSON.parse(await b.text()));if(w.__editDuringSave){const a=w.__paint.app;a.begin(300,300,8,'#283747',1,false);a.end();w.__editDuringSave=false;}await new Promise(r=>setTimeout(r,100));},close:async()=>{},abort:async()=>{}})});});
  await dot(page,100,100);await page.locator('#save').click();await expect.poll(()=>page.evaluate(()=>(window as any).__writes.length)).toBe(1);await expect(page.locator('#dirty')).toBeHidden();
  await page.evaluate(()=>{(window as any).__editDuringSave=true;});await page.locator('#save').click();await expect.poll(()=>page.evaluate(()=>(window as any).__writes.length)).toBe(2);await expect(page.locator('#toast')).toContainText('프로젝트 파일을 저장');await expect(page.locator('#dirty')).toBeVisible();expect((await pixel(page,300,300))[3]).toBe(255);
  const capturedAlpha=await page.evaluate(async()=>{const w=window as any;const decoded=await w.__paint.app.decode({...w.__writes[1],version:1,layers:w.__writes[1].cuts[0].layers});return decoded.layers[0].canvas.getContext('2d').getImageData(300,300,1,1).data[3];});expect(capturedAlpha).toBe(0);
  await page.evaluate(()=>{(window as any).showSaveFilePicker=async()=>({name:'실패.mpaint',createWritable:async()=>{throw new DOMException('쓰기 거부','NotAllowedError');}});});
  await dot(page,200,200);await page.keyboard.press('Control+Shift+s');await expect(page.locator('#toast')).toContainText('저장하지 못했습니다');await expect(page.locator('#dirty')).toBeVisible();
});
test('이전 JSON 별칭, 버전·크기 검증, 0% 브러시', async ({page}) => {
  const result=await page.evaluate(async()=>{const a=(window as any).__paint.app;const p=await a.serialize('이전');const legacy={canvasWidth:p.width,canvasHeight:p.height,layers:p.layers.map((l:any)=>({...l,dataURL:l.image,image:undefined}))};const decoded=await a.decode(legacy);let rejected=0;for(const p2 of [{...p,version:100},{...p,width:999999},{...p,layers:[]}]){try{await a.decode(p2);}catch{rejected++;}}return {width:decoded.width,rejected};});expect(result).toEqual({width:1600,rejected:3});
  await page.locator('#brushOpacity').fill('0');await page.locator('#brushOpacity').dispatchEvent('input');await dot(page,100,100);expect((await state(page)).undo).toBe(0);expect((await pixel(page,100,100))[3]).toBe(0);
});
test('자동 저장 용량 오류 알림과 재시도 복구', async ({page}) => {
  await page.evaluate(()=>{const w=window as any;w.__transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:any[]){if(args[1]==='readwrite')throw new DOMException('저장 공간이 부족합니다','QuotaExceededError');return w.__transaction.apply(this,args); } as any;});
  await dot(page,100,100);await expect(page.locator('#autoStatus')).toHaveText('자동 저장 실패',{timeout:10000});await expect(page.locator('#toast')).toContainText('프로젝트 파일을 직접 저장');
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=(window as any).__transaction;});await dot(page,200,200);await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:10000});
});
test('randomUUID 미지원 환경에서 시작·레이어 추가·프로젝트 열기·Undo/Redo', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.reload(); await expect(page.locator('#pen')).toBeVisible();
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await dot(page,100,100); await page.locator('#addLayer').click(); await dot(page,200,200);
  await page.keyboard.press('Control+z'); expect((await pixel(page,200,200))[3]).toBe(0);
  await page.keyboard.press('Control+y'); expect((await pixel(page,200,200))[3]).toBe(255);
  const restored = await page.evaluate(async () => {
    const a = (window as any).__paint.app, p = await a.serialize('HTTP 작업');
    const decoded = await a.decode(p); a.load(decoded); a.add();
    const ids = a.layers.map((l:any) => l.id); a.reset(8,8);
    for(let i=0;i<25;i++) ids.push(a.makeLayer().id);
    // The original loader permits up to 50 layers; keep that compatibility.
    const tiny = await a.serialize('50 레이어');
    const fifty = await a.decode({...tiny,layers:Array.from({length:50},()=>tiny.layers[0])});
    return { total: ids.length, unique: new Set(ids).size, legacyLayers: fifty.layers.length };
  });
  expect(restored).toEqual({total:28,unique:28,legacyLayers:50}); expect(errors).toEqual([]);
});
test('원본 HTML에서 실제 저장한 JSON의 레이어·픽셀 호환성', async ({page}) => {
  await page.route('**/legacy-mini-paint.html', route => route.fulfill({ path: 'tests/fixtures/mini_paint_layers.html', contentType: 'text/html' }));
  await page.goto('/legacy-mini-paint.html');
  let r=(await page.locator('#paper').boundingBox())!;
  await page.mouse.click(r.x+100,r.y+100);
  await page.locator('#add').click();
  await page.locator('#color').fill('#ee6c55'); await page.locator('#color').dispatchEvent('input');
  r=(await page.locator('#paper').boundingBox())!; await page.mouse.click(r.x+200,r.y+200);
  page.once('dialog', d=>void d.accept('원본 위 레이어'));
  await page.locator('.layer.selected .name').dblclick();
  await page.locator('#layers .layer').last().locator('input').uncheck();
  const pending=page.waitForEvent('download');await page.locator('#saveProject').click();const saved=await pending;
  const {readFile}=await import('node:fs/promises');const buffer=await readFile((await saved.path())!);
  const original=JSON.parse(buffer.toString());expect(original.width).toBe(1000);expect(original.height).toBe(700);expect(original.layers[0].visible).toBe(false);
  await page.goto('/');await page.locator('#fileInput').setInputFiles({name:'그림-레이어.json',mimeType:'application/json',buffer});
  await expect(page.locator('#dimensions')).toHaveText('1000 × 700 px');await expect(page.locator('#layerCount')).toHaveText('2');
  expect(await page.evaluate(()=>{const a=(window as any).__paint.app;return a.layers.map((l:any)=>({name:l.name,visible:l.visible,opacity:l.opacity}));})).toEqual(original.layers.map((l:any)=>({name:l.name,visible:l.visible,opacity:1})));
  expect(await pixel(page,100,100,0)).toEqual([17,17,17,255]);expect(await pixel(page,200,200,1)).toEqual([238,108,85,255]);
  await page.keyboard.press('e');await dot(page,200,200);expect((await pixel(page,200,200,1))[3]).toBe(0);await page.keyboard.press('Control+z');expect(await pixel(page,200,200,1)).toEqual([238,108,85,255]);
});
