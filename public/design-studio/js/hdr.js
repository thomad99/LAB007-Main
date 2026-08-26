export const FX_STYLES = [
  { id: "kenburns", name: "Ken Burns" },
  { id: "drift", name: "Slow Drift" },
  { id: "living", name: "Living Scene" },
  { id: "cassette", name: "Cassette Deck" },
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
  { id: "miami-vice-tank", name: "Miami Vice Tank", num: "01", src: "assets/hdr/miami-vice-tank.jpg", fx: "living", scene: "swim", intensity: 0.55, pace: 0.9 },
  { id: "neon-blobs", name: "Neon Blobs", num: "02", src: "assets/hdr/neon-blobs.png", fx: "blobs" },
  { id: "liquid-chrome", name: "Liquid Chrome", num: "03", src: "assets/hdr/liquid-chrome.png", fx: "chrome" },
  { id: "plasma-nebula", name: "Plasma Nebula", num: "04", src: "assets/hdr/plasma-nebula.png", fx: "plasma" },
  { id: "particle-wave", name: "Particle Wave", num: "05", src: "assets/hdr/particle-wave.png", fx: "wave" },
  { id: "oil-swirls", name: "Oil Swirls", num: "06", src: "assets/hdr/oil-swirls.png", fx: "oil" },
  { id: "cell-network", name: "Cell Network", num: "07", src: "assets/hdr/cell-network.png", fx: "cells" },
  { id: "cassette-classic", name: "Cassette Deck", num: "08", src: "assets/cassettes/classic-black.png", fx: "cassette", intensity: 0.7, pace: 1 },
  { id: "cassette-mix", name: "Awesome Mix Deck", num: "09", src: "assets/cassettes/awesome-mix.png", fx: "cassette", intensity: 0.7, pace: 1 },
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

function luma(r, g, b) {
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}

function blobMode(blob, scene) {
  if (scene === "swim") return "swim";
  const aspect = blob.w / Math.max(1, blob.h);
  const [hue, sat] = rgbToHsl(blob.color[0], blob.color[1], blob.color[2]);
  const green = hue > 70 && hue < 170 && sat > 0.18;
  const warm = hue < 48 || hue > 320;
  if (aspect < 0.72 && (green || blob.cy > 0.58)) return "sway";
  if (scene === "flicker" || (warm && sat > 0.45 && blob.area < 900)) return "flicker";
  if (aspect > 1.12) return "swim";
  return "float";
}

function classifyScene(med, blobs, aquarium) {
  if (aquarium) return "swim";
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

function findTankRect(data, w, h) {
  const row = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      if (data[o + 3] < 16) continue;
      if (luma(data[o], data[o + 1], data[o + 2]) > 0.07) row[y] += 1;
    }
  }
  const rowThr = w * 0.2;
  let y0 = 0;
  let y1 = h - 1;
  for (let y = 0; y < h; y += 1) {
    if (row[y] >= rowThr) {
      y0 = y;
      break;
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    if (row[y] >= rowThr) {
      y1 = y;
      break;
    }
  }
  const band = Math.max(8, y1 - y0);
  const colThr = band * 0.42;
  let x0 = 0;
  let x1 = w - 1;
  for (let x = 0; x < w; x += 1) {
    let n = 0;
    for (let y = y0; y <= y1; y += 1) {
      const o = (y * w + x) * 4;
      if (data[o + 3] > 16 && luma(data[o], data[o + 1], data[o + 2]) > 0.07) n += 1;
    }
    if (n >= colThr) {
      x0 = x;
      break;
    }
  }
  for (let x = w - 1; x >= 0; x -= 1) {
    let n = 0;
    for (let y = y0; y <= y1; y += 1) {
      const o = (y * w + x) * 4;
      if (data[o + 3] > 16 && luma(data[o], data[o + 1], data[o + 2]) > 0.07) n += 1;
    }
    if (n >= colThr) {
      x1 = x;
      break;
    }
  }
  const padX = Math.round((x1 - x0) * 0.03);
  const padY = Math.round((y1 - y0) * 0.04);
  return {
    x0: Math.max(0, x0 + padX),
    y0: Math.max(0, y0 + padY),
    x1: Math.min(w - 1, x1 - padX),
    y1: Math.min(h - 1, y1 - padY),
  };
}

function floodFromSeeds(seed, walk, w, h) {
  const out = new Uint8Array(w * h);
  const stack = [];
  for (let i = 0; i < seed.length; i += 1) {
    if (seed[i] && walk[i]) {
      out[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    const nbs = [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1];
    for (let n = 0; n < nbs.length; n += 1) {
      const j = nbs[n];
      if (j < 0 || j >= walk.length || out[j] || !walk[j]) continue;
      const nx = j % w;
      const ny = (j / w) | 0;
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  return out;
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

function lumaAt(data, w, h, x, y) {
  const xi = x < 0 ? 0 : x >= w ? w - 1 : x | 0;
  const yi = y < 0 ? 0 : y >= h ? h - 1 : y | 0;
  const o = (yi * w + xi) * 4;
  return (data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11) / 255;
}

function scoreReelCircle(data, w, h, cx, cy, r, samples = 16) {
  if (r < 5) return 0;
  if (cx - r * 1.25 < 1 || cy - r * 1.25 < 1 || cx + r * 1.25 >= w - 1 || cy + r * 1.25 >= h - 1) return 0;
  let inn = 0;
  let rim = 0;
  let out = 0;
  const hub = [];
  for (let i = 0; i < samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    inn += lumaAt(data, w, h, cx + c * r * 0.55, cy + s * r * 0.55);
    rim += lumaAt(data, w, h, cx + c * r * 0.96, cy + s * r * 0.96);
    out += lumaAt(data, w, h, cx + c * r * 1.22, cy + s * r * 1.22);
    hub.push(lumaAt(data, w, h, cx + c * r * 0.28, cy + s * r * 0.28));
  }
  inn /= samples;
  rim /= samples;
  out /= samples;
  const edge = out - inn;
  const ring = Math.max(0, out - rim) + Math.max(0, Math.abs(inn - rim) - 0.02);
  let mean = 0;
  for (let i = 0; i < hub.length; i += 1) mean += hub[i];
  mean /= hub.length;
  let varHub = 0;
  for (let i = 0; i < hub.length; i += 1) varHub += (hub[i] - mean) ** 2;
  varHub /= hub.length;
  if (edge < 0.025 && ring < 0.03) return 0;
  return edge * 1.4 + ring * 0.85 + Math.min(0.09, varHub) * 2.4 + (inn < 0.42 ? 0.1 : 0);
}

function refineHubRadius(data, w, h, cx, cy, r) {
  let bestR = r * 0.9;
  let best = -1;
  for (let t = 0.26; t <= 0.7; t += 0.03) {
    const rr = r * t;
    const n = 20;
    const samples = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      samples.push(lumaAt(data, w, h, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
    const mean = samples.reduce((s, v) => s + v, 0) / n;
    let v = 0;
    for (let i = 0; i < n; i += 1) v += (samples[i] - mean) ** 2;
    v = v / n + Math.abs(0.5 - mean) * 0.01;
    if (v > best) {
      best = v;
      bestR = rr;
    }
  }
  return best > 0.008 ? Math.min(r * 0.95, bestR * 1.18) : r * 0.9;
}

function pickReelPair(candidates, w, h) {
  const kept = [];
  const ordered = candidates.slice().sort((a, b) => b.score - a.score);
  for (let i = 0; i < ordered.length; i += 1) {
    const c = ordered[i];
    if (kept.some((p) => Math.hypot(p.cx - c.cx, p.cy - c.cy) < Math.max(c.r, p.r) * 0.72)) continue;
    kept.push(c);
    if (kept.length > 20) break;
  }
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      const a = kept[i];
      const b = kept[j];
      const rRatio = Math.max(a.r, b.r) / Math.max(1, Math.min(a.r, b.r));
      if (rRatio > 1.35) continue;
      const dy = Math.abs(a.cy - b.cy);
      const dx = Math.abs(a.cx - b.cx);
      const r = (a.r + b.r) / 2;
      if (dy > r * 0.6) continue;
      if (dx < r * 2.05 || dx > r * 8.8) continue;
      if (dx < w * 0.08 || dx > w * 0.58) continue;
      const midY = (a.cy + b.cy) / 2 / h;
      if (midY < 0.16 || midY > 0.8) continue;
      const align = 1 - dy / (r * 0.6);
      const pair = (a.score + b.score) * (0.65 + align * 0.45 + (1.35 - rRatio) * 0.35);
      if (pair > bestScore) {
        bestScore = pair;
        best = a.cx < b.cx ? [a, b] : [b, a];
      }
    }
  }
  return best || [];
}

function findCassetteReels(data, w, h) {
  const minR = Math.max(5, Math.round(Math.min(w, h) * 0.032));
  const maxR = Math.max(minR + 3, Math.round(Math.min(w, h) * 0.155));
  const y0 = Math.round(h * 0.14);
  const y1 = Math.round(h * 0.74);
  const x0 = Math.round(w * 0.1);
  const x1 = Math.round(w * 0.9);
  const coarse = [];
  for (let r = minR; r <= maxR; r += 2) {
    for (let y = y0; y < y1; y += 4) {
      for (let x = x0; x < x1; x += 4) {
        const score = scoreReelCircle(data, w, h, x, y, r, 12);
        if (score > 0.08) coarse.push({ cx: x, cy: y, r, score });
      }
    }
  }
  coarse.sort((a, b) => b.score - a.score);
  const seeds = [];
  for (let i = 0; i < coarse.length && seeds.length < 28; i += 1) {
    const c = coarse[i];
    if (seeds.some((p) => Math.hypot(p.cx - c.cx, p.cy - c.cy) < Math.max(6, c.r * 0.55))) continue;
    seeds.push(c);
  }
  const refined = seeds.map((seed) => {
    let best = seed;
    for (let r = Math.max(minR, seed.r - 3); r <= Math.min(maxR, seed.r + 3); r += 1) {
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const cx = seed.cx + dx;
          const cy = seed.cy + dy;
          const score = scoreReelCircle(data, w, h, cx, cy, r, 20);
          if (score > best.score) best = { cx, cy, r, score };
        }
      }
    }
    return { ...best, r: refineHubRadius(data, w, h, best.cx, best.cy, best.r) };
  });
  return pickReelPair(refined, w, h);
}

function isMeterPixel(r, g, b) {
  const [hue, sat, lum] = rgbToHsl(r, g, b);
  if (lum < 0.22 || lum > 0.96 || sat < 0.32) return false;
  if (hue >= 70 && hue <= 165) return true;
  if (hue >= 40 && hue <= 70 && sat > 0.42 && lum > 0.32) return true;
  if (hue >= 165 && hue <= 210 && sat > 0.4) return true;
  if ((hue <= 40 || hue >= 345) && sat > 0.5 && lum > 0.3 && g > 70) return true;
  return false;
}

function inCassetteWindow(x, y, reels) {
  if (!reels || reels.length < 2) {
    return reels?.some((reel) => Math.hypot(x - reel.cx, y - reel.cy) < reel.r * 1.4);
  }
  const left = reels[0].cx <= reels[1].cx ? reels[0] : reels[1];
  const right = left === reels[0] ? reels[1] : reels[0];
  const r = Math.max(left.r, right.r);
  return x >= left.cx - r * 1.7 && x <= right.cx + r * 1.7 && y >= Math.min(left.cy, right.cy) - r * 2.3 && y <= Math.max(left.cy, right.cy) + r * 2.3;
}

function findEqBars(data, w, h, reels) {
  const colHits = new Float32Array(w);
  const colY0 = new Int32Array(w);
  const colY1 = new Int32Array(w);
  colY0.fill(h);
  for (let x = 0; x < w; x += 1) {
    let hits = 0;
    let y0 = h;
    let y1 = 0;
    for (let y = 0; y < h; y += 1) {
      if (inCassetteWindow(x, y, reels)) continue;
      const o = (y * w + x) * 4;
      if (data[o + 3] < 16) continue;
      if (!isMeterPixel(data[o], data[o + 1], data[o + 2])) continue;
      hits += 1;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    colHits[x] = hits;
    colY0[x] = y0;
    colY1[x] = y1;
  }
  const smooth = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let s = 0;
    let n = 0;
    for (let k = -2; k <= 2; k += 1) {
      const xx = x + k;
      if (xx < 0 || xx >= w) continue;
      s += colHits[xx];
      n += 1;
    }
    smooth[x] = s / n;
  }
  const thr = Math.max(h * 0.1, 8);
  const runs = [];
  let start = -1;
  for (let x = 0; x <= w; x += 1) {
    const on = x < w && smooth[x] >= thr;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      let y0 = h;
      let y1 = 0;
      let hits = 0;
      for (let xx = start; xx < x; xx += 1) {
        hits += colHits[xx];
        if (colY0[xx] < y0) y0 = colY0[xx];
        if (colY1[xx] > y1) y1 = colY1[xx];
      }
      const bw = x - start;
      const bh = y1 - y0 + 1;
      if (bw >= 1 && bw <= w * 0.08 && bh >= h * 0.12 && bh / bw >= 2.2 && hits > h * 0.12) {
        runs.push({ x0: start, x1: x - 1, y0, y1, hits });
      }
      start = -1;
    }
  }
  if (runs.length < 2) return [];
  const groups = [];
  runs.forEach((run) => {
    const hgt = run.y1 - run.y0;
    const group = groups.find((g) => {
      const gy0 = g[0].y0;
      const gh = g[0].y1 - g[0].y0;
      const gap = run.x0 - g[g.length - 1].x1;
      return Math.abs(run.y0 - gy0) < h * 0.08 && Math.abs(hgt - gh) < gh * 0.38 && gap < w * 0.12;
    });
    if (group) group.push(run);
    else groups.push([run]);
  });
  groups.sort((a, b) => {
    const score = (g) => {
      const hits = g.reduce((s, r) => s + r.hits, 0);
      const span = Math.max(1, g[g.length - 1].x1 - g[0].x0);
      return g.length * 12 + hits / span;
    };
    return score(b) - score(a);
  });
  const picked = groups.find((g) => g.length >= 2) || [];
  if (picked.length < 2) return [];
  const span = picked[picked.length - 1].x1 - picked[0].x0;
  if (span > w * 0.5) return [];
  return picked.map((run) => ({
    x0: run.x0,
    y0: run.y0,
    x1: run.x1,
    y1: run.y1,
  }));
}

function extractCircleSprite(img, cx, cy, r, aw, ah) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const sx = iw / aw;
  const sy = ih / ah;
  const size = Math.min(220, Math.max(28, Math.round(r * 2 * ((sx + sy) / 2))));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const srcX = (cx - r) * sx;
  const srcY = (cy - r) * sy;
  ctx.drawImage(img, srcX, srcY, r * 2 * sx, r * 2 * sy, 0, 0, size, size);
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function extractBarSprite(img, bar, aw, ah) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const pad = 2;
  const x0 = Math.max(0, bar.x0 - pad);
  const y0 = Math.max(0, bar.y0 - pad);
  const x1 = Math.min(aw - 1, bar.x1 + pad);
  const y1 = Math.min(ah - 1, bar.y1 + pad);
  const mw = x1 - x0 + 1;
  const mh = y1 - y0 + 1;
  const sw = Math.max(4, Math.round((mw / aw) * iw));
  const sh = Math.max(8, Math.round((mh / ah) * ih));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, (x0 / aw) * iw, (y0 / ah) * ih, (mw / aw) * iw, (mh / ah) * ih, 0, 0, sw, sh);
  return canvas;
}

function barOffColor(data, w, bar) {
  const lumas = [];
  const pixels = [];
  for (let y = bar.y0; y <= bar.y1; y += 1) {
    for (let x = bar.x0; x <= bar.x1; x += 1) {
      const o = (y * w + x) * 4;
      const lum = luma(data[o], data[o + 1], data[o + 2]);
      lumas.push(lum);
      pixels.push([data[o], data[o + 1], data[o + 2], lum]);
    }
  }
  if (!pixels.length) return "rgb(8, 10, 12)";
  lumas.sort((a, b) => a - b);
  const cut = lumas[Math.floor(lumas.length * 0.18)] ?? 0.12;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  pixels.forEach((p) => {
    if (p[3] <= cut + 0.04) {
      r += p[0];
      g += p[1];
      b += p[2];
      n += 1;
    }
  });
  if (!n) return "rgb(8, 10, 12)";
  return `rgb(${(r / n) | 0}, ${(g / n) | 0}, ${(b / n) | 0})`;
}

export function analyzeCassette(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { reels: [], bars: [] };

  const maxSide = 340;
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
    return { reels: [], bars: [] };
  }
  const { data } = imageData;
  const found = findCassetteReels(data, w, h);
  const reels = found.map((reel, i) => ({
    canvas: extractCircleSprite(img, reel.cx, reel.cy, reel.r, w, h),
    cx: reel.cx / w,
    cy: reel.cy / h,
    rx: reel.r / w,
    ry: reel.r / h,
    phase: i * 0.08,
  }));
  const bars = findEqBars(data, w, h, found).map((bar, i) => {
    const pad = 2;
    const x0 = Math.max(0, bar.x0 - pad);
    const y0 = Math.max(0, bar.y0 - pad);
    const x1 = Math.min(w - 1, bar.x1 + pad);
    const y1 = Math.min(h - 1, bar.y1 + pad);
    return {
      canvas: extractBarSprite(img, bar, w, h),
      x: x0 / w,
      y: y0 / h,
      w: (x1 - x0 + 1) / w,
      h: (y1 - y0 + 1) / h,
      off: barOffColor(data, w, bar),
      phase: i * 0.67,
    };
  });
  return { reels, bars };
}

