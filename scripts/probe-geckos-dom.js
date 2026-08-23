'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const sh = require('../lib/smarthours');

const TARGET =
  'https://www.google.com/search?q=Gecko%27s+Grill+%26+Pub&hl=en&gl=us';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function waitCdp(port, tries = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/version' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        n += 1;
        if (n >= tries) reject(new Error('cdp not ready'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

(async () => {
  const port = 9344;
  const proc = spawn(
    process.env.CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox',
      '--disable-gpu',
      '--window-size=1440,1400',
      '--lang=en-US',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  await waitCdp(port);
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
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
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  await cdp('Page.navigate', { url: TARGET });
  await sleep(6000);

  const expand = await cdp('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const norm = (s) => String(s||'').replace(/\\s+/g,' ').trim();
      const ready = () => document.querySelectorAll('table.BRdld tr.XCUnmd, div[jsname="ICUAND"] table tr').length;
      // click hours
      for (const el of document.querySelectorAll('[role="button"],button,div,span,a,[aria-label]')) {
        const t = norm(el.getAttribute('aria-label') || el.textContent || '');
        if (!t || t.length > 90) continue;
        if (/Open\\s*[·•∙].*Clos|show open hours|Hours/i.test(t) && !/Suggest/i.test(t)) {
          (el.closest('[role="button"]')||el.closest('button')||el).click();
          await sleep(1000);
        }
      }
      await sleep(1500);
      const rows = Array.from(document.querySelectorAll('table.BRdld tr.XCUnmd, div[jsname="ICUAND"] table tr, table.BRdld tr'));
      const out = rows.map(r => Array.from(r.querySelectorAll('td')).map(td => norm(td.textContent)));
      return {
        ready: ready(),
        title: document.title,
        h1: document.querySelector('h1') && document.querySelector('h1').textContent,
        rows: out,
        hasBRdld: !!document.querySelector('table.BRdld'),
        hasICUAND: !!document.querySelector('div[jsname="ICUAND"]'),
        sample: norm(document.body.innerText).slice(0, 500)
      };
    }`
  });
  console.log(JSON.stringify(expand.result && expand.result.value, null, 2));

  const html = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: 'document.documentElement.outerHTML'
  });
  const htmlStr = html.result.value || '';
  fs.writeFileSync('scripts/geckos-chrome.html', htmlStr);
  const parsed = sh.extractHoursFromPageContent(htmlStr);
  console.log('parsed from html', parsed.descriptions);

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
