'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { renderDisplayPng, buildDisplayHtml } = require('../lib/smarthoursDisplayRender');
const { defaultDesign, defaultEink, defaultHours, normalizeCustomer } = require('../lib/smarthours');
const fs = require('fs');

(async () => {
  const customer = normalizeCustomer({
    id: 'test-display',
    name: 'Elite Cleaning Services',
    slug: 'elite-cleaning',
    hours: defaultHours(),
    design: {
      ...defaultDesign({ width: 800, height: 480 }),
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      accentColor: '#FF0000'
    },
    eink: { ...defaultEink(), width: 800, height: 480, orientation: 'landscape', colorMode: '4color' }
  });
  const html = buildDisplayHtml(customer, require('path').join(__dirname, '..', 'data', 'SmartHours'));
  fs.writeFileSync('scripts/probe-display.html', html);
  const rendered = await renderDisplayPng(customer, {
    dataDir: require('path').join(__dirname, '..', 'data', 'SmartHours'),
    force: true
  });
  fs.writeFileSync('scripts/probe-display.png', rendered.buffer);
  console.log('ok', rendered.width, rendered.height, rendered.buffer.length, rendered.version);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
