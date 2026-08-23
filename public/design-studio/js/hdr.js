export const FX_STYLES = [
  { id: "kenburns", name: "Ken Burns" },
  { id: "drift", name: "Slow Drift" },
  { id: "living", name: "Living Scene" },
  { id: "shimmer", name: "Light Sweep" },
  { id: "ripple", name: "Ripple" },
  { id: "blobs", name: "Liquid Warp" },
  { id: "chrome", name: "Chrome Sweep" },
  { id: "plasma", name: "Plasma Breathe" },
  { id: "wave", name: "Particle Wave" },
  { id: "oil", name: "Oil Rotate" },
  { id: "cells", name: "Cell Pulse" },
  { id: "still", name: "Still" },
];

export const LIVE_SCENES = [
  { id: "auto", name: "Auto (read the still)" },
  { id: "swim", name: "Swim — fish, birds, boats" },
  { id: "float", name: "Drift — dust, spores, jellies" },
  { id: "sway", name: "Sway — plants, trees, flags" },
  { id: "flicker", name: "Flicker — fire, neon, candles" },
];

export const HDR_IMAGES = [
  { id: "neon-blobs", name: "Neon Blobs", num: "01", src: "assets/hdr/neon-blobs.png", fx: "blobs" },
  { id: "liquid-chrome", name: "Liquid Chrome", num: "02", src: "assets/hdr/liquid-chrome.png", fx: "chrome" },
  { id: "plasma-nebula", name: "Plasma Nebula", num: "03", src: "assets/hdr/plasma-nebula.png", fx: "plasma" },
  { id: "particle-wave", name: "Particle Wave", num: "04", src: "assets/hdr/particle-wave.png", fx: "wave" },
  { id: "oil-swirls", name: "Oil Swirls", num: "05", src: "assets/hdr/oil-swirls.png", fx: "oil" },
  { id: "cell-network", name: "Cell Network", num: "06", src: "assets/hdr/cell-network.png", fx: "cells" },
];

export const NEON_IMAGES = [
  { id: "neon-blobs", name: "Neon Blobs", num: "01", src: "assets/neon/neon-blobs.png", fx: "blobs", intensity: 0.22, pace: 0.42 },
  { id: "liquid-chrome", name: "Chrome Splash", num: "02", src: "assets/neon/liquid-chrome.png", fx: "chrome", intensity: 0.2, pace: 0.4 },
  { id: "blue-nebula", name: "Blue Nebula", num: "03", src: "assets/neon/blue-nebula.png", fx: "plasma", intensity: 0.24, pace: 0.38 },
  { id: "particle-wave", name: "Particle Wave", num: "04", src: "assets/neon/particle-wave.png", fx: "wave", intensity: 0.26, pace: 0.45 },
  { id: "oil-swirls", name: "Oil Swirls", num: "05", src: "assets/neon/oil-swirls.png", fx: "oil", intensity: 0.2, pace: 0.35 },
  { id: "cell-web", name: "Cell Web", num: "06", src: "assets/neon/cell-web.png", fx: "cells", intensity: 0.28, pace: 0.4 },
  { id: "blobs-2", name: "Magenta Drift", num: "07", src: "assets/neon/blobs-2.png", fx: "blobs", intensity: 0.22, pace: 0.42 },
  { id: "chrome-2", name: "Mercury Drop", num: "08", src: "assets/neon/chrome-2.png", fx: "chrome", intensity: 0.2, pace: 0.4 },
  { id: "nebula-2", name: "Cyan Veil", num: "09", src: "assets/neon/nebula-2.png", fx: "plasma", intensity: 0.24, pace: 0.38 },
  { id: "wave-2", name: "Dot Terrain", num: "10", src: "assets/neon/wave-2.png", fx: "wave", intensity: 0.26, pace: 0.45 },
  { id: "swirl-2", name: "Iridescent Mix", num: "11", src: "assets/neon/swirl-2.png", fx: "oil", intensity: 0.2, pace: 0.35 },
  { id: "web-2", name: "Green Lattice", num: "12", src: "assets/neon/web-2.png", fx: "cells", intensity: 0.28, pace: 0.4 },
];

