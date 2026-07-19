// ============================================================
// widgets.js — interactive tone curve + color grading wheels + histogram
// ============================================================

// ---------------- Tone Curve editor ----------------
export class CurveEditor {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.channel = 'curveLuma';
    this.points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    this.dragIdx = -1;
    this._bind();
  }

  setChannel(ch, points) {
    this.channel = ch;
    this.points = points.map(p => ({ ...p }));
    this.draw();
  }

  _rect() { return this.canvas.getBoundingClientRect(); }
  _toCanvas(e) {
    const r = this._rect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return {
      x: Math.max(0, Math.min(1, cx / r.width)),
      y: Math.max(0, Math.min(1, 1 - cy / r.height))
    };
  }

  _bind() {
    const down = e => {
      e.preventDefault();
      const p = this._toCanvas(e);
      // find nearby point
      let found = -1, best = 0.04;
      this.points.forEach((pt, i) => {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < best) { best = d; found = i; }
      });
      if (found === -1) {
        this.points.push({ ...p });
        this.points.sort((a, b) => a.x - b.x);
        found = this.points.findIndex(pt => pt.x === p.x && pt.y === p.y);
      }
      this.dragIdx = found;
      this._emit();
      this.draw();
    };
    const move = e => {
      if (this.dragIdx === -1) return;
      e.preventDefault();
      const p = this._toCanvas(e);
      const pt = this.points[this.dragIdx];
      const isEnd = this.dragIdx === 0 || this.dragIdx === this.points.length - 1;
      if (!isEnd) pt.x = p.x;
      pt.y = p.y;
      // keep sorted & clamp ends to x edges
      if (this.dragIdx === 0) pt.x = 0;
      if (this.dragIdx === this.points.length - 1) pt.x = 1;
      this.points.sort((a, b) => a.x - b.x);
      this.dragIdx = this.points.indexOf(pt);
      this._emit();
      this.draw();
    };
    const up = () => { this.dragIdx = -1; };
    const dbl = e => {
      const p = this._toCanvas(e);
      let idx = -1, best = 0.04;
      this.points.forEach((pt, i) => {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < best) { best = d; idx = i; }
      });
      if (idx > 0 && idx < this.points.length - 1) {
        this.points.splice(idx, 1);
        this._emit(); this.draw();
      }
    };
    this.canvas.addEventListener('mousedown', down);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', down, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    this.canvas.addEventListener('dblclick', dbl);
  }

  _emit() { this.onChange(this.channel, this.points.map(p => ({ ...p }))); }

  draw() {
    const c = this.ctx, cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    // grid
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const gx = w * i / 4, gy = h * i / 4;
      c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, h); c.stroke();
      c.beginPath(); c.moveTo(0, gy); c.lineTo(w, gy); c.stroke();
    }
    // diagonal ref
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.stroke();

    // curve
    const chColor = { curveLuma: '#ece7e1', curveR: '#e0483c', curveG: '#4fc04f', curveB: '#3c6fe0' }[this.channel];
    c.strokeStyle = chColor;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      const y = this._sample(x);
      const px = x * w, py = (1 - y) * h;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();

    // points
    this.points.forEach(pt => {
      c.fillStyle = chColor;
      c.beginPath();
      c.arc(pt.x * w, (1 - pt.y) * h, 5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#141312'; c.lineWidth = 2; c.stroke();
    });
  }

  _sample(x) {
    const pts = this.points;
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].x < x) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = (x - p1.x) / (p2.x - p1.x || 1e-6);
    const t2 = t * t, t3 = t2 * t;
    return Math.max(0, Math.min(1, 0.5 * (
      2 * p1.y + (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    )));
  }
}

// ---------------- Color wheel ----------------
export class ColorWheel {
  constructor(canvas, value, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.value = value; // {h,s}
    this.onChange = onChange;
    this.dragging = false;
    this._bind();
    this.draw();
  }
  _bind() {
    const handle = e => {
      const r = this.canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left - r.width / 2;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top - r.height / 2;
      const radius = r.width / 2;
      let dist = Math.hypot(cx, cy) / radius;
      dist = Math.min(1, dist);
      let ang = Math.atan2(cy, cx) * 180 / Math.PI;
      if (ang < 0) ang += 360;
      this.value.h = ang;
      this.value.s = dist;
      this.onChange({ ...this.value });
      this.draw();
    };
    const down = e => { e.preventDefault(); this.dragging = true; handle(e); };
    const move = e => { if (this.dragging) { e.preventDefault(); handle(e); } };
    const up = () => { this.dragging = false; };
    this.canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }
  setValue(v) { this.value = { ...v }; this.draw(); }
  draw() {
    const c = this.ctx, cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const size = cv.clientWidth;
    if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, rad = size / 2 - 2;
    // hue ring
    for (let a = 0; a < 360; a += 2) {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, rad, (a - 1) * Math.PI / 180, (a + 1) * Math.PI / 180);
      c.closePath();
      const grad = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `hsl(${a},0%,55%)`);
      grad.addColorStop(1, `hsl(${a},85%,55%)`);
      c.fillStyle = grad;
      c.fill();
    }
    // center dot
    c.fillStyle = '#141312';
    c.beginPath(); c.arc(cx, cy, rad * 0.12, 0, Math.PI * 2); c.fill();
    // handle
    const hx = cx + Math.cos(this.value.h * Math.PI / 180) * this.value.s * rad;
    const hy = cy + Math.sin(this.value.h * Math.PI / 180) * this.value.s * rad;
    c.fillStyle = '#fff';
    c.strokeStyle = '#141312'; c.lineWidth = 2;
    c.beginPath(); c.arc(hx, hy, 7, 0, Math.PI * 2); c.fill(); c.stroke();
  }
}

// ---------------- Histogram ----------------
export function drawHistogram(canvas, pixels) {
  const c = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const bins = 128;
  const r = new Float32Array(bins), g = new Float32Array(bins), b = new Float32Array(bins);
  const d = pixels.data;
  const step = Math.max(4, Math.floor(d.length / 4 / 30000) * 4); // subsample large images
  for (let i = 0; i < d.length; i += step) {
    r[Math.min(bins - 1, d[i] * bins / 256 | 0)]++;
    g[Math.min(bins - 1, d[i + 1] * bins / 256 | 0)]++;
    b[Math.min(bins - 1, d[i + 2] * bins / 256 | 0)]++;
  }
  const max = Math.max(...r, ...g, ...b) || 1;
  const plot = (arr, color) => {
    c.globalCompositeOperation = 'screen';
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, h);
    for (let i = 0; i < bins; i++) {
      const x = i / (bins - 1) * w;
      const y = h - (arr[i] / max) * h;
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fill();
  };
  plot(r, 'rgba(224,72,60,0.55)');
  plot(g, 'rgba(79,192,79,0.55)');
  plot(b, 'rgba(60,111,224,0.55)');
  c.globalCompositeOperation = 'source-over';
}
