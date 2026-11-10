import './style.css';
import { BASIC_BRUSHES, isBasicBrush, readTexture } from './basic-brushes';
import { brushTestPanel } from './brush-test-panel';
import { BRUSHES, defaults, isBrush, brushSettings, loadToolPreferences, saveToolPreferences, type BrushTool } from './tool-settings';
import { bucketFill } from './bucket';
import { InvertPreview } from './pixel-operations';
import { FreeTransform, type ImportSource, type TransformHandle } from './free-transform';
import { paperTransform, canvasPoint } from './view-transform';
import { flipLayer, duplicateLayer, LayerMove } from './layer-edits';
import { LayerList, initLayerPanel } from './layer-panel';
import { initMenus, initWorkspace, CUT_MIN, CUT_MAX } from './workspace';
import { rectangle, inside, clearRegion, PixelMove, SelectionClipboard, type Rect } from './selection';
import { sampleColor } from './eyedropper';
import { withResolution } from './png-resolution';
import { bindNumbers, syncNumbers } from './numeric';
import { mmToPx, pxToMm, readDpi } from './resolution';
import { importPresets, loadPresets, savePresets, presetId, presetFile, type ToolSetPreset, type UserPreset } from './user-presets';
import { readGuide, renderGuide } from './guides';
import { Storyboard, thumbnailCanvas } from './storyboard';
import { PRESETS, ratio, readPreset, rememberPreset } from './presets';
import { Paint, canvas, ctx, loadImage, blob, dimensions, HISTORY_LIMIT } from './engine';
const icons: Record<string, string> = {
 'rough-ink':'<path d="m5 20 2-6L17 3l4 4L10 18ZM7 14l3 4M4 21l4-1"/>',
 'felt-tip':'<path d="m4 20 2-7L17 2l5 5-11 11Zm2-7 5 5M3 21h7"/>',
 ballpoint:'<path d="m4 20 3-6L18 3l3 3-11 11ZM7 14l3 3M3 21l3-1"/>',
 bucket:'<path d="m4 12 8-8 8 8-8 8Zm7-9 3-2M18 18c0 4 5 4 5 0l-2.5-3Z"/>',
 select:'<rect x="3" y="3" width="18" height="18" stroke-dasharray="3 3"/>',
 'move-artwork':'<path d="M3 5h14v14H3ZM7 1h14v14M8 9v6m-3-3h6"/>',
 mirror:'<path d="M12 2v20M9 6 3 18h6Zm6 0 6 12h-6Z"/>',
 'move-layer':'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
 eyedropper:'<path d="m14 4 6 6M3 18l9-9 4 4-9 9H3Zm11-9 5-5a2 2 0 0 1 3 3l-5 5"/>',
 pencil: '<path d="m4 16 12-12 4 4L8 20l-6 2Zm10-10 4 4M4 16l4 4M3 19l2 2"/>',
 pen: '<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-5-5L3 14l-1 7Z"/>',
 eraser: '<path d="m15 3 6 6a2 2 0 0 1 0 3L11 22H6l-5-5a2 2 0 0 1 0-3L12 3a2 2 0 0 1 3 0ZM7 9l8 8M10 22h12"/>',
 hand: '<path d="M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 5-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2"/>',
 undo: '<path d="m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7"/>', redo: '<path d="m15 5 6 6-6 6m6-6H10a7 7 0 0 0-7 7"/>',
 left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
 plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
 file: '<path d="M14 2H5v20h14V7Zm0 0v6h5M8 14h8m-8 4h5"/>', folder: '<path d="M2 7V4h7l3 3h10l-3 13H2Zm0 4h18"/>',
 save: '<path d="M4 2h13l5 5v15H2V2Zm3 0v7h10V2M7 22v-8h10v8"/>', export: '<path d="M12 3v12m-5-7 5-5 5 5M4 15v6h16v-6"/>',
 layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>', eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
 hidden: '<path d="m3 3 18 18M9 5c7-2 13 7 13 7a21 21 0 0 1-4 4M6 6a22 22 0 0 0-5 6s4 7 11 7a13 13 0 0 0 4-1"/>',
 trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8m4-8v8"/>', up: '<path d="m5 15 7-7 7 7"/>', down: '<path d="m5 9 7 7 7-7"/>',
 fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 8h8v8H8Z"/>', check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', image: '<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m2 18 6-5 4 4 4-7 6 8"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const button = (id: string, name: string, symbol: string, extra = '', label = name) => `<button id="${id}" title="${name}" ${extra}>${icon(symbol)}<span>${label}</span></button>`;
type Tool = BrushTool | 'hand' | 'move-layer' | 'eyedropper' | 'select' | 'move-artwork' | 'bucket';
// One table drives the rail, the tool picker and status text. Order is the on-screen order.
const TOOL_GROUPS: [string, [Tool, string, string][]][] = [
  ['그리기', [['pen','펜','B'],['pencil','기본 연필',''],['dark-pencil','진한 연필',''],['rough-ink','거친 잉크펜',''],['felt-tip','싸인펜',''],['ballpoint','볼펜',''],['eraser','지우개','E'],['bucket','페인트통','G']]],
  ['선택 · 이동', [['select','사각형 선택','S'],['move-layer','레이어 이동','V'],['move-artwork','전체 그림 이동','']]],
  ['보조', [['eyedropper','스포이트','I'],['hand','화면 이동','H']]],
];
const TOOLS = TOOL_GROUPS.flatMap(([, tools]) => tools);
const TOOL_NAMES = Object.fromEntries(TOOLS.map(([id, name]) => [id, name])) as Record<Tool, string>;
const toolButton = ([id, name, key]: [Tool, string, string]) => `<button id="${id}" class="tool${id === 'dark-pencil' ? ' dark-pencil' : ''}${id === 'pen' ? ' active' : ''}" title="${name}${key ? ` (${key})` : ''}" aria-pressed="${id === 'pen'}">${icon(id === 'dark-pencil' ? 'pencil' : id)}<span class="tool-name">${name}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
const menuItem = (label: string, key: string, attrs: string) => `<button role="menuitem" ${attrs}><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
// own(): the command lives in the menu. run(): the menu forwards to a control that is also on screen or bound to a shortcut.
const own = (id: string, label: string, key = '', check = '') => menuItem(label, key, `id="${id}"${check ? ` data-check="${check}"` : ''}`);
const run = (target: string, label: string, key = '', check = '') => menuItem(label, key, `data-run="${target}"${check ? ` data-check="${check}"` : ''}`);
const menu = (label: string, items: string[]) => `<div class="menu"><button class="menu-button" aria-haspopup="menu" aria-expanded="false">${label}</button><div class="menu-list" role="menu" hidden>${items.join('')}</div></div>`;
const rule = '<hr>';
document.querySelector('#app')!.innerHTML = `
<header class="menubar"><a class="brand" href="./" aria-label="Mini Paint 홈">${icon('pen')}<span>Mini Paint</span></a>
<nav class="menus" aria-label="메뉴">
${menu('파일', [own('new','새 캔버스','Ctrl+N'), own('open','열기','Ctrl+O'), run('save','저장','Ctrl+S'), own('saveAs','다른 이름으로 저장','Ctrl+Shift+S'), rule, own('import','PNG 이미지 가져오기'), run('export','내보내기 (PNG · PSD)')])}
${menu('편집', [run('undo','실행 취소','Ctrl+Z'), run('redo','다시 실행','Ctrl+Y'), rule, run('cutSelection','잘라내기','Ctrl+X'), run('copySelection','복사','Ctrl+C'), run('pasteSelection','붙여넣기','Ctrl+V'), run('clearSelection','선택 내용 지우기','Delete'), rule, run('selectAll','전체 선택','Ctrl+A'), run('deselect','선택 해제','Ctrl+D'), rule, run('freeTransform','자유 변형','Ctrl+T')])}
${menu('보기', [run('zoomIn','확대','Ctrl++'), run('zoomOut','축소','Ctrl+−'), run('zoomValue','100%로 보기'), run('fit','화면 맞춤','Ctrl+0'), rule, run('mirrorView','보기 좌우 반전','M','mirror'), run('whiteBackground','흰색 배경으로 보기','','white'), rule, own('toggleRailLabels','도구 이름 표시','','railLabels'), run('toggleCuts','컷 목록 표시','','cuts'), run('toggleSidebar','레이어 패널 표시','','sidebar')])}
${menu('레이어', [run('addLayer','새 레이어'), run('duplicateLayer','레이어 복제'), rule, run('layerUp','위로 이동'), run('layerDown','아래로 이동'), run('renameLayer','이름 변경'), run('deleteLayer','레이어 삭제'), rule, run('flipLayer','레이어 좌우 반전'), run('invertRGB','RGB 반전')])}
${menu('설정', [own('settings','환경 설정 · 프리셋'), own('brushTest','브러시 테스트'), own('diagnostics','성능 진단'), rule, own('help','사용법 · 단축키')])}
</nav>
<div class="document"><span id="docName">제목 없음</span><span id="dirty" class="dirty-dot" title="저장하지 않은 변경 사항" hidden></span><span class="doc-type">.mpaint</span></div>
<div class="quick-actions">${button('undo','실행 취소 (Ctrl+Z)','undo','class="icon-only"')}${button('redo','다시 실행 (Ctrl+Y)','redo','class="icon-only"')}<span class="divider"></span>${button('save','저장 (Ctrl+S)','save','','저장')}${button('export','내보내기 (PNG · PSD)','export','class="export-button"','내보내기')}</div></header>
<div class="workspace" id="workspace"><aside class="toolrail" aria-label="도구">${TOOL_GROUPS.map(([title, tools]) => `<div class="tool-group-title">${title}</div>${tools.map(toolButton).join('')}`).join('')}
<div class="rail-colors"><div class="color-pair"><label class="rail-color" title="전경색"><input id="color" type="color" value="#283747" aria-label="브러시 색상"></label><label class="rail-background" title="배경색"><input id="backgroundColor" type="color" value="#ffffff" aria-label="배경색 슬롯"></label></div><button id="swapColors" title="전경색·배경색 교환 (X)" aria-label="전경색·배경색 교환">⇄</button><button id="resetColor" class="color-reset" title="기본 색상으로 변경" aria-label="기본 색상으로 변경"><i></i><i></i></button><span id="colorHex">#283747</span><div id="palette" class="palette" aria-label="컬러 팔레트"></div></div></aside>
<main class="drawing-area"><div class="optionsbar" id="toolOptions" aria-label="도구 설정">
<label><span class="picker-label">도구</span><select id="brushTool" aria-label="현재 도구">${TOOL_GROUPS.map(([title, tools]) => `<optgroup label="${title}">${tools.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</optgroup>`).join('')}</select></label>
<label id="brushSizeOptions">크기 <input id="size" type="range" min="1" max="100" value="8"><input id="sizeNumber" data-range="size" class="numeric" type="number" min="1" max="100" step="1" value="8" aria-label="브러시 크기 숫자" title="브러시 크기 ( [ / ] )"><span class="numeric-unit">px</span><output id="sizeValue" hidden>8 px</output></label>
<label id="opacityOptions">불투명도 <input id="brushOpacity" type="range" min="0" max="100" value="100"><input id="brushOpacityNumber" data-range="brushOpacity" class="numeric" type="number" min="0" max="100" value="100" aria-label="브러시 불투명도 숫자"><span class="numeric-unit">%</span><output id="brushOpacityValue" hidden>100%</output></label>
<label id="textureOptions" hidden><span id="textureLabel">질감</span><input id="brushTexture" type="range" min="0" max="100"><input id="brushTextureNumber" data-range="brushTexture" class="numeric" type="number" min="0" max="100" aria-label="브러시 질감 숫자"><span class="numeric-unit">%</span></label>
<div id="bucketOptions" hidden><label>허용 오차 <input id="bucketToleranceRange" type="range" min="0" max="100" value="0" aria-label="채우기 허용 오차 슬라이더"><input id="bucketTolerance" type="number" min="0" max="100" value="0" aria-label="채우기 허용 오차"></label><label>확장 <input id="bucketExpand" type="number" min="0" max="5" value="0" aria-label="채우기 확장"><span class="numeric-unit">px</span></label><label><input id="bucketContiguous" type="checkbox" checked> 인접 영역</label><label>참조 <select id="bucketReference"><option value="layer">현재 레이어</option><option value="visible">보이는 모든 레이어</option></select></label></div>
<div id="selectOptions" class="option-group" aria-label="선택 영역 작업" hidden><button id="freeTransform" title="자유 변형 (Ctrl+T)">자유 변형</button><button id="selectAll" title="전체 선택 (Ctrl+A)">전체 선택</button><button id="deselect" title="선택 해제 (Ctrl+D)">선택 해제</button><button id="copySelection" title="복사 (Ctrl+C)">복사</button><button id="cutSelection" title="잘라내기 (Ctrl+X)">잘라내기</button><button id="pasteSelection" title="새 레이어로 붙여넣기 (Ctrl+V)">붙여넣기</button><button id="clearSelection" title="선택 내용 지우기 (Delete)">지우기</button></div>
<label id="moveOptions" hidden><input id="moveHidden" type="checkbox" checked> 숨긴 레이어 포함</label>
<button id="moveTransform" title="자유 변형 (Ctrl+T)" hidden>자유 변형</button>
<select id="toolSetMenu" aria-label="도구 세트 프리셋" title="도구 세트 적용"><option value="">도구 세트</option></select></div>
<div id="stage" tabindex="0" aria-label="그리기 작업 공간"><div id="paper" class="white"><canvas id="view" width="1600" height="1200" aria-label="그림 캔버스"></canvas><div id="guideOverlay" aria-hidden="true" hidden></div><div id="selectionOverlay" aria-hidden="true" hidden></div></div><div id="brushCursor"></div></div>
<section class="cut-panel" id="cutPanel" aria-label="컷 관리"><div id="cutResize" role="separator" aria-orientation="horizontal" aria-label="컷 패널 높이" aria-valuemin="${CUT_MIN}" aria-valuemax="${CUT_MAX}" tabindex="0"></div><div class="cut-heading"><button id="toggleCuts" aria-controls="cutList" aria-expanded="true">▾</button><strong>컷 <span id="cutCount">1</span></strong><span class="cut-current">현재 <span id="currentCutLabel">컷 1</span></span><div class="cut-actions">${button('addCut','새 컷','plus')}${button('duplicateCut','컷 복제','copy','','복제')}${button('previousLayers','이전 컷 레이어 복제','layers','','이전 컷 레이어')}<span class="divider"></span>${button('cutLeft','컷 앞으로','left','class="icon-only"')}${button('cutRight','컷 뒤로','right','class="icon-only"')}${button('renameCut','컷 이름 변경','pen','','이름')}${button('deleteCut','컷 삭제','trash','','삭제')}</div></div><div id="cutList" aria-label="컷 목록"></div></section>
<footer class="statusbar"><span id="statusText" class="status-main">준비</span><span id="coordinates">—, — px</span><span id="dimensions">1600 × 1200 px</span><span id="canvasLabel">4:3</span><span id="autoStatus">자동 저장 대기</span><div class="zoom-controls">${button('mirrorView','보기 좌우 반전 (M)','mirror','aria-pressed="false"','반전')}${button('zoomOut','축소 (Ctrl+−)','minus','class="icon-only"')}<button id="zoomValue" title="100%로 보기">100%</button>${button('zoomIn','확대 (Ctrl++)','plus','class="icon-only"')}${button('fit','화면 맞춤 (Ctrl+0)','fit','class="icon-only"')}</div></footer></main>
<div id="sidebarResize" role="separator" aria-label="레이어 패널 너비" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="520" tabindex="0"><button id="toggleSidebar" aria-controls="sidebar" aria-expanded="true" aria-label="레이어 패널 접기·펼치기">›</button></div>
<aside class="sidebar" id="sidebar" aria-label="레이어 패널"><section class="layers-panel"><div class="section-heading"><h2>레이어 <span id="layerCount">1</span></h2><select id="layerDensity" aria-label="레이어 행 높이" title="레이어 행 높이"><option value="normal">기본 48px</option><option value="compact">간결 36px</option></select></div>
<div class="layer-toolbar">${button('addLayer','레이어 추가','plus','','새 레이어')}${button('duplicateLayer','레이어 복제','copy','','복제')}<span class="spacer"></span>${button('layerUp','레이어 위로','up','class="icon-only"')}${button('layerDown','레이어 아래로','down','class="icon-only"')}${button('renameLayer','레이어 이름 변경 (행 더블클릭)','pen','class="icon-only"')}${button('deleteLayer','레이어 삭제','trash','class="icon-only"')}</div>
<div class="layer-opacity slider-row"><label for="layerOpacity">불투명도</label><input id="layerOpacity" type="range" min="0" max="100" value="100"><input id="layerOpacityNumber" data-range="layerOpacity" class="numeric" type="number" min="0" max="100" aria-label="레이어 불투명도 숫자"><span class="numeric-unit">%</span><output hidden id="layerOpacityValue">100%</output></div>
<div id="layerList" role="list" aria-label="레이어 목록"></div>
<div class="layer-edit-actions">${button('flipLayer','레이어 좌우 반전','mirror','','좌우 반전')}<button id="invertRGB" title="RGB 색상 반전">RGB 반전</button></div></section>
<details id="screenSettings"><summary>작업 화면 · 종이 가이드</summary><section class="background-panel"><label>흰색 배경 <input id="whiteBackground" type="checkbox" checked role="switch"></label><label>가이드 표시 <input id="guideVisible" type="checkbox" checked role="switch"></label><label>종류 <select id="guideType" aria-label="종이 가이드"><option value="none">없음</option><option value="grid">격자</option><option value="ruled">줄노트</option><option value="dots">점 가이드</option></select></label><label>색상 <select id="guideColor" aria-label="가이드 색상"><option value="blue">연한 파랑</option><option value="gray">회색</option></select></label>
<div class="slider-row"><label for="guideSpacing">간격</label><input id="guideSpacing" type="range" min="8" max="64" value="24"><input id="guideSpacingNumber" data-range="guideSpacing" class="numeric" type="number" min="8" max="64" aria-label="가이드 간격 숫자"><span class="numeric-unit">px</span><output hidden id="guideSpacingValue">24 px</output></div>
<div class="slider-row"><label for="guideOpacity">진하기</label><input id="guideOpacity" type="range" min="10" max="80" value="30"><input id="guideOpacityNumber" data-range="guideOpacity" class="numeric" type="number" min="10" max="80" aria-label="가이드 진하기 숫자"><span class="numeric-unit">%</span><output hidden id="guideOpacityValue">30%</output></div>
<small>배경과 가이드는 PNG·PSD 픽셀에 포함되지 않습니다.</small></section></details></aside></div>
<div id="toast" role="status" hidden></div><input id="fileInput" type="file" accept=".mpaint,.json,application/json" hidden><input id="imageInput" type="file" accept="image/png" hidden>
<dialog id="newDialog"><form method="dialog"><h2>새 캔버스</h2><p>저장하지 않은 작업이 있으면 바꾸기 전에 확인합니다.</p><label class="preset-label" for="canvasPreset">캔버스 프리셋</label><select id="canvasPreset">${PRESETS.map(p=>`<option value="${p.id}">${p.label}</option>`).join('')}<option value="custom">사용자 지정</option></select><div id="newSizeInfo" class="size-info"></div><div class="measure-options"><label>단위 <select id="canvasUnit"><option value="px">px</option><option value="mm">mm</option></select></label><label>DPI <input id="newDpi" type="number" min="36" max="1200" value="96"></label><label>방향 <select id="canvasOrientation"><option value="portrait">세로</option><option value="landscape">가로</option></select></label></div><div id="newPrintInfo" class="size-info"></div><div class="dimension-fields"><label>가로 <input id="newWidth" type="number" min="1" max="4096" value="1600" required> <span class="dimensionUnit">px</span></label><span>×</span><label>세로 <input id="newHeight" type="number" min="1" max="4096" value="1200" required> <span class="dimensionUnit">px</span></label></div><div class="preset-buttons"><button type="button" data-preset="1600,1200">기본 4:3</button><button type="button" data-preset="1920,1080">와이드 16:9</button><button type="button" data-preset="1200,1200">정사각형</button></div><div class="dialog-actions"><button value="cancel">취소</button><button id="createDocument" value="create" class="primary">캔버스 만들기</button></div></form></dialog>
<dialog id="exportDialog"><form method="dialog"><h2>내보내기</h2><p>현재 컷을 PNG 또는 레이어 PSD로 저장합니다.<br><span id="exportSize"></span></p><fieldset class="png-options"><legend>PNG 옵션</legend><label class="export-option"><input type="radio" name="exportBg" value="transparent" checked> 투명 배경 <span class="checker-icon"></span></label><label class="export-option"><input type="radio" name="exportBg" value="white"> 흰색 배경</label><label class="export-option"><input id="pngDpi" type="checkbox" checked>DPI 메타데이터 포함</label></fieldset><div class="dialog-actions"><button value="cancel">취소</button><button id="downloadPsd" type="button">PSD 저장</button><button id="downloadPng" class="primary" value="export">PNG 저장</button></div></form></dialog>
<dialog id="helpDialog"><h2>사용법 · 단축키</h2><p>왼쪽에서 도구를 고르면 위쪽 막대에 그 도구의 설정만 표시됩니다. 모든 명령은 상단 메뉴에도 있습니다.<br>레이어 이름 변경: 행 더블클릭 · 순서 변경: 행 드래그 · 패널 경계를 끌어 크기 조절</p><dl class="shortcuts"><dt>B / E / G</dt><dd>펜 / 지우개 / 페인트통</dd><dt>S / V / I / H</dt><dd>사각형 선택 / 레이어 이동 / 스포이트 / 화면 이동</dd><dt>[ / ]</dt><dd>브러시 크기</dd><dt>X</dt><dd>전경색·배경색 교환</dd><dt>M</dt><dd>보기 좌우 반전</dd><dt>Space + 드래그</dt><dd>화면 이동</dd><dt>Ctrl + 휠 / + / − / 0</dt><dd>확대·축소 / 화면 맞춤</dd><dt>Ctrl + Z / Y</dt><dd>실행 취소 / 다시 실행 (Ctrl + Shift + Z)</dd><dt>Ctrl + A / D</dt><dd>전체 선택 / 선택 해제</dd><dt>Ctrl + C / X / V</dt><dd>선택 복사 / 잘라내기 / 새 레이어로 붙여넣기</dd><dt>Ctrl + T</dt><dd>자유 변형 · Enter 확정 · Escape 취소</dd><dt>Delete</dt><dd>선택 영역 지우기 · 선택이 없으면 레이어 지우기</dd><dt>Escape</dt><dd>진행 중인 이동 · 선택 · 채우기 취소</dd><dt>Ctrl + S / Shift + S</dt><dd>저장 / 다른 이름으로 저장</dd><dt>Ctrl + O / N</dt><dd>열기 / 새 캔버스</dd></dl><p class="muted">선택 도구에서 선택 영역 안쪽을 끌면 선택한 픽셀이 이동합니다. 전체 그림 이동은 숨긴 레이어 포함 여부를 위쪽 막대에서 정합니다.<br>자동 복구는 프로젝트 파일 저장을 대신하지 않습니다. 압력 감지·손떨림 보정은 적용하지 않습니다.</p><form method="dialog"><button class="primary">닫기</button></form></dialog>
<dialog id="recoveryDialog"><h2>자동 저장된 작업 복구</h2><p>이 기기에 자동 저장한 작업이 있습니다. 이어서 작업할까요?</p><div class="dialog-actions"><button id="discardRecovery">새로 시작</button><button id="restoreRecovery" class="primary">작업 복구</button></div></dialog>
<dialog id="diagnosticDialog"><h2>성능 진단</h2><p>현재 브라우저의 실제 측정값입니다. 입력 지연은 이벤트 처리부터 다음 렌더 완료까지이며, 화면 표시·기기 자체 지연은 포함하지 않습니다.</p><pre id="metrics"></pre><form method="dialog"><button class="primary">닫기</button></form></dialog>`;
document.querySelector('#app')!.insertAdjacentHTML('beforeend', `<dialog id="settingsDialog"><h2>환경 설정 · 프리셋</h2><p>브라우저에 도구·작업 설정만 저장합니다. 픽셀 데이터는 포함하지 않습니다.</p><label>종류 <select id="presetKind"><option value="brush">브러시</option><option value="work">작업</option><option value="toolset">도구 세트</option></select></label><label>이름 <input id="presetName" type="text" maxlength="100" placeholder="프리셋 이름"></label><select id="userPresetList" size="5" aria-label="사용자 프리셋"></select><div class="preset-commands"><button id="addPreset">추가</button><button id="renamePreset">이름 변경</button><button id="overwritePreset">도구 세트 덮어쓰기</button><button id="deletePreset">삭제</button><button id="applyPreset" class="primary">적용</button></div><p>작업 프리셋 적용은 새 캔버스를 만듭니다. 현재 작업은 먼저 저장하세요.</p><div class="preset-commands"><button id="exportPresets">JSON 내보내기</button><button id="importPresets">JSON 가져오기</button></div><form method="dialog"><button>닫기</button></form></dialog><input id="presetFileInput" type="file" accept=".json,application/json" hidden><dialog id="psdProgressDialog"><h2>PSD 내보내기</h2><p id="psdProgress" role="status">준비 중</p><progress id="psdProgressBar" max="100" value="0"></progress><button id="cancelPsd">취소</button></dialog>`);
const sidebar = document.querySelector<HTMLElement>('.sidebar')!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
let app = new Paint(), story = new Storyboard(app);
const view = $<HTMLCanvasElement>('view'), paper = $('paper'), stage = $('stage');
let preferences=defaults(),preferencesError='';try{preferences=loadToolPreferences();}catch(e){preferencesError=String(e);}
let invertPreview:InvertPreview|null=null,fillAbort:AbortController|null=null;
let tool: Tool = 'pen', size = preferences.tools.pen.size, brushOpacity = preferences.tools.pen.opacity, color = preferences.foreground;
let thumbnailDirty = true;
let mirrored=false,mover:LayerMove|PixelMove|null=null;
let free:FreeTransform|null=null;
let selection:Rect|null=null,selectionLayer='',selecting:{x:number;y:number;previous:Rect|null}|null=null;
const clipboard=new SelectionClipboard();
const layerList=new LayerList($('layerList'), {
  editable:()=>!busy && pointer===null && !free && !invertPreview,
  select:l=>safe(()=>{app.active=l.id;ui();}), rename:l=>safe(()=>rename(l.id)),
  toggle:l=>safe(()=>app.property(l,'visible',!l.visible)),
  reorder:(from,to)=>safe(()=>{const source=app.layers.find(l=>l.id===from),target=app.layers.find(l=>l.id===to);if(!source||!target||source===target)return;
    app.structure('레이어 순서 변경',()=>{const index=app.layers.indexOf(target);app.layers.splice(app.layers.indexOf(source),1);app.layers.splice(index,0,source);app.active=source.id;});})
});
let lastDrawingTool:BrushTool='pen';
let zoom = 1, panX = 0, panY = 0, space = false, pointer: number | null = null, panning: { x: number; y: number; panX: number; panY: number } | null = null;
let name = '제목 없음', revision = 0, savedRevision = 0, autoRevision = 0, documentEpoch = 0;
let fileHandle: any = null, busy = false, saving = false, pendingFrame = 0, inputAt = 0;
let autoFailed = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined, autoWriting = false, db: IDBDatabase | null = null;
const frames: number[] = [], latencies: number[] = [];
function notify(message: string) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
let toastTimer: ReturnType<typeof setTimeout>;
function safe(action: () => void) { try { if (!busy && pointer === null && !free && !invertPreview) action(); } catch (e) { notify(error(e)); } }
function renderSelection() {
  const r=mover instanceof PixelMove && tool==='select'?mover.selection:selection, overlay=$('selectionOverlay');
  overlay.hidden=!!free||!r;
  if(r)Object.assign(overlay.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`,borderWidth:`${1/zoom}px`,boxShadow:`0 0 0 ${1/zoom}px white`});
}
function selectionButtons() {
  const locked=busy || pointer!==null || !!free;
  for(const id of ['deselect','copySelection','cutSelection','clearSelection'])$<HTMLButtonElement>(id).disabled=locked || !selection;
  $<HTMLButtonElement>('selectAll').disabled=locked;$<HTMLButtonElement>('pasteSelection').disabled=locked || !clipboard.available;
}
function selectAll() { selection={x:0,y:0,width:app.width,height:app.height};selectionLayer=app.active;setTool('select');renderSelection();selectionButtons(); }
function deselect() { selection=null;renderSelection();selectionButtons(); }
function copySelection(cut=false) {
  if(!selection)return;clipboard.copy(app,selection);
  if(cut)clearRegion(app,selection);
  selectionButtons();void clipboard.writeSystem().catch(()=>notify('시스템 클립보드에 복사하지 못했습니다. 앱 안에서는 붙여넣을 수 있습니다.'));
}
function pasteSelection() { const r=clipboard.paste(app);if(r){selection=r;selectionLayer=app.active;setTool('select');renderSelection();selectionButtons();} }
for(const [id,action] of [['selectAll',selectAll],['deselect',deselect],['copySelection',()=>copySelection()],['cutSelection',()=>copySelection(true)],['pasteSelection',pasteSelection],['clearSelection',()=>{if(selection)clearRegion(app,selection);}]] as const)$(id).onclick=()=>safe(action);
function error(e: unknown) { return e instanceof Error ? e.message : String(e); }
// Transform UI is outside the pixel engine. Ordinary drawing never allocates its buffers.
stage.before(Object.assign(document.createElement('div'),{id:'transformControls',className:'transform-actions',hidden:true}));
$('transformControls').innerHTML=`<label><input id="transformLock" type="checkbox" checked> 비율 고정</label><label>너비 <input id="transformWidth" type="number" min="0.001" step="any" aria-label="변형 너비"></label><label>높이 <input id="transformHeight" type="number" min="0.001" step="any" aria-label="변형 높이"></label><select id="transformUnit" aria-label="변형 크기 단위"><option value="px">px</option><option value="percent">%</option></select><label>각도 <input id="transformAngle" type="number" min="-36000" max="36000" step="any" value="0" aria-label="변형 각도">°</label><button id="applyTransform">확정 (Enter)</button><button id="cancelTransform">취소 (Esc)</button><span id="transformSource"></span>`;
paper.insertAdjacentHTML('beforeend',`<div id="transformOverlay" hidden aria-label="자유 변형"><div id="transformFrame"></div>${['nw','ne','sw','se'].map(h=>`<span class="transform-handle ${h}" data-transform-handle="${h}" aria-label="${h} 크기 조절"></span>`).join('')}<span class="transform-handle rotate" data-transform-handle="rotate" aria-label="회전"></span></div>`);
function syncTransformNumbers(force=false){
  if(!free)return;const s=free.state,percent=($('transformUnit') as HTMLSelectElement).value==='percent';
  for(const [id,value] of [['transformWidth',percent?s.width/free.sourceWidth*100:s.width],['transformHeight',percent?s.height/free.sourceHeight*100:s.height],['transformAngle',s.angle]] as const)
    if(force||document.activeElement!==input(id))input(id).value=String(Number(value.toFixed(4)));
  for(const el of $('transformControls').querySelectorAll<HTMLInputElement>('input[type=number]'))el.setCustomValidity('');
}
function renderTransform(){
  const overlay=$('transformOverlay');overlay.hidden=!free;
  if(!free)return;const s=free.state;
  Object.assign(overlay.style,{left:`${s.cx-s.width/2}px`,top:`${s.cy-s.height/2}px`,width:`${s.width}px`,height:`${s.height}px`,transform:`rotate(${s.angle}deg)`});
  overlay.style.setProperty('--handle-size',`${10/zoom}px`);overlay.style.setProperty('--transform-line',`${1/zoom}px`);overlay.style.setProperty('--rotate-offset',`${26/zoom}px`);
}
function transformLockUI(){
  const locked=!!free;
  stage.classList.toggle('transforming',locked);
  for(const selector of ['.sidebar','.toolrail','.menus','.quick-actions','.cut-panel','#toolOptions'])document.querySelectorAll<HTMLElement>(selector).forEach(el=>el.inert=locked);
  // The transform bar takes the context bar's place, so the stage does not move.
  $('toolOptions').hidden=locked;$('transformControls').hidden=!locked;$('selectionOverlay').hidden=locked||!selection;
}
function beginTransform(imported?:ImportSource){
  if(free||busy||pointer!==null||saving)return;
  try{free=new FreeTransform(app,imported?null:selection,imported);input('transformLock').checked=true;($('transformUnit') as HTMLSelectElement).value='px';
    const origin=app.selected.imageSource;$('transformSource').textContent=`기준 ${free.sourceWidth} × ${free.sourceHeight} px`+(origin?` · 원본 ${origin.width} × ${origin.height} px`:'');
    transformLockUI();syncTransformNumbers(true);renderTransform();ui();stage.focus({preventScroll:true});
  }catch(e){notify(error(e));}
}
function endTransform(apply:boolean){
  if(!free)return;
  if(apply && [...$('transformControls').querySelectorAll<HTMLInputElement>('input[type=number]')].some(el=>!el.validity.valid||!el.value.trim())){notify('올바른 변형 수치를 입력하세요.');return;}
  const editing=free;
  if(pointer!==null){const id=pointer;pointer=null;if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);}
  try{if(apply)editing.finish();else editing.cancel();}
  catch(e){editing.cancel();notify(error(e));}
  finally{free=null;selection=apply?null:selection;transformLockUI();renderSelection();renderTransform();layerList.invalidate([app.selected]);ui();render();stage.focus({preventScroll:true});}
}
function transformDown(e:PointerEvent){
  if(!free||pointer!==null||e.button!==0)return;
  const p=coordinates(e),target=(e.target as HTMLElement).dataset.transformHandle as TransformHandle|undefined;
  if(!target && !free.hit(p.x,p.y))return;
  e.preventDefault();stage.focus({preventScroll:true});free.begin(target??'move',p.x,p.y);pointer=e.pointerId;stage.setPointerCapture(e.pointerId);
}
for(const [id,axis] of [['transformWidth','width'],['transformHeight','height'],['transformAngle','angle']] as const){
  input(id).oninput=()=>{
    if(!free)return;const field=input(id);field.setCustomValidity('');
    if(!field.value.trim()||!Number.isFinite(field.valueAsNumber)){field.setCustomValidity('숫자를 입력하세요.');return;}
    try{if(axis==='angle')free.set({angle:field.valueAsNumber});else{const percent=($('transformUnit') as HTMLSelectElement).value==='percent';free.resize(axis,field.valueAsNumber*(percent?(axis==='width'?free.sourceWidth:free.sourceHeight)/100:1),input('transformLock').checked);}
      syncTransformNumbers();renderTransform();
    }catch(e){field.setCustomValidity(error(e));notify(error(e));}
  };
}
$('transformUnit').onchange=()=>syncTransformNumbers(true);
$('applyTransform').onclick=()=>endTransform(true);$('cancelTransform').onclick=()=>endTransform(false);$('freeTransform').onclick=()=>safe(()=>beginTransform());
function render() { if (!pendingFrame) pendingFrame = requestAnimationFrame(draw); }
function draw() {
  pendingFrame = 0; if (busy) return; const start = performance.now(); free?.flush(); mover?.flush(); if(mover)renderSelection(); app.flush();
  if (view.width !== app.width || view.height !== app.height) { view.width = app.width; view.height = app.height; }
  const c = ctx(view); c.clearRect(0, 0, view.width, view.height);
  for (const l of app.layers) if (l.visible) { c.globalAlpha = l.opacity; c.drawImage(l.canvas, 0, 0); }
  c.globalAlpha = 1;
  if (thumbnailDirty && !app.stroke && !mover && !free) {
    const thumb=thumbnailCanvas(app.width,app.height);ctx(thumb).drawImage(view,0,0,thumb.width,thumb.height);
    story.current.thumbnail=thumb.toDataURL('image/png');thumbnailDirty=false;renderCuts();
  }
  frames.push(performance.now() - start); if (frames.length > 180) frames.shift();
  if (inputAt) { latencies.push(performance.now() - inputAt); if (latencies.length > 180) latencies.shift(); inputAt = 0; }
}
function bindEngine() { app = story.paint; app.render = render; app.changed = changed; thumbnailDirty = true; selection=null;selectionLayer='';layerList.reset();renderSelection(); }
bindEngine();
function ui() {
  syncGuide();
  renderCuts();
  syncNumbers();
  $('docName').textContent = name; $('dirty').hidden = revision === savedRevision;
  ($('undo') as HTMLButtonElement).disabled = !app.history.past.length || busy || pointer !== null || !!free;
  ($('redo') as HTMLButtonElement).disabled = !app.history.future.length || busy || pointer !== null || !!free;
  $('layerCount').textContent = String(app.layers.length); $('dimensions').textContent = `${app.width} × ${app.height} px`; $('canvasLabel').textContent = ratio(app.width,app.height);
  if(selectionLayer!==app.active){selection=null;selectionLayer=app.active;renderSelection();}
  layerList.sync(app,pointer!==null || !!app.stroke || !!mover || !!free);
  selectionButtons();
  input('layerOpacity').value = String(Math.round(app.selected.opacity * 100)); $('layerOpacityValue').textContent = `${Math.round(app.selected.opacity * 100)}%`;
  ($('deleteLayer') as HTMLButtonElement).disabled = app.layers.length <= 1;
  ($('layerUp') as HTMLButtonElement).disabled = app.layers.indexOf(app.selected) === app.layers.length - 1;
  ($('layerDown') as HTMLButtonElement).disabled = app.layers.indexOf(app.selected) === 0;syncNumbers();
}
function changed(layers=app.layers) { layerList.invalidate(layers); revision++; thumbnailDirty = true; const trimmed=story.enforceHistoryBudget(); ui(); scheduleAuto(); if (app.history.discarded || trimmed) notify('프로젝트 히스토리 메모리 한도로 오래된 실행 취소 기록을 정리했습니다.'); }
function transform() {
  story.current.view = {zoom,panX,panY};
  paper.style.width = `${app.width}px`; paper.style.height = `${app.height}px`; paper.style.transform = paperTransform(app.width,zoom,panX,panY,mirrored);
  $('zoomValue').textContent = `${Math.round(zoom * 100)}%`; updateCursor(); renderSelection(); renderTransform();
}
function fit() { zoom = Math.max(.1, Math.min(8, (stage.clientWidth - 48) / app.width, (stage.clientHeight - 48) / app.height)); panX = (stage.clientWidth - app.width * zoom) / 2; panY = (stage.clientHeight - app.height * zoom) / 2; transform(); }
function setZoom(next: number, x = stage.clientWidth / 2, y = stage.clientHeight / 2) { next = Math.max(.1, Math.min(8, next)); panX = x - (x - panX) * next / zoom; panY = y - (y - panY) * next / zoom; zoom = next; transform(); }
function coordinates(e: { clientX: number; clientY: number }) { return canvasPoint(e,paper.getBoundingClientRect(),zoom,app.width,mirrored); }
function updateCursor() { $('brushCursor').style.width = $('brushCursor').style.height = `${Math.max(3, size * zoom)}px`; stage.dataset.tool = space ? 'hand' : tool; }
function setTool(next: Tool) {
  if (pointer !== null || free || busy || invertPreview) return; const previous = tool; tool = next;
  if(isBrush(next)){size=preferences.tools[next].size;brushOpacity=preferences.tools[next].opacity;lastDrawingTool=next;}else if(next==='bucket')brushOpacity=preferences.bucket.opacity;
  for (const t of previous === next ? [next] : [previous, next]) { $(t).classList.toggle('active', t === tool); $(t).setAttribute('aria-pressed', String(t === tool)); }
  ($('brushTool') as HTMLSelectElement).value = tool; brushUI(true);toolOptions();
}
function persistTools(){try{saveToolPreferences(preferences);}catch(e){notify(`도구 설정 저장 실패: ${error(e)}`);}}
function setColor(value: string) { color = value; preferences.foreground=value;persistTools(); input('color').value = value; $('colorHex').textContent = value.toUpperCase(); document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(b => b.classList.toggle('selected', b.dataset.color === value)); }
function brushUI(force=false) { input('brushOpacity').value=String(Math.round(brushOpacity*100)); $('sizeValue').textContent = `${size} px`; input('size').value = String(size); $('brushOpacityValue').textContent = `${Math.round(brushOpacity * 100)}%`; syncNumbers();if(force){for(const [id,value]of [['sizeNumber',size],['brushOpacityNumber',Math.round(brushOpacity*100)]] as const){input(id).value=String(value);input(id).setCustomValidity('');}} updateCursor(); }
const colors = ['#283747','#747c88','#c2c5ca','#ffffff','#ee6c55','#f2ad71','#e6c86a','#99b89b','#668fbd','#9184b3','#d39ab4','#8c6b57'];
for (const value of colors) { const b = document.createElement('button'); b.className = 'swatch'; b.dataset.color = value; b.style.background = value; b.title = value; b.setAttribute('aria-label', `색상 ${value}`); b.onclick = () => setColor(value); $('palette').append(b); }
setColor(color); brushUI();
$('brushTool').onchange = () => { setTool(($('brushTool') as HTMLSelectElement).value as Tool); ($('brushTool') as HTMLSelectElement).value = tool; };
input('color').oninput = () => setColor(input('color').value); input('backgroundColor').value=preferences.background;
input('backgroundColor').oninput=()=>{preferences.background=input('backgroundColor').value;persistTools();};
function swapColors(){const old=color,next=preferences.background;preferences.background=old;input('backgroundColor').value=old;setColor(next);}
$('swapColors').onclick=()=>safe(swapColors);$('resetColor').onclick=()=>safe(()=>{preferences.background='#ffffff';input('backgroundColor').value=preferences.background;setColor('#283747');});
input('size').oninput = () => { if(!isBrush(tool))return;size = Number(input('size').value);preferences.tools[tool].size=size;persistTools();brushUI();syncToolOverview(); };
input('brushOpacity').oninput = () => { brushOpacity = Number(input('brushOpacity').value) / 100;if(isBrush(tool))preferences.tools[tool].opacity=brushOpacity;else if(tool==='bucket')preferences.bucket.opacity=brushOpacity;persistTools();brushUI();syncToolOverview(); };
for (const [t] of TOOLS) $(t).onclick = () => setTool(t);
const labels:Record<BrushTool,string>={pen:'펜',pencil:'기본 연필','dark-pencil':'진한 연필',eraser:'지우개','rough-ink':'거친 잉크펜','felt-tip':'싸인펜',ballpoint:'볼펜'};
stage.insertAdjacentHTML('afterend','<div id="fillProgress" role="status" hidden><span id="fillStatus">채우기 준비</span><progress id="fillProgressBar" max="100" value="0"></progress><button id="cancelFill">취소 (Esc)</button></div>');
document.querySelector('#settingsDialog .preset-commands')!.insertAdjacentHTML('beforebegin',`<table id="toolOverview"><caption>도구별 설정</caption><thead><tr><th>도구</th><th>크기 (px)</th><th>불투명도 (%)</th><th>질감 (%)</th></tr></thead><tbody>${BRUSHES.map(t=>`<tr><th>${labels[t]}</th><td><input id="tool-${t}-size" type="number" min="1" max="100" aria-label="${labels[t]} 크기"></td><td><input id="tool-${t}-opacity" type="number" min="0" max="100" aria-label="${labels[t]} 불투명도"></td><td>${isBasicBrush(t)?`<input id="tool-${t}-texture" type="number" min="0" max="100" aria-label="${labels[t]} 질감">`:"—"}</td></tr>`).join('')}</tbody></table>`);
document.querySelector('#app')!.insertAdjacentHTML('beforeend','<dialog id="invertDialog"><h2>RGB 색상 반전</h2><p>선택 영역이 있으면 해당 영역만 반전합니다. 알파는 유지합니다.</p><div class="dialog-actions"><button id="cancelInvert">취소</button><button id="applyInvert" class="primary">적용</button></div></dialog>');
function toolOptions(){
  $('textureOptions').hidden=!isBasicBrush(tool);if(isBasicBrush(tool)){const amount=readTexture(tool,preferences.tools[tool].texture).amount;input('brushTexture').value=input('brushTextureNumber').value=String(amount);input('brushTextureNumber').setCustomValidity('');$('textureLabel').textContent=tool==='rough-ink'?'외곽 거칠기':tool==='felt-tip'?'가장자리 부드러움':'농도 변화';}
  $('brushSizeOptions').hidden=!isBrush(tool);$('opacityOptions').hidden=!isBrush(tool)&&tool!=='bucket';$('bucketOptions').hidden=tool!=='bucket';
  $('selectOptions').hidden=tool!=='select';$('moveOptions').hidden=tool!=='move-artwork';$('moveTransform').hidden=tool!=='move-layer';$('toolSetMenu').hidden=!isBrush(tool);
  input('bucketTolerance').value=input('bucketToleranceRange').value=String(preferences.bucket.tolerance);input('bucketExpand').value=String(preferences.bucket.expand);input('bucketContiguous').checked=preferences.bucket.contiguous;($('bucketReference') as HTMLSelectElement).value=preferences.bucket.reference;
  input('bucketTolerance').setCustomValidity('');input('bucketExpand').setCustomValidity('');updateCursor();
}
function syncToolOverview(){for(const t of BRUSHES)for(const key of ['size','opacity'] as const){const el=input(`tool-${t}-${key}`);if(document.activeElement!==el)el.value=String(key==='size'?preferences.tools[t].size:Math.round(preferences.tools[t].opacity*100));}for(const t of BASIC_BRUSHES){const el=input(`tool-${t}-texture`);if(document.activeElement!==el)el.value=String(readTexture(t,preferences.tools[t].texture).amount);}}
for(const t of BRUSHES)for(const key of ['size','opacity'] as const)input(`tool-${t}-${key}`).onchange=()=>{
  const field=input(`tool-${t}-${key}`),value=field.valueAsNumber;
  if(!field.value.trim()||!field.validity.valid||!Number.isInteger(value)){field.value=String(key==='size'?preferences.tools[t].size:preferences.tools[t].opacity*100);return;}
  preferences.tools[t][key]=key==='size'?value:value/100;
  if(tool===t){size=preferences.tools[t].size;brushOpacity=preferences.tools[t].opacity;brushUI();}persistTools();
};
input('brushTexture').oninput=()=>{if(!isBasicBrush(tool))return;preferences.tools[tool].texture=readTexture(tool,{version:1,amount:Number(input('brushTexture').value)});persistTools();syncToolOverview();};
for(const t of BASIC_BRUSHES)input(`tool-${t}-texture`).onchange=()=>{const field=input(`tool-${t}-texture`);if(!field.value.trim()||!field.validity.valid||!Number.isInteger(field.valueAsNumber)){field.value=String(readTexture(t,preferences.tools[t].texture).amount);return;}preferences.tools[t].texture=readTexture(t,{version:1,amount:field.valueAsNumber});persistTools();if(tool===t)toolOptions();};
for(const [id,key,max]of [['bucketTolerance','tolerance',100],['bucketExpand','expand',5]] as const){
  input(id).oninput=()=>{const field=input(id),value=field.valueAsNumber;field.setCustomValidity('');if(!field.value.trim()||!Number.isInteger(value)||value<0||value>max){field.setCustomValidity(`0~${max} 정수를 입력하세요.`);return;}preferences.bucket[key]=value;persistTools();};
  input(id).onblur=()=>{input(id).setCustomValidity('');input(id).value=String(preferences.bucket[key]);};
}
// The tolerance slider feeds the validated number field, which stays the single writer of the setting.
input('bucketToleranceRange').oninput=()=>{input('bucketTolerance').value=input('bucketToleranceRange').value;input('bucketTolerance').dispatchEvent(new Event('input'));};
input('bucketTolerance').addEventListener('input',()=>{if(input('bucketTolerance').validity.valid)input('bucketToleranceRange').value=String(preferences.bucket.tolerance);});
$('moveTransform').onclick=()=>$('freeTransform').click();
$('bucketContiguous').onchange=()=>{preferences.bucket.contiguous=input('bucketContiguous').checked;persistTools();};
$('bucketReference').onchange=()=>{preferences.bucket.reference=($('bucketReference') as HTMLSelectElement).value as 'layer'|'visible';persistTools();};
async function runBucket(x:number,y:number){
  if(busy||free||invertPreview||pointer!==null)return;
  const settings={...preferences.bucket},foreground=color,region=selection?{...selection}:null,controller=new AbortController();fillAbort=controller;$('fillProgress').hidden=false;
  try{await exclusive(async()=>{await bucketFill(app,x,y,foreground,settings,region,{signal:controller.signal,progress:(phase,done)=>{$('fillStatus').textContent=`${phase} ${done}%`;($('fillProgressBar') as HTMLProgressElement).value=done;}});});}
  finally{fillAbort=null;$('fillProgress').hidden=true;toolOptions();}
}
$('cancelFill').onclick=()=>fillAbort?.abort();
$('invertRGB').onclick=()=>safe(()=>{invertPreview=new InvertPreview(app,selection);$<HTMLDialogElement>('invertDialog').showModal();});
function endInvert(apply:boolean){const edit=invertPreview;if(!edit)return;invertPreview=null;try{if(apply)edit.finish();else edit.cancel();}catch(e){edit.cancel();notify(error(e));}finally{$<HTMLDialogElement>('invertDialog').close();layerList.invalidate([app.selected]);ui();render();}}
$('applyInvert').onclick=()=>endInvert(true);$('cancelInvert').onclick=()=>endInvert(false);$<HTMLDialogElement>('invertDialog').addEventListener('cancel',e=>{e.preventDefault();endInvert(false);});
function undo(redo = false) { safe(() => { const c = redo ? app.history.redo() : app.history.undo(); if (c) { selection=null;renderSelection();app.changed(c.layers); render(); $('statusText').textContent = `${c.label} ${redo ? '다시 실행' : '실행 취소'}`; } }); }
$('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
$('zoomIn').onclick = () => setZoom(zoom * 1.25); $('zoomOut').onclick = () => setZoom(zoom / 1.25); $('zoomValue').onclick = () => setZoom(1); $('fit').onclick = fit;
function toggleMirror(){mirrored=!mirrored;$('mirrorView').setAttribute('aria-pressed',String(mirrored));transform();}
$('mirrorView').onclick=()=>{if(free && pointer===null)toggleMirror();else safe(toggleMirror);};
$('duplicateLayer').onclick=()=>safe(()=>duplicateLayer(app));$('flipLayer').onclick=()=>safe(()=>flipLayer(app));
$('addLayer').onclick = () => safe(() => app.add()); $('deleteLayer').onclick = () => safe(() => app.remove()); $('layerUp').onclick = () => safe(() => app.move(1)); $('layerDown').onclick = () => safe(() => app.move(-1));
function rename(id = app.active) { const l = app.layers.find(l => l.id === id)!; const value = prompt('레이어 이름', l.name); if (value?.trim()) app.property(l, 'name', value.trim().slice(0, 100)); }
$('renameLayer').onclick = () => safe(() => rename());
input('layerOpacity').oninput = () => { $('layerOpacityValue').textContent = `${input('layerOpacity').value}%`; };
input('layerOpacity').onchange = () => safe(() => app.property(app.selected, 'opacity', Number(input('layerOpacity').value) / 100));
input('whiteBackground').onchange = () => { story.whiteBackground = input('whiteBackground').checked; paper.classList.toggle('white',story.whiteBackground); revision++; ui(); scheduleAuto(); };
let guideKey='';
function syncGuide(force=false) {
  const g=app.guide,key=`${g.type}|${g.visible}|${g.spacing}|${g.color}|${g.opacity}`;if(!force&&key===guideKey)return;guideKey=key;
  ($('guideType') as HTMLSelectElement).value=g.type;input('guideVisible').checked=g.visible;input('guideSpacing').value=String(g.spacing);($('guideColor') as HTMLSelectElement).value=g.color;input('guideOpacity').value=String(Math.round(g.opacity*100));
  $('guideSpacingValue').textContent=`${g.spacing} px`;$('guideOpacityValue').textContent=`${Math.round(g.opacity*100)}%`;renderGuide($('guideOverlay'),g);syncNumbers();
}
function changeGuide() {
  try { app.guide=readGuide({type:($('guideType') as HTMLSelectElement).value,visible:input('guideVisible').checked,spacing:Number(input('guideSpacing').value),color:($('guideColor') as HTMLSelectElement).value,opacity:Number(input('guideOpacity').value)/100});revision++;$('dirty').hidden=revision===savedRevision;syncGuide(true);scheduleAuto(); }catch(e){syncGuide(true);notify(error(e));}
}
for(const id of ['guideType','guideVisible','guideColor']) $(id).onchange=changeGuide;
for(const id of ['guideSpacing','guideOpacity']) $(id).oninput=changeGuide;

function dialog(id: string) { if (pointer === null && !busy && !free) $<HTMLDialogElement>(id).showModal(); }
$('help').onclick = () => dialog('helpDialog');
$('diagnostics').onclick = () => { const average = (a: number[]) => a.length ? (a.reduce((a, b) => a + b, 0) / a.length).toFixed(2) : '—'; const max = (a: number[]) => a.length ? Math.max(...a).toFixed(2) : '—'; $('metrics').textContent = `캔버스        ${app.width} × ${app.height}\n레이어        ${app.layers.length}\n렌더 표본     ${frames.length}\n렌더 평균     ${average(frames)} ms\n렌더 최대     ${max(frames)} ms\n입력 표본     ${latencies.length}\n입력→렌더 평균 ${average(latencies)} ms\n입력→렌더 최대 ${max(latencies)} ms\n히스토리      ${(app.history.bytes / 1048576).toFixed(2)} / ${HISTORY_LIMIT / 1048576} MiB\nUndo / Redo   ${app.history.past.length} / ${app.history.future.length}\n컷 Canvas     ${(story.stats.canvasBytes/1048576).toFixed(2)} MiB\n압축 컷 버퍼   ${(story.stats.compressedBytes/1048576).toFixed(2)} MiB\n상주 컷       ${story.stats.hotCuts} / ${story.stats.cuts}\n전체 히스토리   ${(story.stats.historyBytes/1048576).toFixed(2)} MiB\n스트로크 임시 버퍼: 캔버스 2장 (히스토리와 별도)`; dialog('diagnosticDialog'); };
stage.addEventListener('pointerdown', e => {
  if(free){transformDown(e);return;}
  if ((e.target as Element).closest('button') || pointer !== null || busy || document.querySelector('dialog[open]') || (e.button !== 0 && e.button !== 1)) return;
  const p = coordinates(e); const pan = tool === 'hand' || space || e.button === 1;
  if (!pan && (p.x < 0 || p.y < 0 || p.x >= app.width || p.y >= app.height)) return;
  e.preventDefault(); stage.focus({ preventScroll: true });
  if(!pan&&tool==='bucket'){void runBucket(p.x,p.y);return;}
  if(!pan&&tool==='eyedropper'){if(pendingFrame)cancelAnimationFrame(pendingFrame);draw();const picked=sampleColor(view,p.x,p.y);if(picked)setColor(picked);else notify('투명한 픽셀입니다.');setTool(lastDrawingTool);return;}
  if(!pan&&tool==='select'){
    if(inside(selection,p.x,p.y)){try{mover=new PixelMove(app,p.x,p.y,[app.selected],selection);}catch(e){notify(error(e));return;}}
    else{selecting={x:p.x,y:p.y,previous:selection};selection=null;selectionLayer=app.active;renderSelection();}
  }
  else if(!pan&&tool==='move-artwork'){try{mover=new PixelMove(app,p.x,p.y,app.layers.filter(l=>input('moveHidden').checked || l.visible));}catch(e){notify(error(e));return;}}
  else if(!pan&&tool==='move-layer'){try{mover=new LayerMove(app,p.x,p.y);}catch(e){notify(error(e));return;}}
  else if (!pan && !app.begin(p.x, p.y, size, color, brushOpacity, tool === 'eraser', tool === 'pencil' || tool === 'dark-pencil' || isBasicBrush(tool) ? tool : null,isBasicBrush(tool)?preferences.tools[tool].texture:undefined)) { notify('보이는 레이어와 0%보다 높은 불투명도를 선택해주세요.'); return; }
  pointer = e.pointerId; stage.setPointerCapture(e.pointerId); inputAt ||= performance.now();
  if (pan) { panning = { x: e.clientX, y: e.clientY, panX, panY }; stage.classList.add('panning'); }
  $('statusText').textContent = pan ? '화면 이동 중' : selecting ? '선택 영역 지정 중' : mover ? tool==='select'?'선택 영역 이동 중':tool==='move-artwork'?'전체 그림 이동 중':'레이어 이동 중' : `${TOOL_NAMES[tool]} 사용 중`; ui();
});
// Pointer feedback is written at most once per frame; the cursor moves by transform so a stroke never invalidates layout.
const cursorElement = $('brushCursor'), coordinateElement = $('coordinates');
let hoverFrame = 0, hoverText = '', hoverX = 0, hoverY = 0, hoverHidden = true;
function hover(p: { x: number; y: number }, x: number, y: number) {
  hoverText = `${Math.round(p.x)}, ${Math.round(p.y)} px`; hoverX = x; hoverY = y; hoverHidden = p.x < 0 || p.y < 0 || p.x > app.width || p.y > app.height;
  if (!hoverFrame) hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0; if (coordinateElement.textContent !== hoverText) coordinateElement.textContent = hoverText;
    cursorElement.style.transform = `translate(${hoverX}px,${hoverY}px) translate(-50%,-50%)`; if (cursorElement.hidden !== hoverHidden) cursorElement.hidden = hoverHidden;
  });
}
stage.addEventListener('pointermove', e => {
  const p = coordinates(e), r = stage.getBoundingClientRect(); hover(p, e.clientX - r.left, e.clientY - r.top);
  if (e.pointerId !== pointer) return;
  if(free){try{free.update(p.x,p.y,input('transformLock').checked);syncTransformNumbers();renderTransform();}catch(err){notify(error(err));}return;}
  if (panning) { panX = panning.panX + e.clientX - panning.x; panY = panning.panY + e.clientY - panning.y; transform(); return; }
  if(selecting){selection=rectangle(selecting.x,selecting.y,p.x,p.y,app.width,app.height);renderSelection();return;}
  if(mover){mover.update(p.x,p.y);return;}
  inputAt ||= performance.now();
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const event of events.length ? events : [e]) { const point = coordinates(event); app.point(point.x, point.y); }
});
function finishPointer(e: PointerEvent, cancelled: boolean) {
  if (e.pointerId !== pointer) return;
  if(free){try{if(!cancelled){const p=coordinates(e);free.update(p.x,p.y,input('transformLock').checked);}free.endDrag(cancelled);free.flush();}catch(err){notify(error(err));free.endDrag();}syncTransformNumbers();renderTransform();pointer=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);return;}
  if(selecting){const drag=selecting;selecting=null;const p=coordinates(e);selection=cancelled?drag.previous:rectangle(drag.x,drag.y,p.x,p.y,app.width,app.height);renderSelection();}
  else if(mover){const editing=mover;mover=null;try{if(cancelled)editing.cancel();else{const p=coordinates(e);editing.update(p.x,p.y);const next=editing instanceof PixelMove && tool==='select'?editing.selection:selection;editing.finish();selection=next;}}catch(errorValue){editing.cancel();notify(error(errorValue));}renderSelection();}
  else if (cancelled) app.cancel(); else { if (app.stroke) { const p = coordinates(e); app.point(p.x, p.y); } app.end(); }
  pointer = null; panning = null; stage.classList.remove('panning'); if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  $('statusText').textContent = cancelled ? '획 취소됨' : '준비'; ui();
}
stage.addEventListener('pointerup', e => finishPointer(e, false)); stage.addEventListener('pointercancel', e => finishPointer(e, true));
stage.addEventListener('lostpointercapture', e => finishPointer(e, true));
stage.addEventListener('pointerleave', () => { hoverHidden = true; cursorElement.hidden = true; });
stage.addEventListener('wheel', e => { if (e.ctrlKey && pointer === null && !busy) { e.preventDefault(); const r = stage.getBoundingClientRect(); setZoom(zoom * Math.exp(-e.deltaY * .002), e.clientX - r.left, e.clientY - r.top); } }, { passive: false });
window.addEventListener('blur', () => { space = false; if(free)endTransform(false);else if (pointer !== null)finishPointer(new PointerEvent('pointercancel',{pointerId:pointer}),true); updateCursor(); });
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
type CutCard={button:HTMLButtonElement;image:HTMLImageElement;text:HTMLSpanElement;thumbnail:string;label:string};
const cutCards=new Map<string,CutCard>();
function renderCuts() {
  const count=String(story.cuts.length);if($('cutCount').textContent!==count)$('cutCount').textContent=count;
  if($('currentCutLabel').textContent!==story.current.name)$('currentCutLabel').textContent=story.current.name;
  const list=$('cutList'),locked=busy || pointer!==null || !!free,live=new Set(story.cuts.map(c=>c.id));
  for(const [id,card] of cutCards)if(!live.has(id)){card.button.remove();cutCards.delete(id);}
  for(const [i,cut] of story.cuts.entries()){
    let card=cutCards.get(cut.id);
    if(!card){
      const b=document.createElement('button'),image=document.createElement('img'),text=document.createElement('span');b.className='cut-card';b.dataset.cutId=cut.id;image.alt='';b.append(image,text);
      b.onclick=()=>{const target=story.cuts.find(c=>c.id===cut.id);if(target)void cutAction(async()=>story.select(target.id),target!==story.current);};
      card={button:b,image,text,thumbnail:'',label:''};cutCards.set(cut.id,card);
    }
    const label=`${String(i+1).padStart(2,'0')}  ${cut.name}`,pressed=String(cut===story.current);
    if(card.label!==label){card.label=label;card.text.textContent=label;card.button.title=cut.name;}
    if(card.button.getAttribute('aria-pressed')!==pressed)card.button.setAttribute('aria-pressed',pressed);
    if(card.button.disabled!==locked)card.button.disabled=locked;
    if(cut.thumbnail&&card.thumbnail!==cut.thumbnail){card.thumbnail=cut.thumbnail;card.image.src=cut.thumbnail;}
    if(list.children[i]!==card.button)list.insertBefore(card.button,list.children[i]??null);
  }
  const i=story.cuts.indexOf(story.current);
  for(const id of ['addCut','duplicateCut','renameCut','deleteCut','previousLayers','cutLeft','cutRight']) ($<HTMLButtonElement>(id)).disabled=busy || pointer!==null || !!free;
  if(story.cuts.length<=1) $<HTMLButtonElement>('deleteCut').disabled=true;
  if(i===0){$<HTMLButtonElement>('cutLeft').disabled=true;$<HTMLButtonElement>('previousLayers').disabled=true;}
  if(i===story.cuts.length-1)$<HTMLButtonElement>('cutRight').disabled=true;
}
async function cutAction(action:()=>Promise<void>, edited=true) { await exclusive(async()=>{try { await action(); } finally { bindEngine(); restoreView(); } if(edited){revision++;scheduleAuto();}}); }
$('addCut').onclick=()=>void cutAction(()=>story.add());$('duplicateCut').onclick=()=>void cutAction(()=>story.add(true));
$('deleteCut').onclick=()=>{if(!busy && pointer===null && !free && confirm(`“${story.current.name}” 컷을 삭제할까요? 컷 삭제는 실행 취소할 수 없습니다.`))void cutAction(()=>story.remove());};
$('cutLeft').onclick=()=>void cutAction(()=>story.move(-1));$('cutRight').onclick=()=>void cutAction(()=>story.move(1));
$('previousLayers').onclick=()=>void cutAction(()=>story.copyPreviousLayers(),false);
$('renameCut').onclick=()=>safe(()=>{const value=prompt('컷 이름',story.current.name);if(value?.trim()){story.current.name=value.trim().slice(0,100);revision++;ui();scheduleAuto();}});
function openRequest() { if (pointer === null && !busy && !free) input('fileInput').click(); }
$('open').onclick = openRequest; $('import').onclick = () => { if (pointer === null && !busy && !free) input('imageInput').click(); };
async function readFile(file: File) {
  if (file.size > 128 * 1048576) throw new Error('파일 크기 한도는 128 MiB입니다.');
  return file.text();
}
async function exclusive(action: () => Promise<void>) { if (busy || pointer !== null || free || invertPreview) return; busy = true; ui(); try { await action(); } catch (e) { notify(error(e)); } finally { busy = false; ui(); render(); } }
input('fileInput').onchange = () => { const file = input('fileInput').files?.[0]; input('fileInput').value = ''; if (!file) return; void exclusive(async () => { const decoded = await Storyboard.decode(JSON.parse(await readFile(file))); if (!confirmReplace()) { decoded.story.dispose(); return; } adopt(decoded.story); name = decoded.name === '제목 없음' ? file.name.replace(/\.(mpaint|json)$/i, '') : decoded.name; fileHandle = null; documentEpoch++; revision = savedRevision = 0; autoRevision = -1; restoreView(); scheduleAuto(); notify('프로젝트를 열었습니다. 저장은 새 파일로 진행됩니다.'); }); };
async function importImage(file: File) { let original:ImportSource|undefined;await exclusive(async () => {
  if (file.type !== 'image/png' || file.size > 64 * 1048576) throw new Error('64 MiB 이하의 PNG 파일을 선택하세요.');
  if ((app.layers.length + 1) * app.width * app.height > 128e6 || app.layers.length >= 50) throw new Error('레이어 메모리 한도에 도달했습니다.');
  const url = URL.createObjectURL(file); try { const img = await loadImage(url); if (img.width > 8192 || img.height > 8192) throw new Error('가져올 이미지가 너무 큽니다.');
    const l = app.makeLayer(file.name.replace(/\.png$/i, '')); l.imageSource={width:img.naturalWidth,height:img.naturalHeight,name:file.name.slice(0,100)}; const scale = Math.min(1, app.width / img.width, app.height / img.height); const w = img.width * scale, h = img.height * scale; ctx(l.canvas).drawImage(img, (app.width - w) / 2, (app.height - h) / 2, w, h);
    original={image:img,rect:{x:(app.width-w)/2,y:(app.height-h)/2,width:w,height:h}};
    app.structure('이미지 가져오기', () => { app.layers.push(l); app.active = l.id; }, app.width * app.height * 4); notify(scale < 1 ? '캔버스에 맞게 이미지를 축소해 새 레이어로 가져왔습니다.' : '이미지를 새 레이어로 가져왔습니다.');
  } finally { URL.revokeObjectURL(url); }
});if(original)beginTransform(original); }
input('imageInput').onchange = () => { const file = input('imageInput').files?.[0]; input('imageInput').value = ''; if (file)void importImage(file); };
function textInput(target: EventTarget | null) {
  if(!(target instanceof HTMLElement))return false;
  return !!target.closest('textarea, select, [contenteditable]:not([contenteditable="false"])') ||
    (target instanceof HTMLInputElement && !['range','checkbox','radio','color'].includes(target.type));
}
window.addEventListener('paste',e=>{
  if(textInput(e.target)||busy||pointer!==null||free||document.querySelector('dialog[open]'))return;
  const file=Array.from(e.clipboardData?.files??[]).find(f=>f.type==='image/png');
  if(file){e.preventDefault();void importImage(file);}
});
function download(data: Blob, filename: string) { const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
async function save(as = false) {
  if (saving || busy || pointer !== null || free) return; saving = true;
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
$('save').onclick = () => void save(); $('saveAs').onclick = () => void save(true); $('export').onclick = () => { $('exportSize').textContent=`${story.current.name} · ${app.width} × ${app.height} px · ${ratio(app.width,app.height)} · ${story.dpi} DPI`; dialog('exportDialog'); };
$('downloadPng').onclick = e => { e.preventDefault(); $<HTMLDialogElement>('exportDialog').close(); void exclusive(async () => { const white = document.querySelector<HTMLInputElement>('input[name="exportBg"]:checked')!.value === 'white'; const pixels=await blob(app.composite(white));const result=input('pngDpi').checked?await withResolution(pixels,story.dpi):pixels;download(result, `${name}.png`); notify('PNG 다운로드를 요청했습니다.'); }); };
window.addEventListener('keydown', e => {
  if (e.isComposing || e.altKey || document.querySelector('dialog[open]')) return;
  if(fillAbort){if(e.key==='Escape'){e.preventDefault();fillAbort.abort();}else if((e.ctrlKey||e.metaKey)&&['s','o','n','z','y'].includes(e.key.toLowerCase())){e.preventDefault();notify('채우기 완료 또는 취소 후 사용하세요.');}return;}
  if(free){
    const field=(e.target as HTMLElement).closest('#transformControls');
    if(e.key==='Escape' || (e.key==='Enter' && (!textInput(e.target)||field))){e.preventDefault();endTransform(e.key==='Enter');return;}
    if(!textInput(e.target) && pointer===null){
      const key=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey)&&['+','=','-','0'].includes(key)){e.preventDefault();if(key==='0')fit();else setZoom(zoom*(key==='-'?.8:1.25));return;}
      if(!e.ctrlKey&&!e.metaKey&&key==='m'){e.preventDefault();if(!e.repeat)toggleMirror();return;}
    }
    if((e.ctrlKey||e.metaKey)&&!textInput(e.target)&&['t','s','o','n','z','y','a','d','c','x','v'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key.toLowerCase()!=='t')notify('변형을 확정하거나 취소한 뒤 사용하세요.');}
    return;
  }
  if(textInput(e.target))return;
  if(e.key==='Escape'&&(mover||selecting)&&pointer!==null){e.preventDefault();finishPointer(new PointerEvent('pointercancel',{pointerId:pointer}),true);return;}
  const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let action: (() => void) | undefined;
  if (ctrl) {
    if (!e.shiftKey && key==='t')action=()=>beginTransform();
    else if (!e.shiftKey && key==='a')action=selectAll;
    else if(!e.shiftKey && key==='d' && selection)action=deselect;
    else if(!e.shiftKey && key==='c' && selection)action=()=>copySelection();
    else if(!e.shiftKey && key==='x' && selection)action=()=>copySelection(true);
    else if(!e.shiftKey && key==='v' && clipboard.available)action=pasteSelection;
    else if (key === 's') action = () => void save(e.shiftKey);
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
    else if(key==='s')action=()=>setTool('select');
    else if(key==='g')action=()=>setTool('bucket');
    else if(key==='x')action=swapColors;
    else if (key === 'b') action = () => setTool('pen');
    else if (key === 'e') action = () => setTool('eraser');
    else if (key === 'h') action = () => setTool('hand');
    else if (key === ' ') action = () => { space = true; updateCursor(); };
    else if ((key === '[' || key === ']') && isBrush(tool)) action = () => { size = Math.max(1, Math.min(100, size + (key === ']' ? 1 : -1)));preferences.tools[tool as keyof typeof preferences.tools].size=size;persistTools();brushUI();syncToolOverview(); };
    else if (key === 'delete') action = () => safe(() => selection?clearRegion(app,selection):app.clearLayer());
  }
  if(action && e.repeat && key==='m'){e.preventDefault();return;}
  if (action && pointer === null && !busy && !e.repeat) { e.preventDefault(); safe(action); }
  else if (action && e.repeat && !['s', 'o', 'n','c','x','v'].includes(key) && pointer === null && !busy) { e.preventDefault(); safe(action); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; updateCursor(); } });
window.addEventListener('beforeunload', e => { if (dirty() || autoWriting || autoRevision !== revision || app.stroke || mover || free || invertPreview || fillAbort) { e.preventDefault(); e.returnValue = ''; } });
function dbRequest(mode: IDBTransactionMode, value?: unknown): Promise<unknown> { return new Promise((resolve, reject) => {
  if (!db) { reject(new Error('자동 저장소를 사용할 수 없습니다.')); return; }
  const tx = db.transaction('recovery', mode), store = tx.objectStore('recovery'); const request = mode === 'readonly' ? store.get('last') : store.put(value, 'last');
  tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error ?? new Error('자동 저장 실패')); tx.onabort = () => reject(tx.error ?? new Error('자동 저장 취소'));
}); }
function scheduleAuto() { autoFailed = false; clearTimeout(autoTimer); $('autoStatus').textContent = '자동 저장 대기'; autoTimer = setTimeout(() => void autosave(), 1200); }
async function autosave() {
  if (!db) return;
  if (autoWriting || busy || pointer !== null || free || invertPreview) { autoTimer = setTimeout(() => void autosave(), 1200); return; }
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
function storeUserPresets(next:UserPreset[],selected=''){savePresets(next);userPresets=next;listUserPresets(selected);syncToolSets();}
function selectedPreset(){const p=userPresets.find(p=>p.id===($('userPresetList') as HTMLSelectElement).value);if(!p)throw new Error('프리셋을 선택하세요.');return p;}
function toolSetSnapshot(id:string,name:string):ToolSetPreset{return {id,name,kind:'toolset',tools:brushSettings(preferences.tools),foreground:color,background:preferences.background};}
function applyToolSet(p:ToolSetPreset){preferences.tools=brushSettings(p.tools);preferences.foreground=p.foreground;preferences.background=p.background;setColor(p.foreground);input('backgroundColor').value=p.background;if(isBrush(tool)){size=preferences.tools[tool].size;brushOpacity=preferences.tools[tool].opacity;}brushUI(true);syncToolOverview();}
function syncToolSets(){const menu=$('toolSetMenu') as HTMLSelectElement,value=menu.value;menu.replaceChildren(new Option('도구 세트',''));for(const p of userPresets)if(p.kind==='toolset')menu.append(new Option(p.name,p.id));menu.value=value;}
$('toolSetMenu').onchange=()=>safe(()=>{const menu=$('toolSetMenu') as HTMLSelectElement,p=userPresets.find(p=>p.id===menu.value);if(p?.kind==='toolset')applyToolSet(p);menu.value='';});
$('overwritePreset').onclick=()=>safe(()=>{const p=selectedPreset();if(p.kind!=='toolset')throw new Error('도구 세트 프리셋을 선택하세요.');storeUserPresets(userPresets.map(old=>old.id===p.id?toolSetSnapshot(p.id,p.name):old),p.id);});
function presetName(){const value=input('presetName').value.trim();if(!value)throw new Error('프리셋 이름을 입력하세요.');return value;}
$('settings').onclick=()=>{listUserPresets();syncToolOverview();dialog('settingsDialog');};$('presetKind').onchange=()=>listUserPresets();$('userPresetList').onchange=()=>{input('presetName').value=selectedPreset().name;};
$('addPreset').onclick=()=>safe(()=>{const kind=($('presetKind') as HTMLSelectElement).value;let preset:UserPreset;
  if(kind==='brush'){if(!isBrush(tool))throw new Error('브러시 도구를 선택하세요.');preset={id:presetId(),kind:'brush',name:presetName(),tool,size,opacity:brushOpacity,color,...(isBasicBrush(tool)?{texture:readTexture(tool,preferences.tools[tool].texture)}:tool==='pencil'||tool==='dark-pencil'?{texture:{version:1 as const}}:{})};}
  else if(kind==='toolset')preset=toolSetSnapshot(presetId(),presetName());
  else preset={id:presetId(),kind:'work',name:presetName(),width:app.width,height:app.height,dpi:story.dpi,guide:{...app.guide},whiteBackground:story.whiteBackground};
  storeUserPresets([preset,...userPresets],preset.id);
});
$('renamePreset').onclick=()=>safe(()=>{const old=selectedPreset();storeUserPresets(userPresets.map(p=>p.id===old.id?{...p,name:presetName()}:p),old.id);});
$('deletePreset').onclick=()=>safe(()=>{const old=selectedPreset();storeUserPresets(userPresets.filter(p=>p.id!==old.id));});
$('applyPreset').onclick=()=>safe(()=>{const p=selectedPreset();
  if(p.kind==='brush'){preferences.tools[p.tool]={size:p.size,opacity:p.opacity,...(isBasicBrush(p.tool)?{texture:readTexture(p.tool,p.texture)}:{})};setTool(p.tool);setColor(p.color);brushUI();syncToolOverview();}
  else if(p.kind==='toolset')applyToolSet(p);
  else {if(!confirmReplace())return;const paint=new Paint();paint.reset(p.width,p.height);paint.dpi=p.dpi;paint.guide={...p.guide};const next=new Storyboard(paint);next.whiteBackground=p.whiteBackground;adopt(next);name='제목 없음';fileHandle=null;documentEpoch++;revision=savedRevision=0;autoRevision=-1;fit();ui();render();scheduleAuto();}
  $<HTMLDialogElement>('settingsDialog').close();
});
$('exportPresets').onclick=()=>download(new Blob([JSON.stringify(presetFile(userPresets),null,2)],{type:'application/json'}),'mini-paint-presets.json');
$('importPresets').onclick=()=>input('presetFileInput').click();input('presetFileInput').onchange=()=>{const file=input('presetFileInput').files?.[0];input('presetFileInput').value='';if(!file)return;void(async()=>{try{if(file.size>256*1024)throw new Error('프리셋 JSON은 256 KiB 이하만 가져올 수 있습니다.');const imported=importPresets(JSON.parse(await file.text())).map(p=>({...p,id:presetId()}));storeUserPresets([...userPresets,...imported]);notify(`${imported.length}개 프리셋을 가져왔습니다.`);}catch(e){notify(error(e));}})();};
let psdAbort:AbortController|null=null;
$('downloadPsd').onclick=()=>{if(busy||pointer!==null||free)return;$<HTMLDialogElement>('exportDialog').close();$<HTMLDialogElement>('psdProgressDialog').showModal();psdAbort=new AbortController();const signal=psdAbort.signal;
  void exclusive(async()=>{try{const {exportPsd}=await import('./psd-export');const data=await exportPsd(app,story.dpi,signal,(text,value)=>{$('psdProgress').textContent=text;($('psdProgressBar') as HTMLProgressElement).value=value;});download(data,`${name}.psd`);notify('PSD 다운로드를 요청했습니다.');}catch(e){if((e as Error).name==='AbortError')notify('PSD 내보내기 취소');else throw e;}finally{psdAbort=null;$<HTMLDialogElement>('psdProgressDialog').close();}});
};
$('cancelPsd').onclick=()=>psdAbort?.abort();$<HTMLDialogElement>('psdProgressDialog').addEventListener('cancel',e=>{e.preventDefault();psdAbort?.abort();});

const testPanel=brushTestPanel(()=>({tools:brushSettings(preferences.tools),color}));$('brushTest').onclick=()=>safe(()=>{if(!document.querySelector('dialog[open]'))testPanel.open();});
bindNumbers();toolOptions();syncToolOverview();syncToolSets();if(preferencesError)notify(`도구 설정 읽기 실패: ${preferencesError}`);
initLayerPanel(sidebar,$('sidebarResize'),$<HTMLButtonElement>('toggleSidebar'),()=>!busy && pointer===null && !free,notify);
const workspace=initWorkspace({workspace:$('workspace'),cutPanel:$('cutPanel'),cutHandle:$('cutResize'),cutToggle:$<HTMLButtonElement>('toggleCuts'),editable:()=>!busy && pointer===null && !free,onError:notify});
initMenus(document.querySelector<HTMLElement>('.menus')!,{mirror:()=>mirrored,white:()=>story.whiteBackground,railLabels:()=>workspace.railLabels,cuts:()=>workspace.cutsVisible,sidebar:()=>!sidebar.hidden});
$('toggleRailLabels').onclick=()=>workspace.toggleRailLabels();
ui(); fit(); render(); void initRecovery();
new ResizeObserver(() => { transform(); }).observe(stage);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => notify('오프라인 캐시를 준비하지 못했습니다. 온라인에서 다시 열어주세요.'));
// Development diagnostics and deterministic browser regression tests only; excluded from production.
if (import.meta.env.DEV) (window as any).__paint = { get app() { return app; }, get story() { return story; }, get mirrored() {return mirrored;}, get busy() { return busy; }, get revision() { return revision; }, get zoom() { return zoom; }, get selection() { return selection; }, get freeTransform() { return free?.state ?? null; }, get toolPreferences() { return structuredClone(preferences); }, setZoom, coordinates, autosave, get metrics() { return { frames, latencies }; } };