function sizeCanvas(canvas, ctx, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return false;
}

function drawCover(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function syncSource(src, img, w, h, cover) {
  if (src.width !== w || src.height !== h) {
    src.width = w;
    src.height = h;
  }
  const sctx = src.getContext("2d");
  sctx.clearRect(0, 0, w, h);
  if (cover) drawCover(sctx, img, w, h);
  else sctx.drawImage(img, 0, 0, w, h);
}

function warpRows(ctx, src, w, h, sample) {
  for (let y = 0; y < h; y += 1) {
    const { dx, sy } = sample(y);
    let srcY = sy | 0;
    if (srcY < 0) srcY = 0;
    if (srcY >= h) srcY = h - 1;
    ctx.drawImage(src, 0, srcY, w, 1, dx, y, w, 1);
  }
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function channelMedian(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1] || 0;
}

function blobMode(blob, scene) {
  const aspect = blob.w / Math.max(1, blob.h);
  const [hue, sat] = rgbToHsl(blob.color[0], blob.color[1], blob.color[2]);
  const green = hue > 70 && hue < 170 && sat > 0.18;
  const warm = hue < 48 || hue > 320;
  if (aspect < 0.72 && (green || blob.cy > 0.58)) return "sway";
  if (scene === "flicker" || (warm && sat > 0.45 && blob.area < 900)) return "flicker";
  if (aspect > 1.12 || scene === "swim") return "swim";
  return "float";
}

function classifyScene(med, blobs) {
  const [hue, sat] = rgbToHsl(med[0], med[1], med[2]);
  const warmth = med[0] / (med[0] + med[1] + med[2] + 1);
  const aquatic = hue > 145 && hue < 230 && sat > 0.12;
  const avgY = blobs.length ? blobs.reduce((s, b) => s + b.cy, 0) / blobs.length : 0.5;
  const avgAspect = blobs.length
    ? blobs.reduce((s, b) => s + b.w / Math.max(1, b.h), 0) / blobs.length
    : 1;
  if (aquatic || avgAspect > 1.35) return "swim";
  if (warmth > 0.48 && med[0] > med[2]) return "flicker";
  if (avgY > 0.56 && avgAspect < 0.9) return "sway";
  return "float";
}

function extractSprite(img, blob, aw, ah) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const pad = 3;
  const x0 = Math.max(0, blob.minX - pad);
  const y0 = Math.max(0, blob.minY - pad);
  const x1 = Math.min(aw - 1, blob.maxX + pad);
  const y1 = Math.min(ah - 1, blob.maxY + pad);
  const mw = x1 - x0 + 1;
  const mh = y1 - y0 + 1;
  const mask = document.createElement("canvas");
  mask.width = mw;
  mask.height = mh;
  const mctx = mask.getContext("2d");
  const id = mctx.createImageData(mw, mh);
  const px = id.data;
  for (let p = 0; p < blob.pixels.length; p += 1) {
    const i = blob.pixels[p];
    const lx = (i % aw) - x0;
    const ly = ((i / aw) | 0) - y0;
    if (lx < 0 || ly < 0 || lx >= mw || ly >= mh) continue;
    const o = (ly * mw + lx) * 4;
    px[o] = 255;
    px[o + 1] = 255;
    px[o + 2] = 255;
    px[o + 3] = 255;
  }
  mctx.putImageData(id, 0, 0);

  let sw = Math.max(8, Math.round((mw / aw) * iw));
  let sh = Math.max(8, Math.round((mh / ah) * ih));
  const cap = 220;
  if (Math.max(sw, sh) > cap) {
    const s = cap / Math.max(sw, sh);
    sw = Math.max(8, Math.round(sw * s));
    sh = Math.max(8, Math.round(sh * s));
  }
  const sprite = document.createElement("canvas");
  sprite.width = sw;
  sprite.height = sh;
  const sctx = sprite.getContext("2d");
  sctx.drawImage(img, (x0 / aw) * iw, (y0 / ah) * ih, (mw / aw) * iw, (mh / ah) * ih, 0, 0, sw, sh);
  sctx.globalCompositeOperation = "destination-in";
  sctx.filter = `blur(${Math.max(1, Math.round(Math.min(sw, sh) * 0.045))}px)`;
  sctx.drawImage(mask, 0, 0, sw, sh);
  sctx.filter = "none";
  sctx.globalCompositeOperation = "source-over";
  return sprite;
}

