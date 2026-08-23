'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const sh = require('../lib/smarthours');

const TARGETS = [
  `https://www.google.com/maps/search/?api=1&hl=en&gl=us&query=${encodeURIComponent("Gecko's Grill & Pub")}&kgmid=${encodeURIComponent('/g/11ty51n7yc')}`,
  `https://www.google.com/maps?hl=en&q=${encodeURIComponent("Gecko's Grill & Pub")}`,
  'https://www.google.com/maps?cid=1125972973904948563' // elite control - known working-ish
];

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

async function scrape(target) {
  const port = 9400 + Math.floor(Math.random() * 200);
  const proc = spawn(
    process.env.CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,1400',
      '--lang=en-US',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  try {
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
    await cdp('Network.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }).catch(() =>
      cdp('Emulation.setUserAgentOverride', {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      })
    );
    await cdp('Page.navigate', { url: target });
    await sleep(8000);
    const result = await cdp('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const norm = (s) => String(s||'').replace(/\\s+/g,' ').trim();
        for (const el of document.querySelectorAll('[role="button"],button,div,span,a,[aria-label]')) {
          const t = norm(el.getAttribute('aria-label') || el.textContent || '');
          if (!t || t.length > 100) continue;
          if (/Open\\s*[·•∙].*Clos|show open hours|^Hours$/i.test(t) && !/Suggest/i.test(t)) {
            (el.closest('[role="button"]')||el.closest('button')||el).click();
            await sleep(1200);
          }
        }
        await sleep(1500);
        const rows = Array.from(document.querySelectorAll('table.BRdld tr.XCUnmd, div[jsname="ICUAND"] table tr, table.BRdld tr, [role="table"] [role="row"]'));
        const table = rows.map(r => Array.from(r.querySelectorAll('td,[role="cell"]')).map(td => norm(td.textContent)).filter(Boolean)).filter(c => c.length>=2);
        const aria = Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).filter(a => /Monday|Tuesday|Wednesday|AM|PM|Closed/i.test(a||'')).slice(0,20);
        return {
          title: document.title,
          url: location.href,
          captcha: !!document.querySelector('#captcha-form, #captcha'),
          hasBRdld: !!document.querySelector('table.BRdld'),
          table,
          aria,
          bodyHas11: /11\\s*AM/i.test(document.body.innerText),
          bodyHas10: /10\\s*PM/i.test(document.body.innerText),
          snippet: norm(document.body.innerText).slice(0, 400)
        };
      }`
    });
    const val = result.result && result.result.value;
    console.log('\nTARGET', target.slice(0, 100));
    console.log(JSON.stringify(val, null, 2));
    if (val && !val.captcha) {
      const html = await cdp('Runtime.evaluate', {
        returnByValue: true,
        expression: 'document.documentElement.outerHTML'
      });
      const parsed = sh.extractHoursFromPageContent((html.result && html.result.value) || '');
      console.log('html parse', parsed.descriptions);
    }
    ws.close();
  } finally {
    try {
      proc.kill();
    } catch (_) {}
  }
}

(async () => {
  for (const t of TARGETS.slice(0, 2)) {
    await scrape(t);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
