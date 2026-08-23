'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { spawn } = require('child_process');
const http = require('http');

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
  const port = 9459;
  const proc = spawn(
    process.env.CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
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
    return res.result && res.result.result ? res.result.result.value : null;
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  // Direct place URL from earlier probe (cid hex)
  await cdp('Page.navigate', {
    url:
      'https://www.google.com/maps/place/Gecko%27s+Grill+%26+Pub/@27.258789,-82.5217494,17z/data=!3m1!4b1!4m6!3m5!1s0x88c34180fdf01407:0x67e34bc198ae9316!8m2!3d27.258789!4d-82.5217494!16s%2Fg%2F11gb3r04kh?hl=en&entry=ttu'
  });
  await sleep(9000);

  const state = await evaluate(`(() => {
    const btn = document.querySelector('[jsaction*="openhours"][role="button"], [aria-expanded][jsaction*="openhours"]');
    if (!btn) return { found: false };
    const before = btn.getAttribute('aria-expanded');
    btn.focus();
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    btn.click();
    return {
      found: true,
      before,
      after: btn.getAttribute('aria-expanded'),
      className: String(btn.className || ''),
      parentClass: String((btn.parentElement && btn.parentElement.className) || '')
    };
  })()`);
  console.log('click state', state);
  await sleep(3000);

  const days = await evaluate(`(() => {
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const pairs = [];
    document.querySelectorAll('table.eK4R0e tr, tr.y0skZc').forEach((tr) => {
      const dayEl = tr.querySelector('td.ylH6lf, .ylH6lf');
      const timeEl = tr.querySelector('td.mxowUb, .mxowUb');
      if (!dayEl) return;
      const day = (dayEl.textContent || '').trim();
      if (!names.includes(day)) return;
      pairs.push({
        day,
        aria: timeEl ? timeEl.getAttribute('aria-label') : '',
        text: timeEl ? (timeEl.textContent || '').replace(/\\s+/g, ' ').trim() : ''
      });
    });
    const btn = document.querySelector('[jsaction*="openhours"][role="button"]');
    return {
      pairs,
      expanded: btn && btn.getAttribute('aria-expanded'),
      limited: /limited view/i.test(document.body.innerText || ''),
      dayTextCount: names.filter((d) => (document.body.innerText || '').includes(d)).length
    };
  })()`);
  console.log(JSON.stringify(days, null, 2));

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
