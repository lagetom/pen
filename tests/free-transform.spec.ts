import { test, expect, type Page } from '@playwright/test';
import { initializeCanvas, readPsd } from 'ag-psd';
initializeCanvas(()=>{throw new Error('PSD parsing must use ImageData');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)} as ImageData));
async function ready(p:Page){await p.waitForFunction(()=>!!(window as any).__paint && !(window as any).__paint.busy);}
async function pixels(p:Page){return p.evaluate(()=>(window as any).__paint.app.layers.map((l:any)=>l.canvas.toDataURL()));}
async function state(p:Page){return p.evaluate(()=>(window as any).__paint.freeTransform);}
async function start(p:Page){await p.locator('#stage').focus();await p.keyboard.press('Control+t');await expect(p.locator('#transformControls')).toBeVisible();}
async function seed(p:Page){await p.evaluate(()=>{const a=(window as any).__paint.app,g=a.selected.canvas.getContext('2d');g.fillStyle='#ff0000';g.fillRect(16,16,32,16);g.clearRect(20,20,4,4);g.fillStyle='rgba(0,0,255,.5)';g.fillRect(24,20,4,4);a.changed();a.render();a.history.clear();});}
async function canvasPoint(p:Page,x:number,y:number){return p.evaluate(({x,y})=>{const p=(window as any).__paint,r=document.getElementById('paper')!.getBoundingClientRect();return {x:r.x+(p.mirrored?p.app.width-x:x)*p.zoom,y:r.y+y*p.zoom};},{x,y});}
async function pixel(p:Page,x:number,y:number){return p.evaluate(({x,y})=>Array.from((window as any).__paint.app.selected.canvas.getContext('2d').getImageData(x,y,1,1).data),{x,y});}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);await page.locator('#new').click();await page.locator('#newWidth').fill('128');await page.locator('#newHeight').fill('96');await page.locator('#createDocument').click();await seed(page);});

test('레이어 자유 변형 크기·비율·%·각도, 실시간 픽셀과 한 단계 Undo/Redo',async({page})=>{
  const before=await pixels(page);await start(page);expect(await state(page)).toEqual({cx:32,cy:24,width:32,height:16,angle:0});
  await page.locator('#transformWidth').fill('64');await expect(page.locator('#transformHeight')).toHaveValue('32');
  await expect.poll(()=>pixel(page,2,20)).not.toEqual([0,0,0,0]);
  await page.locator('#transformUnit').selectOption('percent');await expect(page.locator('#transformWidth')).toHaveValue('200');
  await page.locator('#transformLock').uncheck();await page.locator('#transformHeight').fill('150');expect((await state(page)).height).toBe(24);
  await page.locator('#transformAngle').fill('90');await page.keyboard.press('Enter');await expect(page.locator('#transformControls')).toBeHidden();
  const after=await pixels(page);expect(after).not.toEqual(before);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(1);
  await page.keyboard.press('Control+z');expect(await pixels(page)).toEqual(before);await page.keyboard.press('Control+y');expect(await pixels(page)).toEqual(after);
});

test('선택 영역 변형은 외부 픽셀 보존, 반복 미리보기 원본 재사용·Escape 완전 복원',async({page})=>{
  await page.evaluate(()=>{const p=(window as any).__paint,g=p.app.selected.canvas.getContext('2d');g.fillStyle='#00ff00';g.fillRect(90,70,8,8);p.app.changed();});
  const before=await pixels(page);await page.locator('#stage').focus();await page.keyboard.press('s');const a=await canvasPoint(page,16,16),b=await canvasPoint(page,48,32);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();
  await start(page);for(const w of [16,96,8,32]){await page.locator('#transformWidth').fill(String(w));await page.evaluate(()=>new Promise(requestAnimationFrame));}
  expect(await pixels(page)).toEqual(before);await page.locator('#transformAngle').fill('27');await expect.poll(()=>pixels(page)).not.toEqual(before);expect(await pixel(page,92,72)).toEqual([0,255,0,255]);
  await page.keyboard.press('Escape');expect(await pixels(page)).toEqual(before);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);expect(await page.evaluate(()=>(window as any).__paint.selection)).toEqual({x:16,y:16,width:32,height:16});
  await start(page);await page.locator('#transformAngle').fill('90');await page.locator('#applyTransform').click();expect(await pixel(page,92,72)).toEqual([0,255,0,255]);
});

