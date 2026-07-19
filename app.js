// ============================================================
// app.js — main controller
// ============================================================
import { Engine } from './engine.js';
import {
  defaultSettings, linearCurve, SLIDER_DEFS, HSL_BANDS, HSL_COLORS,
  loadPresets, persistPresets, History
} from './state.js';
import { loadAnyImage } from './raw.js';
import { CurveEditor, ColorWheel, drawHistogram } from './widgets.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const glCanvas = $('#glCanvas');
let engine;
try {
  engine = new Engine(glCanvas);
} catch (e) {
  alert('Šī ierīce neatbalsta WebGL2, kas nepieciešams redaktoram.');
}

const state = {
  settings: defaultSettings(),
  hasImage: false,
  imgW: 0, imgH: 0,
  showingOriginal: false,
};
const history = new History();
let presets = loadPresets();

// ---------------- Rendering ----------------
let renderPending = false;
function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    doRender();
  });
}
function doRender() {
  if (!state.hasImage) return;
  engine.render(state.settings, { showOriginal: state.showingOriginal });
  updateHistogram();
}

let histTimer = null;
function updateHistogram() {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    const small = Math.min(240, state.imgW);
    const scale = small / state.imgW;
    // read from the visible canvas at native size, subsample in drawHistogram
    const px = engine.readPixels(glCanvas.width, glCanvas.height);
    drawHistogram($('#histCanvas'), px);
  }, 120);
}

// ---------------- File loading ----------------
$('#fileInput').addEventListener('change', e => handleFile(e.target.files[0]));

async function handleFile(file) {
  if (!file) return;
  const toast = $('#loadToast'), msg = $('#loadMsg');
  toast.classList.remove('hidden');
  const setStatus = t => { msg.textContent = t; };
  try {
    const result = await loadAnyImage(file, setStatus);
    engine.setImage(result.bitmap, result.width, result.height);
    state.imgW = result.width; state.imgH = result.height;
    state.hasImage = true;
    state.settings = defaultSettings();
    history.stack = []; history.idx = -1;
    history.push(state.settings);
    syncAllControls();
    $('#emptyState').classList.add('hidden');
    $('#histCanvas').classList.remove('hidden');
    fitCanvas();
    doRender();
    if (result.note) showNote(result.note);
  } catch (err) {
    showNote('⚠ ' + err.message, 5000);
  } finally {
    toast.classList.add('hidden');
  }
}

function fitCanvas() {
  // CSS handles max-width/height; nothing needed beyond letting the browser scale
}

let noteTimer = null;
function showNote(text, ms = 3500) {
  const n = $('#note');
  n.textContent = text;
  n.classList.remove('hidden');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => n.classList.add('hidden'), ms);
}

// ---------------- History push (debounced on slider release) ----------------
function commitHistory() {
  history.push(state.settings);
  updateUndoRedo();
}
function updateUndoRedo() {
  $('#btnUndo').disabled = !history.canUndo();
  $('#btnRedo').disabled = !history.canRedo();
}
$('#btnUndo').addEventListener('click', () => {
  const s = history.undo();
  if (s) { state.settings = s; syncAllControls(); requestRender(); updateUndoRedo(); }
});
$('#btnRedo').addEventListener('click', () => {
  const s = history.redo();
  if (s) { state.settings = s; syncAllControls(); requestRender(); updateUndoRedo(); }
});

// ---------------- Build slider panels ----------------
function buildSliders(panelName, defs) {
  const panel = $(`.panel[data-panel="${panelName}"]`);
  panel.innerHTML = '';
  defs.forEach(([key, label, min, max]) => {
    const row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = `<span class="lbl">${label}</span>
      <input type="range" min="${min}" max="${max}" step="1" value="0">
      <span class="val">0</span>`;
    const input = row.querySelector('input');
    const val = row.querySelector('.val');
    input.addEventListener('input', () => {
      state.settings[key] = parseFloat(input.value);
      val.textContent = input.value;
      row.classList.toggle('active', parseFloat(input.value) !== 0);
      requestRender();
    });
    input.addEventListener('change', commitHistory);
    row._key = key; row._input = input; row._val = val;
    panel.appendChild(row);
  });
}
buildSliders('light', SLIDER_DEFS.tone);
buildSliders('color', SLIDER_DEFS.color);
buildSliders('detail', SLIDER_DEFS.detail);
buildSliders('effects', SLIDER_DEFS.effects);

// grade blend slider
(() => {
  const wrap = $('#gradeBlendSlider');
  wrap.innerHTML = `<div class="srow"><span class="lbl">Intensitāte</span>
    <input type="range" min="0" max="100" value="${state.settings.gradeBlend}">
    <span class="val">${state.settings.gradeBlend}</span></div>`;
  const input = wrap.querySelector('input'), val = wrap.querySelector('.val');
  input.addEventListener('input', () => {
    state.settings.gradeBlend = parseFloat(input.value);
    val.textContent = input.value; requestRender();
  });
  input.addEventListener('change', commitHistory);
  wrap._input = input; wrap._val = val;
})();

