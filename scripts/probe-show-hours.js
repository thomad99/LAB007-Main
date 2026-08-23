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
  const port = 9458;
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
    if (res.result && res.result.exceptionDetails) {
      throw new Error(JSON.stringify(res.result.exceptionDetails));
    }
    return res.result && res.result.result ? res.result.result.value : null;
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', {
    url: 'https://www.google.com/maps/search/?api=1&query=Gecko%27s+Grill+%26+Pub&kgmid=%2Fg%2F11ty51n7yc&hl=en'
  });
  await sleep(8000);
  await evaluate(`(() => { const a=document.querySelector('a[href*="/maps/place/"]'); if(a) a.click(); })()`);
  await sleep(5000);

  // Click ONLY "Show open hours for the week"
  const clickRes = await evaluate(`(() => {
    const el = document.querySelector('[aria-label="Show open hours for the week"]');
    if (!el) return { ok: false, reason: 'missing' };
    const btn = el.closest('[role="button"]') || el.closest('button') || el;
    btn.click();
    return { ok: true, tag: btn.tagName, cls: String(btn.className||'').slice(0,80) };
  })()`);
  console.log('click', clickRes);
  await sleep(2500);

  const after = await evaluate(`(() => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const text = document.body.innerText || '';
    const pairs = [];
    document.querySelectorAll('td.ylH6lf, .ylH6lf').forEach((td) => {
      const day = (td.textContent || '').replace(/\\s+/g,' ').trim();
      if (!days.includes(day)) return;
      const tr = td.closest('tr') || td.parentElement;
      const timeTd = tr && tr.querySelector('td.mxowUb, .mxowUb');
      pairs.push({
        day,
        aria: timeTd ? (timeTd.getAttribute('aria-label') || '') : '',
        text: timeTd ? (timeTd.textContent || '').replace(/\\s+/g,' ').trim() : ''
      });
    });
    // Fallback: any tr with day name
    const rows = [];
    document.querySelectorAll('table tr, tr').forEach((tr) => {
      const t = (tr.textContent || '').replace(/\\s+/g,' ').trim();
      const day = days.find((d) => t.startsWith(d) || new RegExp('^'+d+'\\\\b').test(t));
      if (day) rows.push(t.slice(0, 80));
    });
    return {
      bj: !!(document.querySelector('.BjTeYd') || document.querySelector('.dWqRCd')),
      dayHits: days.filter((d) => text.includes(d)),
      pairs,
      rows: rows.slice(0, 10),
      showBtn: !!(document.querySelector('[aria-label="Show open hours for the week"]')),
      sample: text.split(/\\n/).filter((l) => /AM|PM|Closed|Monday|Tuesday|Open/i.test(l)).slice(0, 30)
    };
  })()`);
  console.log(JSON.stringify(after, null, 2));

  const html = await evaluate('document.documentElement.outerHTML');
  fs.writeFileSync('scripts/geckos-maps-expanded.html', html || '', 'utf8');
  console.log('html', (html || '').length);

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