test('확대·좌우 반전 핸들 크기 조절, 회전 드래그·이동·포인터 취소',async({page})=>{
  await page.locator('#mirrorView').click();await page.evaluate(()=>(window as any).__paint.setZoom(2));await start(page);
  const handle=page.locator('[data-transform-handle=se]'),h=(await handle.boundingBox())!,to=await canvasPoint(page,80,48);
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y);await page.mouse.up();
  const s=await state(page);expect(s.width).toBeCloseTo(64,0);expect(s.height).toBeCloseTo(32,0);expect(s.cx-s.width/2).toBeCloseTo(16,0);
  const r=(await page.locator('[data-transform-handle=rotate]').boundingBox())!,turn=await canvasPoint(page,s.cx+40,s.cy);
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(turn.x,turn.y);await page.mouse.up();expect((await state(page)).angle).toBeCloseTo(90,0);
  await page.screenshot({path:'test-results/free-transform.png'});
  const c=await canvasPoint(page,s.cx,s.cy),move=await canvasPoint(page,s.cx+5,s.cy+7);await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(move.x,move.y);await page.locator('#stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();expect((await state(page)).cx).toBeCloseTo(s.cx,0);
  await page.keyboard.press('Escape');await expect(page.locator('#transformOverlay')).toBeHidden();
});

test('입력 보호·무효 수치·변형 중 컷/레이어/저장 잠금·blur 복원',async({page})=>{
  const before=await pixels(page);await page.locator('#sizeNumber').focus();const prevented=await page.locator('#sizeNumber').evaluate(el=>!el.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true,cancelable:true})));expect(prevented).toBe(false);expect(await state(page)).toBeNull();
  await start(page);await page.locator('#transformWidth').fill('');await page.keyboard.press('Enter');expect(await state(page)).not.toBeNull();await page.locator('#transformWidth').fill('40000');await page.locator('#applyTransform').click();expect((await state(page)).width).toBe(32);
  await page.locator('#transformAngle').fill('');await page.locator('#transformAngle').pressSequentially('12.5');expect((await state(page)).angle).toBe(12.5);
  await expect(page.locator('#addCut')).toBeDisabled();await expect(page.locator('#undo')).toBeDisabled();expect(await page.locator('#sidebar').evaluate(el=>el.inert)).toBe(true);
  await page.locator('#transformWidth').fill('64');await page.evaluate(async()=>{await (window as any).__paint.autosave();});await expect(page.locator('#autoStatus')).not.toHaveText('자동 저장 중…');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect(await state(page)).toBeNull();expect(await pixels(page)).toEqual(before);expect(await page.locator('#sidebar').evaluate(el=>el.inert)).toBe(false);
});