function connectedBlobs(mask, data, scores, w, h, minA, maxA) {
  const seen = new Uint8Array(w * h);
  const blobs = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
      if (!mask[start] || seen[start]) continue;
      const pixels = [];
      const stack = [start];
      seen[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let r = 0;
      let g = 0;
      let b = 0;
      let score = 0;
      while (stack.length) {
        const i = stack.pop();
        pixels.push(i);
        const px = i % w;
        const py = (i / w) | 0;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        const o = i * 4;
        r += data[o];
        g += data[o + 1];
        b += data[o + 2];
        score += scores[i];
        if (px > 0 && mask[i - 1] && !seen[i - 1]) {
          seen[i - 1] = 1;
          stack.push(i - 1);
        }
        if (px < w - 1 && mask[i + 1] && !seen[i + 1]) {
          seen[i + 1] = 1;
          stack.push(i + 1);
        }
        if (py > 0 && mask[i - w] && !seen[i - w]) {
          seen[i - w] = 1;
          stack.push(i - w);
        }
        if (py < h - 1 && mask[i + w] && !seen[i + w]) {
          seen[i + w] = 1;
          stack.push(i + w);
        }
      }
      const area = pixels.length;
      if (area < minA || area > maxA) continue;
      const touches = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
      if (touches && area > 0.035 * w * h) continue;
      const n = area;
      blobs.push({
        pixels,
        minX,
        maxX,
        minY,
        maxY,
        area,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        cx: (minX + maxX) * 0.5 / w,
        cy: (minY + maxY) * 0.5 / h,
        color: [r / n, g / n, b / n],
        score: score / n,
      });
    }
  }
  return blobs;
}

function pickPeaks(scores, w, h, count) {
  const candidates = [];
  const step = 5;
  const margin = Math.max(6, Math.round(Math.min(w, h) * 0.08));
  for (let y = margin; y < h - margin; y += step) {
    for (let x = margin; x < w - margin; x += step) {
      const i = y * w + x;
      const v = scores[i];
      if (v < 0.22) continue;
      if (v < scores[i - step] || v < scores[i + step] || v < scores[i - step * w] || v < scores[i + step * w]) continue;
      candidates.push({ x, y, v });
    }
  }
  candidates.sort((a, b) => b.v - a.v);
  const picked = [];
  const minDist = Math.max(14, Math.round(Math.min(w, h) * 0.1));
  for (let i = 0; i < candidates.length && picked.length < count; i += 1) {
    const c = candidates[i];
    if (picked.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < minDist)) continue;
    picked.push(c);
  }
  return picked;
}

