export const TANKS = [
  { id: "reef", name: "Coral Reef", num: "01", theme: "reef" },
  { id: "bowl", name: "Goldfish Bowl", num: "02", theme: "bowl" },
  { id: "abyss", name: "Deep Abyss", num: "03", theme: "abyss" },
  { id: "school", name: "Neon School", num: "04", theme: "school" },
  { id: "jellies", name: "Moon Jellies", num: "05", theme: "jellies" },
  { id: "betta", name: "Planted Betta", num: "06", theme: "betta" },
];

const THEMES = {
  reef: { water: ["#083548", "#12627a", "#1d8a96"], gravel: "#6b4a32", accent: "#ff7a3d" },
  bowl: { water: ["#1a3a48", "#2a6a78", "#4aa0a8"], gravel: "#c4b49a", accent: "#ff8a2b" },
  abyss: { water: ["#030712", "#071428", "#0c2744"], gravel: "#1a2030", accent: "#3ecbff" },
  school: { water: ["#082430", "#0d4a58", "#157888"], gravel: "#3d4a3a", accent: "#4ee0ff" },
  jellies: { water: ["#071018", "#102838", "#163a52"], gravel: "#243040", accent: "#d4f6ff" },
  betta: { water: ["#102820", "#1a4a38", "#2a6e52"], gravel: "#5a4632", accent: "#e23b6a" },
};

function sizeCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

function makeFish(count, palette, speed) {
  const fish = [];
  for (let i = 0; i < count; i += 1) {
    fish.push({
      x: Math.random(),
      y: 0.28 + Math.random() * 0.45,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: speed * (0.7 + Math.random() * 0.6),
      size: 0.035 + Math.random() * 0.03,
      hue: palette[i % palette.length],
      phase: Math.random() * Math.PI * 2,
    });
  }
  return fish;
}

function makeBubbles(n) {
  return Array.from({ length: n }, () => ({
    x: 0.12 + Math.random() * 0.76,
    y: Math.random(),
    r: 0.004 + Math.random() * 0.008,
    s: 0.04 + Math.random() * 0.06,
  }));
}

function initWorld(theme) {
  if (theme === "reef") {
    return {
      fish: makeFish(5, ["#ff7a3d", "#fff4c8", "#2ec4b6", "#ff9f1c"], 0.045),
      bubbles: makeBubbles(14),
      plants: 5,
    };
  }
  if (theme === "bowl") {
    return {
      fish: makeFish(2, ["#ff7b1c", "#ffb347"], 0.032),
      bubbles: makeBubbles(8),
      plants: 2,
    };
  }
  if (theme === "abyss") {
    return {
      fish: makeFish(3, ["#4ecbff", "#7a8cff", "#2a4a6a"], 0.028),
      bubbles: makeBubbles(10),
      plants: 0,
      jellies: 2,
    };
  }
  if (theme === "school") {
    return {
      fish: makeFish(16, ["#3ecbff", "#7ee7ff", "#c084fc"], 0.055),
      bubbles: makeBubbles(12),
      plants: 4,
    };
  }
  if (theme === "jellies") {
    return {
      fish: [],
      bubbles: makeBubbles(9),
      plants: 0,
      jellies: 4,
    };
  }
  return {
    fish: makeFish(1, ["#e23b6a", "#7b1e3a"], 0.03),
    bubbles: makeBubbles(10),
    plants: 6,
  };
}

function drawGlass(ctx, w, h, bowl) {
  ctx.save();
  if (bowl) {
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.52, w * 0.38, h * 0.42, 0, 0, Math.PI * 2);
    ctx.clip();
  } else {
    roundRectPath(ctx, w * 0.06, h * 0.08, w * 0.88, h * 0.82, 18);
    ctx.clip();
  }
}

function roundRectPath(ctx, x, y, bw, bh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + bw, y, x + bw, y + bh, r);
  ctx.arcTo(x + bw, y + bh, x, y + bh, r);
  ctx.arcTo(x, y + bh, x, y, r);
  ctx.arcTo(x, y, x + bw, y, r);
  ctx.closePath();
}

