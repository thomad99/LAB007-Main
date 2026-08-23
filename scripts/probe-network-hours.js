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
  const port = 9460;
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
  const interesting = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Network.responseReceived') {
      const url = msg.params.response.url || '';
      if (/preview|place|search|batchexecute|maps\/preview|rpc/i.test(url)) {
        interesting.push({
          requestId: msg.params.requestId,
          url: url.slice(0, 180),
          status: msg.params.response.status,
          mime: msg.params.response.mimeType
        });
      }
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
  await cdp('Page.navigate', {
    url: 'https://www.google.com/maps/search/?api=1&query=geckos&kgmid=%2Fg%2F11ty51n7yc&hl=en'
  });
  await sleep(10000);

  console.log('interesting responses', interesting.length);
  interesting.slice(0, 40).forEach((x, i) => console.log(i, x.status, x.mime, x.url));

  const bodies = [];
  for (const item of interesting.slice(0, 25)) {
    try {
      const body = await cdp('Network.getResponseBody', { requestId: item.requestId });
      const text = body.result && body.result.body ? body.result.body : '';
      const decoded = body.result && body.result.base64Encoded ? Buffer.from(text, 'base64').toString('utf8') : text;
      if (/Monday|Wednesday|11|AM|PM|Closed|\[\[11|openhours|Opening/i.test(decoded)) {
        bodies.push({ url: item.url, len: decoded.length, sample: decoded.slice(0, 500) });
        // Save first large match
        if (decoded.length > 2000 && /Wednesday|Monday/.test(decoded)) {
          fs.writeFileSync('scripts/geckos-network-hours.txt', decoded.slice(0, 200000), 'utf8');
          console.log('saved network body', item.url.slice(0, 100), decoded.length);
        }
      }
    } catch (_) {
      /* body unavailable */
    }
  }
  console.log('bodies with hours markers', bodies.length);
  bodies.slice(0, 8).forEach((b) => {
    console.log('---', b.url);
    console.log(b.sample.replace(/\s+/g, ' ').slice(0, 300));
  });

  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