export function analyzeLiving(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { sprites: [], scene: "float", water: [40, 80, 100] };

  const maxSide = 360;
  const scale = maxSide / Math.max(iw, ih);
  const w = Math.max(48, Math.round(iw * scale));
  const h = Math.max(48, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return { sprites: [], scene: "float", water: [40, 80, 100] };
  }

  const { data } = imageData;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 16) continue;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }
  const med = [channelMedian(rs), channelMedian(gs), channelMedian(bs)];
  const scores = new Float32Array(w * h);
  const marginX = Math.round(w * 0.06);
  const marginY = Math.round(h * 0.06);
  let maxScore = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const o = i * 4;
      if (x < marginX || y < marginY || x >= w - marginX || y >= h - marginY || data[o + 3] < 16) {
        scores[i] = 0;
        continue;
      }
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const dist = Math.sqrt((r - med[0]) ** 2 + (g - med[1]) ** 2 + (b - med[2]) ** 2) / 441;
      const [, sat, lum] = rgbToHsl(r, g, b);
      const nx = Math.min(w - 1, x + 3);
      const ny = Math.min(h - 1, y + 3);
      const nL = (data[(ny * w + nx) * 4] * 0.3 + data[(ny * w + nx) * 4 + 1] * 0.59 + data[(ny * w + nx) * 4 + 2] * 0.11) / 255;
      const edge = Math.abs(lum - nL);
      const v = dist * 0.52 + sat * 0.28 + edge * 0.2;
      scores[i] = v;
      if (v > maxScore) maxScore = v;
    }
  }

  if (maxScore < 0.08) {
    return { sprites: [], scene: classifyScene(med, []), water: med };
  }

  const sample = [];
  for (let i = 0; i < scores.length; i += 4) {
    if (scores[i] > 0) sample.push(scores[i]);
  }
  sample.sort((a, b) => a - b);
  const thr = Math.max(0.16, sample[Math.floor(sample.length * 0.86)] || 0.2);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < scores.length; i += 1) {
    if (scores[i] >= thr) mask[i] = 1;
  }
  const dilated = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) dilated[i] = 1;
    }
  }

  const minA = Math.max(18, Math.round(w * h * 0.0011));
  const maxA = Math.round(w * h * 0.09);
  let blobs = connectedBlobs(dilated, data, scores, w, h, minA, maxA);
  blobs.sort((a, b) => b.score * Math.sqrt(b.area) - a.score * Math.sqrt(a.area));

  const kept = [];
  for (let i = 0; i < blobs.length && kept.length < 10; i += 1) {
    const blob = blobs[i];
    const compact = blob.area / Math.max(1, blob.w * blob.h);
    if (compact < 0.18) continue;
    const hit = kept.some((other) => {
      const ix = Math.max(0, Math.min(blob.maxX, other.maxX) - Math.max(blob.minX, other.minX));
      const iy = Math.max(0, Math.min(blob.maxY, other.maxY) - Math.max(blob.minY, other.minY));
      const inter = ix * iy;
      const union = blob.area + other.area - inter;
      return union && inter / union > 0.42;
    });
    if (!hit) kept.push(blob);
  }

  if (kept.length < 2) {
    const peaks = pickPeaks(scores, w, h, 8);
    peaks.forEach((peak) => {
      const rad = Math.max(6, Math.round(Math.min(w, h) * 0.045));
      const pixels = [];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = peak.y - rad; y <= peak.y + rad; y += 1) {
        for (let x = peak.x - rad; x <= peak.x + rad; x += 1) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if ((x - peak.x) ** 2 + (y - peak.y) ** 2 > rad * rad) continue;
          const i = y * w + x;
          pixels.push(i);
          const o = i * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
        }
      }
      if (pixels.length < 12) return;
      kept.push({
        pixels,
        minX: peak.x - rad,
        maxX: peak.x + rad,
        minY: peak.y - rad,
        maxY: peak.y + rad,
        area: pixels.length,
        w: rad * 2,
        h: rad * 2,
        cx: peak.x / w,
        cy: peak.y / h,
        color: [r / pixels.length, g / pixels.length, b / pixels.length],
        score: peak.v,
      });
    });
  }

  const scene = classifyScene(med, kept);
  const sprites = kept.slice(0, 10).map((blob, i) => ({
    canvas: extractSprite(img, blob, w, h),
    ox: blob.cx,
    oy: blob.cy,
    nw: blob.w / w,
    nh: blob.h / h,
    mode: blobMode(blob, scene),
    phase: i * 1.17 + blob.cx * 4,
    color: blob.color,
    travel: 0.16 + (i % 5) * 0.03,
  }));

  return { sprites, scene, water: med };
}

