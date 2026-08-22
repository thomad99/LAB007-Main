export const DECKS = [
  {
    id: "classic-black",
    name: "Classic Black",
    num: "01",
    src: "assets/cassettes/classic-black.png",
    start: 3,
    reel: { left: [0.363, 0.42], right: [0.60, 0.42], r: 0.055, look: "white" },
    counter: { x: 0.048, y: 0.33, w: 0.135, h: 0.155 },
    vu: { type: "led", x: 0.815, y: 0.18, w: 0.13, h: 0.40, segs: 8, palette: "green" },
    power: { x: 0.095, y: 0.175, color: "#ff3030" },
    buttons: { y: 0.775, h: 0.175, x0: 0.045, x1: 0.78, ids: ["rew", "play", "stop", "ff", "eject"] },
  },
  {
    id: "silver-pro",
    name: "Silver Pro",
    num: "02",
    src: "assets/cassettes/silver-pro.png",
    start: 14,
    reel: { left: [0.34, 0.46], right: [0.545, 0.46], r: 0.052, look: "silver" },
    counter: { x: 0.05, y: 0.36, w: 0.125, h: 0.15 },
    vu: { type: "needle", x: 0.78, y: 0.12, w: 0.175, h: 0.50 },
    power: { x: 0.10, y: 0.165, color: "#3dff7a" },
    buttons: { y: 0.775, h: 0.175, x0: 0.04, x1: 0.76, ids: ["rew", "play", "stop", "ff", "pause"] },
  },
  {
    id: "modern-minimal",
    name: "Modern Minimal",
    num: "03",
    src: "assets/cassettes/modern-minimal.png",
    start: 27,
    reel: { left: [0.346, 0.445], right: [0.593, 0.445], r: 0.052, look: "dark" },
    counter: { x: 0.05, y: 0.35, w: 0.13, h: 0.15 },
    vu: { type: "led", x: 0.82, y: 0.18, w: 0.125, h: 0.42, segs: 10, palette: "orange" },
    power: { x: 0.10, y: 0.18, color: "#3ecbff" },
    buttons: { y: 0.78, h: 0.16, x0: 0.05, x1: 0.78, ids: ["rew", "play", "pause", "ff", "stop"] },
  },
  {
    id: "awesome-mix",
    name: "Awesome Mix",
    num: "04",
    src: "assets/cassettes/awesome-mix.png",
    start: 42,
    reel: { left: [0.35, 0.44], right: [0.60, 0.44], r: 0.052, look: "dark" },
    counter: { x: 0.05, y: 0.35, w: 0.13, h: 0.15 },
    vu: { type: "led", x: 0.815, y: 0.16, w: 0.13, h: 0.44, segs: 10, palette: "rainbow" },
    power: { x: 0.095, y: 0.17, color: "#ff3030" },
    buttons: { y: 0.775, h: 0.175, x0: 0.04, x1: 0.78, ids: ["rew", "play", "stop", "ff", "pause"] },
  },
  {
    id: "champagne",
    name: "Champagne Hi-Fi",
    num: "05",
    src: "assets/cassettes/champagne.png",
    start: 6,
    reel: { left: [0.35, 0.43], right: [0.581, 0.43], r: 0.054, look: "white" },
    counter: { x: 0.048, y: 0.35, w: 0.13, h: 0.15 },
    vu: { type: "led", x: 0.81, y: 0.16, w: 0.135, h: 0.44, segs: 10, palette: "vu" },
    power: { x: 0.09, y: 0.175, color: "#ff2a2a" },
    buttons: { y: 0.775, h: 0.175, x0: 0.04, x1: 0.78, ids: ["rew", "play", "stop", "ff", "eject"] },
  },
  {
    id: "neon-cyber",
    name: "Neon Cyber",
    num: "06",
    src: "assets/cassettes/neon-cyber.png",
    start: 89,
    reel: { left: [0.335, 0.445], right: [0.589, 0.445], r: 0.055, look: "neon" },
    counter: { x: 0.048, y: 0.35, w: 0.13, h: 0.15 },
    vu: { type: "led", x: 0.82, y: 0.16, w: 0.125, h: 0.44, segs: 12, palette: "blue" },
    power: { x: 0.095, y: 0.18, color: "#3ecbff" },
    buttons: { y: 0.78, h: 0.16, x0: 0.05, x1: 0.78, ids: ["rew", "play", "pause", "ff", "stop"] },
  },
];