// straighten slider
(() => {
  const wrap = $('#straightenSlider');
  wrap.innerHTML = `<div class="srow"><span class="lbl">Iztaisnot</span>
    <input type="range" min="-45" max="45" value="0"><span class="val">0°</span></div>`;
  const input = wrap.querySelector('input'), val = wrap.querySelector('.val');
  input.addEventListener('input', () => {
    state.settings.straighten = parseFloat(input.value);
    val.textContent = input.value + '°';
    // straighten handled at export via canvas rotate; live preview simplified
    requestRender();
  });
  wrap._input = input; wrap._val = val;
})();

// ---------------- Curve editor ----------------
const curveEditor = new CurveEditor($('#curveCanvas'), (channel, points) => {
  state.settings[channel] = points;
  requestRender();
});
$$('.ctab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.ctab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const ch = tab.dataset.ch;
    curveEditor.setChannel(ch, state.settings[ch]);
  });
});

// ---------------- HSL panel ----------------
let activeBand = 0;
(function buildHSL() {
  const tabs = $('#hslBandTabs');
  HSL_COLORS.forEach((color, i) => {
    const sw = document.createElement('button');
    sw.className = 'hsl-swatch' + (i === 0 ? ' active' : '');
    sw.style.background = color;
    sw.title = HSL_BANDS[i];
    sw.addEventListener('click', () => {
      activeBand = i;
      $$('.hsl-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      syncHSLSliders();
    });
    tabs.appendChild(sw);
  });
  const wrap = $('#hslSliders');
  ['hue', 'sat', 'lum'].forEach(prop => {
    const label = { hue: 'Nokrāsa', sat: 'Piesātinājums', lum: 'Gaišums' }[prop];
    const row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = `<span class="lbl">${label}</span>
      <input type="range" min="-100" max="100" value="0"><span class="val">0</span>`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.addEventListener('input', () => {
      state.settings.hsl[activeBand][prop] = parseFloat(input.value);
      val.textContent = input.value;
      row.classList.toggle('active', parseFloat(input.value) !== 0);
      requestRender();
    });
    input.addEventListener('change', commitHistory);
    row._prop = prop; row._input = input; row._val = val;
    wrap.appendChild(row);
  });
})();
function syncHSLSliders() {
  $$('#hslSliders .srow').forEach(row => {
    const v = state.settings.hsl[activeBand][row._prop] || 0;
    row._input.value = v; row._val.textContent = v;
    row.classList.toggle('active', v !== 0);
  });
}

// ---------------- Color grading wheels ----------------
const wheels = {};
$$('.wheel').forEach(cv => {
  const key = cv.dataset.wheel;
  wheels[key] = new ColorWheel(cv, { ...state.settings[key] }, val => {
    state.settings[key] = val;
    requestRender();
  });
});

// ---------------- Geometry ----------------
$$('.geo-btn[data-geo]').forEach(btn => {
  btn.addEventListener('click', () => {
    const g = btn.dataset.geo;
    if (g === 'rotL') state.settings.rotate = (state.settings.rotate - 90 + 360) % 360;
    if (g === 'rotR') state.settings.rotate = (state.settings.rotate + 90) % 360;
    if (g === 'flipH') state.settings.flipH = !state.settings.flipH;
    if (g === 'flipV') state.settings.flipV = !state.settings.flipV;
    applyGeometryToCanvas();
    commitHistory();
  });
});
function applyGeometryToCanvas() {
  // Geometry is applied at export; for preview we rotate the CSS canvas transform
  const r = state.settings.rotate;
  const sx = state.settings.flipH ? -1 : 1;
  const sy = state.settings.flipV ? -1 : 1;
  glCanvas.style.transform = `rotate(${r}deg) scale(${sx},${sy})`;
}
$('#cropReset').addEventListener('click', () => {
  state.settings.crop = null;
  state.settings.rotate = 0;
  state.settings.flipH = false; state.settings.flipV = false;
  state.settings.straighten = 0;
  applyGeometryToCanvas();
  syncAllControls();
  commitHistory();
});

// ---------------- Tool rail switching ----------------
$$('.tool').forEach(tool => {
  tool.addEventListener('click', () => {
    $$('.tool').forEach(t => t.classList.remove('active'));
    tool.classList.add('active');
    const target = tool.dataset.tool;
    $$('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));
    if (target === 'curve') curveEditor.setChannel(curveEditor.channel, state.settings[curveEditor.channel]);
    if (target === 'presets') renderPresets();
  });
});

// ---------------- Compare (hold) ----------------
const cmp = $('#btnCompare');
const showOrig = () => { state.showingOriginal = true; doRender(); };
const showEdit = () => { state.showingOriginal = false; doRender(); };
cmp.addEventListener('mousedown', showOrig);
cmp.addEventListener('touchstart', e => { e.preventDefault(); showOrig(); }, { passive: false });
cmp.addEventListener('mouseup', showEdit);
cmp.addEventListener('mouseleave', showEdit);
cmp.addEventListener('touchend', showEdit);

// ---------------- Presets ----------------
$('#btnSavePreset').addEventListener('click', () => {
  const name = $('#presetName').value.trim();
  if (!name) return;
  presets.push({ id: Date.now(), name, settings: deepCopy(state.settings) });
  persistPresets(presets);
  $('#presetName').value = '';
  renderPresets();
  showNote('Preset saglabāts');
});
function renderPresets() {
  const list = $('#presetList');
  list.innerHTML = '';
  if (!presets.length) { list.innerHTML = '<div class="preset-empty">Vēl nav presetu</div>'; return; }
  presets.slice().reverse().forEach(p => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `<span class="pname">${escapeHtml(p.name)}</span>
      ${p.builtin ? '<span class="badge">iebūvēts</span>' : ''}
      <button class="apply">Pielietot</button>
      ${p.builtin ? '' : '<button class="del">✕</button>'}`;
    item.querySelector('.apply').addEventListener('click', () => {
      state.settings = { ...defaultSettings(), ...deepCopy(p.settings) };
      syncAllControls(); applyGeometryToCanvas(); requestRender(); commitHistory();
      showNote('Pielietots: ' + p.name);
    });
    const del = item.querySelector('.del');
    if (del) del.addEventListener('click', () => {
      presets = presets.filter(x => x.id !== p.id);
      persistPresets(presets); renderPresets();
    });
    list.appendChild(item);
  });
}
$('#btnExportPresets').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(presets.filter(p => !p.builtin), null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'aperture-presets.json');
});
$('#importPresets').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (Array.isArray(imported)) {
      imported.forEach(p => { p.id = Date.now() + Math.random(); presets.push(p); });
      persistPresets(presets); renderPresets();
      showNote('Importēti ' + imported.length + ' preseti');
    }
  } catch { showNote('⚠ Nederīgs preset fails'); }
});

