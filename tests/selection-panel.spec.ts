import { test, expect, type Page } from '@playwright/test';
import { menu } from './ui';
import { readFile } from 'node:fs/promises';

async function ready(page: Page) { await page.waitForFunction(() => !!(window as any).__paint && !(window as any).__paint.busy); }
async function point(page: Page, x: number, y: number) {
  return page.evaluate(({x,y}) => { const p=(window as any).__paint,r=document.getElementById('paper')!.getBoundingClientRect();return {x:r.x+(p.mirrored?p.app.width-x:x)*p.zoom,y:r.y+y*p.zoom}; }, {x,y});
}
async function drag(page: Page, a: [number,number], b: [number,number], up=true) {
  const from=await point(page,...a),to=await point(page,...b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y);if(up)await page.mouse.up();
}
async function signature(page: Page) { return page.evaluate(() => (window as any).__paint.app.layers.map((l:any)=>l.canvas.toDataURL())); }
async function pixel(page: Page,x:number,y:number,layer?:number) { return page.evaluate(({x,y,layer})=>{const a=(window as any).__paint.app;return Array.from((layer===undefined?a.selected:a.layers[layer]).canvas.getContext('2d').getImageData(x,y,1,1).data);},{x,y,layer}); }
async function selection(page: Page) { return page.evaluate(()=>(window as any).__paint.selection); }
async function seed(page: Page) { await page.evaluate(()=>{const a=(window as any).__paint.app,g=a.selected.canvas.getContext('2d');g.fillStyle='#ff0000';g.fillRect(10,10,8,8);g.fillStyle='rgba(0,0,255,.5)';g.fillRect(22,10,4,4);g.fillStyle='#00ff00';g.fillRect(80,60,8,8);a.changed();a.render();}); }
async function choose(page:Page) { await page.locator('#stage').focus();await page.keyboard.press('s');await drag(page,[8,8],[30,26]); }
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);await menu(page,'new');await page.locator('#newWidth').fill('128');await page.locator('#newHeight').fill('96');await page.locator('#createDocument').click();});

test('사각 선택 이동은 선택 내부만 편집, 투명·미리보기·단일 Undo/Redo',async({page})=>{
  await seed(page);const before=await signature(page);await choose(page);expect(await selection(page)).toEqual({x:8,y:8,width:22,height:18});
  expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);
  await drag(page,[12,12],[42,32],false);
  await expect.poll(()=>pixel(page,40,30)).toEqual([255,0,0,255]);
  expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);
  await page.mouse.up();expect(await pixel(page,10,10)).toEqual([0,0,0,0]);expect(await pixel(page,52,30)).toEqual([0,0,255,128]);expect(await pixel(page,80,60)).toEqual([0,255,0,255]);
  expect(await selection(page)).toEqual({x:38,y:28,width:22,height:18});
  const after=await signature(page);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(1);
  await page.keyboard.press('Control+z');expect(await signature(page)).toEqual(before);await page.keyboard.press('Control+y');expect(await signature(page)).toEqual(after);
});

test('선택 이동 Escape·pointercancel·캡처 상실·blur 취소, 새 선택 취소',async({page})=>{
  await seed(page);await choose(page);const before=await signature(page),r=await selection(page);
  for(const mode of ['escape','pointer','capture','blur']){
    await drag(page,[12,12],[40,30],false);await expect.poll(()=>pixel(page,38,28)).toEqual([255,0,0,255]);
    if(mode==='escape')await page.keyboard.press('Escape');
    else if(mode==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else await page.locator('#stage').dispatchEvent(mode==='pointer'?'pointercancel':'lostpointercapture',{pointerId:1});
    await page.mouse.up();expect(await signature(page)).toEqual(before);expect(await selection(page)).toEqual(r);
  }
  await drag(page,[70,40],[100,70],false);await page.keyboard.press('Escape');await page.mouse.up();expect(await selection(page)).toEqual(r);
  expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);
});

