(function initEliteBannerBorderGlow() {
  const header = document.querySelector('.page-header');
  const img = header && header.querySelector('img');
  const canvas = header && header.querySelector('.banner-shimmer-canvas');
  if (!header || !img || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const CYCLE_MS = 4800;
  const ICON_CYCLE_MS = 10400;
  const SHIMMER_SPAN = 0.11;
  const ICON_GLOW_SPREAD = 0.09;

  const LAYOUTS = {
    landscape: {
      left: 0.0146,
      top: 0.022,
      right: 0.974,
      bottom: 0.974,
      icons: [
        { x: 0.307, y: 0.252 },
        { x: 0.430, y: 0.256 },
        { x: 0.564, y: 0.271 },
        { x: 0.688, y: 0.258 }
      ]
    },
    portrait: {
      left: 0.031,
      top: 0.018,
      right: 0.998,
      bottom: 0.979,
      icons: [
        { x: 0.179, y: 0.277 },
        { x: 0.388, y: 0.281 },
        { x: 0.591, y: 0.275 },
        { x: 0.812, y: 0.277 }
      ]
    }
  };

  let viewW = 0;
  let viewH = 0;

  function layoutKey() {
    return img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape';
  }

  function borderRect() {
    const box = LAYOUTS[layoutKey()];
    return {
      left: viewW * box.left,
      top: viewH * box.top,
      right: viewW * box.right,
      bottom: viewH * box.bottom
    };
  }

  function pointOnRect(rect, t) {
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    const perim = 2 * (w + h);
    let d = ((t % 1) + 1) % 1 * perim;

    if (d <= h) return { x: rect.right, y: rect.top + d };
    d -= h;
    if (d <= w) return { x: rect.right - d, y: rect.bottom };
    d -= w;
    if (d <= h) return { x: rect.left, y: rect.bottom - d };
    d -= h;
    return { x: rect.left + d, y: rect.top };
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

  function drawStar(cx, cy, size, alpha) {
    if (alpha < 0.03) return;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 3.2);
    glow.addColorStop(0, 'rgba(255, 248, 220, ' + (0.95 * alpha) + ')');
    glow.addColorStop(0.35, 'rgba(242, 210, 123, ' + (0.55 * alpha) + ')');
    glow.addColorStop(1, 'rgba(215, 173, 75, 0)');

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255, 252, 236, ' + (0.35 + alpha * 0.65) + ')';
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
      const outer = size * (1 + alpha * 0.35);
      const inner = size * 0.28;
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.lineTo(Math.cos(angle + Math.PI / 4) * inner, Math.sin(angle + Math.PI / 4) * inner);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
    const rect = borderRect();
    const phase = (now % CYCLE_MS) / CYCLE_MS;
    const scale = Math.min(viewW, viewH);

    const segments = 28;
    for (let i = 0; i <= segments; i += 1) {
      const offset = (i / segments - 0.5) * SHIMMER_SPAN;
      const t = phase + offset;
      const p = pointOnRect(rect, t);
      const centerWeight = 1 - Math.abs(i / segments - 0.5) * 2;
      const intensity = centerWeight ** 1.6;
      if (intensity < 0.04) continue;

      const halo = scale * 0.028 * (0.65 + intensity * 0.9);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
      gradient.addColorStop(0, 'rgba(255, 246, 210, ' + (0.92 * intensity) + ')');
      gradient.addColorStop(0.35, 'rgba(242, 210, 123, ' + (0.62 * intensity) + ')');
      gradient.addColorStop(1, 'rgba(215, 173, 75, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, halo, 0, Math.PI * 2);
      ctx.fill();
    }

    const trailSteps = 10;
    ctx.lineCap = 'round';
    for (let i = 0; i < trailSteps; i += 1) {
      const t = phase - (i / trailSteps) * SHIMMER_SPAN * 0.55;
      const p = pointOnRect(rect, t);
      const alpha = (1 - i / trailSteps) ** 2 * 0.75;
      ctx.strokeStyle = 'rgba(255, 236, 180, ' + alpha + ')';
      ctx.lineWidth = Math.max(1.2, scale * 0.0038 * (1 - i / trailSteps));
      if (i === 0) continue;
      const prev = pointOnRect(rect, phase - ((i - 1) / trailSteps) * SHIMMER_SPAN * 0.55);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    const starPulse = Math.exp(-(circularDistance(phase, 0) ** 2) / (2 * 0.045 ** 2));
    const starX = rect.right;
    const starY = rect.top;
    drawStar(starX, starY, scale * 0.014, 0.22 + starPulse * 0.78);

    const iconPhase = (now % ICON_CYCLE_MS) / ICON_CYCLE_MS;
    const icons = LAYOUTS[layoutKey()].icons || [];
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
    resize();
    header.classList.add('is-animated');
    requestAnimationFrame(draw);
  }

  if (img.complete && img.naturalWidth) start();
  img.addEventListener('load', () => {
    resize();
    start();
  });

  window.addEventListener('resize', resize);
})();
