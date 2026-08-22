export const EYE_STYLES = [
  { id: "pixel", name: "Digital Pixel", num: "01" },
  { id: "ring", name: "LED Ring", num: "02" },
  { id: "lcd", name: "LCD Screen", num: "03" },
  { id: "cartoon", name: "Cartoon", num: "04" },
  { id: "matrix", name: "AMOLED Dot Matrix", num: "05" },
  { id: "aperture", name: "Mechanical Aperture", num: "06" },
  { id: "emotive", name: "Emotive LED", num: "07" },
  { id: "vector", name: "Vector Display", num: "08" },
  { id: "halo", name: "Glow Halo", num: "09" },
  { id: "real", name: "3D Realistic", num: "10" },
];

const CYAN = "#3ecbff";
const TEAL = "#2af0d0";

let uid = 0;

function nextId() {
  uid += 1;
  return `e${uid}`;
}

function makeCanvas() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.createElement("div");
  wrap.className = "eye";
  wrap.appendChild(canvas);
  return { wrap, canvas, ctx };
}

function sizeCanvas(canvas, ctx) {
  const css = canvas.clientWidth || 168;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(css * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return css;
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function clearGlow(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ---------- canvas styles ---------- */

function drawPixel(ctx, size, look, open) {
  const n = 15;
  const cell = size / n;
  const pad = cell * 0.16;
  const cx = 0.45 * look;
  const rx = 0.52 * (1 - Math.abs(look) * 0.28);
  const ry = 0.52 * Math.max(open, 0.07);

  ctx.clearRect(0, 0, size, size);
  glow(ctx, "rgba(40,170,255,0.85)", 8);
  ctx.fillStyle = CYAN;

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = (i + 0.5) / n * 2 - 1;
      const y = (j + 0.5) / n * 2 - 1;
      if ((x - cx) ** 2 / rx ** 2 + y ** 2 / ry ** 2 <= 1) {
        ctx.fillRect(i * cell + pad, j * cell + pad, cell - pad * 2, cell - pad * 2);
      }
    }
  }
  clearGlow(ctx);
}

function drawMatrix(ctx, size, look, open) {
  const n = 17;
  const cell = size / n;
  const cx = 0.42 * look;
  const rx = 0.5 * (1 - Math.abs(look) * 0.22);
  const ry = 0.5 * Math.max(open, 0.08);

  ctx.clearRect(0, 0, size, size);
  glow(ctx, "rgba(0,255,210,0.9)", 7);

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = (i + 0.5) / n * 2 - 1;
      const y = (j + 0.5) / n * 2 - 1;
      const d = (x - cx) ** 2 / rx ** 2 + y ** 2 / ry ** 2;
      if (d <= 1) {
        const a = 0.45 + 0.55 * (1 - d);
        ctx.fillStyle = `rgba(42, 240, 208, ${a})`;
        ctx.beginPath();
        ctx.arc((i + 0.5) * cell, (j + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  clearGlow(ctx);
}

function drawLedDot(ctx, x, y, r, a, long) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  roundRect(ctx, -long / 2, -r, long, r * 2, r);
  ctx.fill();
  ctx.restore();
}

function drawRing(ctx, size, look, open) {
  const c = size / 2;
  const pupilX = c + look * size * 0.22;
  const squash = Math.max(open, 0.06);

  ctx.clearRect(0, 0, size, size);
  glow(ctx, "rgba(62,203,255,0.95)", 10);
  ctx.fillStyle = CYAN;

  const rings = [
    { r: size * 0.38, n: 28, long: 7, rad: 2.1 },
    { r: size * 0.26, n: 18, long: 6, rad: 1.8 },
  ];

  rings.forEach((ring) => {
    for (let i = 0; i < ring.n; i += 1) {
      const a = (i / ring.n) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * ring.r;
      const y = c + Math.sin(a) * ring.r * squash;
      drawLedDot(ctx, x, y, ring.rad, a, ring.long);
    }
  });

  const pr = size * 0.08 * (0.35 + open * 0.65);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const rr = size * 0.055;
    const x = pupilX + Math.cos(a) * rr * open;
    const y = c + Math.sin(a) * rr * squash;
    ctx.beginPath();
    ctx.arc(x, y, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(pupilX, c, pr, 0, Math.PI * 2);
  ctx.fill();
  clearGlow(ctx);
}

function drawAperture(ctx, size, look, open) {
  const c = size / 2;
  const outer = size * 0.46;
  const innerX = c + look * size * 0.16;
  const blades = 8;
  const rot = (1 - open) * 0.62;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  const metal = ctx.createLinearGradient(c - outer, c - outer, c + outer, c + outer);
  metal.addColorStop(0, "#d5dce4");
  metal.addColorStop(0.45, "#8b97a4");
  metal.addColorStop(1, "#3a424c");
  ctx.fillStyle = metal;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, outer * 0.86, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < blades; i += 1) {
    const base = (i / blades) * Math.PI * 2 + look * 0.18;
    ctx.save();
    ctx.translate(innerX, c);
    ctx.rotate(base);
    ctx.translate(outer * 0.72, 0);
    ctx.rotate(rot);

    const grd = ctx.createLinearGradient(-20, -30, 40, 30);
    grd.addColorStop(0, "#f0f4f8");
    grd.addColorStop(0.45, "#9aa7b4");
    grd.addColorStop(1, "#4d5864");
    ctx.fillStyle = grd;
    ctx.strokeStyle = "rgba(20,24,30,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.quadraticCurveTo(18, -38, 62, -8);
    ctx.lineTo(62, 14);
    ctx.quadraticCurveTo(10, 8, -10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#1a1e24";
  ctx.stroke();

  const rim = ctx.createLinearGradient(c - outer, c, c + outer, c);
  rim.addColorStop(0, "#e8eef4");
  rim.addColorStop(0.5, "#6d7782");
  rim.addColorStop(1, "#c5ced6");
  ctx.beginPath();
  ctx.arc(c, c, outer * 0.97, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = rim;
  ctx.stroke();

  const hole = Math.max(3, outer * 0.34 * open);
  ctx.beginPath();
  ctx.arc(innerX, c, hole, 0, Math.PI * 2);
  ctx.fillStyle = open < 0.08 ? "#2a3138" : "#07080c";
  ctx.fill();
}

function mountCanvasEye(draw) {
  const { wrap, canvas, ctx } = makeCanvas();
  return {
    el: wrap,
    draw(look, open) {
      const size = sizeCanvas(canvas, ctx);
      draw(ctx, size, look, open);
    },
  };
}

/* ---------- DOM / SVG styles ---------- */

function mountLcd() {
  const el = document.createElement("div");
  el.className = "eye lcd";
  el.innerHTML = `
    <div class="socket">
      <div class="lcd-sclera">
        <div class="lcd-iris">
          <div class="lcd-pupil"></div>
          <div class="lcd-glint"></div>
          <div class="lcd-glint small"></div>
        </div>
      </div>
      <div class="lid lid-top"></div>
      <div class="lid lid-bottom"></div>
    </div>`;
  return {
    el,
    draw(look, open) {
      el.style.setProperty("--look", look.toFixed(3));
      el.style.setProperty("--open", open.toFixed(3));
    },
  };
}

function mountCartoon() {
  const el = document.createElement("div");
  el.className = "eye cartoon";
  el.innerHTML = `
    <div class="socket">
      <div class="cartoon-white">
        <div class="cartoon-iris">
          <div class="cartoon-glint"></div>
        </div>
      </div>
      <div class="cartoon-lidline"></div>
    </div>`;
  return {
    el,
    draw(look, open) {
      el.style.setProperty("--look", look.toFixed(3));
      el.style.setProperty("--open", open.toFixed(3));
    },
  };
}

function mountEmotive() {
  const el = document.createElement("div");
  el.className = "eye emotive";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", CYAN);
  path.setAttribute("stroke-width", "10");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  el.appendChild(svg);

  const center = { a: [18, 72], b: [50, 22], c: [82, 72] };
  const left = { a: [16, 42], b: [38, 28], c: [70, 86] };
  const right = { a: [30, 86], b: [62, 28], c: [84, 42] };
  const closed = { a: [20, 58], b: [50, 78], c: [80, 58] };

  function mix(p, q, t) {
    return {
      a: [p.a[0] + (q.a[0] - p.a[0]) * t, p.a[1] + (q.a[1] - p.a[1]) * t],
      b: [p.b[0] + (q.b[0] - p.b[0]) * t, p.b[1] + (q.b[1] - p.b[1]) * t],
      c: [p.c[0] + (q.c[0] - p.c[0]) * t, p.c[1] + (q.c[1] - p.c[1]) * t],
    };
  }

  return {
    el,
    draw(look, open) {
      const gaze = look < 0 ? mix(center, left, -look) : mix(center, right, look);
      const pose = mix(closed, gaze, open);
      path.setAttribute(
        "d",
        `M ${pose.a[0]} ${pose.a[1]} Q ${pose.b[0]} ${pose.b[1]} ${pose.c[0]} ${pose.c[1]}`
      );
    },
  };
}

function mountVector() {
  const el = document.createElement("div");
  el.className = "eye vector";
  const id = nextId();
  el.innerHTML = `
    <svg viewBox="0 0 100 100">
      <defs>
        <filter id="vg-${id}" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.1" result="b"/>
          <feMerge>
            <feMergeNode in="b"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#vg-${id})" fill="none" stroke="${TEAL}" stroke-linecap="round">
        <ellipse class="v-outer" cx="50" cy="50" rx="34" ry="34" stroke-width="1.6"/>
        <ellipse class="v-inner" cx="50" cy="50" rx="11" ry="11" stroke-width="1.6"/>
      </g>
    </svg>`;
  const outer = el.querySelector(".v-outer");
  const inner = el.querySelector(".v-inner");
  return {
    el,
    draw(look, open) {
      const ry = 34 * Math.max(open, 0.04);
      const iry = 11 * Math.max(open, 0.04);
      outer.setAttribute("ry", ry.toFixed(2));
      inner.setAttribute("ry", iry.toFixed(2));
      inner.setAttribute("cx", (50 + look * 18).toFixed(2));
      inner.setAttribute("rx", (11 * (1 - Math.abs(look) * 0.12)).toFixed(2));
    },
  };
}

function mountHalo() {
  const el = document.createElement("div");
  el.className = "eye";
  el.innerHTML = `
    <div class="halo">
      <div class="halo-bloom"></div>
      <div class="halo-ring"></div>
    </div>`;
  return {
    el,
    draw(look, open) {
      el.style.setProperty("--look", look.toFixed(3));
      el.style.setProperty("--open", open.toFixed(3));
    },
  };
}

function mountReal() {
  const el = document.createElement("div");
  el.className = "eye real";
  el.innerHTML = `
    <div class="socket">
      <div class="real-globe">
        <div class="real-iris">
          <div class="real-pupil"></div>
        </div>
        <div class="real-spec"></div>
      </div>
      <div class="lid lid-top"></div>
      <div class="lid lid-bottom"></div>
    </div>`;
  return {
    el,
    draw(look, open) {
      el.style.setProperty("--look", look.toFixed(3));
      el.style.setProperty("--open", open.toFixed(3));
    },
  };
}

const FACTORIES = {
  pixel: () => mountCanvasEye(drawPixel),
  ring: () => mountCanvasEye(drawRing),
  lcd: mountLcd,
  cartoon: mountCartoon,
  matrix: () => mountCanvasEye(drawMatrix),
  aperture: () => mountCanvasEye(drawAperture),
  emotive: mountEmotive,
  vector: mountVector,
  halo: mountHalo,
  real: mountReal,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createEye(styleId) {
  return FACTORIES[styleId]();
}

export function mountEyes(container, styleId, count) {
  container.replaceChildren();
  container.dataset.count = String(count);
  const eyes = [];
  for (let i = 0; i < count; i += 1) {
    const eye = createEye(styleId);
    container.appendChild(eye.el);
    eyes.push(eye);
  }
  return eyes;
}

export function createEyeMotion() {
  const motion = {
    look: 0,
    open: 1,
    targetLook: 0,
    targetOpen: 1,
    manual: false,
    blinking: false,
    step: 0,
    until: 0,
    nextBlink: 0,
  };
  const script = [
    { look: 0, hold: 1600 },
    { look: -1, hold: 1400 },
    { look: 0, hold: 700 },
    { look: 1, hold: 1400 },
    { look: 0, hold: 1800 },
  ];
  motion.until = performance.now() + script[0].hold;
  motion.nextBlink = performance.now() + 1800 + Math.random() * 1200;

  function blink() {
    if (motion.blinking) return;
    motion.blinking = true;
    motion.targetOpen = 0;
    setTimeout(() => {
      motion.targetOpen = 1;
      motion.blinking = false;
    }, 90);
  }

  motion.tick = function tick(now) {
    if (!motion.manual) {
      if (!motion.until) motion.until = now + script[0].hold;
      if (now >= motion.until) {
        motion.step = (motion.step + 1) % script.length;
        motion.targetLook = script[motion.step].look;
        motion.until = now + script[motion.step].hold;
      }
    }
    if (now >= motion.nextBlink) {
      blink();
      motion.nextBlink = now + 2400 + Math.random() * 2200;
      if (Math.random() < 0.18) motion.nextBlink = now + 280;
    }
    motion.look = lerp(motion.look, motion.targetLook, 0.12);
    motion.open = lerp(motion.open, motion.targetOpen, motion.targetOpen < 0.5 ? 0.45 : 0.22);
  };

  return motion;
}

export function bindEyePointer(el, motion) {
  const onMove = (event) => {
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    motion.targetLook = Math.max(-1, Math.min(1, (x - 0.5) * 2.2));
  };
  const onEnter = () => {
    motion.manual = true;
  };
  const onLeave = () => {
    motion.manual = false;
    motion.targetLook = 0;
  };
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("pointermove", onMove);
  return () => {
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.removeEventListener("pointermove", onMove);
  };
}

export function drawEyes(eyes, motion, housing) {
  if (housing) {
    housing.style.setProperty("--look", motion.look.toFixed(3));
    housing.style.setProperty("--open", motion.open.toFixed(3));
  }
  eyes.forEach((eye) => eye.draw(motion.look, motion.open));
}
