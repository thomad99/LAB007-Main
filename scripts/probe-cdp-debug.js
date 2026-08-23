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
  const port = 9455;
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
      }, 60000);
    });
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  const nav = await cdp('Page.navigate', {
    url: `https://www.google.com/maps?q=${encodeURIComponent("Gecko's Grill & Pub")}&hl=en`
  });
  console.log('nav', JSON.stringify(nav).slice(0, 300));
  await sleep(10000);
  const evalRes = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: '({title: document.title, len: document.body?document.body.innerText.length:0, captcha:!!document.querySelector("#captcha-form"), href: location.href})'
  });
  console.log('eval full', JSON.stringify(evalRes, null, 2).slice(0, 1500));
  ws.close();
  proc.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
