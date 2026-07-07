(function initEliteBannerIconGlow() {
  const header = document.querySelector('.page-header');
  const img = header && header.querySelector('img');
  const canvas = header && header.querySelector('.banner-shimmer-canvas');
  if (!header || !img || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const ICON_CYCLE_MS = 6933;
  const ICON_GLOW_SPREAD = 0.09;

  const FALLBACK_ICONS = {
    landscape: [
      { x: 0.295, y: 0.327 },
      { x: 0.424, y: 0.337 },
      { x: 0.559, y: 0.322 },
      { x: 0.694, y: 0.336 }
    ],
    portrait: [
      { x: 0.171, y: 0.298 },
      { x: 0.384, y: 0.300 },
      { x: 0.591, y: 0.298 },
      { x: 0.821, y: 0.298 }
    ]
  };

  let viewW = 0;
  let viewH = 0;
  let icons = [];

  function isGold(r, g, b) {
    return r > 130 && g > 90 && b < 130 && (r + g) > b * 2;
  }

  function layoutKey() {
    return img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape';
  }

  function detectIconsFromImage() {
    const probe = document.createElement('canvas');
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    probe.width = img.naturalWidth;
    probe.height = img.naturalHeight;
    pctx.drawImage(img, 0, 0);
    const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data;
    const w = probe.width;
    const h = probe.height;
    const pts = [];

    for (let y = Math.floor(h * 0.14); y < Math.floor(h * 0.42); y += 1) {
      for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.95); x += 1) {
        const i = (y * w + x) * 4;
        if (isGold(pixels[i], pixels[i + 1], pixels[i + 2])) pts.push({ x, y });
      }
    }

    if (pts.length < 40) return null;

    const ys = pts.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const iconPts = pts.filter((p) => p.y > minY + (maxY - minY) * 0.15 && p.y < minY + (maxY - minY) * 0.85);
    if (iconPts.length < 20) return null;

    const xs = iconPts.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const band = (maxX - minX) / 4;
    const detected = [];

    for (let index = 0; index < 4; index += 1) {
      const seg = iconPts.filter((p) => minX + index * band <= p.x && p.x < minX + (index + 1) * band);
      if (!seg.length) return null;
      detected.push({
        x: seg.reduce((sum, p) => sum + p.x, 0) / seg.length / w,
        y: seg.reduce((sum, p) => sum + p.y, 0) / seg.length / h
      });
    }

    return detected;
  }

  function refreshIcons() {
    icons = detectIconsFromImage() || FALLBACK_ICONS[layoutKey()] || FALLBACK_ICONS.landscape;
  }

  function circularDistance(a, b) {
    let d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  }

  function resize() {
    const rect = header.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawIconGlow(cx, cy, size, alpha) {
    if (alpha < 0.04) return;

    const halo = size * (2.8 + alpha * 1.4);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, halo);
    gradient.addColorStop(0, 'rgba(255, 248, 214, ' + (0.95 * alpha) + ')');
    gradient.addColorStop(0.32, 'rgba(242, 210, 123, ' + (0.68 * alpha) + ')');
    gradient.addColorStop(0.7, 'rgba(215, 173, 75, ' + (0.22 * alpha) + ')');
    gradient.addColorStop(1, 'rgba(215, 173, 75, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, halo, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 252, 236, ' + (0.18 + alpha * 0.55) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.22 + alpha * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(now) {
    if (!img.naturalWidth) {
      requestAnimationFrame(draw);
      return;
    }

    ctx.clearRect(0, 0, viewW, viewH);
    const scale = Math.min(viewW, viewH);
    const iconPhase = (now % ICON_CYCLE_MS) / ICON_CYCLE_MS;

    icons.forEach((icon, index) => {
      const center = index / icons.length;
      const glow = Math.exp(-(circularDistance(iconPhase, center) ** 2) / (2 * ICON_GLOW_SPREAD ** 2));
      drawIconGlow(
        viewW * icon.x,
        viewH * icon.y,
        scale * 0.024,
        0.12 + glow * 0.88
      );
    });

    requestAnimationFrame(draw);
  }

  let started = false;

  function start() {
    if (started) return;
    started = true;
    refreshIcons();
    resize();
    header.classList.add('is-animated');
    requestAnimationFrame(draw);
  }

  function onImageReady() {
    refreshIcons();
    resize();
    start();
  }

  if (img.complete && img.naturalWidth) onImageReady();
  img.addEventListener('load', onImageReady);

  window.addEventListener('resize', resize);
})();
