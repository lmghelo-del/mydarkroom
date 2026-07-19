// ============================================================
// raw.js — image + RAW loading with graceful fallback
//
// Strategy (matches "try RAW, fallback if it fails"):
//   1. Try native browser decode (works for JPEG/PNG/WebP/HEIC on iOS,
//      and DNG on some Safari builds via createImageBitmap).
//   2. If that fails and it's a RAW, try the LibRaw WASM decoder
//      (loaded lazily from CDN only when needed).
//   3. If RAW decode fails too, try to pull the embedded JPEG preview
//      that virtually every RAW file contains.
//   4. Surface a clear error if nothing works.
// ============================================================

const RAW_EXTENSIONS = ['cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'raf', 'orf', 'rw2', 'pef', 'dng', 'raw', 'dcr', 'kdc', '3fr', 'mef',
  'mos', 'iiq', 'gpr', 'x3f'];

export function isRawFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return RAW_EXTENSIONS.includes(ext);
}

// Returns { bitmap: ImageBitmap|HTMLImageElement, width, height, wasRaw, note }
export async function loadAnyImage(file, onStatus = () => {}) {
  const raw = isRawFile(file);

  // 1. Native decode attempt
  onStatus('Ielādē…');
  try {
    const bmp = await tryNativeDecode(file);
    if (bmp) return { bitmap: bmp, width: bmp.width, height: bmp.height, wasRaw: false, note: '' };
  } catch (e) { /* fall through */ }

  if (!raw) throw new Error('Neizdevās nolasīt attēlu. Formāts, iespējams, netiek atbalstīts.');

  // 2. LibRaw WASM decode
  onStatus('Dekodē RAW…');
  try {
    const decoded = await decodeRawWithLibRaw(file, onStatus);
    if (decoded) return { ...decoded, wasRaw: true, note: 'RAW dekodēts' };
  } catch (e) {
    console.warn('LibRaw failed:', e);
  }

  // 3. Embedded preview fallback
  onStatus('Meklē iegulto priekšskatījumu…');
  try {
    const preview = await extractEmbeddedJpeg(file);
    if (preview) return { ...preview, wasRaw: true, note: 'Izmantots RAW iegultais priekšskatījums (samazināta kvalitāte)' };
  } catch (e) { /* fall through */ }

  throw new Error('Neizdevās dekodēt šo RAW failu. Pamēģini eksportēt DNG vai JPEG no kameras/Lightroom.');
}

async function tryNativeDecode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch (e) { /* try <img> next */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img decode failed')); };
    img.src = url;
  });
}

// Lazy-load LibRaw WASM. Only fetched the first time a RAW needs it.
let _librawPromise = null;
function loadLibRaw() {
  if (_librawPromise) return _librawPromise;
  _librawPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // libraw-wasm — decodes most RAW formats in the browser
    script.src = 'https://cdn.jsdelivr.net/npm/libraw-wasm@0.4.0/dist/libraw.js';
    script.onload = () => resolve(window.LibRaw);
    script.onerror = () => reject(new Error('LibRaw CDN load failed (nav interneta?)'));
    document.head.appendChild(script);
  });
  return _librawPromise;
}

async function decodeRawWithLibRaw(file, onStatus) {
  const LibRawMod = await loadLibRaw().catch(() => null);
  if (!LibRawMod) return null;

  const buf = new Uint8Array(await file.arrayBuffer());
  const libraw = new LibRawMod();
  await libraw.open(buf);
  onStatus('Attēlo RAW pikseļus…');
  const imageData = await libraw.imageData(); // { data, width, height } RGBA
  const width = imageData.width, height = imageData.height;

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const id = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  ctx.putImageData(id, 0, 0);
  const bmp = await createImageBitmap(canvas);
  return { bitmap: bmp, width, height };
}

// Scan RAW bytes for an embedded JPEG (SOI ffd8 ... EOI ffd9).
async function extractEmbeddedJpeg(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let best = null;
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      // find EOI
      for (let j = i + 2; j < buf.length - 1; j++) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
          const len = j + 2 - i;
          if (!best || len > best.len) best = { start: i, len };
          i = j;
          break;
        }
      }
    }
  }
  if (!best || best.len < 8000) return null; // ignore tiny thumbnails
  const blob = new Blob([buf.slice(best.start, best.start + best.len)], { type: 'image/jpeg' });
  const bmp = await createImageBitmap(blob);
  return { bitmap: bmp, width: bmp.width, height: bmp.height };
}
