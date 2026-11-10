import { Paint } from './engine';
import { BASIC_BRUSHES, type BasicBrushKind } from './basic-brushes';
import type { BrushSettings } from './tool-settings';

const names:Record<BasicBrushKind,string>={'rough-ink':'거친 잉크펜','felt-tip':'싸인펜',ballpoint:'볼펜'};
// An isolated Paint per card exercises the production renderer without a project reference.
export function brushTestPanel(getSettings:()=>{tools:BrushSettings;color:string}){
  const dialog=document.createElement('dialog');dialog.id='brushTestDialog';
  dialog.innerHTML='<h2>브러시 테스트</h2><p>작은 원 · 짧은 직선 · 긴 곡선 · 지그재그. 각 시험 영역에 직접 그릴 수 있습니다.</p><div class="brush-test-actions"><button id="brushSamples">샘플 그리기</button><button id="clearBrushTests">지우기</button><button id="closeBrushTests">닫기</button></div><div id="brushTestCards"></div>';
  document.body.append(dialog);
  let frame=0;
  type Card={paint:Paint;kind:BasicBrushKind;pointer:number|null;surface:HTMLCanvasElement};
  let cards:Card[]=[];let snapshot=getSettings();
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const card of cards)card.paint.flush();});};
  function finish(card:Card,cancelled:boolean){const id=card.pointer;card.pointer=null;if(cancelled)card.paint.cancel();else card.paint.end();if(id!==null&&card.surface.hasPointerCapture(id))card.surface.releasePointerCapture(id);}
  function cleanup(){if(frame)cancelAnimationFrame(frame);frame=0;for(const card of cards){finish(card,true);card.paint.release();}cards=[];dialog.querySelector('#brushTestCards')!.replaceChildren();}
  function begin(card:Card,x:number,y:number){const v=snapshot.tools[card.kind];return card.paint.begin(x,y,v.size,snapshot.color,v.opacity,false,card.kind,v.texture);}
  function samples(){
    for(const card of cards){finish(card,true);const p=card.paint;p.clearLayer();
      begin(card,46,30);for(let i=1;i<=16;i++)p.point(38+Math.cos(i*Math.PI/8)*8,30+Math.sin(i*Math.PI/8)*8);p.end();
      begin(card,100,30);p.point(168,30);p.end();
      begin(card,24,106);for(let i=1;i<=32;i++)p.point(24+i*9,106+Math.sin(i/32*Math.PI*3)*25);p.end();
      begin(card,355,85);for(let i=1;i<=8;i++)p.point(355+i*18,85+(i%2?42:0));p.end();
    }
  }
  function open(){
    if(dialog.open)return;cleanup();snapshot=structuredClone(getSettings());
    for(const kind of BASIC_BRUSHES){
      const paint=new Paint(),initial=paint.selected.canvas;paint.reset(540,160);initial.width=initial.height=0;paint.render=schedule;paint.changed=()=>paint.history.clear();
      const surface=paint.selected.canvas,card:Card={paint,kind,pointer:null,surface};surface.className='brush-test-canvas';surface.setAttribute('aria-label',`${names[kind]} 시험 영역`);
      const article=document.createElement('article'),title=document.createElement('h3');title.textContent=`${names[kind]} · ${snapshot.tools[kind].size}px · ${Math.round(snapshot.tools[kind].opacity*100)}%`;article.append(title,surface);dialog.querySelector('#brushTestCards')!.append(article);cards.push(card);
      const point=(e:{clientX:number;clientY:number})=>{const r=surface.getBoundingClientRect();return {x:(e.clientX-r.x)*surface.width/r.width,y:(e.clientY-r.y)*surface.height/r.height};};
      surface.onpointerdown=e=>{if(e.button!==0||card.pointer!==null)return;e.preventDefault();const p=point(e);if(begin(card,p.x,p.y)){card.pointer=e.pointerId;surface.setPointerCapture(e.pointerId);}};
      surface.onpointermove=e=>{if(e.pointerId!==card.pointer)return;const events=e.getCoalescedEvents?.()??[];for(const event of events.length?events:[e]){const p=point(event);paint.point(p.x,p.y);}};
      surface.onpointerup=e=>{if(e.pointerId!==card.pointer)return;const p=point(e);paint.point(p.x,p.y);finish(card,false);};
      surface.onpointercancel=e=>{if(e.pointerId===card.pointer)finish(card,true);};surface.onlostpointercapture=e=>{if(e.pointerId===card.pointer)finish(card,true);};
    }
    dialog.showModal();samples();
  }
  dialog.querySelector<HTMLButtonElement>('#brushSamples')!.onclick=samples;
  dialog.querySelector<HTMLButtonElement>('#clearBrushTests')!.onclick=()=>{for(const c of cards){finish(c,true);c.paint.clearLayer();}};
  dialog.querySelector<HTMLButtonElement>('#closeBrushTests')!.onclick=()=>dialog.close();
  dialog.addEventListener('close',cleanup);
  window.addEventListener('blur',()=>{for(const c of cards)if(c.pointer!==null)finish(c,true);});
  return {open};
}
