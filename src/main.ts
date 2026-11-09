import './style.css';
import { paperTransform, canvasPoint } from './view-transform';
import { flipLayer, duplicateLayer, LayerMove } from './layer-edits';
import { sampleColor } from './eyedropper';
import { withResolution } from './png-resolution';
import { bindNumbers, syncNumbers } from './numeric';
import { mmToPx, pxToMm, readDpi } from './resolution';
import { importPresets, loadPresets, savePresets, presetId, type UserPreset } from './user-presets';
import { readGuide, renderGuide } from './guides';
import { Storyboard, thumbnailCanvas } from './storyboard';
import { PRESETS, ratio, readPreset, rememberPreset } from './presets';
import { Paint, canvas, ctx, loadImage, blob, dimensions, HISTORY_LIMIT } from './engine';
const icons: Record<string, string> = {
 mirror:'<path d="M12 2v20M9 6 3 18h6Zm6 0 6 12h-6Z"/>',
 'move-layer':'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
 eyedropper:'<path d="m14 4 6 6M3 18l9-9 4 4-9 9H3Zm11-9 5-5a2 2 0 0 1 3 3l-5 5"/>',
 pencil: '<path d="m4 16 12-12 4 4L8 20l-6 2Zm10-10 4 4M4 16l4 4M3 19l2 2"/>',
 pen: '<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-5-5L3 14l-1 7Z"/>',
 eraser: '<path d="m15 3 6 6a2 2 0 0 1 0 3L11 22H6l-5-5a2 2 0 0 1 0-3L12 3a2 2 0 0 1 3 0ZM7 9l8 8M10 22h12"/>',
 hand: '<path d="M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 5-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2"/>',
 undo: '<path d="m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7"/>', redo: '<path d="m15 5 6 6-6 6m6-6H10a7 7 0 0 0-7 7"/>',
 plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
 file: '<path d="M14 2H5v20h14V7Zm0 0v6h5M8 14h8m-8 4h5"/>', folder: '<path d="M2 7V4h7l3 3h10l-3 13H2Zm0 4h18"/>',
 save: '<path d="M4 2h13l5 5v15H2V2Zm3 0v7h10V2M7 22v-8h10v8"/>', export: '<path d="M12 3v12m-5-7 5-5 5 5M4 15v6h16v-6"/>',
 layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>', eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
 hidden: '<path d="m3 3 18 18M9 5c7-2 13 7 13 7a21 21 0 0 1-4 4M6 6a22 22 0 0 0-5 6s4 7 11 7a13 13 0 0 0 4-1"/>',
 trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8m4-8v8"/>', up: '<path d="m5 15 7-7 7 7"/>', down: '<path d="m5 9 7 7 7-7"/>',
 fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 8h8v8H8Z"/>', check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', image: '<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m2 18 6-5 4 4 4-7 6 8"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const button = (id: string, name: string, symbol: string, extra = '') => `<button id="${id}" title="${name}" ${extra}>${icon(symbol)}<span>${name}</span></button>`;
document.querySelector('#app')!.innerHTML = `
<header class="topbar"><a class="brand" href="./" aria-label="Mini Paint 홈"><span class="brandmark">${icon('pen')}</span>mini<span class="brand-paint">paint</span><small>1.0</small></a><div class="document"><span id="docName">제목 없음</span><span id="dirty" class="dirty-dot" title="저장하지 않은 변경 사항" hidden></span><span class="doc-type">.mpaint</span></div><div class="top-actions"><span class="local-badge"><i></i>내 기기에만 저장</span>${button('help','사용법','info')}</div></header>
<nav class="filebar" aria-label="파일 도구"><div class="file-actions">${button('new','새 캔버스','file')}${button('open','열기','folder')}${button('save','저장','save')}<span class="divider"></span>${button('import','이미지 가져오기','image')}</div>${button('settings','환경 설정','save')}${button('export','내보내기','export','class="export-button"')}</nav>
<div class="workspace"><aside class="toolrail" aria-label="그리기 도구">${button('pen','펜 (B)','pen','class="tool active" aria-pressed="true"')}${button('pencil','기본 연필','pencil','class="tool" aria-pressed="false"')}${button('dark-pencil','진한 연필','pencil','class="tool dark-pencil" aria-pressed="false"')}${button('eraser','지우개 (E)','eraser','class="tool" aria-pressed="false"')}${button('move-layer','레이어 이동 (V)','move-layer','class="tool" aria-pressed="false"')}${button('eyedropper','스포이트 (I)','eyedropper','class="tool" aria-pressed="false"')}${button('hand','화면 이동 (H)','hand','class="tool" aria-pressed="false"')}<div class="rail-line"></div><label class="rail-color" title="색상 선택"><input id="color" type="color" value="#283747" aria-label="브러시 색상"></label><button id="resetColor" class="color-reset" title="기본 색상으로 변경"><i></i><i></i></button><div class="rail-bottom">${button('diagnostics','성능 진단','info')}</div></aside>
<main class="drawing-area"><div class="optionsbar"><strong id="toolLabel">${icon('pen')}펜</strong><select id="brushTool" aria-label="브러시 선택"><option value="pen">기본 펜</option><option value="pencil">기본 연필</option><option value="dark-pencil">진한 연필</option><option value="eraser">지우개</option><option value="hand">화면 이동</option><option value="move-layer">레이어 이동</option><option value="eyedropper">스포이트</option></select><span class="divider"></span><label>크기 <input id="size" type="range" min="1" max="100" value="8"><input id="sizeNumber" data-range="size" class="numeric" type="number" min="1" max="100" step="1" value="8" aria-label="브러시 크기 숫자"><span class="numeric-unit">px</span><output id="sizeValue" hidden>8 px</output></label><span class="divider"></span><label>불투명도 <input id="brushOpacity" type="range" min="0" max="100" value="100"><input id="brushOpacityNumber" data-range="brushOpacity" class="numeric" type="number" min="0" max="100" value="100" aria-label="브러시 불투명도 숫자"><span class="numeric-unit">%</span><output id="brushOpacityValue" hidden>100%</output></label><div class="history-actions">${button('mirrorView','보기 좌우 반전 (M)','mirror','aria-pressed="false"')}${button('undo','실행 취소 (Ctrl+Z)','undo')}${button('redo','다시 실행 (Ctrl+Y)','redo')}</div></div>
<div id="stage" tabindex="0" aria-label="그리기 작업 공간"><div class="canvas-label">CANVAS <span id="canvasLabel">1600 × 1200</span></div><div id="paper" class="white"><canvas id="view" width="1600" height="1200" aria-label="그림 캔버스"></canvas><div id="guideOverlay" aria-hidden="true" hidden></div></div><div id="brushCursor"></div><div class="stage-hint"><kbd>Space</kbd> + 드래그로 이동 <span>·</span> <kbd>Ctrl</kbd> + 휠로 확대</div><div class="zoom-controls">${button('zoomOut','축소','minus')}<button id="zoomValue" title="100%로 보기">100%</button>${button('zoomIn','확대','plus')}<span></span>${button('fit','화면 맞춤 (Ctrl+0)','fit')}</div></div>
<section class="cut-panel" aria-label="컷 관리"><div class="cut-heading"><strong>컷 <span id="cutCount">1</span></strong><span id="currentCutLabel">컷 1</span><div class="cut-actions">${button('addCut','새 컷','plus')}${button('duplicateCut','컷 복제','layers')}${button('previousLayers','이전 컷 레이어 복제','layers')}${button('cutLeft','컷 앞으로','up')}${button('cutRight','컷 뒤로','down')}${button('renameCut','컷 이름 변경','pen')}${button('deleteCut','컷 삭제','trash')}</div></div><div id="cutList" aria-label="컷 목록"></div></section>
<footer class="statusbar"><span><i class="status-led"></i><span id="statusText">준비</span></span><span id="coordinates">—, — px</span><span id="dimensions">1600 × 1200 px</span><span id="autoStatus">자동 저장 대기</span></footer></main>
<aside class="sidebar"><section class="brush-panel"><div class="section-heading"><h2>브러시 설정</h2><span>필압 OFF</span></div><div class="brush-preview"><span id="brushDot"></span><div><strong id="brushName">펜</strong></div><span id="brushBadge">8 px</span></div><div class="palette-label">컬러 팔레트 <span id="colorHex">#283747</span></div><div id="palette" class="palette"></div></section>
<section class="layers-panel"><div class="section-heading"><h2>${icon('layers')}레이어 <span id="layerCount">1</span></h2>${button('addLayer','레이어 추가','plus')}</div><div class="layer-opacity"><label for="layerOpacity">불투명도</label><input id="layerOpacityNumber" data-range="layerOpacity" class="numeric" type="number" min="0" max="100" aria-label="레이어 불투명도 숫자"><span class="numeric-unit">%</span><output hidden id="layerOpacityValue">100%</output><input id="layerOpacity" type="range" min="0" max="100" value="100"></div><div id="layerList" role="list" aria-label="레이어 목록"></div><div class="layer-edit-actions">${button('duplicateLayer','레이어 복제','layers')}${button('flipLayer','레이어 좌우 반전','mirror')}</div><div class="layer-actions">${button('layerUp','레이어 위로','up')}${button('layerDown','레이어 아래로','down')}<span></span>${button('renameLayer','레이어 이름 변경','pen')}${button('deleteLayer','레이어 삭제','trash')}</div></section>
<section class="background-panel"><h2>작업 화면</h2><label><span class="checker-icon"></span>흰색 배경으로 보기 <input id="whiteBackground" type="checkbox" checked role="switch"></label><p>배경은 그림에 저장되지 않아요.</p><div class="guide-settings"><label>종이 가이드<select id="guideType"><option value="none">없음</option><option value="grid">격자</option><option value="ruled">줄노트</option><option value="dots">점 가이드</option></select></label><label>가이드 표시<input id="guideVisible" type="checkbox" checked role="switch"></label><label for="guideSpacing">간격 <input id="guideSpacingNumber" data-range="guideSpacing" class="numeric" type="number" min="8" max="64" aria-label="가이드 간격 숫자"><span class="numeric-unit">px</span><output hidden id="guideSpacingValue">24 px</output></label><input id="guideSpacing" type="range" min="8" max="64" value="24"><label>가이드 색상<select id="guideColor"><option value="blue">연한 파랑</option><option value="gray">회색</option></select></label><label for="guideOpacity">진하기 <input id="guideOpacityNumber" data-range="guideOpacity" class="numeric" type="number" min="10" max="80" aria-label="가이드 진하기 숫자"><span class="numeric-unit">%</span><output hidden id="guideOpacityValue">30%</output></label><input id="guideOpacity" type="range" min="10" max="80" value="30"><small>가이드는 PNG에 포함되지 않아요.</small></div></section></aside></div>
<div id="toast" role="status" hidden></div><input id="fileInput" type="file" accept=".mpaint,.json,application/json" hidden><input id="imageInput" type="file" accept="image/png" hidden>
<dialog id="newDialog"><form method="dialog"><div class="dialog-icon">${icon('file')}</div><h2>새 캔버스</h2><p>크기를 지정하세요. 저장하지 않은 작업을 바꾸면 확인합니다.</p><label class="preset-label" for="canvasPreset">캔버스 프리셋</label><select id="canvasPreset">${PRESETS.map(p=>`<option value="${p.id}">${p.label}</option>`).join('')}<option value="custom">사용자 지정</option></select><div id="newSizeInfo" class="size-info"></div><div class="measure-options"><label>단위 <select id="canvasUnit"><option value="px">px</option><option value="mm">mm</option></select></label><label>DPI <input id="newDpi" type="number" min="36" max="1200" value="96"></label><label>방향 <select id="canvasOrientation"><option value="portrait">세로</option><option value="landscape">가로</option></select></label></div><div id="newPrintInfo" class="size-info"></div><div class="dimension-fields"><label>가로 <input id="newWidth" type="number" min="1" max="4096" value="1600" required> <span class="dimensionUnit">px</span></label><span>×</span><label>세로 <input id="newHeight" type="number" min="1" max="4096" value="1200" required> <span class="dimensionUnit">px</span></label></div><div class="preset-buttons"><button type="button" data-preset="1600,1200">기본 4:3</button><button type="button" data-preset="1920,1080">와이드 16:9</button><button type="button" data-preset="1200,1200">정사각형</button></div><div class="dialog-actions"><button value="cancel">취소</button><button id="createDocument" value="create" class="primary">캔버스 만들기</button></div></form></dialog>
<dialog id="exportDialog"><form method="dialog"><div class="dialog-icon">${icon('export')}</div><h2>내보내기</h2><p>현재 컷을 PNG 또는 레이어 PSD로 저장합니다.<br><span id="exportSize"></span></p><fieldset class="png-options"><legend>PNG 옵션</legend><label class="export-option"><input type="radio" name="exportBg" value="transparent" checked> 투명 배경 <span class="checker-icon"></span></label><label class="export-option"><input type="radio" name="exportBg" value="white"> 흰색 배경</label><label class="export-option"><input id="pngDpi" type="checkbox" checked>DPI 메타데이터 포함</label></fieldset><div class="dialog-actions"><button value="cancel">취소</button><button id="downloadPsd" type="button">PSD 저장</button><button id="downloadPng" class="primary" value="export">PNG 저장</button></div></form></dialog>
<dialog id="helpDialog"><h2>사용법</h2><p>펜·연필 또는 가져온 이미지를 편집합니다.<br>레이어 이름 변경: 더블클릭</p><dl class="shortcuts"><dt>M / I / V</dt><dd>보기 반전 / 스포이트 / 레이어 이동</dd><dt>B / E / H</dt><dd>펜 / 지우개 / 화면 이동</dd><dt>Space + 드래그</dt><dd>화면 이동</dd><dt>[ / ]</dt><dd>브러시 크기</dd><dt>Ctrl + Z / Y</dt><dd>실행 취소 / 다시 실행</dd><dt>Ctrl + Shift + Z</dt><dd>다시 실행</dd><dt>Ctrl + S / Shift + S</dt><dd>저장 / 다른 이름으로 저장</dd><dt>Ctrl + O / N</dt><dd>열기 / 새 캔버스</dd><dt>Ctrl + + / − / 0</dt><dd>확대 / 축소 / 화면 맞춤</dd><dt>Delete</dt><dd>선택 레이어 내용 지우기</dd></dl><p class="muted">자동 복구는 프로젝트 파일 저장을 대신하지 않습니다.<br>압력 감지·손떨림 보정은 기본적으로 적용하지 않습니다.</p><form method="dialog"><button class="primary">알겠어요</button></form></dialog>
<dialog id="recoveryDialog"><h2>이전 그림이 기다리고 있어요</h2><p>이 기기에 자동 저장한 작업이 있습니다. 이어서 그릴까요?</p><div class="dialog-actions"><button id="discardRecovery">새로 시작</button><button id="restoreRecovery" class="primary">작업 복구</button></div></dialog>
<dialog id="diagnosticDialog"><h2>개발자 진단</h2><p>현재 브라우저의 실제 측정값입니다. 입력 지연은 이벤트 처리부터 다음 렌더 완료까지이며, 화면 표시·기기 자체 지연은 포함하지 않습니다.</p><pre id="metrics"></pre><form method="dialog"><button class="primary">닫기</button></form></dialog>`;
document.querySelector('#app')!.insertAdjacentHTML('beforeend', `<dialog id="settingsDialog"><h2>환경 설정 · 프리셋</h2><p>브라우저에 도구·작업 설정만 저장합니다. 픽셀 데이터는 포함하지 않습니다.</p><label>종류 <select id="presetKind"><option value="brush">브러시</option><option value="work">작업</option></select></label><label>이름 <input id="presetName" type="text" maxlength="100" placeholder="프리셋 이름"></label><select id="userPresetList" size="5" aria-label="사용자 프리셋"></select><div class="preset-commands"><button id="addPreset">추가</button><button id="renamePreset">이름 변경</button><button id="deletePreset">삭제</button><button id="applyPreset" class="primary">적용</button></div><p>작업 프리셋 적용은 새 캔버스를 만듭니다. 현재 작업은 먼저 저장하세요.</p><div class="preset-commands"><button id="exportPresets">JSON 내보내기</button><button id="importPresets">JSON 가져오기</button></div><form method="dialog"><button>닫기</button></form></dialog><input id="presetFileInput" type="file" accept=".json,application/json" hidden><dialog id="psdProgressDialog"><h2>PSD 내보내기</h2><p id="psdProgress" role="status">준비 중</p><progress id="psdProgressBar" max="100" value="0"></progress><button id="cancelPsd">취소</button></dialog>`);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
let app = new Paint(), story = new Storyboard(app);
const view = $<HTMLCanvasElement>('view'), paper = $('paper'), stage = $('stage');
let tool: 'pen' | 'pencil' | 'dark-pencil' | 'eraser' | 'hand' | 'move-layer' | 'eyedropper' = 'pen', size = 8, brushOpacity = 1, color = '#283747';
let thumbnailDirty = true;
let mirrored=false,mover:LayerMove|null=null;
let lastDrawingTool:'pen'|'pencil'|'dark-pencil'|'eraser'='pen';
let zoom = 1, panX = 0, panY = 0, space = false, pointer: number | null = null, panning: { x: number; y: number; panX: number; panY: number } | null = null;
let name = '제목 없음', revision = 0, savedRevision = 0, autoRevision = 0, documentEpoch = 0;
let fileHandle: any = null, busy = false, saving = false, pendingFrame = 0, inputAt = 0;
let autoFailed = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined, autoWriting = false, db: IDBDatabase | null = null;
const frames: number[] = [], latencies: number[] = [];
function notify(message: string) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
let toastTimer: ReturnType<typeof setTimeout>;
function safe(action: () => void) { try { if (!busy && pointer === null) action(); } catch (e) { notify(error(e)); } }
function error(e: unknown) { return e instanceof Error ? e.message : String(e); }
function render() { if (!pendingFrame) pendingFrame = requestAnimationFrame(draw); }
function draw() {
  pendingFrame = 0; if (busy) return; const start = performance.now(); mover?.flush(); app.flush();
  if (view.width !== app.width || view.height !== app.height) { view.width = app.width; view.height = app.height; }
  const c = ctx(view); c.clearRect(0, 0, view.width, view.height);
  for (const l of app.layers) if (l.visible) { c.globalAlpha = l.opacity; c.drawImage(l.canvas, 0, 0); }
  c.globalAlpha = 1;
  if (thumbnailDirty && !app.stroke) {
    const thumb=thumbnailCanvas(app.width,app.height);ctx(thumb).drawImage(view,0,0,thumb.width,thumb.height);
    story.current.thumbnail=thumb.toDataURL('image/png');thumbnailDirty=false;renderCuts();
  }
  frames.push(performance.now() - start); if (frames.length > 180) frames.shift();
  if (inputAt) { latencies.push(performance.now() - inputAt); if (latencies.length > 180) latencies.shift(); inputAt = 0; }
}
function bindEngine() { app = story.paint; app.render = render; app.changed = changed; thumbnailDirty = true; }
bindEngine();
function ui() {
  syncGuide();
  renderCuts();
  syncNumbers();
  $('docName').textContent = name; $('dirty').hidden = revision === savedRevision;
  ($('undo') as HTMLButtonElement).disabled = !app.history.past.length || busy || pointer !== null;
  ($('redo') as HTMLButtonElement).disabled = !app.history.future.length || busy || pointer !== null;
  $('layerCount').textContent = String(app.layers.length); $('dimensions').textContent = `${app.width} × ${app.height} px`; $('canvasLabel').textContent = `${app.width} × ${app.height} · ${ratio(app.width,app.height)}`;
  $('layerList').replaceChildren();
  for (const l of [...app.layers].reverse()) {
    const row = document.createElement('div'); row.className = `layer-row ${l.id === app.active ? 'selected' : ''}`; row.setAttribute('role', 'listitem'); row.dataset.layerId = l.id;
    const eye = document.createElement('button'); eye.className = 'eye'; eye.title = l.visible ? '레이어 숨기기' : '레이어 표시'; eye.innerHTML = icon(l.visible ? 'eye' : 'hidden'); eye.setAttribute('aria-pressed', String(l.visible));
    eye.onclick = () => safe(() => app.property(l, 'visible', !l.visible));
    const thumb = canvas(44, 34); thumb.className = 'layer-thumbnail'; ctx(thumb).drawImage(l.canvas, 0, 0, 44, 34);
    const select = document.createElement('button'); select.className = 'layer-select'; select.setAttribute('aria-pressed', String(l.id === app.active));
    const text = document.createElement('span'); text.textContent = l.name; const small = document.createElement('small'); small.textContent = `${Math.round(l.opacity * 100)}% · 일반`; select.append(text, small);
    select.onclick = () => safe(() => { app.active = l.id; ui(); }); select.ondblclick = () => safe(() => rename(l.id));
    const mark = document.createElement('span'); mark.className = 'active-mark'; mark.textContent = l.id === app.active ? '•' : '';
    row.append(eye, thumb, select, mark); $('layerList').append(row);
  }
  input('layerOpacity').value = String(Math.round(app.selected.opacity * 100)); $('layerOpacityValue').textContent = `${Math.round(app.selected.opacity * 100)}%`;
  ($('deleteLayer') as HTMLButtonElement).disabled = app.layers.length <= 1;
  ($('layerUp') as HTMLButtonElement).disabled = app.layers.indexOf(app.selected) === app.layers.length - 1;
  ($('layerDown') as HTMLButtonElement).disabled = app.layers.indexOf(app.selected) === 0;syncNumbers();
}
function changed() { revision++; thumbnailDirty = true; const trimmed=story.enforceHistoryBudget(); ui(); scheduleAuto(); if (app.history.discarded || trimmed) notify('프로젝트 히스토리 메모리 한도로 오래된 실행 취소 기록을 정리했습니다.'); }
function transform() {
  story.current.view = {zoom,panX,panY};
  paper.style.width = `${app.width}px`; paper.style.height = `${app.height}px`; paper.style.transform = paperTransform(app.width,zoom,panX,panY,mirrored);
  $('zoomValue').textContent = `${Math.round(zoom * 100)}%`; updateCursor();
}
function fit() { zoom = Math.max(.1, Math.min(8, (stage.clientWidth - 112) / app.width, (stage.clientHeight - 100) / app.height)); panX = (stage.clientWidth - app.width * zoom) / 2; panY = (stage.clientHeight - app.height * zoom) / 2; transform(); }
function setZoom(next: number, x = stage.clientWidth / 2, y = stage.clientHeight / 2) { next = Math.max(.1, Math.min(8, next)); panX = x - (x - panX) * next / zoom; panY = y - (y - panY) * next / zoom; zoom = next; transform(); }
function coordinates(e: { clientX: number; clientY: number }) { return canvasPoint(e,paper.getBoundingClientRect(),zoom,app.width,mirrored); }
function updateCursor() { $('brushCursor').style.width = $('brushCursor').style.height = `${Math.max(3, size * zoom)}px`; stage.dataset.tool = space ? 'hand' : tool; }
function setTool(next: typeof tool) { if (pointer !== null) return; tool = next; if(next==='pen'||next==='pencil'||next==='dark-pencil'||next==='eraser')lastDrawingTool=next; for (const t of ['pen', 'pencil', 'dark-pencil', 'eraser', 'hand', 'move-layer', 'eyedropper']) { $(t).classList.toggle('active', t === tool); $(t).setAttribute('aria-pressed', String(t === tool)); } const label = tool === 'pen' ? '펜' : tool === 'pencil' ? '기본 연필' : tool === 'dark-pencil' ? '진한 연필' : tool === 'eraser' ? '지우개' : tool==='move-layer'?'레이어 이동':tool==='eyedropper'?'스포이트':'화면 이동'; ($('brushTool') as HTMLSelectElement).value = tool; $('toolLabel').innerHTML = `${icon(tool === 'dark-pencil' ? 'pencil' : tool)}${label}`; $('brushName').textContent = label; updateCursor(); }
function setColor(value: string) { color = value; input('color').value = value; $('colorHex').textContent = value.toUpperCase(); $('brushDot').style.background = color; document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(b => b.classList.toggle('selected', b.dataset.color === value)); }
function brushUI() { $('sizeValue').innerHTML = `${size} <span>px</span>`; $('brushBadge').textContent = `${size} px`; input('size').value = String(size); $('brushOpacityValue').textContent = `${Math.round(brushOpacity * 100)}%`; syncNumbers(); $('brushDot').style.width = $('brushDot').style.height = `${Math.min(30, Math.max(4, size))}px`; updateCursor(); }
const colors = ['#283747','#747c88','#c2c5ca','#ffffff','#ee6c55','#f2ad71','#e6c86a','#99b89b','#668fbd','#9184b3','#d39ab4','#8c6b57'];
for (const value of colors) { const b = document.createElement('button'); b.className = 'swatch'; b.dataset.color = value; b.style.background = value; b.title = value; b.setAttribute('aria-label', `색상 ${value}`); b.onclick = () => setColor(value); $('palette').append(b); }
setColor(color); brushUI();
$('brushTool').onchange = () => setTool(($('brushTool') as HTMLSelectElement).value as typeof tool);
input('color').oninput = () => setColor(input('color').value); $('resetColor').onclick = () => setColor('#283747');
input('size').oninput = () => { size = Number(input('size').value); brushUI(); };
input('brushOpacity').oninput = () => { brushOpacity = Number(input('brushOpacity').value) / 100; brushUI(); };
for (const t of ['pen', 'pencil', 'dark-pencil', 'eraser', 'hand', 'move-layer', 'eyedropper'] as const) $(t).onclick = () => setTool(t);
function undo(redo = false) { safe(() => { const c = redo ? app.history.redo() : app.history.undo(); if (c) { app.changed(); render(); $('statusText').textContent = `${c.label} ${redo ? '다시 실행' : '실행 취소'}`; } }); }
$('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
$('zoomIn').onclick = () => setZoom(zoom * 1.25); $('zoomOut').onclick = () => setZoom(zoom / 1.25); $('zoomValue').onclick = () => setZoom(1); $('fit').onclick = fit;
$('mirrorView').onclick=()=>safe(()=>{mirrored=!mirrored;$('mirrorView').setAttribute('aria-pressed',String(mirrored));transform();});
$('duplicateLayer').onclick=()=>safe(()=>duplicateLayer(app));$('flipLayer').onclick=()=>safe(()=>flipLayer(app));
$('addLayer').onclick = () => safe(() => app.add()); $('deleteLayer').onclick = () => safe(() => app.remove()); $('layerUp').onclick = () => safe(() => app.move(1)); $('layerDown').onclick = () => safe(() => app.move(-1));
function rename(id = app.active) { const l = app.layers.find(l => l.id === id)!; const value = prompt('레이어 이름', l.name); if (value?.trim()) app.property(l, 'name', value.trim().slice(0, 100)); }
$('renameLayer').onclick = () => safe(() => rename());
input('layerOpacity').oninput = () => { $('layerOpacityValue').textContent = `${input('layerOpacity').value}%`; };
input('layerOpacity').onchange = () => safe(() => app.property(app.selected, 'opacity', Number(input('layerOpacity').value) / 100));
input('whiteBackground').onchange = () => { story.whiteBackground = input('whiteBackground').checked; paper.classList.toggle('white',story.whiteBackground); revision++; ui(); scheduleAuto(); };
function syncGuide() {
  const g=app.guide; ($('guideType') as HTMLSelectElement).value=g.type;input('guideVisible').checked=g.visible;input('guideSpacing').value=String(g.spacing);($('guideColor') as HTMLSelectElement).value=g.color;input('guideOpacity').value=String(Math.round(g.opacity*100));
  $('guideSpacingValue').textContent=`${g.spacing} px`;$('guideOpacityValue').textContent=`${Math.round(g.opacity*100)}%`;renderGuide($('guideOverlay'),g);syncNumbers();
}
function changeGuide() {
  try { app.guide=readGuide({type:($('guideType') as HTMLSelectElement).value,visible:input('guideVisible').checked,spacing:Number(input('guideSpacing').value),color:($('guideColor') as HTMLSelectElement).value,opacity:Number(input('guideOpacity').value)/100});revision++;$('dirty').hidden=revision===savedRevision;syncGuide();scheduleAuto(); }catch(e){notify(error(e));}
}
for(const id of ['guideType','guideVisible','guideColor']) $(id).onchange=changeGuide;
for(const id of ['guideSpacing','guideOpacity']) $(id).oninput=changeGuide;

function dialog(id: string) { if (pointer === null && !busy) $<HTMLDialogElement>(id).showModal(); }
$('help').onclick = () => dialog('helpDialog');
$('diagnostics').onclick = () => { const average = (a: number[]) => a.length ? (a.reduce((a, b) => a + b, 0) / a.length).toFixed(2) : '—'; const max = (a: number[]) => a.length ? Math.max(...a).toFixed(2) : '—'; $('metrics').textContent = `캔버스        ${app.width} × ${app.height}\n레이어        ${app.layers.length}\n렌더 표본     ${frames.length}\n렌더 평균     ${average(frames)} ms\n렌더 최대     ${max(frames)} ms\n입력 표본     ${latencies.length}\n입력→렌더 평균 ${average(latencies)} ms\n입력→렌더 최대 ${max(latencies)} ms\n히스토리      ${(app.history.bytes / 1048576).toFixed(2)} / ${HISTORY_LIMIT / 1048576} MiB\nUndo / Redo   ${app.history.past.length} / ${app.history.future.length}\n컷 Canvas     ${(story.stats.canvasBytes/1048576).toFixed(2)} MiB\n압축 컷 버퍼   ${(story.stats.compressedBytes/1048576).toFixed(2)} MiB\n상주 컷       ${story.stats.hotCuts} / ${story.stats.cuts}\n전체 히스토리   ${(story.stats.historyBytes/1048576).toFixed(2)} MiB\n스트로크 임시 버퍼: 캔버스 2장 (히스토리와 별도)`; dialog('diagnosticDialog'); };
stage.addEventListener('pointerdown', e => {
  if ((e.target as Element).closest('button') || pointer !== null || busy || document.querySelector('dialog[open]') || (e.button !== 0 && e.button !== 1)) return;
  const p = coordinates(e); const pan = tool === 'hand' || space || e.button === 1;
  if (!pan && (p.x < 0 || p.y < 0 || p.x >= app.width || p.y >= app.height)) return;
  e.preventDefault(); stage.focus({ preventScroll: true });
  if(!pan&&tool==='eyedropper'){if(pendingFrame)cancelAnimationFrame(pendingFrame);draw();const picked=sampleColor(view,p.x,p.y);if(picked)setColor(picked);else notify('투명한 픽셀입니다.');setTool(lastDrawingTool);return;}
  if(!pan&&tool==='move-layer'){try{mover=new LayerMove(app,p.x,p.y);}catch(e){notify(error(e));return;}}
  else if (!pan && !app.begin(p.x, p.y, size, color, brushOpacity, tool === 'eraser', tool === 'pencil' || tool === 'dark-pencil' ? tool : null)) { notify('보이는 레이어와 0%보다 높은 불투명도를 선택해주세요.'); return; }
  pointer = e.pointerId; stage.setPointerCapture(e.pointerId); inputAt ||= performance.now();
  if (pan) { panning = { x: e.clientX, y: e.clientY, panX, panY }; stage.classList.add('panning'); }
  $('statusText').textContent = pan ? '화면 이동 중' : mover ? '레이어 이동 중' : `${tool === 'pen' ? '펜' : tool === 'eraser' ? '지우개' : '연필'}으로 그리는 중`; ui();
});
stage.addEventListener('pointermove', e => {
  const p = coordinates(e), r = stage.getBoundingClientRect(); $('coordinates').textContent = `${Math.round(p.x)}, ${Math.round(p.y)} px`;
  $('brushCursor').style.left = `${e.clientX - r.left}px`; $('brushCursor').style.top = `${e.clientY - r.top}px`; $('brushCursor').hidden = p.x < 0 || p.y < 0 || p.x > app.width || p.y > app.height;
  if (e.pointerId !== pointer) return;
  if (panning) { panX = panning.panX + e.clientX - panning.x; panY = panning.panY + e.clientY - panning.y; transform(); return; }
  if(mover){mover.update(p.x,p.y);return;}
  inputAt ||= performance.now();
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const event of events.length ? events : [e]) { const point = coordinates(event); app.point(point.x, point.y); }
});
function finishPointer(e: PointerEvent, cancelled: boolean) {
  if (e.pointerId !== pointer) return;
  if(mover){const editing=mover;mover=null;try{if(cancelled)editing.cancel();else{const p=coordinates(e);editing.update(p.x,p.y);editing.finish();}}catch(errorValue){editing.cancel();notify(error(errorValue));}}
  else if (cancelled) app.cancel(); else { if (app.stroke) { const p = coordinates(e); app.point(p.x, p.y); } app.end(); }
  pointer = null; panning = null; stage.classList.remove('panning'); if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  $('statusText').textContent = cancelled ? '획 취소됨' : '준비'; ui();
}
stage.addEventListener('pointerup', e => finishPointer(e, false)); stage.addEventListener('pointercancel', e => finishPointer(e, true));
stage.addEventListener('lostpointercapture', e => finishPointer(e, true));
stage.addEventListener('pointerleave', () => $('brushCursor').hidden = true);
stage.addEventListener('wheel', e => { if (e.ctrlKey && pointer === null && !busy) { e.preventDefault(); const r = stage.getBoundingClientRect(); setZoom(zoom * Math.exp(-e.deltaY * .002), e.clientX - r.left, e.clientY - r.top); } }, { passive: false });
window.addEventListener('blur', () => { space = false; if (pointer !== null) { mover?.cancel();mover=null;app.cancel(); if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer); pointer = null; panning = null; stage.classList.remove('panning'); ui(); } updateCursor(); });
function dirty() { return revision !== savedRevision; }
function confirmReplace() { return !dirty() || confirm('저장하지 않은 변경 사항이 있습니다. 현재 작업을 바꿀까요?'); }
function newRequest() { dialog('newDialog'); }
$('new').onclick = newRequest;
let canvasUnit='px';
function canvasValues() { const dpi=readDpi(input('newDpi').valueAsNumber);const w=input('newWidth').valueAsNumber,h=input('newHeight').valueAsNumber;return {w:canvasUnit==='mm'?mmToPx(w,dpi):w,h:canvasUnit==='mm'?mmToPx(h,dpi):h,dpi}; }
function setCanvasValues(w:number,h:number,dpi:number) { input('newDpi').value=String(dpi);input('newWidth').value=canvasUnit==='mm'?pxToMm(w,dpi).toFixed(3):String(w);input('newHeight').value=canvasUnit==='mm'?pxToMm(h,dpi).toFixed(3):String(h); }
function updatePresetInfo() {
  try { const {w,h,dpi}=canvasValues();dimensions(w,h);$('newSizeInfo').textContent=`${w} × ${h} px · ${ratio(w,h)}`;$('newPrintInfo').textContent=`${pxToMm(w,dpi).toFixed(2)} × ${pxToMm(h,dpi).toFixed(2)} mm · ${dpi} DPI`;
    rememberPreset(($('canvasPreset') as HTMLSelectElement).value,w,h,dpi);
  } catch(e) { $('newSizeInfo').textContent=error(e);$('newPrintInfo').textContent='각 변 1~4096px · 컷당 레이어 픽셀 합계 128백만 이하'; }
}
function orientCanvas() { const orientation=($('canvasOrientation') as HTMLSelectElement).value,w=input('newWidth').valueAsNumber,h=input('newHeight').valueAsNumber;if((orientation==='landscape'&&w<h)||(orientation==='portrait'&&w>h)){input('newWidth').value=String(h);input('newHeight').value=String(w);}updatePresetInfo(); }
const savedPreset=readPreset();setCanvasValues(savedPreset.width,savedPreset.height,savedPreset.dpi);($('canvasPreset') as HTMLSelectElement).value=savedPreset.id;($('canvasOrientation') as HTMLSelectElement).value=savedPreset.width>savedPreset.height?'landscape':'portrait';updatePresetInfo();
$('canvasPreset').onchange=()=>{const p=PRESETS.find(p=>p.id===($('canvasPreset') as HTMLSelectElement).value);if(p){setCanvasValues(p.width,p.height,p.dpi);($('canvasOrientation') as HTMLSelectElement).value=p.width>p.height?'landscape':'portrait';}updatePresetInfo();};
$('canvasOrientation').onchange=orientCanvas;
$('canvasUnit').onchange=()=>{try{const previous=canvasValues();canvasUnit=($('canvasUnit') as HTMLSelectElement).value;for(const id of ['newWidth','newHeight']){input(id).step=canvasUnit==='mm'?'0.001':'1';input(id).max=canvasUnit==='mm'?'3000':'4096';input(id).min=canvasUnit==='mm'?'0.001':'1';}setCanvasValues(previous.w,previous.h,previous.dpi);document.querySelectorAll('.dimensionUnit').forEach(el=>el.textContent=canvasUnit);updatePresetInfo();}catch(e){($('canvasUnit') as HTMLSelectElement).value=canvasUnit;notify(error(e));}};
for(const id of ['newWidth','newHeight','newDpi'])input(id).oninput=()=>{($('canvasPreset') as HTMLSelectElement).value='custom';updatePresetInfo();};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-preset]'))b.onclick=()=>{const [w,h]=b.dataset.preset!.split(',').map(Number);setCanvasValues(w,h,96);($('canvasPreset') as HTMLSelectElement).value=PRESETS.find(p=>p.width===w&&p.height===h)?.id??'custom';updatePresetInfo();};
function restoreView() { const v=story.current.view; if(v){zoom=v.zoom;panX=v.panX;panY=v.panY;transform();}else fit(); }
function adopt(next: Storyboard) { const old=story;story=next;bindEngine();old.dispose();input('whiteBackground').checked=story.whiteBackground;paper.classList.toggle('white',story.whiteBackground); }
$('createDocument').onclick = e => { e.preventDefault(); safe(() => { const {w,h,dpi}=canvasValues();dimensions(w,h);if(!confirmReplace())return;const p=new Paint();p.reset(w,h);p.dpi=dpi;adopt(new Storyboard(p));name='제목 없음';fileHandle=null;documentEpoch++;revision=0;savedRevision=0;autoRevision=-1;$<HTMLDialogElement>('newDialog').close();ui();fit();render();scheduleAuto(); }); };
function renderCuts() {
  $('cutCount').textContent=String(story.cuts.length);$('currentCutLabel').textContent=story.current.name;
  $('cutList').replaceChildren();
  for(const [i,cut] of story.cuts.entries()){
    const b=document.createElement('button');b.className='cut-card';b.dataset.cutId=cut.id;b.setAttribute('aria-pressed',String(cut===story.current));b.title=cut.name;b.disabled=busy || pointer!==null;
    const image=document.createElement('img');image.alt='';if(cut.thumbnail)image.src=cut.thumbnail;
    const text=document.createElement('span');text.textContent=`${String(i+1).padStart(2,'0')}  ${cut.name}`;b.append(image,text);
    b.onclick=()=>void cutAction(async()=>story.select(cut.id),cut!==story.current);$('cutList').append(b);
  }
  const i=story.cuts.indexOf(story.current);
  for(const id of ['addCut','duplicateCut','renameCut','deleteCut','previousLayers','cutLeft','cutRight']) ($<HTMLButtonElement>(id)).disabled=busy || pointer!==null;
  if(story.cuts.length<=1) $<HTMLButtonElement>('deleteCut').disabled=true;
  if(i===0){$<HTMLButtonElement>('cutLeft').disabled=true;$<HTMLButtonElement>('previousLayers').disabled=true;}
  if(i===story.cuts.length-1)$<HTMLButtonElement>('cutRight').disabled=true;
}
async function cutAction(action:()=>Promise<void>, edited=true) { await exclusive(async()=>{try { await action(); } finally { bindEngine(); restoreView(); } if(edited){revision++;scheduleAuto();}}); }
$('addCut').onclick=()=>void cutAction(()=>story.add());$('duplicateCut').onclick=()=>void cutAction(()=>story.add(true));
$('deleteCut').onclick=()=>{if(!busy && pointer===null && confirm(`“${story.current.name}” 컷을 삭제할까요? 컷 삭제는 실행 취소할 수 없습니다.`))void cutAction(()=>story.remove());};
$('cutLeft').onclick=()=>void cutAction(()=>story.move(-1));$('cutRight').onclick=()=>void cutAction(()=>story.move(1));
$('previousLayers').onclick=()=>void cutAction(()=>story.copyPreviousLayers(),false);
$('renameCut').onclick=()=>safe(()=>{const value=prompt('컷 이름',story.current.name);if(value?.trim()){story.current.name=value.trim().slice(0,100);revision++;ui();scheduleAuto();}});
function openRequest() { if (pointer === null && !busy) input('fileInput').click(); }
$('open').onclick = openRequest; $('import').onclick = () => { if (pointer === null && !busy) input('imageInput').click(); };
async function readFile(file: File) {
  if (file.size > 128 * 1048576) throw new Error('파일 크기 한도는 128 MiB입니다.');
  return file.text();
}
async function exclusive(action: () => Promise<void>) { if (busy || pointer !== null) return; busy = true; ui(); try { await action(); } catch (e) { notify(error(e)); } finally { busy = false; ui(); render(); } }
input('fileInput').onchange = () => { const file = input('fileInput').files?.[0]; input('fileInput').value = ''; if (!file) return; void exclusive(async () => { const decoded = await Storyboard.decode(JSON.parse(await readFile(file))); if (!confirmReplace()) { decoded.story.dispose(); return; } adopt(decoded.story); name = decoded.name === '제목 없음' ? file.name.replace(/\.(mpaint|json)$/i, '') : decoded.name; fileHandle = null; documentEpoch++; revision = savedRevision = 0; autoRevision = -1; restoreView(); scheduleAuto(); notify('프로젝트를 열었습니다. 저장은 새 파일로 진행됩니다.'); }); };
input('imageInput').onchange = () => { const file = input('imageInput').files?.[0]; input('imageInput').value = ''; if (!file) return; void exclusive(async () => {
  if (file.type !== 'image/png' || file.size > 64 * 1048576) throw new Error('64 MiB 이하의 PNG 파일을 선택하세요.');
  if ((app.layers.length + 1) * app.width * app.height > 128e6 || app.layers.length >= 50) throw new Error('레이어 메모리 한도에 도달했습니다.');
  const url = URL.createObjectURL(file); try { const img = await loadImage(url); if (img.width > 8192 || img.height > 8192) throw new Error('가져올 이미지가 너무 큽니다.');
    const l = app.makeLayer(file.name.replace(/\.png$/i, '')); const scale = Math.min(1, app.width / img.width, app.height / img.height); const w = img.width * scale, h = img.height * scale; ctx(l.canvas).drawImage(img, (app.width - w) / 2, (app.height - h) / 2, w, h);
    app.structure('이미지 가져오기', () => { app.layers.push(l); app.active = l.id; }, app.width * app.height * 4); notify(scale < 1 ? '캔버스에 맞게 이미지를 축소해 새 레이어로 가져왔습니다.' : '이미지를 새 레이어로 가져왔습니다.');
  } finally { URL.revokeObjectURL(url); }
}); };
function download(data: Blob, filename: string) { const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
async function save(as = false) {
  if (saving || busy || pointer !== null) return; saving = true;
  const startRevision = revision, epoch = documentEpoch; let nextName = name, handle = fileHandle;
  try {
    // Invoke the picker before any awaited encoding to retain browser user activation.
    if ('showSaveFilePicker' in window) {
      if (as || !handle) handle = await (window as any).showSaveFilePicker({ suggestedName: `${name}.mpaint`, types: [{ description: 'Mini Paint 프로젝트', accept: { 'application/json': ['.mpaint'] } }] });
      nextName = handle.name.replace(/\.mpaint$/i, '');
    } else if (as || name === '제목 없음') { const value = prompt('프로젝트 파일 이름', name === '제목 없음' ? '나의 그림' : name); if (!value?.trim()) return; nextName = value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 100); }
    // New/open operations are blocked while choosing and capturing the save revision.
    if (documentEpoch !== epoch || revision !== startRevision) { notify('저장 준비 중 그림이 변경되었습니다. 다시 저장해주세요.'); return; }
    const project = await story.serialize(nextName); const data = new Blob([JSON.stringify(project)], { type: 'application/json' }); if(data.size>128*1048576)throw new Error('프로젝트 파일이 128 MiB 한도를 초과합니다.');
    if (handle) { const writable = await handle.createWritable(); try { await writable.write(data); await writable.close(); } catch (e) { await writable.abort().catch(() => {}); throw e; } }
    else download(data, `${nextName}.mpaint`);
    if (documentEpoch === epoch) { name = nextName; fileHandle = handle; savedRevision = startRevision; ui(); }
    notify(handle ? '프로젝트 파일을 저장했습니다.' : '프로젝트 다운로드를 요청했습니다. 브라우저의 다운로드 결과를 확인해주세요.');
  } catch (e) { if ((e as DOMException).name !== 'AbortError') notify(`저장하지 못했습니다: ${error(e)}. 다른 이름으로 저장을 시도하세요.`); }
  finally { saving = false; }
}
$('save').onclick = () => void save(); $('export').onclick = () => { $('exportSize').textContent=`${story.current.name} · ${app.width} × ${app.height} px · ${ratio(app.width,app.height)} · ${story.dpi} DPI`; dialog('exportDialog'); };
$('downloadPng').onclick = e => { e.preventDefault(); $<HTMLDialogElement>('exportDialog').close(); void exclusive(async () => { const white = document.querySelector<HTMLInputElement>('input[name="exportBg"]:checked')!.value === 'white'; const pixels=await blob(app.composite(white));const result=input('pngDpi').checked?await withResolution(pixels,story.dpi):pixels;download(result, `${name}.png`); notify('PNG 다운로드를 요청했습니다.'); }); };
window.addEventListener('keydown', e => {
  if (e.isComposing || e.altKey || document.querySelector('dialog[open]')) return;
  if(e.key==='Escape'&&mover&&pointer!==null){e.preventDefault();finishPointer(new PointerEvent('pointercancel',{pointerId:pointer}),true);return;}
  const target = e.target as HTMLElement; if (target.closest('textarea, select, [contenteditable="true"]') || (target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'color'].includes(target.type))) return;
  const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let action: (() => void) | undefined;
  if (ctrl) {
    if (key === 's') action = () => void save(e.shiftKey);
    else if (key === 'o') action = openRequest;
    else if (key === 'n') action = newRequest;
    else if (key === 'z') action = () => undo(e.shiftKey);
    else if (key === 'y') action = () => undo(true);
    else if (key === '+' || key === '=') action = () => setZoom(zoom * 1.25);
    else if (key === '-') action = () => setZoom(zoom / 1.25);
    else if (key === '0') action = fit;
  } else {
    if (key === 'm') action=()=>$('mirrorView').click();
    else if(key==='i')action=()=>setTool('eyedropper');
    else if(key==='v')action=()=>setTool('move-layer');
    else if (key === 'b') action = () => setTool('pen');
    else if (key === 'e') action = () => setTool('eraser');
    else if (key === 'h') action = () => setTool('hand');
    else if (key === ' ') action = () => { space = true; updateCursor(); };
    else if (key === '[' || key === ']') action = () => { size = Math.max(1, Math.min(100, size + (key === ']' ? 1 : -1))); brushUI(); };
    else if (key === 'delete') action = () => safe(() => app.clearLayer());
  }
  if(action && e.repeat && key==='m'){e.preventDefault();return;}
  if (action && pointer === null && !busy && !e.repeat) { e.preventDefault(); action(); }
  else if (action && e.repeat && !['s', 'o', 'n'].includes(key) && pointer === null && !busy) { e.preventDefault(); action(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; updateCursor(); } });