function ensureLiveBlur(live, src, w, h) {
  if (live.blur && live.blurW === w && live.blurH === h) return live.blur;
  const blur = document.createElement("canvas");
  blur.width = w;
  blur.height = h;
  const bctx = blur.getContext("2d");
  bctx.filter = `blur(${Math.max(8, Math.round(w * 0.022))}px)`;
  bctx.drawImage(src, 0, 0, w, h);
  bctx.filter = "none";
  live.blur = blur;
  live.blurW = w;
  live.blurH = h;
  return blur;
}

function coverSpriteHoles(ctx, live, src, w, h) {
  if (!live.sprites.length) return;
  const blur = ensureLiveBlur(live, src, w, h);
  const water = live.water || [30, 70, 90];
  live.sprites.forEach((sprite) => {
    const rw = Math.max(10, sprite.nw * w * 0.72);
    const rh = Math.max(10, sprite.nh * h * 0.72);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sprite.ox * w, sprite.oy * h, rw, rh, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = `rgba(${water[0] | 0}, ${water[1] | 0}, ${water[2] | 0}, 0.55)`;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(blur, 0, 0, w, h);
    ctx.restore();
  });
}

function drawLivingSprite(ctx, sprite, w, h, t, k, mode) {
  const travel = sprite.travel * (0.55 + k * 1.1);
  const dw = Math.max(8, sprite.nw * w * 1.04);
  const dh = Math.max(8, sprite.nh * h * 1.04);
  let x = sprite.ox * w;
  let y = sprite.oy * h;
  let rot = 0;
  let flip = 1;
  let scale = 1;

  if (mode === "swim") {
    const osc = t * (0.55 + k * 0.55) + sprite.phase;
    const u = Math.sin(osc);
    flip = Math.cos(osc) >= 0 ? 1 : -1;
    x = sprite.ox * w + u * travel * w;
    y = sprite.oy * h + Math.sin(osc * 1.6 + sprite.phase) * h * 0.035 * k;
    x = Math.max(dw * 0.6, Math.min(w - dw * 0.6, x));
    y = Math.max(dh * 0.6, Math.min(h - dh * 0.6, y));
  } else if (mode === "sway") {
    rot = Math.sin(t * 0.9 + sprite.phase) * 0.22 * k;
    x = sprite.ox * w + Math.sin(t * 0.7 + sprite.phase) * w * 0.012 * k;
    y = sprite.oy * h;
  } else if (mode === "flicker") {
    scale = 0.92 + Math.abs(Math.sin(t * 6 + sprite.phase)) * 0.18 * k;
    y = sprite.oy * h - Math.abs(Math.sin(t * 5.2 + sprite.phase)) * h * 0.02 * k;
    ctx.globalAlpha = 0.75 + Math.sin(t * 8 + sprite.phase) * 0.2;
  } else {
    x = sprite.ox * w + Math.sin(t * 0.45 + sprite.phase) * travel * w * 0.7;
    y = sprite.oy * h + Math.cos(t * 0.33 + sprite.phase * 1.3) * travel * h * 0.45;
    x = Math.max(dw * 0.5, Math.min(w - dw * 0.5, x));
    y = Math.max(dh * 0.5, Math.min(h - dh * 0.5, y));
  }

  ctx.save();
  ctx.translate(x, y);
  if (mode === "sway") {
    ctx.translate(0, dh * 0.45);
    ctx.rotate(rot);
    ctx.translate(0, -dh * 0.45);
  }
  ctx.scale(flip * scale, scale);
  ctx.drawImage(sprite.canvas, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawLivingExtras(ctx, live, w, h, t, k, scene) {
  if (scene === "swim") {
    ctx.save();
    ctx.fillStyle = "rgba(220,245,255,0.38)";
    for (let i = 0; i < 14; i += 1) {
      const x = ((0.12 + (i * 0.061 + t * 0.015) % 0.76) * w);
      const y = h * (0.88 - ((t * (0.07 + (i % 4) * 0.02) + i * 0.18) % 0.72));
      const r = (1.2 + (i % 4)) * (0.6 + k);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.1 + 0.1 * k;
    for (let i = 0; i < 4; i += 1) {
      const yy = h * (0.2 + i * 0.16) + Math.sin(t * 0.7 + i) * 10;
      ctx.strokeStyle = "rgba(180,230,255,0.7)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(w * 0.5, yy + Math.sin(t + i) * 18, w, yy);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (scene === "flicker") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const pulse = 0.08 + Math.abs(Math.sin(t * 7)) * 0.12 * k;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.72, 8, w * 0.5, h * 0.55, w * 0.42);
    g.addColorStop(0, `rgba(255,170,60,${pulse + 0.08})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  if (scene === "float") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(200,230,255,0.35)";
    for (let i = 0; i < 18; i += 1) {
      const px = ((Math.sin(i * 12.1 + t * 0.22) * 0.5 + 0.5) * w);
      const py = ((Math.cos(i * 7.7 + t * 0.18) * 0.5 + 0.5) * h);
      ctx.globalAlpha = (0.12 + (i % 5) * 0.04) * k;
      ctx.beginPath();
      ctx.arc(px, py, 1.1 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function renderLiving(ctx, src, w, h, t, k, live, scenePref) {
  const scene = scenePref && scenePref !== "auto" ? scenePref : live?.scene || "float";
  const amp = 0.55 + k * 0.7;
  warpRows(ctx, src, w, h, (y) => {
    const inside = Math.sin((y / h) * Math.PI);
    return {
      dx: Math.sin(y * 0.028 + t * 1.05) * 7 * amp * inside * 0.45,
      sy: y + Math.sin(y * 0.02 + t * 0.7) * 2.4 * amp * inside * 0.45,
    };
  });
  if (!live?.sprites?.length) {
    drawLivingExtras(ctx, live, w, h, t, k, scene);
    return;
  }
  coverSpriteHoles(ctx, live, src, w, h);
  live.sprites.forEach((sprite) => {
    drawLivingSprite(ctx, sprite, w, h, t, k, scenePref && scenePref !== "auto" ? scene : sprite.mode);
  });
  drawLivingExtras(ctx, live, w, h, t, k, scene);
}

function renderFx(ctx, src, w, h, t, fx, intensity = 1, live = null, scene = "auto") {
  const k = intensity;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  if (fx === "still" || !fx) {
    ctx.drawImage(src, 0, 0, w, h);
    return;
  }

  if (fx === "living") {
    renderLiving(ctx, src, w, h, t, k, live, scene);
    return;
  }

  if (fx === "kenburns") {
    const z = 1.06 + Math.sin(t * 0.18) * 0.05 * k;
    const ox = Math.sin(t * 0.12) * w * 0.035 * k;
    const oy = Math.cos(t * 0.1) * h * 0.03 * k;
    ctx.save();
    ctx.translate(w / 2 + ox, h / 2 + oy);
    ctx.scale(z, z);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }

  if (fx === "drift") {
    const ox = Math.sin(t * 0.35) * 10 * k;
    const oy = Math.cos(t * 0.28) * 7 * k;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    return;
  }

  if (fx === "shimmer") {
    ctx.drawImage(src, 0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const x = ((t * 0.18) % 1.6 - 0.3) * w;
    const g = ctx.createLinearGradient(x, 0, x + w * 0.28, h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(210,235,255,${0.18 * k})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  if (fx === "ripple") {
    warpRows(ctx, src, w, h, (y) => ({
      dx: Math.sin(y * 0.04 + t * 1.6) * 8 * k,
      sy: y + Math.sin(y * 0.03 + t * 1.1) * 4 * k,
    }));
    return;
  }

  if (fx === "blobs") {
    const amp = (9 + Math.sin(t * 0.9) * 5) * k;
    warpRows(ctx, src, w, h, (y) => ({
      dx: Math.sin(y * 0.028 + t * 1.15) * amp + Math.sin(y * 0.01 + t * 0.4) * 4 * k,
      sy: y + Math.sin(y * 0.018 + t * 0.85) * 5 * k,
    }));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (0.22 + Math.sin(t * 1.4) * 0.08) * Math.min(1, k + 0.35);
    ctx.translate(w / 2, h / 2);
    ctx.scale(1.02 + Math.sin(t * 0.7) * 0.03 * k, 1.02 + Math.cos(t * 0.6) * 0.03 * k);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.globalAlpha = 0.35 * k + 0.12;
    ctx.fillStyle = "#7ee7ff";
    for (let i = 0; i < 18; i += 1) {
      const px = ((Math.sin(i * 12.1 + t * 0.35) * 0.5 + 0.5) * w);
      const py = ((Math.cos(i * 7.7 + t * 0.28) * 0.5 + 0.5) * h);
      const r = 1.1 + (i % 4) * 0.4;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (fx === "chrome") {
    warpRows(ctx, src, w, h, (y) => ({
      dx: Math.sin(y * 0.045 - t * 2.2) * 7 * k + Math.sin(y * 0.12 + t) * 2 * k,
      sy: y + Math.sin(y * 0.03 + t * 1.6) * 3 * k,
    }));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const hx = w * (0.35 + Math.sin(t * 0.9) * 0.28);
    const hy = h * (0.28 + Math.cos(t * 0.7) * 0.2);
    const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, w * 0.28);
    g.addColorStop(0, `rgba(255,255,255,${0.42 * (0.45 + k * 0.55)})`);
    g.addColorStop(0.45, "rgba(200,220,255,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  if (fx === "plasma") {
    const breathe = 0.96 + Math.sin(t * 0.8) * 0.08 * k;
    ctx.filter = `brightness(${breathe}) saturate(${1 + 0.15 * k})`;
    warpRows(ctx, src, w, h, (y) => {
      const n = (y / h - 0.5) * 2;
      return {
        dx: Math.sin(t * 0.45 + y * 0.025) * 11 * k * (1 - n * n * 0.3) + Math.cos(t * 0.2 + y * 0.01) * 3 * k,
        sy: y + Math.cos(t * 0.35 + y * 0.02) * 5 * k,
      };
    });
    ctx.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (0.12 + Math.sin(t * 1.8) * 0.06) * k;
    ctx.fillStyle = "#4ecbff";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  if (fx === "wave") {
    warpRows(ctx, src, w, h, (y) => ({
      dx: Math.sin(y * 0.02 + t * 1.4) * 4 * k,
      sy: y + Math.sin(y * 0.038 + t * 2.1) * 11 * k + Math.sin(y * 0.011 + t * 0.9) * 5 * k,
    }));
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 40; i += 1) {
      const tw = 0.5 + 0.5 * Math.sin(t * 7 + i * 1.7);
      ctx.globalAlpha = (0.15 + tw * 0.55) * (0.35 + k * 0.65);
      ctx.fillStyle = i % 3 ? "#7ee7ff" : "#c9a6ff";
      const px = ((i * 73) % w);
      const py = ((i * 47 + t * 18) % h);
      ctx.beginPath();
      ctx.arc(px, py, 1.1 + tw, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (fx === "oil") {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.sin(t * 0.22) * 0.12 * k + t * 0.05 * k);
    ctx.scale(1.08 + 0.08 * k, 1.08 + 0.08 * k);
    ctx.filter = `hue-rotate(${Math.sin(t * 0.28) * 22 * k}deg) saturate(${1 + 0.25 * k})`;
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.filter = "none";
    ctx.restore();
    return;
  }

  if (fx === "cells") {
    const pulse = 1.01 + Math.sin(t * 2.2) * 0.035 * k;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(pulse, pulse);
    ctx.filter = `brightness(${1 + Math.sin(t * 2.2) * 0.12 * k})`;
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.filter = "none";
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const flash = Math.max(0, Math.sin(t * 3.1));
    ctx.globalAlpha = (0.08 + flash * 0.16) * k;
    const rg = ctx.createRadialGradient(w * 0.5, h * 0.48, 8, w * 0.5, h * 0.48, w * 0.42);
    rg.addColorStop(0, "rgba(180,255,160,0.65)");
    rg.addColorStop(0.45, "rgba(80,255,200,0.18)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  ctx.drawImage(src, 0, 0, w, h);
}

export function createHdrItem(item, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "deck hdr-card";
  wrap.dataset.id = item.id;
  const fitPi = options.fit === "pi";
  if (fitPi) wrap.classList.add("pi-screen");

  const img = document.createElement("img");
  img.src = options.src || item.src;
  img.alt = item.name;
  img.draggable = false;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const src = document.createElement("canvas");
  wrap.append(img, canvas);

  const state = { t: 0, ready: false };
  const live = { key: "", ready: false, sprites: [], scene: "float", water: [40, 80, 100] };
  let speedMul = options.speed ?? 1;

  function ensureLive() {
    if (item.fx !== "living" || !img.naturalWidth) return live;
    const key = `${img.naturalWidth}x${img.naturalHeight}:${img.currentSrc || img.src}`;
    if (live.ready && live.key === key) return live;
    const next = analyzeLiving(img);
    live.key = key;
    live.ready = true;
    live.sprites = next.sprites || [];
    live.scene = next.scene || "float";
    live.water = next.water || [40, 80, 100];
    live.blur = null;
    return live;
  }

  function ensure(w, h) {
    const resized = sizeCanvas(canvas, ctx, w, h);
    const bw = canvas.width;
    const bh = canvas.height;
    if (resized || src.width !== bw || src.height !== bh) {
      syncSource(src, img, bw, bh, fitPi);
      live.blur = null;
    }
    return { bw, bh };
  }

  function update(dt) {
    state.t += dt * (item.pace ?? 1) * speedMul;
  }

  function paint(drawCtx, width, height) {
    if (!img.naturalWidth) return;
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const octx = off.getContext("2d");
    if (fitPi) drawCover(octx, img, width, height);
    else octx.drawImage(img, 0, 0, width, height);
    renderFx(drawCtx, off, width, height, state.t, item.fx, item.intensity ?? 1, ensureLive(), item.scene || "auto");
  }

  function draw() {
    const w = wrap.clientWidth || img.clientWidth;
    const h = wrap.clientHeight || img.clientHeight;
    if (!w || !h || !img.naturalWidth) return;
    const { bw, bh } = ensure(w, h);
    renderFx(ctx, src, bw, bh, state.t, item.fx, item.intensity ?? 1, ensureLive(), item.scene || "auto");
  }

  img.addEventListener("load", () => {
    state.ready = true;
    live.ready = false;
    draw();
  });
  if (img.complete && img.naturalWidth) state.ready = true;

  return {
    el: wrap,
    deck: item,
    img,
    fullPaint: true,
    outputSize: fitPi ? { w: 1920, h: 480 } : null,
    state,
    update,
    draw,
    paint,
    setSpeed(mul) {
      speedMul = mul;
    },
    getSpeed() {
      return speedMul;
    },
    setFx(fx) {
      item.fx = fx;
      if (fx === "living") live.ready = false;
    },
    setScene(scene) {
      item.scene = scene;
    },
    setIntensity(value) {
      item.intensity = value;
    },
    destroy() {
      wrap.remove();
    },
  };
}