test('선택 삭제·잘라내기·투명 픽셀 새 레이어 붙여넣기와 Undo, 컷/레이어 격리',async({page})=>{
  await seed(page);await choose(page);const before=await signature(page);
  await page.keyboard.press('Control+c');expect(await signature(page)).toEqual(before);
  await page.keyboard.press('Delete');expect(await pixel(page,10,10)).toEqual([0,0,0,0]);expect(await pixel(page,80,60)).toEqual([0,255,0,255]);await page.keyboard.press('Control+z');expect(await signature(page)).toEqual(before);
  await choose(page);await page.keyboard.press('Control+x');expect(await pixel(page,10,10)).toEqual([0,0,0,0]);await page.keyboard.press('Control+v');await expect(page.locator('#layerCount')).toHaveText('2');
  expect(await pixel(page,10,10)).toEqual([255,0,0,255]);expect(await pixel(page,22,10)).toEqual([0,0,255,128]);expect(await pixel(page,80,60)).toEqual([0,0,0,0]);expect(await pixel(page,80,60,0)).toEqual([0,255,0,255]);
  const pasted=await signature(page);await page.keyboard.press('Control+z');await expect(page.locator('#layerCount')).toHaveText('1');await page.keyboard.press('Control+y');expect(await signature(page)).toEqual(pasted);
  await page.locator('#addCut').click();await ready(page);expect(await selection(page)).toBeNull();await page.locator('#stage').focus();await page.keyboard.press('Control+v');expect(await pixel(page,10,10)).toEqual([255,0,0,255]);
  await page.locator('.cut-card').first().click();await ready(page);expect(await signature(page)).toEqual(pasted);expect(await selection(page)).toBeNull();
});

