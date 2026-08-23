'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

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
  const port = 9456;
  const proc = spawn(
    process.env.CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox',
      '--disable-gpu',
      '--window-size=1400,1100',
      'about:blank'
    ],
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
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
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
  await cdp('Page.navigate', {
    url: `https://www.google.com/maps/search/${encodeURIComponent("Gecko's Grill & Pub")}?hl=en`
  });
  await sleep(8000);

  // Click first place result
  await cdp('Runtime.evaluate', {
    expression: `(() => {
      const a = document.querySelector('a[href*="/maps/place/"]');
      if (a) { a.click(); return a.href; }
      const feed = document.querySelector('[role="feed"] a');
      if (feed) { feed.click(); return feed.href || 'feed'; }
      return 'none';
    })()`
  });
  await sleep(8000);

  const snap1 = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      href: location.href,
      title: document.title,
      captcha: !!document.querySelector('#captcha-form'),
      tables: document.querySelectorAll('table.BRdld').length,
      rows: document.querySelectorAll('tr.XCUnmd').length,
      hasHours: /Hours|Open|Closed|11|AM|PM/i.test(document.body.innerText),
      textSample: (document.body.innerText||'').slice(0, 2500)
    })`
  });
  console.log('after click', JSON.stringify(snap1.result.result.value, null, 2));

  // Expand hours
  await cdp('Runtime.evaluate', {
    expression: `(() => {
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], div[role="button"], [jsaction*="pane"], [aria-label*="Hours" i], [aria-label*="Open" i], [data-item-id*="oh"]'));
      for (const el of nodes) {
        const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
        if (/hour|open|closed|today/.test(label) && !/direction|save|share|call|website|menu|review/.test(label)) {
          el.click();
          return label.slice(0, 120);
        }
      }
      return 'no-hours-btn';
    })()`
  });
  await sleep(2500);

  const hours = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const out = {
        href: location.href,
        tables: document.querySelectorAll('table.BRdld').length,
        rows: [],
        aria: [],
        textHits: []
      };
      document.querySelectorAll('table.BRdld tr.XCUnmd, tr.XCUnmd').forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('td, th, div')).map((c) => (c.textContent || '').trim()).filter(Boolean);
        if (cells.length) out.rows.push(cells.slice(0, 6));
      });
      document.querySelectorAll('[aria-label]').forEach((el) => {
        const a = el.getAttribute('aria-label') || '';
        if (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(a) && /\\d|Closed|Open/i.test(a)) {
          out.aria.push(a.slice(0, 200));
        }
      });
      const t = document.body.innerText || '';
      for (const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) {
        const re = new RegExp(day + '[^\\\\n]{0,80}', 'i');
        const m = t.match(re);
        if (m) out.textHits.push(m[0]);
      }
      return out;
    })()`
  });
  console.log('hours', JSON.stringify(hours.result.result.value, null, 2));

  const html = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: 'document.documentElement.outerHTML'
  });
  fs.writeFileSync('scripts/geckos-maps-chrome.html', html.result.result.value || '', 'utf8');
  console.log('html bytes', (html.result.result.value || '').length);

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