const PALETTES = {
  green: ["#1b8f3a", "#2adf55", "#7dff7a"],
  orange: ["#c46a00", "#ffae00", "#ffe27a"],
  rainbow: ["#1db954", "#1db954", "#8fd14f", "#f5d000", "#f5d000", "#ff8a00", "#ff3b30"],
  vu: ["#1db954", "#3dff7a", "#d6e14a", "#ffd400", "#ff8a00", "#ff3b30"],
  blue: ["#125e9a", "#1ea0ff", "#7ee7ff"],
};

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

function drawReel(ctx, x, y, r, angle, pack, look) {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2);
  ctx.fillStyle = look === "neon" ? "rgba(4, 10, 22, 0.88)" : "rgba(8, 8, 10, 0.92)";
  ctx.fill();

  const packR = r * (0.62 + pack * 0.62);
  ctx.beginPath();
  ctx.arc(0, 0, packR, 0, Math.PI * 2);
  ctx.fillStyle = look === "neon" ? "#1a0a28" : "#2c241c";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.strokeStyle = look === "neon" ? "rgba(80, 220, 255, 0.85)" : "rgba(40, 40, 44, 0.9)";
  ctx.lineWidth = Math.max(1.4, r * 0.08);
  if (look === "neon") {
    ctx.shadowColor = "#3ecbff";
    ctx.shadowBlur = 12;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.rotate(angle);
  const spokes = look === "neon" ? 8 : 6;
  ctx.strokeStyle = look === "white" || look === "silver" ? "#e8eef4" : look === "neon" ? "#7ee7ff" : "#c5ccd4";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.lineCap = "round";
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = look === "neon" ? "#e8ffff" : "#111216";
  ctx.fill();
  ctx.restore();
}

