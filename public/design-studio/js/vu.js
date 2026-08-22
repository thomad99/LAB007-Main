export const VU_UNITS = [
  {
    id: "eq-231",
    name: "EQ-231",
    num: "01",
    src: "assets/vu/eq-231.png",
    meters: [
      {
        x: 0.685,
        y: 0.318,
        w: 0.255,
        h: 0.345,
        pivot: [0.811, 0.627],
        cover: -112,
        face: "#ecc888",
      },
    ],
  },
  {
    id: "ge-20",
    name: "GE-20",
    num: "02",
    src: "assets/vu/ge-20.png",
    meters: [
      {
        x: 0.545,
        y: 0.340,
        w: 0.150,
        h: 0.290,
        pivot: [0.619, 0.595],
        cover: -81,
        face: "#f6c783",
      },
      {
        x: 0.728,
        y: 0.340,
        w: 0.195,
        h: 0.290,
        pivot: [0.824, 0.595],
        cover: -87,
        face: "#efc782",
      },
    ],
  },
  {
    id: "eq-70",
    name: "EQ-70",
    num: "03",
    src: "assets/vu/eq-70.png",
    meters: [
      {
        x: 0.712,
        y: 0.410,
        w: 0.198,
        h: 0.260,
        pivot: [0.809, 0.633],
        cover: [-55, -107],
        face: "#a8c247",
      },
    ],
  },
  {
    id: "se-8",
    name: "SE-B",
    num: "04",
    src: "assets/vu/se-8.png",
    meters: [
      {
        x: 0.546,
        y: 0.320,
        w: 0.178,
        h: 0.275,
        pivot: [0.635, 0.558],
        cover: -112,
        face: "#ecc578",
      },
      {
        x: 0.766,
        y: 0.325,
        w: 0.178,
        h: 0.270,
        pivot: [0.855, 0.559],
        cover: -110,
        face: "#e8c37f",
      },
    ],
  },
  {
    id: "realistic",
    name: "Realistic",
    num: "05",
    src: "assets/vu/realistic.png",
    meters: [
      {
        x: 0.670,
        y: 0.292,
        w: 0.272,
        h: 0.265,
        pivot: [0.806, 0.523],
        cover: -140,
        face: "#ebc47f",
      },
      {
        x: 0.670,
        y: 0.645,
        w: 0.272,
        h: 0.255,
        pivot: [0.806, 0.866],
        cover: -140,
        face: "#e7c07b",
      },
    ],
  },
  {
    id: "eq-2000",
    name: "EQ-2000",
    num: "06",
    src: "assets/vu/eq-2000.png",
    meters: [
      {
        x: 0.572,
        y: 0.348,
        w: 0.148,
        h: 0.258,
        pivot: [0.645, 0.576],
        cover: -109,
        face: "#e6a03e",
      },
      {
        x: 0.782,
        y: 0.348,
        w: 0.140,
        h: 0.258,
        pivot: [0.852, 0.576],
        cover: -103,
        face: "#d79a3d",
      },
    ],
  },
];

function sizeOverlay(canvas, ctx, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function meterGeom(meter, w, h) {
  return {
    x: meter.x * w,
    y: meter.y * h,
    bw: meter.w * w,
    bh: meter.h * h,
    px: meter.pivot[0] * w,
    py: meter.pivot[1] * h,
  };
}

function coverNeedle(ctx, meter, w, h) {
  const { x, y, bw, bh, px, py } = meterGeom(meter, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, bw, bh);
  ctx.clip();
  const len = bh * 0.86;
  ctx.strokeStyle = meter.face;
  ctx.lineWidth = Math.max(3, bh * 0.07);
  ctx.lineCap = "round";
  const covers = Array.isArray(meter.cover) ? meter.cover : [meter.cover];
  covers.forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(px, py, Math.max(3, bh * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = meter.face;
  ctx.fill();
  ctx.restore();
}

function drawNeedle(ctx, meter, level, w, h) {
  const { x, y, bw, bh, px, py } = meterGeom(meter, w, h);
  const clamped = Math.max(0, Math.min(1, level));
  const deg = -148 + clamped * 112;
  const a = (deg * Math.PI) / 180;
  const len = bh * 0.82;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, bw, bh);
  ctx.clip();

  ctx.strokeStyle = "rgba(20, 14, 10, 0.95)";
  ctx.lineWidth = Math.max(1.15, bh * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px, py, Math.max(2.2, bh * 0.055), 0, Math.PI * 2);
  ctx.fillStyle = "#1a140e";
  ctx.fill();
  ctx.restore();
}

export function createVuUnit(unit, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "deck";
  wrap.dataset.id = unit.id;
  const fitPi = options.fit === "pi";
  if (fitPi) wrap.classList.add("pi-screen");

  const img = document.createElement("img");
  img.src = options.src || unit.src;
  img.alt = unit.name;
  img.draggable = false;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  wrap.append(img, canvas);

  const state = {
    shown: unit.meters.map(() => 0.28),
    target: unit.meters.map((_, i) => 0.3 + i * 0.08),
    next: unit.meters.map(() => 0),
    t: 0,
  };

  function update(dt) {
    state.t += dt;
    unit.meters.forEach((_, i) => {
      if (state.t >= state.next[i]) {
        const slam = Math.random() < 0.1;
        const base = 0.18 + Math.random() * 0.62;
        state.target[i] = slam ? 0.82 + Math.random() * 0.16 : base;
        if (i === 1) state.target[i] = state.target[0] * (0.72 + Math.random() * 0.4);
        state.next[i] = state.t + 0.05 + Math.random() * 0.16;
      }
      const rising = state.target[i] > state.shown[i];
      const k = rising ? 14 : 3.2;
      state.shown[i] += (state.target[i] - state.shown[i]) * Math.min(1, k * dt);
      state.shown[i] += (Math.random() - 0.5) * 0.018;
    });
  }

  function paint(drawCtx, width, height) {
    if (drawCtx === ctx) drawCtx.clearRect(0, 0, width, height);
    unit.meters.forEach((meter, i) => {
      coverNeedle(drawCtx, meter, width, height);
      drawNeedle(drawCtx, meter, state.shown[i], width, height);
    });
  }

  function draw() {
    const w = wrap.clientWidth || img.clientWidth;
    const h = wrap.clientHeight || img.clientHeight;
    if (!w || !h) return;
    sizeOverlay(canvas, ctx, w, h);
    paint(ctx, w, h);
  }

  img.addEventListener("load", draw);
  if (img.complete) draw();

  return {
    el: wrap,
    deck: unit,
    img,
    outputSize: fitPi ? { w: 1920, h: 480 } : null,
    state,
    update,
    draw,
    paint,
    destroy() {
      wrap.remove();
    },
  };
}
