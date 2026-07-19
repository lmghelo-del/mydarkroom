// ============================================================
// MyDarkroom — personal Lightroom-style photo editor (PWA)
// ============================================================

const PREVIEW_MAX = 1280; // working resolution for live preview
const STORAGE_KEY = 'mydarkroom_presets_v1';

const state = {
  originalFullImage: null,   // HTMLImageElement, full resolution
  previewData: null,         // ImageData at preview resolution (untouched)
  previewCanvas: document.getElementById('mainCanvas'),
  settings: defaultSettings(),
  showingOriginal: false,
};

function defaultSettings() {
  return {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temp: 0, tint: 0, vibrance: 0, saturation: 0,
    clarity: 0, sharpness: 0, vignette: 0, grain: 0
  };
}

// ---------------- DOM refs ----------------
const canvas = state.previewCanvas;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');
const fileInput2 = document.getElementById('fileInput2');
const panelAdjust = document.getElementById('panelAdjust');
const panelPresets = document.getElementById('panelPresets');
const tabAdjust = document.getElementById('tabAdjust');
const tabPresets = document.getElementById('tabPresets');
const btnReset = document.getElementById('btnReset');
const btnExport = document.getElementById('btnExport');
const btnCompare = document.getElementById('btnCompare');
const presetList = document.getElementById('presetList');
const presetNameInput = document.getElementById('presetName');
const btnSavePreset = document.getElementById('btnSavePreset');

// ---------------- File loading ----------------
[fileInput, fileInput2].forEach(inp => inp.addEventListener('change', onFileChosen));

function onFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    loadImage(img);
  };
  img.src = url;
}

function loadImage(img) {
  state.originalFullImage = img;
  state.settings = defaultSettings();
  syncSlidersFromSettings();

  // Build preview-resolution canvas
  const scale = Math.min(1, PREVIEW_MAX / Math.max(img.width, img.height));
  const pw = Math.round(img.width * scale);
  const ph = Math.round(img.height * scale);

  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(img, 0, 0, pw, ph);
  state.previewData = offCtx.getImageData(0, 0, pw, ph);

  canvas.width = pw;
  canvas.height = ph;

  emptyState.style.display = 'none';
  render();
}

// ---------------- Sliders ----------------
document.querySelectorAll('.slider-row').forEach(row => {
  const key = row.dataset.key;
  const input = row.querySelector('input[type="range"]');
  const valEl = row.querySelector('.val');
  input.addEventListener('input', () => {
    state.settings[key] = parseFloat(input.value);
    valEl.textContent = input.value;
    row.classList.toggle('active', parseFloat(input.value) !== 0);
    requestRender();
  });
});

function syncSlidersFromSettings() {
  document.querySelectorAll('.slider-row').forEach(row => {
    const key = row.dataset.key;
    const input = row.querySelector('input[type="range"]');
    const valEl = row.querySelector('.val');
    const v = state.settings[key] ?? 0;
    input.value = v;
    valEl.textContent = v;
    row.classList.toggle('active', v !== 0);
  });
}

// ---------------- Tabs ----------------
tabAdjust.addEventListener('click', () => {
  tabAdjust.classList.add('active');
  tabPresets.classList.remove('active');
  panelAdjust.classList.remove('hidden');
  panelPresets.classList.add('hidden');
});
tabPresets.addEventListener('click', () => {
  tabPresets.classList.add('active');
  tabAdjust.classList.remove('active');
  panelPresets.classList.remove('hidden');
  panelAdjust.classList.add('hidden');
  renderPresetList();
});

// ---------------- Reset / Compare ----------------
btnReset.addEventListener('click', () => {
  state.settings = defaultSettings();
  syncSlidersFromSettings();
  requestRender();
});

btnCompare.addEventListener('mousedown', showOriginal);
btnCompare.addEventListener('touchstart', showOriginal, { passive: true });
btnCompare.addEventListener('mouseup', showEdited);
btnCompare.addEventListener('touchend', showEdited);
btnCompare.addEventListener('mouseleave', showEdited);
function showOriginal() {
  if (!state.previewData) return;
  ctx.putImageData(state.previewData, 0, 0);
}
function showEdited() {
  if (!state.previewData) return;
  render();
}

// ---------------- Render pipeline ----------------
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  if (!state.previewData) return;
  const out = applyAdjustments(state.previewData, state.settings);
  ctx.putImageData(out, 0, 0);
}

