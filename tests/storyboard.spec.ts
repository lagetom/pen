import {test,expect,Page} from '@playwright/test';
import { menu } from './ui';
async function ready(page:Page){await page.waitForFunction(()=>!(window as any).__paint.busy);}
async function act(page:Page,id:string){if(id==='new')await menu(page,id);else await page.locator(`#${id}`).click();await ready(page);}
async function select(page:Page,index:number){await page.locator('.cut-card').nth(index).click();await ready(page);}
async function dot(page:Page,x=100,y=100){const r=(await page.locator('#paper').boundingBox())!,z=await page.evaluate(()=>(window as any).__paint.zoom);await page.mouse.click(r.x+x*z,r.y+y*z);}
async function pixel(page:Page,x=100,y=100){return page.evaluate(({x,y})=>Array.from((window as any).__paint.app.selected.canvas.getContext('2d').getImageData(x,y,1,1).data),{x,y});}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!(window as any).__paint);});
test('인스타툰 프리셋 기억, 사용자 지정, 비율·해상도, 흰 배경',async({page})=>{
  await act(page,'new');await page.locator('#canvasPreset').selectOption('instagram-portrait');await expect(page.locator('#newSizeInfo')).toHaveText('1080 × 1350 px · 4:5');
  await page.locator('#newDialog button[value=cancel]').click();await page.reload();await act(page,'new');await expect(page.locator('#canvasPreset')).toHaveValue('instagram-portrait');await expect(page.locator('#newHeight')).toHaveValue('1350');
  await act(page,'createDocument');await expect(page.locator('#dimensions')).toHaveText('1080 × 1350 px');await expect(page.locator('#canvasLabel')).toContainText('4:5');await expect(page.locator('#whiteBackground')).toBeChecked();await expect(page.locator('#paper')).toHaveClass('white');
  await act(page,'export');await expect(page.locator('#exportSize')).toContainText('1080 × 1350 px');await page.keyboard.press('Escape');
  await act(page,'new');await page.locator('#newWidth').fill('513');await page.locator('#newHeight').fill('777');await expect(page.locator('#canvasPreset')).toHaveValue('custom');await expect(page.locator('#newSizeInfo')).toHaveText('513 × 777 px · 171:259');await act(page,'createDocument');await expect(page.locator('#dimensions')).toHaveText('513 × 777 px');
});
test('컷 복제 픽셀과 독립 레이어·히스토리, 이전 컷 레이어 복사',async({page})=>{
  await dot(page);await act(page,'addLayer');await dot(page,200,200);
  const source=await page.evaluate(()=>(window as any).__paint.app.composite().toDataURL());await act(page,'duplicateCut');
  expect(await page.evaluate(()=>(window as any).__paint.app.composite().toDataURL())).toBe(source);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);
  await page.keyboard.press('e');await dot(page,200,200);expect((await pixel(page,200,200))[3]).toBe(0);await page.keyboard.press('Control+z');expect((await pixel(page,200,200))[3]).toBe(255);
  await select(page,0);expect((await pixel(page,200,200))[3]).toBe(255);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(3);
  await act(page,'addCut');await act(page,'previousLayers');await expect(page.locator('#layerCount')).toHaveText('3');expect((await pixel(page,200,200))[3]).toBe(255);await page.keyboard.press('Control+z');await expect(page.locator('#layerCount')).toHaveText('1');await page.keyboard.press('Control+y');await expect(page.locator('#layerCount')).toHaveText('3');
});
test('컷 순서·이름·삭제, 선택 레이어와 화면 위치 보존',async({page})=>{
  await act(page,'addLayer');const active=await page.evaluate(()=>(window as any).__paint.app.active);await page.evaluate(()=>(window as any).__paint.setZoom(2,0,0));
  await act(page,'addCut');await act(page,'addCut');const first=await page.evaluate(()=>(window as any).__paint.story.cuts[0].id);
  page.once('dialog',d=>void d.accept('마지막 컷'));await act(page,'renameCut');await expect(page.locator('#currentCutLabel')).toHaveText('마지막 컷');
  await act(page,'cutLeft');expect(await page.evaluate(()=>(window as any).__paint.story.cuts[1].name)).toBe('마지막 컷');await act(page,'cutRight');
  await select(page,0);expect(await page.evaluate(()=>(window as any).__paint.app.active)).toBe(active);expect(await page.evaluate(()=>(window as any).__paint.zoom)).toBe(2);
  page.once('dialog',d=>void d.accept());await act(page,'deleteCut');await expect(page.locator('#cutCount')).toHaveText('2');expect(await page.evaluate((first)=>(window as any).__paint.story.cuts.some((c:any)=>c.id===first),first)).toBe(false);
});
test('비활성 컷 Canvas 해제와 재로딩 후 삭제 레이어·획 Undo/Redo',async({page})=>{
  await dot(page);await act(page,'addLayer');await dot(page,200,200);await act(page,'deleteLayer');
  for(let i=0;i<3;i++){await act(page,'addCut');await dot(page,100+i*10,100);}
  const memory=await page.evaluate(()=>{const s=(window as any).__paint.story;return {...s.stats,firstCold:!!s.cuts[0].cold,firstWidths:s.cuts[0].paint.referencedLayers().map((l:any)=>l.canvas.width)};});
  expect(memory.hotCuts).toBeLessThanOrEqual(3);expect(memory.firstCold).toBe(true);expect(memory.firstWidths.every((w:number)=>w===0)).toBe(true);expect(memory.canvasBytes).toBeLessThan(4*1600*1200*4);expect(memory.compressedBytes).toBeGreaterThan(0);
  console.log('Storyboard memory (Canvas backing stores; excludes browser overhead):',memory);
  await select(page,0);expect((await pixel(page))[3]).toBe(255);await page.keyboard.press('Control+z');await expect(page.locator('#layerCount')).toHaveText('2');expect((await pixel(page,200,200))[3]).toBe(255);
  await page.keyboard.press('Control+z');expect((await pixel(page,200,200))[3]).toBe(0);await page.keyboard.press('Control+y');expect((await pixel(page,200,200))[3]).toBe(255);await page.keyboard.press('Control+y');await expect(page.locator('#layerCount')).toHaveText('1');
  await expect(page.locator('.cut-card img').first()).toHaveJSProperty('naturalWidth',96);await page.screenshot({path:'test-results/storyboard.png'});
});
test('version 2 저장·열기·자동 복구와 손상 파일 원자적 거부',async({page})=>{
  await dot(page);await act(page,'addCut');await dot(page,200,200);await act(page,'addLayer');await dot(page,300,300);
  const p=await page.evaluate(async()=>(window as any).__paint.story.serialize('다중 컷'));expect(p.version).toBe(2);expect(p.cuts.length).toBe(2);
  page.on('dialog',d=>void d.accept());await page.locator('#fileInput').setInputFiles({name:'multi.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await ready(page);await expect(page.locator('#docName')).toHaveText('다중 컷');expect((await pixel(page,300,300))[3]).toBe(255);
  await select(page,0);expect((await pixel(page))[3]).toBe(255);await expect(page.locator('#layerCount')).toHaveText('1');
  const bad=structuredClone(p);bad.cuts[1].layers[0].image='data:image/png;base64,broken';await page.locator('#fileInput').setInputFiles({name:'broken.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await ready(page);await expect(page.locator('#toast')).toContainText('이미지');expect((await pixel(page))[3]).toBe(255);await expect(page.locator('#cutCount')).toHaveText('2');
  await dot(page,150,150);await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:15000});await page.reload();await expect(page.locator('#recoveryDialog')).toBeVisible();await act(page,'restoreRecovery');await expect(page.locator('#cutCount')).toHaveText('2');expect((await pixel(page,150,150))[3]).toBe(255);await select(page,1);await expect(page.locator('#layerCount')).toHaveText('2');expect((await pixel(page,300,300))[3]).toBe(255);
});
test('컷 압축 실패 시 픽셀 보존, 저장 중 컷 편집 스냅샷, IME 단축키 보호',async({page})=>{
  await dot(page);const result=await page.evaluate(async()=>{const s=(window as any).__paint.story,original=HTMLCanvasElement.prototype.toBlob;let failed=false;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};try{await s.freeze(s.current);}catch{failed=true;}finally{HTMLCanvasElement.prototype.toBlob=original;}return {failed,cold:s.current.cold,width:s.paint.selected.canvas.width};});expect(result).toEqual({failed:true,cold:null,width:1600});expect((await pixel(page))[3]).toBe(255);
  const revision=await page.evaluate(()=>(window as any).__paint.revision);await page.locator('#stage').dispatchEvent('keydown',{key:'e',isComposing:true,bubbles:true});await expect(page.locator('#pen')).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>(window as any).__paint.revision)).toBe(revision);
  const snapshot=await page.evaluate(async()=>{const s=(window as any).__paint.story;const promise=s.serialize('스냅샷');s.current.name='변경됨';s.paint.begin(400,400,8,'#000000',1,false);s.paint.end();return await promise;});expect(snapshot.cuts[0].name).toBe('컷 1');
  const alpha=await page.evaluate(async(p)=>{const a=(window as any).__paint.app,d=await a.decode({...p,version:1,layers:p.cuts[0].layers});return d.layers[0].canvas.getContext('2d').getImageData(400,400,1,1).data[3];},snapshot);expect(alpha).toBe(0);
});