window.addEventListener('beforeunload', e => { if (dirty() || autoWriting || autoRevision !== revision || app.stroke || mover) { e.preventDefault(); e.returnValue = ''; } });
function dbRequest(mode: IDBTransactionMode, value?: unknown): Promise<unknown> { return new Promise((resolve, reject) => {
  if (!db) { reject(new Error('자동 저장소를 사용할 수 없습니다.')); return; }
  const tx = db.transaction('recovery', mode), store = tx.objectStore('recovery'); const request = mode === 'readonly' ? store.get('last') : store.put(value, 'last');
  tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error ?? new Error('자동 저장 실패')); tx.onabort = () => reject(tx.error ?? new Error('자동 저장 취소'));
}); }
function scheduleAuto() { autoFailed = false; clearTimeout(autoTimer); $('autoStatus').textContent = '자동 저장 대기'; autoTimer = setTimeout(() => void autosave(), 1200); }
async function autosave() {
  if (!db) return;
  if (autoWriting || busy || pointer !== null) { autoTimer = setTimeout(() => void autosave(), 1200); return; }
  autoWriting = true; const version = revision, epoch = documentEpoch; $('autoStatus').textContent = '자동 저장 중…';
  try { const project = await story.serialize(name); if (epoch !== documentEpoch) return; await dbRequest('readwrite', { project, at: Date.now() });
    if (epoch === documentEpoch) { autoRevision = version; $('autoStatus').textContent = revision === version ? '자동 저장 완료' : '자동 저장 대기'; }
  } catch (e) { autoFailed = true; $('autoStatus').textContent = '자동 저장 실패'; notify(`자동 저장 실패: ${error(e)}. 프로젝트 파일을 직접 저장해주세요.`); }
  finally { autoWriting = false; if (!autoFailed && autoRevision !== revision) scheduleAuto(); }
}
async function initRecovery() {
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('mini-paint-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('recovery'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('다른 탭의 저장소 연결을 닫아주세요.')); });
    db.onversionchange = () => { db?.close(); db = null; notify('저장소 연결이 변경되었습니다. 프로젝트를 저장하고 새로고침하세요.'); };
    const recovery = await dbRequest('readonly') as { project: unknown; at: number } | undefined;
    if (!recovery) return;
    // Do not offer late recovery after the user has already started editing.
    if (revision || pointer !== null) return;
    $<HTMLDialogElement>('recoveryDialog').showModal();
    $('restoreRecovery').onclick = () => { $<HTMLDialogElement>('recoveryDialog').close(); void exclusive(async () => { const p = await Storyboard.decode(recovery.project); adopt(p.story); name = p.name; fileHandle = null; documentEpoch++; revision = 1; savedRevision = 0; autoRevision = 1; restoreView(); notify('작업을 복구했습니다. 프로젝트 파일로도 저장해주세요.'); }); };
    $('discardRecovery').onclick = () => { $<HTMLDialogElement>('recoveryDialog').close(); autoRevision = -1; scheduleAuto(); };
    $<HTMLDialogElement>('recoveryDialog').addEventListener('cancel', e => e.preventDefault());
  } catch (e) { $('autoStatus').textContent = '자동 저장 사용 불가'; notify(`자동 복구를 사용할 수 없습니다: ${error(e)}. 파일 저장을 이용하세요.`); }
}
let userPresets:UserPreset[]=[];
try { userPresets=loadPresets(); }catch(e){notify(`프리셋 읽기 실패: ${error(e)}`);}
function listUserPresets(selected='') {
  const list=$('userPresetList') as HTMLSelectElement,kind=($('presetKind') as HTMLSelectElement).value;list.replaceChildren();
  for(const p of userPresets.filter(p=>p.kind===kind)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;list.append(o);}if(selected)list.value=selected;
}
function storeUserPresets(next:UserPreset[],selected=''){savePresets(next);userPresets=next;listUserPresets(selected);}
function selectedPreset(){const p=userPresets.find(p=>p.id===($('userPresetList') as HTMLSelectElement).value);if(!p)throw new Error('프리셋을 선택하세요.');return p;}
function presetName(){const value=input('presetName').value.trim();if(!value)throw new Error('프리셋 이름을 입력하세요.');return value;}
$('settings').onclick=()=>{listUserPresets();dialog('settingsDialog');};$('presetKind').onchange=()=>listUserPresets();$('userPresetList').onchange=()=>{input('presetName').value=selectedPreset().name;};
$('addPreset').onclick=()=>safe(()=>{const kind=($('presetKind') as HTMLSelectElement).value;let preset:UserPreset;
  if(kind==='brush'){if(tool==='hand'||tool==='move-layer'||tool==='eyedropper')throw new Error('브러시 도구를 선택하세요.');preset={id:presetId(),kind:'brush',name:presetName(),tool,size,opacity:brushOpacity,color,...(tool==='pencil'||tool==='dark-pencil'?{texture:{version:1 as const}}:{})};}
  else preset={id:presetId(),kind:'work',name:presetName(),width:app.width,height:app.height,dpi:story.dpi,guide:{...app.guide},whiteBackground:story.whiteBackground};
  storeUserPresets([...userPresets,preset],preset.id);
});
$('renamePreset').onclick=()=>safe(()=>{const old=selectedPreset();storeUserPresets(userPresets.map(p=>p.id===old.id?{...p,name:presetName()}:p),old.id);});
$('deletePreset').onclick=()=>safe(()=>{const old=selectedPreset();storeUserPresets(userPresets.filter(p=>p.id!==old.id));});
$('applyPreset').onclick=()=>safe(()=>{const p=selectedPreset();
  if(p.kind==='brush'){setTool(p.tool);size=p.size;brushOpacity=p.opacity;input('brushOpacity').value=String(Math.round(p.opacity*100));setColor(p.color);brushUI();}
  else {if(!confirmReplace())return;const paint=new Paint();paint.reset(p.width,p.height);paint.dpi=p.dpi;paint.guide={...p.guide};const next=new Storyboard(paint);next.whiteBackground=p.whiteBackground;adopt(next);name='제목 없음';fileHandle=null;documentEpoch++;revision=savedRevision=0;autoRevision=-1;fit();ui();render();scheduleAuto();}
  $<HTMLDialogElement>('settingsDialog').close();
});
$('exportPresets').onclick=()=>download(new Blob([JSON.stringify({format:'mini-paint-presets',version:1,presets:userPresets},null,2)],{type:'application/json'}),'mini-paint-presets.json');
$('importPresets').onclick=()=>input('presetFileInput').click();input('presetFileInput').onchange=()=>{const file=input('presetFileInput').files?.[0];input('presetFileInput').value='';if(!file)return;void(async()=>{try{if(file.size>256*1024)throw new Error('프리셋 JSON은 256 KiB 이하만 가져올 수 있습니다.');const imported=importPresets(JSON.parse(await file.text())).map(p=>({...p,id:presetId()}));storeUserPresets([...userPresets,...imported]);notify(`${imported.length}개 프리셋을 가져왔습니다.`);}catch(e){notify(error(e));}})();};
let psdAbort:AbortController|null=null;
$('downloadPsd').onclick=()=>{if(busy||pointer!==null)return;$<HTMLDialogElement>('exportDialog').close();$<HTMLDialogElement>('psdProgressDialog').showModal();psdAbort=new AbortController();const signal=psdAbort.signal;
  void exclusive(async()=>{try{const {exportPsd}=await import('./psd-export');const data=await exportPsd(app,story.dpi,signal,(text,value)=>{$('psdProgress').textContent=text;($('psdProgressBar') as HTMLProgressElement).value=value;});download(data,`${name}.psd`);notify('PSD 다운로드를 요청했습니다.');}catch(e){if((e as Error).name==='AbortError')notify('PSD 내보내기 취소');else throw e;}finally{psdAbort=null;$<HTMLDialogElement>('psdProgressDialog').close();}});
};
$('cancelPsd').onclick=()=>psdAbort?.abort();$<HTMLDialogElement>('psdProgressDialog').addEventListener('cancel',e=>{e.preventDefault();psdAbort?.abort();});

bindNumbers();
ui(); fit(); render(); void initRecovery();
new ResizeObserver(() => { transform(); }).observe(stage);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => notify('오프라인 캐시를 준비하지 못했습니다. 온라인에서 다시 열어주세요.'));
// Development diagnostics and deterministic browser regression tests only; excluded from production.
if (import.meta.env.DEV) (window as any).__paint = { get app() { return app; }, get story() { return story; }, get mirrored() {return mirrored;}, get busy() { return busy; }, get revision() { return revision; }, get zoom() { return zoom; }, setZoom, coordinates, autosave, get metrics() { return { frames, latencies }; } };
