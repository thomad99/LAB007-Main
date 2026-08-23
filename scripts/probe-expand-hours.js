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
  const port = 9457;
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
    return res.result && res.result.result ? res.result.result.value : null;
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', {
    url: 'https://www.google.com/maps/search/?api=1&query=geckos&kgmid=%2Fg%2F11ty51n7yc&hl=en'
  });
  await sleep(9000);

  // Click place result if needed
  await evaluate(`(() => {
    const a = document.querySelector('a[href*="/maps/place/"]');
    if (a) a.click();
    return location.href;
  })()`);
  await sleep(5000);

  const before = await evaluate(`(() => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const text = document.body.innerText || '';
    return {
      href: location.href.slice(0, 120),
      dayHits: days.filter((d) => text.includes(d)),
      bj: !!document.querySelector('.BjTeYd'),
      openLabel: (document.querySelector('[aria-label*="Copy open hours"]') || {}).getAttribute
        ? document.querySelector('[aria-label*="Copy open hours"]').getAttribute('aria-label')
        : null,
      closes: Array.from(document.querySelectorAll('[aria-label]'))
        .map((el) => el.getAttribute('aria-label'))
        .filter((a) => /Open|Hours|AM|PM|Closed/i.test(a || ''))
        .slice(0, 12)
    };
  })()`);
  console.log('before', JSON.stringify(before, null, 2));

  const clicked = await evaluate(`(() => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clicks = [];
    const tryClick = (el, why) => {
      if (!el) return;
      const target = el.closest('[role="button"]') || el.closest('button') || el;
      try { target.click(); clicks.push(why); } catch (_) {}
    };
    // Current Maps hours row (Open · Closes …)
    document.querySelectorAll('[aria-label]').forEach((el) => {
      const a = el.getAttribute('aria-label') || '';
      if (/Copy open hours|AM to|PM|Open|Hours|Closed/i.test(a) && !/direction|website|call|menu|review|photo/i.test(a)) {
        tryClick(el, 'aria:' + a.slice(0, 60));
      }
    });
    // Class-based hours toggle container
    document.querySelectorAll('.OyjIsf, .mWUh3d, .GUrTXd, [data-item-id="oh"], [jsaction*="openhours"], [jsaction*="hours"]').forEach((el) => {
      tryClick(el, 'cls:' + (el.className || '').toString().slice(0, 40));
    });
    // Text match Open · Closes
    Array.from(document.querySelectorAll('button, [role="button"], div')).some((el) => {
      const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (/Open\\s*[·•].*Clos/i.test(t) && t.length < 80) {
        tryClick(el, 'text:' + t.slice(0, 50));
        return true;
      }
      return false;
    });
    return clicks.slice(0, 20);
  })()`);
  console.log('clicked', clicked);
  await sleep(3000);

  const after = await evaluate(`(() => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const text = document.body.innerText || '';
    const rows = [];
    document.querySelectorAll('tr, [role="row"]').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('td, [role="cell"], div.ylH6lf, td.mxowUb'))
        .map((c) => (c.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      const day = days.find((d) => cells.some((c) => c === d || c.startsWith(d)));
      if (day) rows.push({ day, cells: cells.slice(0, 5) });
    });
    // Also scan ylH6lf / mxowUb pairs
    const pairs = [];
    document.querySelectorAll('td.ylH6lf, .ylH6lf').forEach((td) => {
      const day = (td.textContent || '').trim();
      if (!days.includes(day)) return;
      const timeTd = td.parentElement && td.parentElement.querySelector('td.mxowUb, .mxowUb');
      pairs.push({ day, time: timeTd ? (timeTd.getAttribute('aria-label') || timeTd.textContent || '').trim() : '' });
    });
    return {
      bj: !!document.querySelector('.BjTeYd, .dWqRCd'),
      dayHits: days.filter((d) => text.includes(d)),
      rows,
      pairs,
      ariaDays: Array.from(document.querySelectorAll('[aria-label]'))
        .map((el) => el.getAttribute('aria-label'))
        .filter((a) => /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(a || '') && /AM|PM|Closed|Open/i.test(a || ''))
    };
  })()`);
  console.log('after', JSON.stringify(after, null, 2));

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