test('확대·보기 반전에서 선택 좌표와 오버레이, 전체 선택/해제·입력 보호',async({page})=>{
  await seed(page);await page.locator('#mirrorView').click();await page.evaluate(()=>{const p=(window as any).__paint,r=document.getElementById('paper')!.getBoundingClientRect(),s=document.getElementById('stage')!.getBoundingClientRect();p.setZoom(2,r.x-s.x,r.y-s.y);});
  await choose(page);expect(await selection(page)).toEqual({x:8,y:8,width:22,height:18});const box=(await page.locator('#selectionOverlay').boundingBox())!,a=await point(page,30,8);expect(box.x).toBeCloseTo(a.x);expect(box.y).toBeCloseTo(a.y);expect(box.width).toBeCloseTo(44);
  expect(await page.locator('#selectionOverlay').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  await drag(page,[12,12],[22,17]);expect(await pixel(page,20,15)).toEqual([255,0,0,255]);
  const before=await signature(page);await page.keyboard.press('Control+a');expect(await selection(page)).toEqual({x:0,y:0,width:128,height:96});await page.keyboard.press('Control+d');expect(await selection(page)).toBeNull();expect(await signature(page)).toEqual(before);
  await page.locator('#layerOpacityNumber').focus();await page.keyboard.press('s');await page.keyboard.press('Control+a');await page.keyboard.press('Control+d');await expect(page.locator('#brushTool')).toHaveValue('select');expect(await selection(page)).toBeNull();expect(await signature(page)).toEqual(before);
  await page.locator('#stage').focus();await page.keyboard.press('v');await expect(page.locator('#brushTool')).toHaveValue('move-layer');
});

test('전체 그림 이동은 숨긴 레이어 옵션과 한 명령, 다른 컷 격리·취소',async({page})=>{
  await seed(page);await page.evaluate(()=>{const a=(window as any).__paint.app;a.add();a.selected.canvas.getContext('2d').fillRect(30,30,4,4);a.selected.visible=false;a.changed();a.render();a.history.clear();});
  const original=await signature(page);await page.locator('#duplicateCut').click();await ready(page);await page.locator('.cut-card').first().click();await ready(page);
  await page.locator('#move-artwork').click();await drag(page,[50,50],[57,54]);expect(await pixel(page,37,34,1)).toEqual([0,0,0,255]);expect(await pixel(page,17,14,0)).toEqual([255,0,0,255]);
  const both=await signature(page);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(1);await page.keyboard.press('Control+z');expect(await signature(page)).toEqual(original);await page.keyboard.press('Control+y');expect(await signature(page)).toEqual(both);
  await page.locator('#moveHidden').uncheck();await drag(page,[50,50],[53,52]);expect((await signature(page))[1]).toBe(both[1]);expect(await pixel(page,20,16,0)).toEqual([255,0,0,255]);const visible=await signature(page);
  await drag(page,[50,50],[60,60],false);await page.keyboard.press('Escape');await page.mouse.up();expect(await signature(page)).toEqual(visible);
  await page.locator('.cut-card').nth(1).click();await ready(page);expect(await signature(page)).toEqual(original);
});

test('패널 340px 기본값·범위·포인터 취소·접기·설정 복원·행 밀도',async({page})=>{
  const sidebar=page.locator('#sidebar'),handle=page.locator('#sidebarResize');expect((await sidebar.boundingBox())!.width).toBe(340);
  let box=(await handle.boundingBox())!;await page.mouse.move(box.x+4,box.y+80);await page.mouse.down();await page.mouse.move(box.x-400,box.y+80);await page.mouse.up();expect((await sidebar.boundingBox())!.width).toBe(520);
  await handle.focus();for(let i=0;i<13;i++)await page.keyboard.press('ArrowRight');expect((await sidebar.boundingBox())!.width).toBe(280);
  box=(await handle.boundingBox())!;await page.mouse.move(box.x+4,box.y+80);await page.mouse.down();await page.mouse.move(box.x-50,box.y+80);await handle.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();expect((await sidebar.boundingBox())!.width).toBe(280);
  await page.locator('#layerDensity').selectOption('compact');expect((await page.locator('.layer-row').boundingBox())!.height).toBe(36);
  await expect(page.locator('#screenSettings')).not.toHaveAttribute('open');await page.locator('#screenSettings summary').click();await page.locator('#toggleSidebar').click();await expect(sidebar).toBeHidden();
  page.on('dialog',d=>void d.accept());await page.reload();await ready(page);await expect(sidebar).toBeHidden();await page.locator('#toggleSidebar').click();expect((await sidebar.boundingBox())!.width).toBe(280);await expect(page.locator('#layerDensity')).toHaveValue('compact');await expect(page.locator('#screenSettings')).toHaveAttribute('open');
});

test('레이어 드래그 순서 Undo·활성 행 스크롤·썸네일 캐시와 스트로크 비용',async({page})=>{
  await seed(page);for(let i=0;i<4;i++)await page.locator('#addLayer').click();
  const order=await page.evaluate(()=>(window as any).__paint.app.layers.map((l:any)=>l.id));
  await page.locator('.layer-row').first().dragTo(page.locator('.layer-row').nth(3));
  expect(await page.evaluate(()=>(window as any).__paint.app.layers.map((l:any)=>l.id))).toEqual([order[0],order[4],order[1],order[2],order[3]]);
  await page.locator('#stage').focus();await page.keyboard.press('Control+z');expect(await page.evaluate(()=>(window as any).__paint.app.layers.map((l:any)=>l.id))).toEqual(order);
  await page.evaluate(()=>{const w=window as any;w.__thumbs=0;w.__row=document.querySelector('.layer-row');const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){if(this.canvas.classList.contains('layer-thumbnail'))w.__thumbs++;return (original as any).apply(this,args);};});
  await page.keyboard.press('b');await drag(page,[50,40],[70,40],false);expect(await page.evaluate(()=>(window as any).__thumbs)).toBe(0);await page.mouse.up();expect(await page.evaluate(()=>(window as any).__thumbs)).toBe(1);expect(await page.evaluate(()=>(window as any).__row===document.querySelector('.layer-row'))).toBe(true);
  await page.locator('#layerDensity').selectOption('compact');await page.evaluate(()=>{const a=(window as any).__paint.app;document.getElementById('layerList')!.style.maxHeight='75px';a.active=a.layers[0].id;a.changed([]);});
  const row=(await page.locator('.layer-row.selected').boundingBox())!,list=(await page.locator('#layerList').boundingBox())!;expect(row.y).toBeGreaterThanOrEqual(list.y);expect(row.y+row.height).toBeLessThanOrEqual(list.y+list.height+1);
});

