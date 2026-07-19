// ============================================================
// state.js — settings model, presets, history
// ============================================================

export function defaultSettings() {
  return {
    // Tone
    exposure: 0, contrast: 0, highlights: 0, shadows: 0,
    whites: 0, blacks: 0, brightness: 0,
    // Color
    temp: 0, tint: 0, vibrance: 0, saturation: 0, dehaze: 0,
    // Detail
    clarity: 0, texture: 0, sharpness: 0, noiseReduction: 0,
    // Effects
    vignette: 0, vignetteFeather: 50, grain: 0, fade: 0,
    // Curves — control points in 0..1 space
    curveLuma: linearCurve(),
    curveR: linearCurve(),
    curveG: linearCurve(),
    curveB: linearCurve(),
    // HSL — 8 bands
    hsl: Array.from({ length: 8 }, () => ({ hue: 0, sat: 0, lum: 0 })),
    // Color grading wheels {h:0-360, s:0-1}
    gradeShadow: { h: 0, s: 0 },
    gradeMid: { h: 0, s: 0 },
    gradeHigh: { h: 0, s: 0 },
    gradeBlend: 40,
    // Geometry
    rotate: 0,        // degrees
    flipH: false,
    flipV: false,
    crop: null        // {x,y,w,h} normalized 0..1 or null
  };
}

export function linearCurve() {
  return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
}

export const HSL_BANDS = ['Sarkans', 'Oranžs', 'Dzeltens', 'Zaļš', 'Akvamarīns', 'Zils', 'Violets', 'Fuksīns'];
export const HSL_COLORS = ['#e0483c', '#e08b3c', '#e0d23c', '#4fc04f', '#3cc0c0', '#3c6fe0', '#8b3ce0', '#e03ca8'];

export const SLIDER_DEFS = {
  tone: [
    ['exposure', 'Exposure', -100, 100],
    ['contrast', 'Contrast', -100, 100],
    ['highlights', 'Highlights', -100, 100],
    ['shadows', 'Shadows', -100, 100],
    ['whites', 'Whites', -100, 100],
    ['blacks', 'Blacks', -100, 100],
    ['brightness', 'Brightness', -100, 100],
    ['dehaze', 'Dehaze', -100, 100],
  ],
  color: [
    ['temp', 'Temperature', -100, 100],
    ['tint', 'Tint', -100, 100],
    ['vibrance', 'Vibrance', -100, 100],
    ['saturation', 'Saturation', -100, 100],
  ],
  detail: [
    ['clarity', 'Clarity', -100, 100],
    ['texture', 'Texture', -100, 100],
    ['sharpness', 'Sharpness', 0, 100],
    ['noiseReduction', 'Noise Reduction', 0, 100],
  ],
  effects: [
    ['vignette', 'Vignette', -100, 100],
    ['vignetteFeather', 'Feather', 0, 100],
    ['grain', 'Grain', 0, 100],
    ['fade', 'Fade', 0, 100],
  ]
};

// ---------- Presets ----------
const PRESET_KEY = 'prodarkroom_presets_v1';

export function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || seedPresets(); }
  catch { return seedPresets(); }
}
export function persistPresets(list) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(list));
}

// A few built-in looks so the presets tab isn't empty on first run
function seedPresets() {
  const base = defaultSettings();
  const presets = [
    {
      id: 1, name: 'Cinematic Teal', builtin: true,
      settings: { ...base, temp: -12, tint: 6, contrast: 18, shadows: 22, highlights: -30,
        gradeShadow: { h: 200, s: 0.4 }, gradeHigh: { h: 40, s: 0.25 }, gradeBlend: 45,
        saturation: -8, vibrance: 14, clarity: 12, fade: 12 }
    },
    {
      id: 2, name: 'Warm Film', builtin: true,
      settings: { ...base, temp: 16, tint: 8, contrast: 12, highlights: -20, blacks: 14,
        saturation: 6, vibrance: 18, grain: 28, fade: 22,
        gradeShadow: { h: 30, s: 0.2 }, gradeBlend: 40 }
    },
    {
      id: 3, name: 'Mono Contrast', builtin: true,
      settings: { ...base, saturation: -100, contrast: 30, clarity: 24, blacks: -18,
        whites: 12, grain: 20 }
    },
    {
      id: 4, name: 'Moody Matte', builtin: true,
      settings: { ...base, exposure: -8, contrast: -6, shadows: 30, blacks: 20,
        saturation: -14, temp: -6, fade: 34, vignette: -26, vignetteFeather: 60 }
    },
  ];
  persistPresets(presets);
  return presets;
}

// ---------- History (undo/redo) ----------
export class History {
  constructor(limit = 60) { this.stack = []; this.idx = -1; this.limit = limit; }
  push(snapshot) {
    this.stack = this.stack.slice(0, this.idx + 1);
    this.stack.push(JSON.stringify(snapshot));
    if (this.stack.length > this.limit) this.stack.shift();
    this.idx = this.stack.length - 1;
  }
  canUndo() { return this.idx > 0; }
  canRedo() { return this.idx < this.stack.length - 1; }
  undo() { if (this.canUndo()) { this.idx--; return JSON.parse(this.stack[this.idx]); } return null; }
  redo() { if (this.canRedo()) { this.idx++; return JSON.parse(this.stack[this.idx]); } return null; }
}
