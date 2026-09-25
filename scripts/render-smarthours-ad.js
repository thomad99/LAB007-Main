const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const ffmpeg = require('ffmpeg-static');

const ROOT = path.join(__dirname, '..', 'public');
const OUT_DIR = path.join(ROOT, 'smarthours-assets', 'about');
const TMP = path.join(__dirname, '..', '.tmp-ad');
const PORT = 8778;
const TOTAL_MS = 20400;

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.mp3')) return 'audio/mpeg';
  if (file.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

function fileFor(urlPath) {
  const p = (urlPath || '/').split('?')[0];
  if (p === '/SmartHours/ad' || p === '/SmartHours/assets/about/advert.html') {
    return path.join(OUT_DIR, 'advert.html');
  }
  if (p.startsWith('/SmartHours/assets/')) {
    return path.join(ROOT, 'smarthours-assets', p.slice('/SmartHours/assets/'.length).split('/').join(path.sep));
  }
  return path.join(ROOT, p.replace(/^\//, '').split('/').join(path.sep));
}

const server = http.createServer((req, res) => {
  const file = fileFor(req.url);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime(file) });
    res.end(data);
  });
});

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: 1920, height: 1080 } }
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/SmartHours/assets/about/advert.html?record=1`, {
    waitUntil: 'networkidle'
  });
  await new Promise((resolve) => setTimeout(resolve, TOTAL_MS));
  await context.close();
  await browser.close();

  const webm = fs.readdirSync(TMP).find((name) => name.endsWith('.webm'));
  if (!webm) throw new Error('Playwright did not write a video file');
  const mp4 = path.join(OUT_DIR, 'smarthours-advert.mp4');
  const mp3 = path.join(OUT_DIR, 'smarthours-advert.mp3');
  const args = ['-y', '-i', path.join(TMP, webm)];
  if (fs.existsSync(mp3)) {
    args.push('-i', mp3, '-map', '0:v:0', '-map', '1:a:0', '-t', '19.8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  }
  args.push('-movflags', '+faststart', mp4);
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: 'inherit' });
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code))));
  });
  server.close();
  console.log('Wrote', mp4);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
