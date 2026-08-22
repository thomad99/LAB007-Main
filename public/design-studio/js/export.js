function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadText(filename, text, type = "text/html") {
  downloadBlob(filename, new Blob([text], { type }));
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function toDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function readText(url) {
  const res = await fetch(url);
  return res.text();
}

function widgetCss(standard, pi = false) {
  if (pi) {
    return `.deck { width: min(1920px, 96vw); aspect-ratio: 1920 / 480; height: auto; }
body { padding: 12px; }`;
  }
  return `.deck { width: ${standard}; }`;
}

export async function exportCassetteHTML(deck, options = {}) {
  const pi = options.fit === "pi";
  const [css, cassetteJs, img] = await Promise.all([
    readText("styles.css"),
    readText("js/cassettes.js"),
    toDataURL(deck.src),
  ]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${deck.name}</title>
  <style>
${css}
body { overflow: auto; display: grid; place-items: center; min-height: 100dvh; padding: 24px; }
${widgetCss("min(920px, 96vw)", pi)}
  </style>
</head>
<body>
  <div id="mount"></div>
  <script type="module">
${cassetteJs.replace("export const DECKS", "const DECKS").replace("export function createDeck", "function createDeck")}
const deck = DECKS.find((d) => d.id === ${JSON.stringify(deck.id)});
const widget = createDeck(deck, { src: ${JSON.stringify(img)}, fit: ${JSON.stringify(options.fit || "standard")} });
document.getElementById("mount").appendChild(widget.el);
let last = performance.now();
function frame(now) {
  widget.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  widget.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
  </script>
</body>
</html>`;
  downloadText(`${slug(deck.name)}.html`, html);
}

export async function exportVuHTML(unit, options = {}) {
  const pi = options.fit === "pi";
  const [css, vuJs, img] = await Promise.all([
    readText("styles.css"),
    readText("js/vu.js"),
    toDataURL(unit.src),
  ]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${unit.name}</title>
  <style>
${css}
body { overflow: auto; display: grid; place-items: center; min-height: 100dvh; padding: 24px; }
${widgetCss("min(920px, 96vw)", pi)}
  </style>
</head>
<body>
  <div id="mount"></div>
  <script type="module">
${vuJs.replace("export const VU_UNITS", "const VU_UNITS").replace("export function createVuUnit", "function createVuUnit")}
const unit = VU_UNITS.find((d) => d.id === ${JSON.stringify(unit.id)});
const widget = createVuUnit(unit, { src: ${JSON.stringify(img)}, fit: ${JSON.stringify(options.fit || "standard")} });
document.getElementById("mount").appendChild(widget.el);
let last = performance.now();
function frame(now) {
  widget.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  widget.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
  </script>
</body>
</html>`;
  downloadText(`${slug(unit.name)}-vu.html`, html);
}

export async function exportHdrHTML(item, options = {}) {
  const speed = options.speed ?? 1;
  const pi = options.fit === "pi";
  const meta = {
    id: item.id,
    name: item.name,
    fx: item.fx,
    intensity: item.intensity,
    pace: item.pace,
  };
  const [css, hdrJs, img] = await Promise.all([
    readText("styles.css"),
    readText("js/hdr.js"),
    toDataURL(item.src),
  ]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${item.name}</title>
  <style>
${css}
body { overflow: auto; display: grid; place-items: center; min-height: 100dvh; padding: 24px; background: #050507; }
${widgetCss("min(920px, 92vw)", pi)}
  </style>
</head>
<body>
  <div id="mount"></div>
  <script type="module">
${hdrJs.replaceAll("export ", "")}
const item = ${JSON.stringify(meta)};
const widget = createHdrItem(item, { src: ${JSON.stringify(img)}, speed: ${speed}, fit: ${JSON.stringify(options.fit || "standard")} });
document.getElementById("mount").appendChild(widget.el);
let last = performance.now();
function frame(now) {
  widget.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  widget.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
  </script>
</body>
</html>`;
  downloadText(`${slug(item.name)}-hdr.html`, html);
}

export async function exportTankHTML(item, options = {}) {
  const pi = options.fit === "pi";
  const [css, tankJs] = await Promise.all([readText("styles.css"), readText("js/tanks.js")]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${item.name}</title>
  <style>
${css}
body { overflow: auto; display: grid; place-items: center; min-height: 100dvh; padding: 24px; background: #050507; }
${widgetCss("min(720px, 94vw)", pi)}
  </style>
</head>
<body>
  <div id="mount"></div>
  <script type="module">
${tankJs.replaceAll("export ", "")}
const item = TANKS.find((d) => d.id === ${JSON.stringify(item.id)});
const widget = createTank(item, { fit: ${JSON.stringify(options.fit || "standard")} });
document.getElementById("mount").appendChild(widget.el);
let last = performance.now();
function frame(now) {
  widget.update(Math.min(0.05, (now - last) / 1000));
  last = now;
  widget.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
  </script>
</body>
</html>`;
  downloadText(`${slug(item.name)}-tank.html`, html);
}

export async function exportEyeHTML(style, count, options = {}) {
  const pi = options.fit === "pi";
  const [css, eyeJs] = await Promise.all([readText("styles.css"), readText("js/eyes.js")]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${style.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
${css}
body { overflow: auto; display: grid; place-items: center; min-height: 100dvh; padding: 24px; }
  </style>
</head>
<body${pi ? ' class="size-pi"' : ""}>
  <div class="housing" id="housing" data-count="${count}"></div>
  <script type="module">
${eyeJs}
const housing = document.getElementById("housing");
const motion = createEyeMotion();
let eyes = mountEyes(housing, ${JSON.stringify(style.id)}, ${count});
bindEyePointer(housing, motion);
function frame(now) {
  motion.tick(now);
  drawEyes(eyes, motion, housing);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
  </script>
</body>
</html>`;
  downloadText(`${slug(style.name)}-eyes.html`, html);
}

function exportPaintSize(instance) {
  const img = instance.img;
  if (instance.outputSize) {
    return { w: instance.outputSize.w, h: instance.outputSize.h, mul: 1 };
  }
  const w = img.naturalWidth || 960;
  const h = img.naturalHeight || 400;
  const mul = w >= 1600 ? 1 : 2;
  return { w, h, mul };
}

export async function exportPNGFromDeck(instance) {
  const img = instance.img;
  await img.decode?.().catch(() => {});
  const { w, h, mul } = exportPaintSize(instance);
  const canvas = document.createElement("canvas");
  canvas.width = w * mul;
  canvas.height = h * mul;
  const ctx = canvas.getContext("2d");
  ctx.scale(mul, mul);
  if (!instance.fullPaint) ctx.drawImage(img, 0, 0, w, h);
  instance.paint(ctx, w, h);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      downloadBlob(`${slug(instance.deck.name)}.png`, blob);
      resolve();
    }, "image/png");
  });
}

export async function recordDeckWebM(instance, seconds = 4) {
  const img = instance.img;
  await img.decode?.().catch(() => {});
  const { w, h, mul } = exportPaintSize(instance);
  const canvas = document.createElement("canvas");
  canvas.width = w * mul;
  canvas.height = h * mul;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      downloadBlob(`${slug(instance.deck.name)}.webm`, new Blob(chunks, { type: "video/webm" }));
      resolve();
    };
  });
  rec.start();
  const start = performance.now();
  await new Promise((resolve) => {
    function tick(now) {
      ctx.setTransform(mul, 0, 0, mul, 0, 0);
      if (!instance.fullPaint) ctx.drawImage(img, 0, 0, w, h);
      instance.paint(ctx, w, h);
      if (now - start < seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
}

export async function recordEyesWebM(housing, seconds = 4, size = null) {
  const rect = housing.getBoundingClientRect();
  const w = size?.w || Math.max(2, Math.round(rect.width));
  const h = size?.h || Math.max(2, Math.round(rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      downloadBlob("robot-eyes.webm", new Blob(chunks, { type: "video/webm" }));
      resolve();
    };
  });
  rec.start();
  const start = performance.now();
  await new Promise((resolve) => {
    async function tick(now) {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.fillStyle = "#08080c";
      ctx.fillRect(0, 0, w, h);
      const canvases = housing.querySelectorAll("canvas");
      if (canvases.length) {
        const n = canvases.length;
        const gap = 16;
        const size = Math.min(h * 0.72, (w - gap * (n + 1)) / n);
        canvases.forEach((c, i) => {
          const x = (w - (size * n + gap * (n - 1))) / 2 + i * (size + gap);
          const y = (h - size) / 2;
          ctx.drawImage(c, x, y, size, size);
        });
      }
      if (now - start < seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
}
