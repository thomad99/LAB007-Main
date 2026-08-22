export const FX_STYLES = [
  { id: "kenburns", name: "Ken Burns" },
  { id: "drift", name: "Slow Drift" },
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

function renderFx(ctx, src, w, h, t, fx, intensity = 1) {
  const k = intensity;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  if (fx === "still" || !fx) {
    ctx.drawImage(src, 0, 0, w, h);
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
  let speedMul = options.speed ?? 1;

  function ensure(w, h) {
    const resized = sizeCanvas(canvas, ctx, w, h);
    const bw = canvas.width;
    const bh = canvas.height;
    if (resized || src.width !== bw || src.height !== bh) {
      syncSource(src, img, bw, bh, fitPi);
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
    renderFx(drawCtx, off, width, height, state.t, item.fx, item.intensity ?? 1);
  }

  function draw() {
    const w = wrap.clientWidth || img.clientWidth;
    const h = wrap.clientHeight || img.clientHeight;
    if (!w || !h || !img.naturalWidth) return;
    const { bw, bh } = ensure(w, h);
    renderFx(ctx, src, bw, bh, state.t, item.fx, item.intensity ?? 1);
  }

  img.addEventListener("load", () => {
    state.ready = true;
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
    },
    setIntensity(value) {
      item.intensity = value;
    },
    destroy() {
      wrap.remove();
    },
  };
}
