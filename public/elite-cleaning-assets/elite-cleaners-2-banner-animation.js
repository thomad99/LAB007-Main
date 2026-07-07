(function initEliteBannerIconGlow() {
  const header = document.querySelector('.page-header');
  const img = header && header.querySelector('img');
  const canvas = header && header.querySelector('.banner-shimmer-canvas');
  if (!header || !img || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const ICON_CYCLE_MS = 6933;
  const ICON_GLOW_SPREAD = 0.09;

  const ICON_LAYOUTS = {
    landscape: [
      { x: 0.307, y: 0.252 },
      { x: 0.430, y: 0.256 },
      { x: 0.564, y: 0.271 },
      { x: 0.688, y: 0.258 }
    ],
    portrait: [
      { x: 0.179, y: 0.277 },
      { x: 0.388, y: 0.281 },
      { x: 0.591, y: 0.275 },
      { x: 0.812, y: 0.277 }
    ]
  };

  let viewW = 0;
  let viewH = 0;

  function layoutKey() {
    return img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape';
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
    const icons = ICON_LAYOUTS[layoutKey()] || [];

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
