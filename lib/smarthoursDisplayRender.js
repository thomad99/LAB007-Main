'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  DAYS,
  DAY_LABELS,
  tabletFromEink,
  effectiveHours,
  formatDayHours,
  isOpenNow,
  normalizeEink,
  normalizeDesign,
  resolveDataDir,
  einkCacheDir,
  ensureDirs,
  readLogoFile,
  readMediaFile,
  listMediaFiles,
  withChromeCdpPage
} = require('./smarthours');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bufferToDataUrl(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  return `data:${mime || 'image/png'};base64,${buffer.toString('base64')}`;
}

function fileToDataUrl(file) {
  if (!file || !file.buffer) return '';
  return bufferToDataUrl(file.buffer, file.type || 'image/png');
}

function displayContentVersion(customer) {
  const hours = effectiveHours(customer);
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const design = normalizeDesign(customer.design, tablet, eink.colorMode);
  const payload = JSON.stringify({
    name: customer.name,
    hours,
    openNow: isOpenNow(hours),
    updatedAt: customer.updatedAt,
    lastSyncedAt: customer.lastSyncedAt,
    useManualHours: customer.useManualHours,
    design,
    eink,
    render: 'display-png-v1'
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function buildDisplayHtml(customer, dataDir) {
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const design = normalizeDesign(customer.design, tablet, eink.colorMode);
  const hours = effectiveHours(customer);
  const openNow = isOpenNow(hours);
  const media = listMediaFiles(dataDir, customer);
  const mediaById = new Map(media.map((m) => [m.id, m]));

  const logoFile = readLogoFile(dataDir, customer.id);
  const logoUrl = fileToDataUrl(logoFile) || design.logoUrl || '';

  const openMedia = design.openMediaId ? mediaById.get(design.openMediaId) : null;
  const closedMedia = design.closedMediaId ? mediaById.get(design.closedMediaId) : null;
  const openImg = openMedia ? fileToDataUrl(readMediaFile(dataDir, customer.id, openMedia.id)) : '';
  const closedImg = closedMedia ? fileToDataUrl(readMediaFile(dataDir, customer.id, closedMedia.id)) : '';
  const slideUrls = (design.slideshowMediaIds || [])
    .map((id) => {
      const m = mediaById.get(id);
      if (!m) return '';
      return fileToDataUrl(readMediaFile(dataDir, customer.id, m.id));
    })
    .filter(Boolean);

  const w = tablet.width;
  const h = tablet.height;
  const bg = design.backgroundColor || '#FFFFFF';
  const fg = design.textColor || '#000000';
  const accent = design.accentColor || '#FF0000';
  const font = design.fontFamily || 'Georgia, "Times New Roman", serif';

  const statusHtml = (() => {
    if (design.statusMode === 'image') {
      const url = openNow ? openImg : closedImg;
      if (url) {
        return `<img class="status-img" src="${url}" alt="${openNow ? 'Open' : 'Closed'}">`;
      }
    }
    if (design.statusMode === 'text') {
      return `<div class="status-text" style="font-size:${Math.min(design.statusFontSize || 28, 42)}px;color:${openNow ? accent : fg}">${
        openNow ? 'Open Now' : 'Closed Now'
      }</div>`;
    }
    return `<div class="status-badge" style="font-size:${design.statusFontSize || 36}px;background:${
      openNow ? accent : fg
    };color:${bg}">${openNow ? 'OPEN' : 'CLOSED'}</div>`;
  })();

  const elements = (design.layout || [])
    .map((el) => {
      const box = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px`;
      let inner = '';
      if (el.type === 'logo' && logoUrl) {
        inner = `<img class="logo" src="${logoUrl}" alt="">`;
      } else if (el.type === 'title') {
        inner = `<div class="title" style="font-size:${design.titleFontSize || 28}px;color:${fg}">${escapeHtml(
          customer.name || 'Hours'
        )}</div>`;
      } else if (el.type === 'status') {
        inner = statusHtml;
      } else if (el.type === 'slideshow' && slideUrls.length) {
        inner = `<img class="slide-img" src="${slideUrls[0]}" alt="">`;
      } else if (el.type === 'hours') {
        inner = `<div class="hours" style="font-size:${design.hoursFontSize || 18}px;color:${fg}">${DAYS.map(
          (day) =>
            `<div class="row"><span>${escapeHtml((DAY_LABELS[day] || day).slice(0, 3).toUpperCase())}</span><span style="color:${accent}">${escapeHtml(
              formatDayHours(hours[day])
            )}</span></div>`
        ).join('')}</div>`;
      } else if (el.type === 'text') {
        const align = el.align === 'left' || el.align === 'right' ? el.align : 'center';
        const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const color = el.color || fg;
        inner = `<div class="custom-text" style="justify-content:${justify};text-align:${align};font-size:${
          el.fontSize || 28
        }px;color:${escapeHtml(color)};font-weight:${el.bold === false ? 400 : 700}">${escapeHtml(el.text || '')}</div>`;
      } else if (el.type === 'image' && el.mediaId) {
        const file = readMediaFile(dataDir, customer.id, el.mediaId);
        const url = fileToDataUrl(file);
        if (url) {
          const fit = el.fit === 'contain' ? 'contain' : 'cover';
          inner = `<img class="custom-img" style="object-fit:${fit}" src="${url}" alt="">`;
        }
      } else if (el.type === 'sketch' && el.dataUrl && String(el.dataUrl).startsWith('data:image/')) {
        inner = `<img class="custom-img" style="object-fit:contain;background:transparent" src="${el.dataUrl}" alt="Sketch">`;
      }
      if (!inner) return '';
      return `<div class="el" style="${box}">${inner}</div>`;
    })
    .filter(Boolean)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${w}px; height: ${h}px; overflow: hidden;
    background: ${bg}; color: ${fg}; font-family: ${font};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  #tablet { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; background: ${bg}; }
  .el { position: absolute; overflow: hidden; }
  .logo { max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto; }
  .title { font-weight: 800; text-align: center; line-height: 1.15; width: 100%; }
  .custom-text {
    width: 100%; height: 100%; display: flex; align-items: center; line-height: 1.2;
    padding: 4px; white-space: pre-wrap; word-break: break-word; overflow: hidden;
  }
  .custom-img, .status-img, .slide-img {
    width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 10px;
  }
  .status-text {
    text-align: center; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; width: 100%;
  }
  .status-badge {
    width: 100%; height: 100%; display: grid; place-items: center; border-radius: 16px;
    font-weight: 900; letter-spacing: .1em; text-transform: uppercase;
  }
  .hours { width: 100%; }
  .hours .row {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 8px 2px; border-bottom: 1px solid rgba(0,0,0,.12); font-weight: 600;
  }
</style>
</head>
<body>
  <div id="tablet">${elements}</div>
</body>
</html>`;
}

async function renderDisplayPng(customer, options = {}) {
  const dataDir = options.dataDir || resolveDataDir();
  ensureDirs(dataDir);
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const version = displayContentVersion(customer);
  const cachePath = path.join(einkCacheDir(dataDir), `${customer.id}.${version}.png`);

  if (fs.existsSync(cachePath) && !options.force) {
    return {
      buffer: fs.readFileSync(cachePath),
      version,
      width: tablet.width,
      height: tablet.height,
      contentType: 'image/png',
      cached: true
    };
  }

  const html = buildDisplayHtml(customer, dataDir);
  const buffer = await withChromeCdpPage(async (page) => {
    const scale = Math.max(1, Math.min(3, Number(options.scale) || 2));
    await page.setContent(html, {
      width: tablet.width,
      height: tablet.height,
      deviceScaleFactor: scale,
      waitMs: 600
    });
    return page.screenshotPng({
      clip: {
        x: 0,
        y: 0,
        width: tablet.width,
        height: tablet.height,
        scale
      }
    });
  });

  try {
    fs.writeFileSync(cachePath, buffer);
    // prune old png caches for this customer
    const dir = einkCacheDir(dataDir);
    const prefix = `${customer.id}.`;
    fs.readdirSync(dir).forEach((name) => {
      if (!name.startsWith(prefix) || !name.endsWith('.png')) return;
      if (name === `${customer.id}.${version}.png`) return;
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch (_) {
        /* ignore */
      }
    });
  } catch (err) {
    console.warn('[SmartHours] display png cache write failed:', err.message);
  }

  return {
    buffer,
    version,
    width: tablet.width,
    height: tablet.height,
    contentType: 'image/png',
    cached: false
  };
}

function displayMeta(customer, baseUrl) {
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const version = displayContentVersion(customer);
  const root = String(baseUrl || '').replace(/\/$/, '');
  return {
    version,
    pollIntervalMinutes: eink.pollIntervalMinutes,
    width: tablet.width,
    height: tablet.height,
    orientation: eink.orientation,
    colorMode: eink.colorMode,
    htmlUrl: `${root}/SmartHours/v/${encodeURIComponent(customer.slug)}`,
    imageUrl: `${root}/api/smarthours/public/${encodeURIComponent(customer.slug)}/display.png?v=${version}`,
    pngUrl: `${root}/api/smarthours/public/${encodeURIComponent(customer.slug)}/display.png?v=${version}`,
    metaUrl: `${root}/api/smarthours/public/${encodeURIComponent(customer.slug)}/display.json`
  };
}

module.exports = {
  buildDisplayHtml,
  renderDisplayPng,
  displayContentVersion,
  displayMeta
};