function meterLevel(t, i, n, k) {
  const pos = n > 1 ? i / (n - 1) : 0.5;
  const bass = 0.5 + 0.5 * Math.sin(t * 2.35);
  const mid = 0.5 + 0.5 * Math.sin(t * 3.8 + i * 0.85);
  const high = 0.5 + 0.5 * Math.sin(t * 6.4 + i * 1.65);
  const mix = bass * (0.55 - pos * 0.25) + mid * 0.32 + high * (0.18 + pos * 0.28);
  const floor = 0.1;
  const span = 0.2 + 0.72 * Math.min(1.05, k);
  return Math.max(floor, Math.min(0.98, floor + span * Math.min(1, mix)));
}

function renderCassette(ctx, src, w, h, t, k, live) {
  ctx.drawImage(src, 0, 0, w, h);
  const reels = live?.reels || [];
  const bars = live?.bars || [];
  const spin = t * (1.35 + k * 2.6);
  reels.forEach((reel, i) => {
    const cx = reel.cx * w;
    const cy = reel.cy * h;
    const rx = reel.rx * w;
    const ry = reel.ry * h;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(spin * (i ? 1.08 : 1) + (reel.phase || 0));
    ctx.drawImage(reel.canvas, -rx, -ry, rx * 2, ry * 2);
    ctx.restore();
  });
  bars.forEach((bar, i) => {
    const x = bar.x * w;
    const y = bar.y * h;
    const bw = bar.w * w;
    const bh = bar.h * h;
    const level = meterLevel(t, i, bars.length, k);
    const vis = Math.max(bh * 0.08, bh * level);
    ctx.fillStyle = bar.off || "rgb(8,10,12)";
    ctx.fillRect(x, y, bw, bh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + bh - vis, bw, vis);
    ctx.clip();
    ctx.drawImage(bar.canvas, x, y, bw, bh);
    ctx.restore();
  });
}