test('가져온 원본 해상도·자동 축소 후 100% 재확대는 원본 픽셀, 취소·Undo·메타데이터',async({page})=>{
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d')!;for(let x=0;x<256;x++){g.fillStyle=x%2?'#0000ff':'#ff0000';g.fillRect(x,0,1,128);}return c.toDataURL().split(',')[1];});
  await page.locator('#imageInput').setInputFiles({name:'원본.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#transformControls')).toBeVisible();await expect(page.locator('#transformSource')).toContainText('원본 256 × 128 px');
  const fitted=await pixels(page);expect((await state(page)).width).toBe(128);
  await page.locator('#transformUnit').selectOption('percent');await page.locator('#transformWidth').fill('100');
  await expect.poll(()=>pixel(page,0,30)).toEqual([255,0,0,255]);expect(await pixel(page,1,30)).toEqual([0,0,255,255]);
  await page.locator('#cancelTransform').click();expect(await pixels(page)).toEqual(fitted);
  // Re-import retains a fresh high resolution source until this import's transform is committed.
  await page.locator('#imageInput').setInputFiles({name:'원본.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#transformControls')).toBeVisible();const initial=await pixels(page);
  await page.locator('#transformUnit').selectOption('percent');await page.locator('#transformWidth').fill('100');await page.locator('#applyTransform').click();const final=await pixels(page);
  await page.keyboard.press('Control+z');expect(await pixels(page)).toEqual(initial);await page.keyboard.press('Control+y');expect(await pixels(page)).toEqual(final);
  const p=await page.evaluate(async()=>(window as any).__paint.story.serialize('원본 정보'));expect(p.cuts[0].layers[2].imageSource).toEqual({width:256,height:128,name:'원본.png'});
  await page.locator('#duplicateLayer').click();expect(await page.evaluate(()=>(window as any).__paint.app.selected.imageSource)).toEqual({width:256,height:128,name:'원본.png'});
});

test('변형 확정 프로젝트/자동 복구/PSD 픽셀, 다른 레이어·컷 격리',async({page})=>{
  const original=await pixels(page);await page.locator('#duplicateCut').click();await ready(page);await page.locator('#addLayer').click();await seed(page);await start(page);await page.locator('#transformWidth').fill('48');await page.locator('#transformAngle').fill('90');await page.locator('#applyTransform').click();const after=await pixels(page);expect(after[0]).toEqual(original[0]);
  const psd=await page.evaluate(async()=>{const {exportPsd}=await import('/src/psd-export.ts');const a=(window as any).__paint.app;const b=await exportPsd(a,96,new AbortController().signal,()=>{});return Array.from(new Uint8Array(await b.arrayBuffer()));});
  const parsed=readPsd(new Uint8Array(psd),{useImageData:true,skipThumbnail:true});expect(parsed.children?.length).toBe(2);
  const rawLayers=await page.evaluate(()=>(window as any).__paint.app.layers.map((l:any)=>Array.from(l.canvas.getContext('2d').getImageData(0,0,128,96).data)));
  parsed.children!.forEach((l,i)=>expect(Array.from(l.imageData!.data)).toEqual(rawLayers[i]));
  const merged=await page.evaluate(()=>Array.from((window as any).__paint.app.composite().getContext('2d').getImageData(0,0,128,96).data));
  const recomposed=await page.evaluate(layers=>{const out=document.createElement('canvas');out.width=128;out.height=96;const g=out.getContext('2d')!;for(const data of layers){const c=document.createElement('canvas');c.width=128;c.height=96;c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data),128,96),0,0);g.drawImage(c,0,0);}return Array.from(g.getImageData(0,0,128,96).data);},parsed.children!.map(l=>Array.from(l.imageData!.data)));
  expect(recomposed).toEqual(merged);
  // PSD's 8-bit white-matted composite loses sub-byte color precision at fractional alpha.
  // Layer pixels and their Canvas composite above must remain exact; the cached preview's
  // Writer truncation (<1) + reader rounding (<=0.5) bound premultiplied error to 1.5.
  const preview=parsed.imageData!.data;
  let alphaExact=true,maxPreviewError=0;
  for(let i=0;i<merged.length;i+=4){alphaExact&&=preview[i+3]===merged[i+3];for(let c=0;c<3;c++)maxPreviewError=Math.max(maxPreviewError,Math.abs(Number(preview[i+c])-merged[i+c])*merged[i+3]/255);}
  expect(alphaExact).toBe(true);expect(maxPreviewError).toBeLessThanOrEqual(1.5+1e-9);
  const project=await page.evaluate(async()=>(window as any).__paint.story.serialize('변형 저장'));await expect(page.locator('#autoStatus')).toHaveText('자동 저장 완료',{timeout:15000});page.on('dialog',d=>void d.accept());await page.reload();await expect(page.locator('#recoveryDialog')).toBeVisible();await page.locator('#restoreRecovery').click();await expect(page.locator('#toast')).toContainText('작업을 복구했습니다');await ready(page);expect(await pixels(page)).toEqual(after);expect(await state(page)).toBeNull();
  await page.locator('#fileInput').setInputFiles({name:'transform.mpaint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.locator('#docName')).toHaveText('변형 저장');expect(await pixels(page)).toEqual(after);await page.locator('.cut-card').first().click();await ready(page);expect(await pixels(page)).toEqual(original);
});

