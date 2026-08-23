'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { spawn } = require('child_process');
const http = require('http');
const { extractHoursFromPageContent } = require('../lib/smarthours');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function waitCdp(port, tries = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      http
        .get({ host: '127.0.0.1', port, path: '/json/version' }, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          n += 1;
          if (n >= tries) reject(new Error('cdp not ready'));
          else setTimeout(tick, 150);
        });
    };
    tick();
  });
}

(async () => {
  const port = 9461;
  const proc = spawn(
    process.env.CHROME_PATH,
    ['--headless=new', `--remote-debugging-port=${port}`, '--no-sandbox', '--disable-gpu', 'about:blank'],
    { stdio: 'ignore' }
  );
  await waitCdp(port);
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r);
    ws.addEventListener('error', j);
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    }
  });
  const cdp = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('timeout ' + method));
        }
      }, 90000);
    });
  };
  const evaluate = async (expression) => {
    const res = await cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result && res.result.result ? res.result.result.value : null;
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', {
    url: 'https://www.google.com/maps/search/?api=1&query=geckos&kgmid=%2Fg%2F11ty51n7yc&hl=en'
  });
  await sleep(8000);

  const inPage = await evaluate(`(async () => {
    const q = 'geckos';
    const urls = [
      '/search?tbm=map&authuser=0&hl=en&gl=us&q=' + encodeURIComponent(q),
      document.querySelector('link[href*="tbm=map"]') && document.querySelector('link[href*="tbm=map"]').href
    ].filter(Boolean);
    const out = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'include' });
        const t = await r.text();
        out.push({ u: String(u).slice(0, 100), status: r.status, len: t.length, hasMon: /Monday/.test(t), hasWed: /Wednesday/.test(t), sample: t.slice(0, 200) });
        if (/\\["Monday"/.test(t) && /\\["Sunday"/.test(t)) out[out.length-1].body = t;
      } catch (e) {
        out.push({ u: String(u).slice(0, 100), err: e.message });
      }
    }
    // Also try absolute from page scripts
    const abs = Array.from(document.querySelectorAll('script[src], link[href]'))
      .map((el) => el.src || el.href)
      .find((h) => /tbm=map/.test(h || ''));
    if (abs) {
      const r = await fetch(abs, { credentials: 'include' });
      const t = await r.text();
      out.push({ u: abs.slice(0, 120), status: r.status, len: t.length, hasMon: /Monday/.test(t), week: (/Monday/.test(t) && /Sunday/.test(t)) });
      if (/Monday/.test(t) && /\\[\\[11\\],\\[22\\]\\]/.test(t)) out[out.length - 1].full = true;
    }
    return out;
  })()`);

  console.log(JSON.stringify(inPage, null, 2));
  if (Array.isArray(inPage)) {
    for (const item of inPage) {
      if (item.body) {
        console.log('parsed', extractHoursFromPageContent(item.body).descriptions);
      }
    }
  }

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
