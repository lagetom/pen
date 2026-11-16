// Splits an imported image into a grid and hands the chosen pieces to the caller.
// The dialog owns only a preview canvas; project pixels are created by Storyboard.addImageCuts.
export type Piece = { index: number; sx: number; sy: number; sw: number; sh: number };
export const MAX_SPLIT = 6;
const MIN_GAP = .02; // Lines keep at least 2% of the image between them.

export const equalLines = (count: number) => Array.from({ length: count + 1 }, (_, i) => i / count);
/** Pieces in reading order (left to right, top to bottom), in source-image pixels. */
export function pieceRects(xs: number[], ys: number[], width: number, height: number): Piece[] {
  const px = xs.map(v => Math.round(v * width)), py = ys.map(v => Math.round(v * height)), out: Piece[] = [];
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < xs.length - 1; c++)
    out.push({ index: out.length, sx: px[c], sy: py[r], sw: Math.max(1, px[c + 1] - px[c]), sh: Math.max(1, py[r + 1] - py[r]) });
  return out;
}
/** Centres a piece on the canvas keeping its ratio. Small pieces grow only when `enlarge` is set. */
export function fitPiece(sw: number, sh: number, width: number, height: number, enlarge: boolean) {
  const scale = Math.min(width / sw, height / sh, enlarge ? Infinity : 1), w = sw * scale, h = sh * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function imageSplitDialog(create: (image: HTMLImageElement, name: string, pieces: Piece[], enlarge: boolean) => void) {
  const dialog = document.createElement('dialog'); dialog.id = 'splitDialog';
  dialog.innerHTML = `<h2>이미지를 컷으로 분할</h2><p>분할선을 끌어 위치를 맞추고, 컷으로 만들 조각을 고르세요. 고른 조각마다 새 컷이 하나씩 생깁니다.</p>
<div class="split-controls"><label>가로 <input id="splitColumns" type="number" min="1" max="${MAX_SPLIT}" step="1" value="2" aria-label="가로 조각 수">칸</label><label>세로 <input id="splitRows" type="number" min="1" max="${MAX_SPLIT}" step="1" value="2" aria-label="세로 조각 수">칸</label><button id="splitAll" type="button">전체 선택</button><button id="splitNone" type="button">선택 해제</button><label><input id="splitEnlarge" type="checkbox" checked> 캔버스에 맞게 확대</label></div>
<canvas id="splitPreview" aria-label="분할 미리보기"></canvas><div id="splitPieces" aria-label="컷으로 만들 조각"></div>
<div class="dialog-actions"><span id="splitInfo"></span><button id="cancelSplit" type="button">취소</button><button id="createSplit" type="button" class="primary">컷 만들기</button></div>`;
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const preview = $<HTMLCanvasElement>('splitPreview'), list = $('splitPieces'), columns = $<HTMLInputElement>('splitColumns'), rows = $<HTMLInputElement>('splitRows');
  let image: HTMLImageElement | null = null, name = '', xs = equalLines(2), ys = equalLines(2), selected: boolean[] = [];
  let drag: { id: number; lines: number[]; at: number; horizontal: boolean; moved: boolean } | null = null, press: { id: number; piece: number } | null = null;

  const pieces = () => image ? pieceRects(xs, ys, image.naturalWidth, image.naturalHeight) : [];
  function draw() {
    if (!image) return; const g = preview.getContext('2d')!, w = preview.width, h = preview.height;
    g.clearRect(0, 0, w, h); g.drawImage(image, 0, 0, w, h);
    // Everything outside a chosen piece is dimmed, including margins cut off by the outer lines.
    g.fillStyle = '#ffffffb8'; g.beginPath(); g.rect(0, 0, w, h);
    const cols = xs.length - 1;
    selected.forEach((on, i) => { if (on) { const c = i % cols, r = Math.floor(i / cols); g.rect(xs[c] * w, ys[r] * h, (xs[c + 1] - xs[c]) * w, (ys[r + 1] - ys[r]) * h); } });
    g.fill('evenodd');
    g.strokeStyle = '#2b68c5'; g.lineWidth = 2; g.beginPath();
    for (const x of xs) { g.moveTo(Math.round(x * w), ys[0] * h); g.lineTo(Math.round(x * w), ys[ys.length - 1] * h); }
    for (const y of ys) { g.moveTo(xs[0] * w, Math.round(y * h)); g.lineTo(xs[xs.length - 1] * w, Math.round(y * h)); }
    g.stroke();
    g.font = 'bold 13px sans-serif'; g.textBaseline = 'top';
    selected.forEach((on, i) => { const c = i % cols, r = Math.floor(i / cols), x = xs[c] * w + 6, y = ys[r] * h + 6, label = String(i + 1), tw = g.measureText(label).width + 10;
      g.fillStyle = on ? '#2b68c5' : '#8791a0'; g.fillRect(x, y, tw, 20); g.fillStyle = '#fff'; g.fillText(label, x + 5, y + 4); });
  }
  function sync() {
    const count = selected.filter(Boolean).length; list.querySelectorAll<HTMLInputElement>('input').forEach((box, i) => { box.checked = selected[i]; });
    $<HTMLButtonElement>('createSplit').disabled = !count; $<HTMLButtonElement>('createSplit').textContent = count ? `선택한 ${count}개 조각으로 컷 만들기` : '컷 만들기';
    const p = pieces(); $('splitInfo').textContent = image ? `${image.naturalWidth} × ${image.naturalHeight} px · ${p.length}조각` : ''; draw();
  }
  function rebuild() {
    const cols = xs.length - 1, total = cols * (ys.length - 1); selected = Array.from({ length: total }, () => true); list.replaceChildren();
    for (let i = 0; i < total; i++) { const label = document.createElement('label'), box = document.createElement('input'); box.type = 'checkbox'; box.checked = true; box.dataset.piece = String(i);
      box.onchange = () => { selected[i] = box.checked; sync(); }; label.append(box, ` 조각 ${i + 1}`); list.append(label); }
    sync();
  }
  function grid() {
    for (const field of [columns, rows]) { const value = field.valueAsNumber; if (!Number.isInteger(value) || value < 1 || value > MAX_SPLIT) { field.setCustomValidity(`1~${MAX_SPLIT} 정수를 입력하세요.`); return; } field.setCustomValidity(''); }
    xs = equalLines(columns.valueAsNumber); ys = equalLines(rows.valueAsNumber); rebuild();
  }
  columns.oninput = rows.oninput = grid;
  for (const field of [columns, rows]) field.onblur = () => { field.setCustomValidity(''); field.value = String((field === columns ? xs : ys).length - 1); };
  $('splitAll').onclick = () => { selected.fill(true); sync(); }; $('splitNone').onclick = () => { selected.fill(false); sync(); };

  const position = (e: PointerEvent) => { const r = preview.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, tx: 7 / r.width, ty: 7 / r.height }; };
  function nearest(lines: number[], value: number, tolerance: number) { let best = -1, distance = tolerance; lines.forEach((line, i) => { const d = Math.abs(line - value); if (d <= distance) { best = i; distance = d; } }); return best; }
  function pieceAt(x: number, y: number) { const c = xs.findIndex((v, i) => i < xs.length - 1 && x >= v && x < xs[i + 1]), r = ys.findIndex((v, i) => i < ys.length - 1 && y >= v && y < ys[i + 1]); return c < 0 || r < 0 ? -1 : r * (xs.length - 1) + c; }
  preview.onpointerdown = e => {
    if (e.button !== 0 || drag || press) return; e.preventDefault(); const p = position(e), vertical = nearest(xs, p.x, p.tx), horizontal = nearest(ys, p.y, p.ty);
    if (vertical >= 0) drag = { id: e.pointerId, lines: xs, at: vertical, horizontal: false, moved: false };
    else if (horizontal >= 0) drag = { id: e.pointerId, lines: ys, at: horizontal, horizontal: true, moved: false };
    else { const piece = pieceAt(p.x, p.y); if (piece < 0) return; press = { id: e.pointerId, piece }; }
    preview.setPointerCapture(e.pointerId);
  };
  preview.onpointermove = e => {
    const p = position(e);
    if (!drag) { preview.style.cursor = nearest(xs, p.x, p.tx) >= 0 ? 'col-resize' : nearest(ys, p.y, p.ty) >= 0 ? 'row-resize' : 'pointer'; return; }
    if (e.pointerId !== drag.id) return; const { lines, at } = drag;
    lines[at] = Math.max(at ? lines[at - 1] + MIN_GAP : 0, Math.min(at < lines.length - 1 ? lines[at + 1] - MIN_GAP : 1, drag.horizontal ? p.y : p.x)); drag.moved = true; sync();
  };
  function finish(e: PointerEvent, cancelled: boolean) {
    if (drag?.id === e.pointerId) drag = null;
    else if (press?.id === e.pointerId) { const p = position(e); if (!cancelled && pieceAt(p.x, p.y) === press.piece) { selected[press.piece] = !selected[press.piece]; sync(); } press = null; }
    else return;
    if (preview.hasPointerCapture(e.pointerId)) preview.releasePointerCapture(e.pointerId);
  }
  preview.onpointerup = e => finish(e, false); preview.onpointercancel = e => finish(e, true);

  $('cancelSplit').onclick = () => dialog.close();
  $('createSplit').onclick = () => { if (!image) return; const chosen = pieces().filter(p => selected[p.index]), source = image, enlarge = $<HTMLInputElement>('splitEnlarge').checked; if (!chosen.length) return; dialog.close(); create(source, name, chosen, enlarge); };
  dialog.addEventListener('close', () => { image = null; drag = press = null; preview.width = preview.height = 0; });
  return {
    open(next: HTMLImageElement, fileName: string) {
      if (dialog.open) return; image = next; name = fileName;
      const scale = Math.min(1, 640 / next.naturalWidth, 440 / next.naturalHeight); preview.width = Math.max(1, Math.round(next.naturalWidth * scale)); preview.height = Math.max(1, Math.round(next.naturalHeight * scale));
      columns.value = rows.value = '2'; columns.setCustomValidity(''); rows.setCustomValidity(''); xs = equalLines(2); ys = equalLines(2); rebuild(); dialog.showModal();
    },
    /** Line positions as fractions of the image; exposed for tests and diagnostics. */
    get lines() { return { xs: [...xs], ys: [...ys] }; },
  };
}