function drawCounter(ctx, box, value, w, h) {
  const x = box.x * w;
  const y = box.y * h;
  const bw = box.w * w;
  const bh = box.h * h;
  roundRect(ctx, x, y, bw, bh, 3);
  ctx.fillStyle = "#0a0b0e";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const digits = String(((value % 1000) + 1000) % 1000).padStart(3, "0");
  const cell = bw / 3;
  ctx.font = `700 ${Math.floor(bh * 0.72)}px "Share Tech Mono", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f2f6fa";
  for (let i = 0; i < 3; i += 1) {
    const cx = x + cell * (i + 0.5);
    if (i) {
      ctx.beginPath();
      ctx.moveTo(x + cell * i, y + 2);
      ctx.lineTo(x + cell * i, y + bh - 2);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.stroke();
    }
    ctx.fillText(digits[i], cx, y + bh / 2 + 1);
  }
}

function drawLedVU(ctx, box, left, right, w, h, deck) {
  const x = box.x * w;
  const y = box.y * h;
  const bw = box.w * w;
  const bh = box.h * h;
  const segs = deck.vu.segs;
  const colors = PALETTES[deck.vu.palette];
  const colW = bw * 0.28;
  const gap = 1.6;
  const segH = (bh - gap * (segs - 1)) / segs;

  roundRect(ctx, x, y, bw, bh, 3);
  ctx.fillStyle = "rgba(6,7,10,0.55)";
  ctx.fill();

  function column(cx, level) {
    const lit = Math.round(level * segs);
    for (let i = 0; i < segs; i += 1) {
      const sy = y + bh - (i + 1) * (segH + gap) + gap;
      const on = i < lit;
      const color = colors[Math.min(i, colors.length - 1)];
      ctx.globalAlpha = on ? 1 : 0.12;
      ctx.fillStyle = color;
      ctx.shadowColor = on ? color : "transparent";
      ctx.shadowBlur = on ? 6 : 0;
      roundRect(ctx, cx, sy, colW, segH, 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  column(x + bw * 0.14, left);
  column(x + bw * 0.55, right);
}

function drawNeedleVU(ctx, box, left, right, w, h) {
  const x = box.x * w;
  const y = box.y * h;
  const bw = box.w * w;
  const bh = box.h * h;
  const meterH = bh * 0.46;

  function meter(my, level) {
    roundRect(ctx, x, my, bw, meterH, 4);
    ctx.fillStyle = "#e8d9a8";
    ctx.fill();
    ctx.strokeStyle = "#6b6248";
    ctx.lineWidth = 1;
    ctx.stroke();

    const cx = x + bw * 0.5;
    const cy = my + meterH * 0.92;
    const start = (-140 * Math.PI) / 180;
    const end = (-40 * Math.PI) / 180;
    const ang = start + (end - start) * level;

    ctx.beginPath();
    ctx.arc(cx, cy, bw * 0.42, start, end);
    ctx.strokeStyle = "rgba(40,30,10,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * bw * 0.4, cy + Math.sin(ang) * bw * 0.4);
    ctx.strokeStyle = "#c41212";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#222";
    ctx.fill();
  }

  meter(y, left);
  meter(y + bh * 0.54, right);
}

function drawPower(ctx, deck, on, w, h) {
  const x = deck.power.x * w;
  const y = deck.power.y * h;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, w * 0.012), 0, Math.PI * 2);
  ctx.fillStyle = on ? deck.power.color : "rgba(40,40,40,0.5)";
  ctx.shadowColor = on ? deck.power.color : "transparent";
  ctx.shadowBlur = on ? 10 : 0;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawButtonGlow(ctx, deck, mode, w, h) {
  const ids = deck.buttons.ids;
  const idx = ids.indexOf(mode === "ff" ? "ff" : mode);
  if (idx < 0 || mode === "stop") return;
  const { y, h: bh, x0, x1 } = deck.buttons;
  const span = x1 - x0;
  const slot = span / ids.length;
  const bx = (x0 + slot * idx) * w;
  const by = y * h;
  const bw = slot * w * 0.92;
  const hh = bh * h;
  ctx.fillStyle = mode === "play" ? "rgba(60, 255, 120, 0.16)" : "rgba(255,255,255,0.08)";
  roundRect(ctx, bx + bw * 0.04, by + hh * 0.08, bw, hh * 0.84, hh * 0.2);
  ctx.fill();
}

export function createDeck(deck, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = "deck";
  wrap.dataset.id = deck.id;
  const fitPi = options.fit === "pi";
  if (fitPi) wrap.classList.add("pi-screen");

  const img = document.createElement("img");
  img.src = options.src || deck.src;
  img.alt = deck.name;
  img.draggable = false;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const hits = document.createElement("div");
  hits.className = "hits";

  wrap.append(img, canvas, hits);

  const state = {
    power: true,
    mode: "play",
    counter: deck.start,
    angle: 0,
    pack: 0.55,
    vuL: 0.4,
    vuR: 0.45,
    ready: false,
  };

  function layoutHits() {
    hits.replaceChildren();
    const { y, h, x0, x1, ids } = deck.buttons;
    const span = x1 - x0;
    const slot = span / ids.length;
    ids.forEach((id, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hit";
      btn.dataset.act = id;
      btn.style.left = `${(x0 + slot * i) * 100}%`;
      btn.style.width = `${slot * 100}%`;
      btn.style.top = `${y * 100}%`;
      btn.style.height = `${h * 100}%`;
      btn.title = id.toUpperCase();
      btn.addEventListener("click", () => setMode(id));
      hits.appendChild(btn);
    });

    const pwr = document.createElement("button");
    pwr.type = "button";
    pwr.className = "hit";
    pwr.style.left = `${(deck.power.x - 0.04) * 100}%`;
    pwr.style.top = `${(deck.power.y - 0.08) * 100}%`;
    pwr.style.width = "8%";
    pwr.style.height = "16%";
    pwr.title = "POWER";
    pwr.addEventListener("click", () => {
      state.power = !state.power;
      if (!state.power) state.mode = "stop";
    });
    hits.appendChild(pwr);

    const rst = document.createElement("button");
    rst.type = "button";
    rst.className = "hit";
    rst.style.left = `${deck.counter.x * 100}%`;
    rst.style.top = `${(deck.counter.y + deck.counter.h) * 100}%`;
    rst.style.width = `${deck.counter.w * 100}%`;
    rst.style.height = "8%";
    rst.title = "RESET COUNTER";
    rst.addEventListener("click", () => {
      state.counter = 0;
    });
    hits.appendChild(rst);
  }

  function setMode(id) {
    if (id === "eject") {
      state.mode = "stop";
      return;
    }
    if (!state.power && id !== "stop") {
      state.power = true;
    }
    if (id === "play") state.mode = "play";
    else if (id === "pause") state.mode = state.mode === "pause" ? "play" : "pause";
    else if (id === "stop") state.mode = "stop";
    else if (id === "rew") state.mode = "rew";
    else if (id === "ff") state.mode = "ff";
  }

  let acc = 0;
  function update(dt) {
    if (!state.ready && img.naturalWidth) state.ready = true;
    const moving = state.power && (state.mode === "play" || state.mode === "ff" || state.mode === "rew");
    const dir = state.mode === "rew" ? -1 : 1;
    const speed = state.mode === "play" ? 2.2 : 9.5;
    if (moving) {
      state.angle += dir * speed * dt;
      state.pack = Math.max(0.08, Math.min(0.92, state.pack + dir * dt * (state.mode === "play" ? 0.015 : 0.08)));
      acc += dt;
      const every = state.mode === "play" ? 0.72 : 0.08;
      while (acc >= every) {
        acc -= every;
        state.counter += dir;
        if (state.counter < 0) state.counter = 0;
        if (state.counter > 999) state.counter = 999;
      }
      const bounce = 0.35 + Math.random() * 0.55;
      state.vuL += (bounce - state.vuL) * 0.35;
      state.vuR += (bounce * (0.8 + Math.random() * 0.4) - state.vuR) * 0.35;
    } else {
      state.vuL += (0.04 - state.vuL) * 0.12;
      state.vuR += (0.05 - state.vuR) * 0.12;
    }
    if (!state.power) {
      state.vuL = 0;
      state.vuR = 0;
    }
  }

  function paint(drawCtx, width, height) {
    const w = width;
    const h = height;
    if (drawCtx === ctx) drawCtx.clearRect(0, 0, w, h);

    const rx = deck.reel.r * w;
    drawReel(
      drawCtx,
      deck.reel.left[0] * w,
      deck.reel.left[1] * h,
      rx,
      state.angle,
      1 - state.pack,
      deck.reel.look
    );
    drawReel(
      drawCtx,
      deck.reel.right[0] * w,
      deck.reel.right[1] * h,
      rx,
      state.angle * 1.06,
      state.pack,
      deck.reel.look
    );
    drawCounter(drawCtx, deck.counter, Math.floor(state.counter), w, h);
    if (deck.vu.type === "needle") drawNeedleVU(drawCtx, deck.vu, state.vuL, state.vuR, w, h);
    else drawLedVU(drawCtx, deck.vu, state.vuL, state.vuR, w, h, deck);
    drawPower(drawCtx, deck, state.power, w, h);
    if (state.power) drawButtonGlow(drawCtx, deck, state.mode, w, h);
  }

  function draw() {
    const w = wrap.clientWidth || img.clientWidth;
    const h = wrap.clientHeight || img.clientHeight;
    if (!w || !h) return;
    sizeOverlay(canvas, ctx, w, h);
    paint(ctx, w, h);
  }

  img.addEventListener("load", () => {
    state.ready = true;
    layoutHits();
    draw();
  });
  if (img.complete) {
    state.ready = true;
    layoutHits();
  }

  return {
    el: wrap,
    deck,
    state,
    img,
    outputSize: fitPi ? { w: 1920, h: 480 } : null,
    update,
    draw,
    paint,
    setMode,
    destroy() {
      wrap.remove();
    },
  };
}