// ---------------- Export ----------------
$('#btnExport').addEventListener('click', exportImage);
async function exportImage() {
  if (!state.hasImage) { showNote('Vispirms atver attēlu'); return; }
  const btn = $('#btnExport');
  btn.textContent = '…';
  await new Promise(r => setTimeout(r, 20));

  // Render at full resolution (engine already holds full-res texture)
  engine.render(state.settings, { width: state.imgW, height: state.imgH, flipY: true });
  const px = engine.readPixels(state.imgW, state.imgH);

  // Move pixels to a 2D canvas, applying geometry (rotate/flip)
  let out = document.createElement('canvas');
  out.width = state.imgW; out.height = state.imgH;
  const octx = out.getContext('2d');
  const id = new ImageData(new Uint8ClampedArray(px.data), state.imgW, state.imgH);
  octx.putImageData(id, 0, 0);

  out = applyGeometryExport(out, state.settings);

  out.toBlob(blob => {
    downloadBlob(blob, `aperture-${Date.now()}.jpg`);
    btn.textContent = 'Saglabāt';
    showNote('Saglabāts pilnā izšķirtspējā');
    // restore preview aspect
    doRender();
  }, 'image/jpeg', 0.95);
}

function applyGeometryExport(canvas, s) {
  const rot = s.rotate % 360;
  const flipH = s.flipH, flipV = s.flipV;
  if (rot === 0 && !flipH && !flipV) return canvas;
  const swap = rot === 90 || rot === 270;
  const out = document.createElement('canvas');
  out.width = swap ? canvas.height : canvas.width;
  out.height = swap ? canvas.width : canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rot * Math.PI / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

// ---------------- Sync helpers ----------------
function syncAllControls() {
  // sliders
  const map = { light: SLIDER_DEFS.tone, color: SLIDER_DEFS.color, detail: SLIDER_DEFS.detail, effects: SLIDER_DEFS.effects };
  Object.keys(map).forEach(panelName => {
    $$(`.panel[data-panel="${panelName}"] .srow`).forEach(row => {
      const v = state.settings[row._key] || 0;
      row._input.value = v; row._val.textContent = v;
      row.classList.toggle('active', v !== 0);
    });
  });
  // grade blend
  const gb = $('#gradeBlendSlider');
  if (gb._input) { gb._input.value = state.settings.gradeBlend; gb._val.textContent = state.settings.gradeBlend; }
  // straighten
  const st = $('#straightenSlider');
  if (st._input) { const v = state.settings.straighten || 0; st._input.value = v; st._val.textContent = v + '°'; }
  // curve
  curveEditor.setChannel(curveEditor.channel, state.settings[curveEditor.channel]);
  // hsl
  syncHSLSliders();
  // wheels
  Object.keys(wheels).forEach(k => wheels[k].setValue(state.settings[k]));
  updateUndoRedo();
}

// ---------------- Utils ----------------
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------- Service worker ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}

// initial render of curve so the panel isn't blank
curveEditor.setChannel('curveLuma', state.settings.curveLuma);
