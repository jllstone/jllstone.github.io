// 通用工具：数学、图片加载与预处理（裁边、自动纸白边、透明度遮罩）
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const beat = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)));
export const TAU = Math.PI * 2;

const imageCache = new Map();
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((ok, fail) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error('图片加载失败：' + src));
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

// 找到图片中不透明像素的外框
function alphaBox(img, maxSide = 2048) {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = canvas(img.width * k, img.height * k), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w: img.width, h: img.height };
  return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k };
}

/**
 * 立牌图片预处理：
 *  1. 裁掉四周透明边（插画师可以保留整张画布导出）
 *  2. 自动加一圈纸白边（edge，单位是成品像素；0 = 不加）
 *  3. 缩到最长边 ≤ maxSide
 *  4. 生成低分辨率透明度遮罩，用于点击判定与底边宽度测量
 * 返回 { canvas, w, h, crop, mask, maskW, maskH, base:[左,右](0..1) }
 */
export async function prepareCut(src, { edge = 5, maxSide = 1024, paper = '#fbf1dc', trim = true } = {}) {
  const img = await loadImage(src);
  const box = trim ? alphaBox(img) : { x: 0, y: 0, w: img.width, h: img.height };
  const k = Math.min(1, maxSide / Math.max(box.w, box.h));
  const e = Math.round(edge);
  const W = Math.round(box.w * k) + e * 2, H = Math.round(box.h * k) + e * 2;
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  if (e > 0) {
    // 把剪影向外扩 e 像素，填成纸色，形成手工剪纸常见的白边
    const s = canvas(W, H), sg = s.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      sg.drawImage(img, box.x, box.y, box.w, box.h, e + Math.cos(a) * e, e + Math.sin(a) * e, box.w * k, box.h * k);
    }
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = paper; sg.fillRect(0, 0, W, H);
    g.drawImage(s, 0, 0);
  }
  g.drawImage(img, box.x, box.y, box.w, box.h, e, e, box.w * k, box.h * k);
  // 遮罩
  const mk = Math.min(1, 160 / Math.max(W, H)), mw = Math.max(2, Math.round(W * mk)), mh = Math.max(2, Math.round(H * mk));
  const m = canvas(mw, mh), mg = m.getContext('2d', { willReadFrequently: true }); mg.drawImage(c, 0, 0, mw, mh);
  const md = mg.getImageData(0, 0, mw, mh).data, mask = new Uint8Array(mw * mh);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3];
  // 底边宽度（用于折舌）
  let b0 = 1, b1 = 0;
  for (let y = mh - 1; y >= Math.floor(mh * 0.9); y--) for (let x = 0; x < mw; x++) if (mask[y * mw + x] > 128) { b0 = Math.min(b0, x / mw); b1 = Math.max(b1, (x + 1) / mw); }
  if (b1 <= b0) { b0 = 0.3; b1 = 0.7; }
  return { canvas: c, w: W, h: H, crop: { ...box, k, e }, mask, maskW: mw, maskH: mh, base: [b0, b1] };
}

export function maskAlpha(cut, u, v) {
  const x = clamp(Math.floor(u * cut.maskW), 0, cut.maskW - 1), y = clamp(Math.floor((1 - v) * cut.maskH), 0, cut.maskH - 1);
  return cut.mask[y * cut.maskW + x] / 255;
}

// 把地面页（可以是一张跨页，也可以是左右两张）切成左右两半的画布
export async function prepareGround(ground, size = [1024, 1200], fallback = '#efe0bd') {
  const halves = [canvas(...size), canvas(...size)];
  const draw = (g, img, sx, sw) => g.drawImage(img, sx, 0, sw, img.height, 0, 0, size[0], size[1]);
  halves.forEach(c => { const g = c.getContext('2d'); g.fillStyle = fallback; g.fillRect(0, 0, size[0], size[1]); });
  if (ground?.spread) {
    const img = await loadImage(ground.spread);
    draw(halves[0].getContext('2d'), img, 0, img.width / 2);
    draw(halves[1].getContext('2d'), img, img.width / 2, img.width / 2);
  } else {
    if (ground?.left) { const img = await loadImage(ground.left); draw(halves[0].getContext('2d'), img, 0, img.width); }
    if (ground?.right) { const img = await loadImage(ground.right); draw(halves[1].getContext('2d'), img, 0, img.width); }
  }
  return halves;
}

export function blankCanvas(w, h) { return canvas(w, h); }

// 纸面颗粒（所有纸片共享）
export function grainCanvas(size = 128, seed = 913) {
  const c = canvas(size, size), g = c.getContext('2d'), px = g.createImageData(size, size);
  let s = seed;
  for (let i = 0; i < px.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const n = 150 + (s >>> 25);
    px.data[i] = px.data[i + 1] = px.data[i + 2] = n; px.data[i + 3] = 255;
  }
  g.putImageData(px, 0, 0);
  return c;
}

export function seeded(seed = 1) { let s = seed >>> 0; return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296); }

export function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