// ---------------- Image processing core ----------------
// All adjustments operate on a COPY of the source ImageData.
function applyAdjustments(srcData, s) {
  const w = srcData.width, h = srcData.height;
  const src = srcData.data;
  const out = new Uint8ClampedArray(src); // working buffer

  const expMul = Math.pow(2, s.exposure / 50);      // exposure stops
  const contrastFactor = 1 + s.contrast / 100;        // -1..2
  const tempShift = s.temp / 100 * 40;                // approx units
  const tintShift = s.tint / 100 * 40;
  const vib = s.vibrance / 100;
  const sat = 1 + s.saturation / 100;

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i], g = out[i + 1], b = out[i + 2];

    // Exposure
    r *= expMul; g *= expMul; b *= expMul;

    // White balance (temp / tint)
    r += tempShift;
    b -= tempShift;
    g += tintShift * 0.5;

    // Luminance for tone-zone adjustments
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Highlights / Shadows (smooth zone weighting)
    const hiWeight = smoothstep(0.35, 1.0, lum);
    const shWeight = smoothstep(0.65, 0.0, lum);
    const hiAdj = (s.highlights / 100) * 60 * hiWeight;
    const shAdj = (s.shadows / 100) * 60 * shWeight;
    r += hiAdj + shAdj; g += hiAdj + shAdj; b += hiAdj + shAdj;

    // Whites / Blacks (push extremes)
    const whWeight = smoothstep(0.6, 1.0, lum);
    const blWeight = smoothstep(0.4, 0.0, lum);
    const whAdj = (s.whites / 100) * 70 * whWeight;
    const blAdj = (s.blacks / 100) * 70 * blWeight;
    r += whAdj + blAdj; g += whAdj + blAdj; b += whAdj + blAdj;

    // Contrast (around midpoint)
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Saturation
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;

    // Vibrance (protects already-saturated pixels, boosts muted ones)
    if (vib !== 0) {
      const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
      const curSat = (maxc - minc) / 255;
      const vibFactor = 1 + vib * (1 - curSat);
      gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * vibFactor;
      g = gray + (g - gray) * vibFactor;
      b = gray + (b - gray) * vibFactor;
    }

    out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }

  let result = new ImageData(out, w, h);

  // Clarity: local-contrast boost via unsharp mask on luminance
  if (s.clarity !== 0) {
    result = unsharpMask(result, 12, s.clarity / 100 * 0.9, true);
  }
  // Sharpness: fine detail unsharp mask
  if (s.sharpness > 0) {
    result = unsharpMask(result, 2, s.sharpness / 100 * 1.1, false);
  }
  // Vignette
  if (s.vignette !== 0) {
    applyVignette(result, s.vignette / 100);
  }
  // Grain
  if (s.grain > 0) {
    applyGrain(result, s.grain / 100);
  }

  return result;
}

function smoothstep(edge0, edge1, x) {
  let t = (x - edge0) / (edge1 - edge0);
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

// Box blur (two-pass separable) used as the base for unsharp masking
function boxBlur(data, w, h, radius) {
  const src = data;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = radius * 2 + 1;

  // horizontal pass
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = clampInt(k, 0, w - 1);
        sum += src[(y * w + xx) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / size;
        const addX = clampInt(x + radius + 1, 0, w - 1);
        const remX = clampInt(x - radius, 0, w - 1);
        sum += src[(y * w + addX) * 4 + c] - src[(y * w + remX) * 4 + c];
      }
    }
  }
  // vertical pass
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = clampInt(k, 0, h - 1);
        sum += tmp[(yy * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / size;
        const addY = clampInt(y + radius + 1, 0, h - 1);
        const remY = clampInt(y - radius, 0, h - 1);
        sum += tmp[(addY * w + x) * 4 + c] - tmp[(remY * w + x) * 4 + c];
      }
    }
  }
  return out;
}

function clampInt(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function unsharpMask(imageData, radius, amount, luminanceOnly) {
  const { width: w, height: h, data } = imageData;
  const blurred = boxBlur(data, w, h, radius);
  const out = new Uint8ClampedArray(data);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = data[i + c];
      const blur = blurred[i + c];
      const diff = orig - blur;
      out[i + c] = orig + diff * amount;
    }
  }
  return new ImageData(out, w, h);
}

function applyVignette(imageData, amount) {
  const { width: w, height: h, data } = imageData;
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const darken = amount < 0;
  const strength = Math.abs(amount);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      const falloff = smoothstep(0.35, 1.1, dist) * strength;
      const idx = (y * w + x) * 4;
      if (darken) {
        data[idx] *= (1 - falloff);
        data[idx + 1] *= (1 - falloff);
        data[idx + 2] *= (1 - falloff);
      } else {
        data[idx] += (255 - data[idx]) * falloff;
        data[idx + 1] += (255 - data[idx + 1]) * falloff;
        data[idx + 2] += (255 - data[idx + 2]) * falloff;
      }
    }
  }
}

function applyGrain(imageData, amount) {
  const data = imageData.data;
  const strength = amount * 40;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * strength;
    data[i] += n; data[i + 1] += n; data[i + 2] += n;
  }
}

// ---------------- Export (full resolution) ----------------
btnExport.addEventListener('click', exportFullRes);

function exportFullRes() {
  if (!state.originalFullImage) return;
  btnExport.textContent = '…';

  const img = state.originalFullImage;
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(img, 0, 0);
  const fullData = offCtx.getImageData(0, 0, img.width, img.height);

  // Processing full-res can be heavy; do it async so UI can update the spinner glyph
  setTimeout(() => {
    const processed = applyAdjustments(fullData, state.settings);
    off.width = processed.width;
    off.height = processed.height;
    offCtx.putImageData(processed, 0, 0);

    off.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mydarkroom-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      btnExport.textContent = '⇩';
    }, 'image/jpeg', 0.94);
  }, 30);
}

// ---------------- Presets (localStorage) ----------------
function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}
function savePresets(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

btnSavePreset.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) return;
  const list = loadPresets();
  list.push({ name, settings: { ...state.settings }, id: Date.now() });
  savePresets(list);
  presetNameInput.value = '';
  renderPresetList();
});

function renderPresetList() {
  const list = loadPresets();
  presetList.innerHTML = '';
  if (list.length === 0) {
    presetList.innerHTML = '<div class="preset-empty">Vēl nav saglabātu presetu</div>';
    return;
  }
  list.slice().reverse().forEach(p => {
    const row = document.createElement('div');
    row.className = 'preset-item';
    row.innerHTML = `
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="actions">
        <button class="apply">Pielietot</button>
        <button class="delete">Dzēst</button>
      </span>
    `;
    row.querySelector('.apply').addEventListener('click', () => {
      state.settings = { ...defaultSettings(), ...p.settings };
      syncSlidersFromSettings();
      requestRender();
    });
    row.querySelector('.delete').addEventListener('click', () => {
      const remaining = loadPresets().filter(x => x.id !== p.id);
      savePresets(remaining);
      renderPresetList();
    });
    presetList.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Service worker registration ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}