(function initEliteLogoDotGlow(selector) {
  const wrap = document.querySelector(selector || '.logo-wrap');
  const img = wrap && wrap.querySelector('img');
  if (!wrap || !img || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'logo-glow-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', img.alt || 'Elite Cleaning Services logo');
  wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  const CYCLE_MS = 5200;

  function goldScore(r, g, b) {
    if (r < 130 || g < 80 || b > 130) return 0;
    return r * 0.55 + g * 0.35 - b * 0.25;
  }

  function fallbackDots(w, h) {
    const count = 34;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.425;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });
  }

  function detectDots(w, h, data) {
    const cx = w / 2;
    const cy = h / 2;
    const slices = 80;
    const found = [];

    for (let s = 0; s < slices; s += 1) {
      const angle = (s / slices) * Math.PI * 2 - Math.PI / 2;
      let best = 0;
      let bx = 0;
      let by = 0;

      for (let radius = w * 0.33; radius <= w * 0.5; radius += 1) {
        const x = Math.round(cx + Math.cos(angle) * radius);
        const y = Math.round(cy + Math.sin(angle) * radius);
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const idx = (y * w + x) * 4;
        const score = goldScore(data[idx], data[idx + 1], data[idx + 2]);
        if (score > best) {
          best = score;
          bx = x;
          by = y;
        }
      }

      if (best > 70) found.push({ x: bx, y: by, slice: s });
    }

    const merged = [];
    found.forEach((dot) => {
      const near = merged.find((m) => Math.hypot(m.x - dot.x, m.y - dot.y) < w * 0.022);
      if (!near) merged.push(dot);
    });

    merged.sort((a, b) => a.slice - b.slice);
    return merged.length >= 12 ? merged : fallbackDots(w, h);
  }

  let dots = [];
  let viewW = 0;
  let viewH = 0;

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function circularDistance(a, b) {
    let d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  }

  function draw(now) {
    if (!img.naturalWidth) {
      requestAnimationFrame(draw);
      return;
    }

    ctx.clearRect(0, 0, viewW, viewH);
    ctx.drawImage(img, 0, 0, viewW, viewH);

    const phase = (now % CYCLE_MS) / CYCLE_MS;
    const count = dots.length;
    const spread = 0.028;

    dots.forEach((dot, index) => {
      const glow = Math.exp(-(circularDistance(index / count, phase) ** 2) / (2 * spread * spread));
      if (glow < 0.05) return;

      const sx = (dot.x / img.naturalWidth) * viewW;
      const sy = (dot.y / img.naturalHeight) * viewH;
      const core = viewW * 0.011;
      const halo = viewW * 0.055 * (1 + glow * 0.45);

      const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, halo);
      gradient.addColorStop(0, 'rgba(255, 244, 205, ' + (0.98 * glow) + ')');
      gradient.addColorStop(0.28, 'rgba(242, 210, 123, ' + (0.72 * glow) + ')');
      gradient.addColorStop(0.62, 'rgba(215, 173, 75, ' + (0.28 * glow) + ')');
      gradient.addColorStop(1, 'rgba(215, 173, 75, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, halo, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 248, 228, ' + (0.35 + glow * 0.65) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, core * (1 + glow * 0.35), 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  function setup() {
    probe.width = img.naturalWidth;
    probe.height = img.naturalHeight;
    pctx.drawImage(img, 0, 0);
    const imageData = pctx.getImageData(0, 0, probe.width, probe.height);
    dots = detectDots(probe.width, probe.height, imageData.data);
    wrap.classList.add('is-animated');
    resize();
    requestAnimationFrame(draw);
  }

  if (img.complete && img.naturalWidth) setup();
  else img.addEventListener('load', setup, { once: true });

  window.addEventListener('resize', resize);
})();
