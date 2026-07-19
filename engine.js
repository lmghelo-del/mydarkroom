// ============================================================
// engine.js — WebGL2 image processing pipeline
// GPU-accelerated so full-res RAW/large images edit in real time.
// ============================================================

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      alpha: false
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.program = this._buildProgram();
    this._setupGeometry();
    this.texture = null;
    this.imgWidth = 0;
    this.imgHeight = 0;

    // histogram readback buffer
    this._histCanvas = document.createElement('canvas');
  }

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('Shader error: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _buildProgram() {
    const gl = this.gl;
    const vs = `#version 300 es
    in vec2 aPos;
    in vec2 aUV;
    out vec2 vUV;
    uniform bool uFlipY;
    void main(){
      vUV = aUV;
      vec2 p = aPos;
      gl_Position = vec4(p.x, uFlipY ? -p.y : p.y, 0.0, 1.0);
    }`;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 outColor;

    uniform sampler2D uTex;
    uniform vec2 uTexSize;

    // Basic tone
    uniform float uExposure;    // stops-ish
    uniform float uContrast;
    uniform float uHighlights;
    uniform float uShadows;
    uniform float uWhites;
    uniform float uBlacks;
    uniform float uBrightness;

    // Color
    uniform float uTemp;
    uniform float uTint;
    uniform float uVibrance;
    uniform float uSaturation;
    uniform float uDehaze;

    // Detail
    uniform float uClarity;
    uniform float uTexture;
    uniform float uSharpness;
    uniform float uNoiseReduction;

    // Effects
    uniform float uVignette;
    uniform float uVignetteMidpoint;
    uniform float uGrain;
    uniform float uGrainSeed;
    uniform float uFade;         // matte lift

    // Tone curve (16 control points sampled into a LUT-ish poly)
    uniform float uCurve[17];    // luma curve
    uniform float uCurveR[17];
    uniform float uCurveG[17];
    uniform float uCurveB[17];

    // HSL — 8 color bands: red, orange, yellow, green, aqua, blue, purple, magenta
    uniform float uHueShift[8];
    uniform float uSatShift[8];
    uniform float uLumShift[8];

    // Color grading wheels (shadows / midtones / highlights)
    uniform vec3 uGradeShadow;
    uniform vec3 uGradeMid;
    uniform vec3 uGradeHigh;
    uniform float uGradeBlend;

    // Split geometry
    uniform bool uShowOriginal;

    const float PI = 3.14159265;

    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    vec3 rgb2hsl(vec3 c){
      float maxc = max(max(c.r,c.g),c.b);
      float minc = min(min(c.r,c.g),c.b);
      float l = (maxc+minc)*0.5;
      float h=0.0, s=0.0;
      float d = maxc-minc;
      if(d > 1e-5){
        s = l > 0.5 ? d/(2.0-maxc-minc) : d/(maxc+minc);
        if(maxc==c.r) h = (c.g-c.b)/d + (c.g<c.b?6.0:0.0);
        else if(maxc==c.g) h = (c.b-c.r)/d + 2.0;
        else h = (c.r-c.g)/d + 4.0;
        h /= 6.0;
      }
      return vec3(h,s,l);
    }
    float hue2rgb(float p, float q, float t){
      if(t<0.0) t+=1.0;
      if(t>1.0) t-=1.0;
      if(t<1.0/6.0) return p+(q-p)*6.0*t;
      if(t<1.0/2.0) return q;
      if(t<2.0/3.0) return p+(q-p)*(2.0/3.0-t)*6.0;
      return p;
    }
    vec3 hsl2rgb(vec3 hsl){
      float h=hsl.x, s=hsl.y, l=hsl.z;
      if(s<1e-5) return vec3(l);
      float q = l<0.5 ? l*(1.0+s) : l+s-l*s;
      float p = 2.0*l-q;
      return vec3(hue2rgb(p,q,h+1.0/3.0), hue2rgb(p,q,h), hue2rgb(p,q,h-1.0/3.0));
    }

    float sampleCurve(float curve[17], float x){
      x = clamp(x, 0.0, 1.0);
      float fi = x*16.0;
      int i = int(floor(fi));
      i = min(i, 15);
      float f = fi - float(i);
      return mix(curve[i], curve[i+1], f);
    }

    float smoothZone(float lum, float lo, float hi){
      return smoothstep(lo, hi, lum);
    }

    // 8-band HSL weight from hue (0..1)
    float bandWeight(float hue, int band){
      float center = float(band)/8.0;
      float d = abs(hue - center);
      d = min(d, 1.0-d);
      return smoothstep(0.09, 0.0, d);
    }

    void main(){
      vec2 uv = vUV;
      vec3 col = texture(uTex, uv).rgb;

      if(uShowOriginal){
        outColor = vec4(col, 1.0);
        return;
      }

      vec2 px = 1.0/uTexSize;

      // ---- Dehaze (approx: local contrast + black point pull toward dark channel) ----
      if(abs(uDehaze) > 0.001){
        float dark = min(min(col.r,col.g),col.b);
        vec3 hazed = (col - dark*0.5*uDehaze) / max(1.0 - dark*0.5*uDehaze, 0.2);
        col = mix(col, hazed, clamp(abs(uDehaze),0.0,1.0));
      }

      // ---- Exposure & brightness ----
      col *= pow(2.0, uExposure);
      col += uBrightness;

      // ---- White balance ----
      col.r += uTemp;
      col.b -= uTemp;
      col.g += uTint;

      // ---- Tone zones ----
      float lum = luma(col);
      float hiW = smoothZone(lum, 0.5, 1.0);
      float shW = 1.0 - smoothZone(lum, 0.0, 0.5);
      col += uHighlights * hiW;
      col += uShadows * shW;
      float whW = smoothZone(lum, 0.7, 1.0);
      float blW = 1.0 - smoothZone(lum, 0.0, 0.3);
      col += uWhites * whW;
      col += uBlacks * blW;

      // ---- Contrast ----
      col = (col - 0.5) * (1.0 + uContrast) + 0.5;

      // ---- Curves (per channel + luma) ----
      col.r = sampleCurve(uCurveR, col.r);
      col.g = sampleCurve(uCurveG, col.g);
      col.b = sampleCurve(uCurveB, col.b);
      float lm = luma(col);
      float lmC = sampleCurve(uCurve, lm);
      col += (lmC - lm);

      // ---- Saturation ----
      float g = luma(col);
      col = mix(vec3(g), col, 1.0 + uSaturation);

      // ---- Vibrance ----
      if(abs(uVibrance) > 0.001){
        float mx = max(max(col.r,col.g),col.b);
        float mn = min(min(col.r,col.g),col.b);
        float sat = mx-mn;
        float amt = uVibrance * (1.0 - clamp(sat,0.0,1.0));
        float gg = luma(col);
        col = mix(vec3(gg), col, 1.0 + amt);
      }

      // ---- HSL per-band ----
      vec3 hsl = rgb2hsl(clamp(col,0.0,1.0));
      float hueAcc = 0.0, satAcc = 0.0, lumAcc = 0.0;
      for(int b=0; b<8; b++){
        float w = bandWeight(hsl.x, b);
        hueAcc += uHueShift[b]*w;
        satAcc += uSatShift[b]*w;
        lumAcc += uLumShift[b]*w;
      }
      hsl.x = fract(hsl.x + hueAcc);
      hsl.y = clamp(hsl.y * (1.0 + satAcc), 0.0, 1.0);
      hsl.z = clamp(hsl.z * (1.0 + lumAcc), 0.0, 1.0);
      col = hsl2rgb(hsl);

      // ---- Color grading (3-way) ----
      if(uGradeBlend > 0.001){
        float l2 = luma(col);
        float sW = 1.0 - smoothstep(0.0, 0.5, l2);
        float hW = smoothstep(0.5, 1.0, l2);
        float mW = 1.0 - sW - hW;
        vec3 grade = uGradeShadow*sW + uGradeMid*mW + uGradeHigh*hW;
        col += grade * uGradeBlend;
      }

      // ---- Clarity / Texture (local contrast via 3x3 unsharp on luma) ----
      if(abs(uClarity) > 0.001 || abs(uTexture) > 0.001 || uSharpness > 0.001){
        vec3 blur = vec3(0.0);
        float rad = 2.0;
        blur += texture(uTex, uv + px*vec2(-rad,-rad)).rgb;
        blur += texture(uTex, uv + px*vec2( 0.0,-rad)).rgb;
        blur += texture(uTex, uv + px*vec2( rad,-rad)).rgb;
        blur += texture(uTex, uv + px*vec2(-rad, 0.0)).rgb;
        blur += texture(uTex, uv + px*vec2( rad, 0.0)).rgb;
        blur += texture(uTex, uv + px*vec2(-rad, rad)).rgb;
        blur += texture(uTex, uv + px*vec2( 0.0, rad)).rgb;
        blur += texture(uTex, uv + px*vec2( rad, rad)).rgb;
        blur /= 8.0;
        vec3 detail = col - blur;
        col += detail * (uClarity*1.5 + uTexture*1.2);

        // fine sharpness (1px)
        if(uSharpness > 0.001){
          vec3 b2 = vec3(0.0);
          b2 += texture(uTex, uv + px*vec2(-1.0,0.0)).rgb;
          b2 += texture(uTex, uv + px*vec2( 1.0,0.0)).rgb;
          b2 += texture(uTex, uv + px*vec2(0.0,-1.0)).rgb;
          b2 += texture(uTex, uv + px*vec2(0.0, 1.0)).rgb;
          b2 /= 4.0;
          col += (col - b2) * uSharpness * 2.0;
        }
      }

      // ---- Fade / matte ----
      if(uFade > 0.001){
        col = mix(col, col*(1.0-0.15*uFade) + 0.12*uFade, 1.0);
      }

      // ---- Vignette ----
      if(abs(uVignette) > 0.001){
        vec2 d = uv - 0.5;
        float dist = length(d) * 1.4142;
        float v = smoothstep(uVignetteMidpoint, 1.05, dist) * abs(uVignette);
        if(uVignette < 0.0) col *= (1.0 - v);
        else col += (1.0 - col) * v;
      }

      // ---- Grain ----
      if(uGrain > 0.001){
        float n = fract(sin(dot(uv*uTexSize + uGrainSeed, vec2(12.9898,78.233))) * 43758.5453);
        col += (n - 0.5) * uGrain * 0.25;
      }

      outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`;

    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Link error: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  _setupGeometry() {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // pos.xy, uv.xy — fullscreen quad
    const data = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.useProgram(this.program);
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aUV = gl.getAttribLocation(this.program, 'aUV');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);
  }

  // src: ImageData | HTMLImageElement | ImageBitmap | Canvas
  setImage(src, width, height) {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Flip Y on upload so image row 0 (top) maps to UV top; keeps preview upright.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    if (src instanceof ImageData) {
      this.imgWidth = src.width; this.imgHeight = src.height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else {
      this.imgWidth = width || src.width || src.videoWidth;
      this.imgHeight = height || src.height || src.videoHeight;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
  }

  _u(name) {
    if (!this._uCache) this._uCache = {};
    if (!(name in this._uCache)) {
      this._uCache[name] = this.gl.getUniformLocation(this.program, name);
    }
    return this._uCache[name];
  }

  // s = settings object (see state.js defaults)
  render(s, opts = {}) {
    const gl = this.gl;
    const outW = opts.width || this.imgWidth;
    const outH = opts.height || this.imgHeight;
    this.canvas.width = outW;
    this.canvas.height = outH;
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.uniform1i(this._u('uTex'), 0);
    gl.uniform2f(this._u('uTexSize'), this.imgWidth, this.imgHeight);
    gl.uniform1i(this._u('uFlipY'), opts.flipY ? 1 : 0);
    gl.uniform1i(this._u('uShowOriginal'), opts.showOriginal ? 1 : 0);

    // map -100..100 UI values to shader-friendly ranges
    const n = v => (v || 0) / 100;
    gl.uniform1f(this._u('uExposure'), n(s.exposure) * 1.5);
    gl.uniform1f(this._u('uContrast'), n(s.contrast) * 0.8);
    gl.uniform1f(this._u('uHighlights'), -n(s.highlights) * 0.5);
    gl.uniform1f(this._u('uShadows'), n(s.shadows) * 0.5);
    gl.uniform1f(this._u('uWhites'), n(s.whites) * 0.5);
    gl.uniform1f(this._u('uBlacks'), n(s.blacks) * 0.5);
    gl.uniform1f(this._u('uBrightness'), n(s.brightness) * 0.3);

    gl.uniform1f(this._u('uTemp'), n(s.temp) * 0.35);
    gl.uniform1f(this._u('uTint'), n(s.tint) * 0.35);
    gl.uniform1f(this._u('uVibrance'), n(s.vibrance));
    gl.uniform1f(this._u('uSaturation'), n(s.saturation));
    gl.uniform1f(this._u('uDehaze'), n(s.dehaze));

    gl.uniform1f(this._u('uClarity'), n(s.clarity) * 0.5);
    gl.uniform1f(this._u('uTexture'), n(s.texture) * 0.5);
    gl.uniform1f(this._u('uSharpness'), n(s.sharpness) * 0.5);
    gl.uniform1f(this._u('uNoiseReduction'), n(s.noiseReduction));

    gl.uniform1f(this._u('uVignette'), n(s.vignette));
    gl.uniform1f(this._u('uVignetteMidpoint'), 0.3 + (1 - n(s.vignetteFeather || 50)) * 0.4);
    gl.uniform1f(this._u('uGrain'), n(s.grain));
    gl.uniform1f(this._u('uGrainSeed'), Math.random() * 100);
    gl.uniform1f(this._u('uFade'), n(s.fade));

    // curves
    gl.uniform1fv(this._u('uCurve'), buildCurveLUT(s.curveLuma));
    gl.uniform1fv(this._u('uCurveR'), buildCurveLUT(s.curveR));
    gl.uniform1fv(this._u('uCurveG'), buildCurveLUT(s.curveG));
    gl.uniform1fv(this._u('uCurveB'), buildCurveLUT(s.curveB));

    // HSL
    const hue = new Float32Array(8), sat = new Float32Array(8), lm = new Float32Array(8);
    for (let i = 0; i < 8; i++) {
      hue[i] = (s.hsl[i]?.hue || 0) / 100 * 0.15;
      sat[i] = (s.hsl[i]?.sat || 0) / 100;
      lm[i] = (s.hsl[i]?.lum || 0) / 100;
    }
    gl.uniform1fv(this._u('uHueShift'), hue);
    gl.uniform1fv(this._u('uSatShift'), sat);
    gl.uniform1fv(this._u('uLumShift'), lm);

    // grading wheels
    gl.uniform3fv(this._u('uGradeShadow'), wheelToRGB(s.gradeShadow));
    gl.uniform3fv(this._u('uGradeMid'), wheelToRGB(s.gradeMid));
    gl.uniform3fv(this._u('uGradeHigh'), wheelToRGB(s.gradeHigh));
    gl.uniform1f(this._u('uGradeBlend'), n(s.gradeBlend || 0));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Read current framebuffer as ImageData (for histogram + export)
  readPixels(w, h) {
    const gl = this.gl;
    const width = w || this.canvas.width;
    const height = h || this.canvas.height;
    const buf = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { data: buf, width, height };
  }
}

// Build a 17-entry LUT from curve control points [{x,y}...] (0..1)
function buildCurveLUT(points) {
  const lut = new Float32Array(17);
  if (!points || points.length < 2) {
    for (let i = 0; i < 17; i++) lut[i] = i / 16;
    return lut;
  }
  const pts = points.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < 17; i++) {
    const x = i / 16;
    lut[i] = catmullRom(pts, x);
  }
  return lut;
}

function catmullRom(pts, x) {
  // find segment
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].x < x) i++;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const t = (x - p1.x) / (p2.x - p1.x || 1e-6);
  const t2 = t * t, t3 = t2 * t;
  const y = 0.5 * (
    2 * p1.y +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
  return Math.max(0, Math.min(1, y));
}

// color wheel {h:0..360, s:0..1} -> signed rgb offset centered on 0
function wheelToRGB(wheel) {
  if (!wheel || wheel.s === 0) return new Float32Array([0, 0, 0]);
  const h = wheel.h / 360;
  const s = wheel.s;
  // hsl at l=0.5 then recenter around 0
  const rgb = hslToRgbArr(h, 1, 0.5);
  return new Float32Array([
    (rgb[0] - 0.5) * s,
    (rgb[1] - 0.5) * s,
    (rgb[2] - 0.5) * s
  ]);
}
function hslToRgbArr(h, s, l) {
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2(p, q, h + 1/3), hue2(p, q, h), hue2(p, q, h - 1/3)];
}