test('선택 편집 저장·자동 복구·PNG 제외와 내부 버퍼/이동 메모리 경계',async({page})=>{
  await seed(page);await choose(page);await drag(page,[12,12],[32,22]);const original=await signature(page);
  const expectedPng=await page.evaluate(()=>(window as any).__paint.app.composite().toDataURL());
  await page.locator('#export').click();const download=page.waitForEvent('download');await page.locator('#downloadPng').click();const bytes=await readFile((await(await download).path())!);
  const png=await page.evaluate(async(src)=>{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=src;});const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d')!.drawImage(img,0,0);return c.toDataURL();},`data:image/png;base64,${bytes.toString('base64')}`);expect(png).toBe(expectedPng);
  const project=await page.evaluate(async()=>(window as any).__paint.story.serialize('선택 편집'));expect(JSON.stringify(project)).not.toContain('selection');
  await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:15000});page.on('dialog',d=>void d.accept());await page.reload();await expect(page.locator('#recoveryDialog')).toBeVisible();await page.locator('#restoreRecovery').click();await expect(page.locator('#toast')).toContainText('작업을 복구했습니다');await ready(page);expect(await signature(page)).toEqual(original);expect(await selection(page)).toBeNull();
  await page.locator('#fileInput').setInputFiles({name:'selection.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.locator('#docName')).toHaveText('선택 편집');await ready(page);expect(await signature(page)).toEqual(original);
  const result=await page.evaluate(async()=>{const {Paint}=await import('/src/engine.ts'),{PixelMove,rectangle}=await import('/src/selection.ts');const p=new Paint();p.reset(4,2);const g=p.selected.canvas.getContext('2d')!;g.fillRect(3,0,1,1);const before=p.selected.canvas.toDataURL();const edit=new PixelMove(p,0,0,[p.selected],{x:3,y:0,width:1,height:1});edit.update(4,0);edit.finish();const empty=!g.getImageData(0,0,4,2).data.some((v,i)=>i%4===3&&v);p.history.undo();const restored=p.selected.canvas.toDataURL()===before;let rejected=false;try{new PixelMove({stroke:null,width:4096,height:4096} as any,0,0,[{},{}] as any);}catch{rejected=true;}return {empty,restored,rejected,clamped:rectangle(-4,-4,2,2,4,2)};});expect(result).toEqual({empty:true,restored:true,rejected:true,clamped:{x:0,y:0,width:2,height:2}});
});

test('시스템 클립보드 쓰기 거부 시 내부 복사 보존, 외부 PNG 붙여넣기·입력 보호',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{throw new DOMException('쓰기 거부','NotAllowedError');}}}));
  await seed(page);await choose(page);await page.keyboard.press('Control+x');await expect(page.locator('#toast')).toContainText('앱 안에서는');await page.keyboard.press('Control+v');expect(await pixel(page,10,10)).toEqual([255,0,0,255]);
  const pasted=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d')!.fillRect(0,0,1,1);const b=await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!)));const transfer=new DataTransfer();transfer.items.add(new File([b],'clipboard.png',{type:'image/png'}));document.getElementById('layerOpacityNumber')!.focus();const protectedEvent=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer});document.getElementById('layerOpacityNumber')!.dispatchEvent(protectedEvent);const protectedCount=(window as any).__paint.app.layers.length;document.getElementById('stage')!.focus();const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer});document.getElementById('stage')!.dispatchEvent(event);return {protectedCount,protectedDefault:protectedEvent.defaultPrevented,handled:event.defaultPrevented};});
  expect(pasted).toEqual({protectedCount:2,protectedDefault:false,handled:true});await ready(page);await expect(page.locator('#layerCount')).toHaveText('3');await expect(page.locator('#transformControls')).toBeVisible();await page.locator('#applyTransform').click();expect(await pixel(page,63,47)).toEqual([0,0,0,255]);expect(await pixel(page,64,48)).toEqual([0,0,0,0]);await page.keyboard.press('Control+z');await expect(page.locator('#layerCount')).toHaveText('2');expect(errors).toEqual([]);
});