function drawFish(ctx, f, w, h, t) {
  const x = f.x * w;
  const y = f.y * h + Math.sin(t * 1.6 + f.phase) * h * 0.012;
  const s = f.size * w;
  const flap = Math.sin(t * 10 * f.speed * 20 + f.phase) * 0.45;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f.dir, 1);
  ctx.fillStyle = f.hue;
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, 0);
  ctx.lineTo(-s * 1.25, -s * (0.35 + flap * 0.2));
  ctx.lineTo(-s * 1.25, s * (0.35 + flap * 0.2));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(s * 0.45, -s * 0.08, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(s * 0.5, -s * 0.08, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJelly(ctx, i, w, h, t) {
  const x = w * (0.28 + (i % 4) * 0.16) + Math.sin(t * 0.4 + i) * 18;
  const y = h * (0.28 + (i % 3) * 0.12) + Math.sin(t * 0.7 + i * 1.3) * 14;
  const pulse = 0.82 + Math.sin(t * 1.8 + i) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(210, 245, 255, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22 * pulse, 14 * pulse, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(180, 240, 255, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 5; k += 1) {
    ctx.moveTo(-12 + k * 6, 2);
    for (let s = 0; s < 28; s += 1) {
      ctx.lineTo(-12 + k * 6 + Math.sin(t * 2 + s * 0.4 + i) * 3, 4 + s * 1.4);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawPlant(ctx, i, w, h, t, color) {
  const x = w * (0.14 + (i * 0.14) % 0.72);
  const base = h * 0.86;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, base);
  for (let s = 1; s <= 14; s += 1) {
    const yy = base - s * h * 0.028;
    const xx = x + Math.sin(t * 0.7 + i + s * 0.35) * (6 + s * 0.8);
    ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

function drawTank(ctx, w, h, t, theme, world) {
  const pal = THEMES[theme];
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);

  const bowl = theme === "bowl";
  ctx.save();
  drawGlass(ctx, w, h, bowl);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.water[0]);
  g.addColorStop(0.55, pal.water[1]);
  g.addColorStop(1, pal.water[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#dff6ff";
  ctx.lineWidth = 6;
  for (let i = 0; i < 5; i += 1) {
    const yy = h * (0.18 + i * 0.12) + Math.sin(t * 0.6 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.quadraticCurveTo(w * 0.5, yy + Math.sin(t + i) * 16, w, yy);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = pal.gravel;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  for (let x = 0; x <= w; x += 8) {
    ctx.lineTo(x, h * (0.86 + Math.sin(x * 0.08) * 0.02));
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  for (let i = 0; i < world.plants; i += 1) {
    drawPlant(ctx, i, w, h, t, theme === "betta" ? "#3d8f5a" : "#2f6b4a");
  }

  (world.jellies ? Array.from({ length: world.jellies }, (_, i) => i) : []).forEach((i) => {
    drawJelly(ctx, i, w, h, t);
  });

  world.fish.forEach((f) => drawFish(ctx, f, w, h, t));

  ctx.fillStyle = "rgba(220,245,255,0.45)";
  world.bubbles.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x * w, b.y * h, b.r * w, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(200, 230, 240, 0.35)";
  ctx.lineWidth = 4;
  if (bowl) {
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.52, w * 0.38, h * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.14, w * 0.22, 8, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180,200,210,0.5)";
    ctx.stroke();
  } else {
    roundRectPath(ctx, w * 0.06, h * 0.08, w * 0.88, h * 0.82, 18);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.ellipse(w * 0.28, h * 0.22, w * 0.08, h * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stepWorld(world, dt, theme) {
  world.fish.forEach((f) => {
    f.x += f.dir * f.speed * dt * 1.1;
    f.y += Math.sin(f.phase) * 0.0008;
    if (theme === "school") {
      f.y += Math.sin(f.x * 12 + f.phase) * 0.0005;
    }
    if (f.x > 0.9) {
      f.x = 0.9;
      f.dir = -1;
    }
    if (f.x < 0.1) {
      f.x = 0.1;
      f.dir = 1;
    }
    f.y = Math.max(0.22, Math.min(0.78, f.y));
  });
  world.bubbles.forEach((b) => {
    b.y -= b.s * dt;
    b.x += Math.sin(b.y * 20) * 0.002;
    if (b.y < 0.12) {
      b.y = 0.88;
      b.x = 0.12 + Math.random() * 0.76;
    }
  });
}

export function createTank(item, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "deck tank-card";
  wrap.dataset.id = item.id;
  const fitPi = options.fit === "pi";
  if (fitPi) wrap.classList.add("pi-screen");

  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const world = initWorld(item.theme);
  const state = { t: 0 };

  const img = fitPi
    ? { naturalWidth: 1920, naturalHeight: 480, decode: async () => {} }
    : { naturalWidth: 960, naturalHeight: 620, decode: async () => {} };

  function update(dt) {
    state.t += dt;
    stepWorld(world, dt, item.theme);
  }

  function paint(drawCtx, width, height) {
    drawTank(drawCtx, width, height, state.t, item.theme, world);
  }

  function draw() {
    const w = wrap.clientWidth || 480;
    const h = wrap.clientHeight || 310;
    if (!w || !h) return;
    sizeCanvas(canvas, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawTank(ctx, canvas.width, canvas.height, state.t, item.theme, world);
  }

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
    destroy() {
      wrap.remove();
    },
  };
}