test('종료·취소된 스트로크 임시 버퍼 해제',async({page})=>{
  const result=await page.evaluate(()=>{const a=(window as any).__paint.app;a.begin(100,100,8,'#000',1,false);const done=a.stroke;a.end();a.begin(120,120,8,'#000',1,false);const cancelled=a.stroke;a.cancel();return {buffers:[done.original,done.mask,cancelled.original,cancelled.mask].map(c=>c.width*c.height),undo:a.history.past.length,bytes:a.history.bytes};});expect(result.buffers).toEqual([0,0,0,0]);expect(result.undo).toBe(1);expect(result.bytes).toBeLessThan(1600*1200*4);
});
test('5개 레이어 컷의 캐시 예산·픽셀 유지',async({page})=>{
  await page.evaluate(()=>{const a=(window as any).__paint.app;for(let i=0;i<4;i++)a.add();});await dot(page,200,200);
  await act(page,'addCut');await act(page,'addCut');await select(page,0);
  const memory=await page.evaluate(()=>{const s=(window as any).__paint.story;return {...s.stats,width:s.width,height:s.height,activeLayers:s.paint.layers.length,others:s.cuts.slice(1).map((c:any)=>({cold:!!c.cold,widths:c.paint.referencedLayers().map((l:any)=>l.canvas.width)}))};});
  expect(memory.activeLayers).toBe(5);expect(memory.hotCuts).toBeLessThanOrEqual(3);expect(memory.canvasBytes).toBeLessThanOrEqual(32_000_000*4);expect(memory.others.every((c:any)=>c.widths.every((w:number)=>c.cold?w===0:w===1600))).toBe(true);expect((await pixel(page,200,200))[3]).toBe(255);
  console.log('Reduced-load active cut memory (excludes decoding/transient/browser memory):',memory);
});
test('극단적인 사용자 지정 비율에서도 썸네일 크기 제한',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [w,h] of [[1,4096],[4096,1]]){
    await act(page,'new');await page.locator('#newWidth').fill(String(w));await page.locator('#newHeight').fill(String(h));await act(page,'createDocument');await act(page,'addCut');
    const size=await page.evaluate(()=>{const img=document.querySelector('.cut-card[aria-pressed=true] img') as HTMLImageElement;return {w:img.naturalWidth,h:img.naturalHeight};});expect(size.w).toBeGreaterThan(0);expect(size.w).toBeLessThanOrEqual(96);expect(size.h).toBeGreaterThan(0);expect(size.h).toBeLessThanOrEqual(72);
    // Adding a cut is an unsaved project edit; accept replacement for the next aspect ratio.
    page.once('dialog',d=>void d.accept());
  }
  expect(errors).toEqual([]);
});