export function analyzeLiving(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { sprites: [], scene: "float", water: [8, 24, 48] };

  const maxSide = 520;
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
    return { sprites: [], scene: "float", water: [8, 24, 48] };
  }

  const { data } = imageData;
  const tank = findTankRect(data, w, h);
  const tankW = Math.max(8, tank.x1 - tank.x0);
  const tankH = Math.max(8, tank.y1 - tank.y0);
  const inner = {
    x0: tank.x0 + Math.round(tankW * 0.05),
    y0: tank.y0 + Math.round(tankH * 0.08),
    x1: tank.x1 - Math.round(tankW * 0.05),
    y1: tank.y1 - Math.round(tankH * 0.06),
  };

  const colorful = new Uint8Array(w * h);
  const scores = new Float32Array(w * h);
  const waterSamp = [[], [], []];
  let neonHits = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const o = i * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const [hue, sat, lum] = rgbToHsl(r, g, b);
      const inside = x >= inner.x0 && x <= inner.x1 && y >= inner.y0 && y <= inner.y1 && data[o + 3] > 16;
      if ((hue > 300 || hue < 20 || (hue > 170 && hue < 210)) && sat > 0.55 && lum > 0.45) neonHits += 1;
      if (inside && sat < 0.28 && lum < 0.22 && lum > 0.02) {
        waterSamp[0].push(r);
        waterSamp[1].push(g);
        waterSamp[2].push(b);
      }
      const isColor = inside && sat > 0.34 && lum > 0.16 && lum < 0.88;
      colorful[i] = isColor ? 1 : 0;
      scores[i] = isColor ? sat * 0.55 + (1 - Math.abs(lum - 0.45)) * 0.25 + 0.2 : 0;
    }
  }

  const aquarium = neonHits > w * 0.8 || (tankW / w > 0.42 && tankH / h > 0.42 && waterSamp[0].length > 40);
  const seed = new Uint8Array(w * h);
  const reefY = inner.y0 + Math.round(tankH * 0.78);
  for (let y = reefY; y <= inner.y1; y += 1) {
    for (let x = inner.x0; x <= inner.x1; x += 1) {
      const i = y * w + x;
      if (colorful[i]) seed[i] = 1;
    }
  }
  const coral = floodFromSeeds(seed, colorful, w, h);
  const coralDilated = new Uint8Array(w * h);
  for (let y = inner.y0; y <= inner.y1; y += 1) {
    for (let x = inner.x0; x <= inner.x1; x += 1) {
      const i = y * w + x;
      if (coral[i] || coral[i - 1] || coral[i + 1] || coral[i - w] || coral[i + w]) coralDilated[i] = 1;
    }
  }

  const fishMask = new Uint8Array(w * h);
  for (let y = inner.y0; y <= inner.y1; y += 1) {
    for (let x = inner.x0; x <= inner.x1; x += 1) {
      const i = y * w + x;
      if (colorful[i] && !coralDilated[i]) fishMask[i] = 1;
    }
  }

  const water = waterSamp[0].length
    ? [channelMedian(waterSamp[0]), channelMedian(waterSamp[1]), channelMedian(waterSamp[2])]
    : [8, 22, 48];

  const tankArea = tankW * tankH;
  const minA = Math.max(10, Math.round(tankArea * 0.0007));
  const maxA = Math.round(tankArea * (aquarium ? 0.045 : 0.09));
  const blobs = connectedBlobs(fishMask, data, scores, w, h, minA, maxA);
  blobs.sort((a, b) => b.score * Math.sqrt(b.area) - a.score * Math.sqrt(a.area));

  const waterLine = (inner.y0 + tankH * 0.68) / h;
  const kept = [];
  for (let i = 0; i < blobs.length && kept.length < 16; i += 1) {
    const blob = blobs[i];
    const compact = blob.area / Math.max(1, blob.w * blob.h);
    if (compact < 0.2) continue;
    if (aquarium && blob.cy > waterLine && blob.area > tankArea * 0.012) continue;
    let coralHit = 0;
    for (let p = 0; p < blob.pixels.length; p += 1) {
      if (coralDilated[blob.pixels[p]]) coralHit += 1;
    }
    if (blob.pixels.length && coralHit / blob.pixels.length > 0.22) continue;
    const hit = kept.some((other) => {
      const ix = Math.max(0, Math.min(blob.maxX, other.maxX) - Math.max(blob.minX, other.minX));
      const iy = Math.max(0, Math.min(blob.maxY, other.maxY) - Math.max(blob.minY, other.minY));
      const inter = ix * iy;
      const union = blob.area + other.area - inter;
      return union && inter / union > 0.42;
    });
    if (!hit) kept.push(blob);
  }

  if (!aquarium && kept.length < 2) {
    pickPeaks(scores, w, h, 8).forEach((peak) => {
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

  const scene = classifyScene(water, kept, aquarium);
  const waterBox = {
    x0: inner.x0 / w,
    y0: inner.y0 / h,
    x1: inner.x1 / w,
    y1: Math.min(inner.y1 / h, waterLine),
  };
  const sprites = kept.slice(0, 16).map((blob, i) => ({
    canvas: extractSprite(img, blob, w, h),
    ox: blob.cx,
    oy: blob.cy,
    nw: blob.w / w,
    nh: blob.h / h,
    mode: blobMode(blob, scene),
    phase: i * 1.17 + blob.cx * 4,
    color: blob.color,
    travel: aquarium ? 0.07 + (i % 5) * 0.015 : 0.16 + (i % 5) * 0.03,
    box: waterBox,
  }));

  return { sprites, scene, water, waterBox, aquarium: Boolean(aquarium) };
}

function coverSpriteHoles(ctx, live, w, h) {
  if (!live.sprites.length) return;
  const water = live.water || [8, 22, 48];
  live.sprites.forEach((sprite) => {
    const rw = Math.max(6, sprite.nw * w * 0.52);
    const rh = Math.max(6, sprite.nh * h * 0.46);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sprite.ox * w, sprite.oy * h, rw, rh, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${water[0] | 0}, ${water[1] | 0}, ${water[2] | 0})`;
    ctx.fill();
    ctx.restore();
  });
}

function drawLivingSprite(ctx, sprite, w, h, t, k, mode, waterBox) {
  const travel = sprite.travel * (0.55 + k * 1.1);
  const dw = Math.max(8, sprite.nw * w * 1.04);
  const dh = Math.max(8, sprite.nh * h * 1.04);
  const box = sprite.box || waterBox || { x0: 0.08, y0: 0.14, x1: 0.92, y1: 0.62 };
  let x = sprite.ox * w;
  let y = sprite.oy * h;
  let rot = 0;
  let flip = 1;
  let scale = 1;

  if (mode === "swim") {
    const osc = t * (0.45 + k * 0.4) + sprite.phase;
    const u = Math.sin(osc);
    flip = Math.cos(osc) >= 0 ? 1 : -1;
    const rangeX = Math.min(travel * w, (box.x1 - box.x0) * w * 0.28);
    const rangeY = Math.min(h * 0.045 * k, (box.y1 - box.y0) * h * 0.22);
    x = sprite.ox * w + u * rangeX;
    y = sprite.oy * h + Math.sin(osc * 1.35 + sprite.phase) * rangeY;
    x = Math.max(box.x0 * w + dw * 0.5, Math.min(box.x1 * w - dw * 0.5, x));
    y = Math.max(box.y0 * h + dh * 0.5, Math.min(box.y1 * h - dh * 0.5, y));
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

function renderLiving(ctx, src, w, h, t, k, live, scenePref) {
  const scene = scenePref && scenePref !== "auto" ? scenePref : live?.scene || "float";
  ctx.drawImage(src, 0, 0, w, h);
  if (!live?.sprites?.length) return;
  coverSpriteHoles(ctx, live, w, h);
  live.sprites.forEach((sprite) => {
    const mode = scenePref && scenePref !== "auto" ? scene : sprite.mode;
    drawLivingSprite(ctx, sprite, w, h, t, k, mode, live.waterBox);
  });
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

  if (fx === "cassette") {
    renderCassette(ctx, src, w, h, t, k, live);
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
    if ((item.fx !== "living" && item.fx !== "cassette") || !img.naturalWidth) return live;
    const key = `${item.fx}:${img.naturalWidth}x${img.naturalHeight}:${img.currentSrc || img.src}`;
    if (live.ready && live.key === key) return live;
    if (item.fx === "cassette") {
      const next = analyzeCassette(img);
      live.key = key;
      live.ready = true;
      live.reels = next.reels || [];
      live.bars = next.bars || [];
      live.sprites = [];
      live.blur = null;
      return live;
    }
    const next = analyzeLiving(img);
    live.key = key;
    live.ready = true;
    live.sprites = next.sprites || [];
    live.scene = next.scene || "float";
    live.water = next.water || [8, 22, 48];
    live.waterBox = next.waterBox || null;
    live.aquarium = Boolean(next.aquarium);
    live.reels = [];
    live.bars = [];
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
      if (fx === "living" || fx === "cassette") live.ready = false;
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