test('원본 메타데이터 v1/v2·비활성 컷 보존, 잘못된 정보 거부와 구형 호환',async({page})=>{
  const result=await page.evaluate(async()=>{const {Paint}=await import('/src/engine.ts'),{Storyboard}=await import('/src/storyboard.ts');const p=new Paint();p.reset(8,8);p.selected.imageSource={width:512,height:256,name:'원본'};const s=new Storyboard(p);await s.freeze(s.current);const saved=await s.serialize('cold');const d=await Storyboard.decode(saved);const meta=d.story.paint.selected.imageSource;const v1=await d.story.paint.serialize('v1');const decoded=await p.decode(v1);const old=await p.decode({...v1,layers:v1.layers.map(l=>({...l,imageSource:undefined}))});let rejected=0;for(const info of [{width:0,height:1,name:''},{width:1,height:99999,name:''},{width:1,height:1,name:5}]){try{await p.decode({...v1,layers:v1.layers.map(l=>({...l,imageSource:info}))});}catch{rejected++;}}s.dispose();d.story.dispose();return {meta,v1:decoded.layers[0].imageSource,old:old.layers[0].imageSource??null,rejected};});expect(result).toEqual({meta:{width:512,height:256,name:'원본'},v1:{width:512,height:256,name:'원본'},old:null,rejected:3});
});

test('회전 후 네 모서리 고정점·자유 비율·무변경 확정·빈 레이어/메모리 오류',async({page})=>{
  const original=await pixels(page);await start(page);await page.keyboard.press('Enter');expect(await pixels(page)).toEqual(original);expect(await page.evaluate(()=>(window as any).__paint.app.history.past.length)).toBe(0);
  const checked=await page.evaluate(async()=>{const {Paint}=await import('/src/engine.ts'),{FreeTransform}=await import('/src/free-transform.ts');const p=new Paint();p.reset(64,64);p.selected.canvas.getContext('2d')!.fillRect(16,16,16,8);const initial=p.selected.canvas.toDataURL(),results=[];
    for(const [handle,sx,sy] of [['nw',-1,-1],['ne',1,-1],['sw',-1,1],['se',1,1]] as const){const f=new FreeTransform(p);f.set({angle:30});const anchor=f.point(-sx*8,-sy*4),from=f.point(sx*8,sy*4),rad=Math.PI/6;f.begin(handle,from.x,from.y);f.update(anchor.x+Math.cos(rad)*sx*32-Math.sin(rad)*sy*24,anchor.y+Math.sin(rad)*sx*32+Math.cos(rad)*sy*24,false);const fixed=f.point(-sx*f.state.width/2,-sy*f.state.height/2);results.push({width:f.state.width,height:f.state.height,anchorError:Math.hypot(fixed.x-anchor.x,fixed.y-anchor.y)});f.flush();f.cancel();}
    let empty=false,limit=false;p.clearLayer();try{new FreeTransform(p);}catch{empty=true;}try{new FreeTransform({stroke:null,width:5000,height:5000} as any);}catch{limit=true;}p.history.undo();return {results,empty,limit,restored:p.selected.canvas.toDataURL()===initial};});
  expect(checked.empty&&checked.limit&&checked.restored).toBe(true);for(const r of checked.results){expect(r.width).toBeCloseTo(32);expect(r.height).toBeCloseTo(24);expect(r.anchorError).toBeLessThan(.00001);}
  await start(page);const before=await state(page);await page.keyboard.press('m');await page.keyboard.press('Control+-');expect(await state(page)).toEqual(before);await page.keyboard.press('Escape');
});
