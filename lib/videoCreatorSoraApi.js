'use strict';

const OPENAI_VIDEO_BASE = 'https://api.openai.com/v1/videos';

function openAiKey() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

function normalizeSeconds(v) {
  const s = String(v ?? '8');
  return ['4', '8', '12'].includes(s) ? s : '8';
}

async function createSoraVideo(fetchFn, opts) {
  const key = openAiKey();
  if (!key) throw new Error('OPENAI_API_KEY is not configured.');

  const prompt = String(opts.prompt || '').trim();
  if (!prompt) throw new Error('Prompt is required.');

  const requested = String(
    opts.model || process.env.VIDEOCREATOR_SORA_MODEL || 'sora-2'
  ).trim();
  const safeModel = requested === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2';
  const sizes = ['720x1280', '1280x720', '1024x1792', '1792x1024'];
  const rawSize = String(opts.size || '1280x720').trim();
  const size = sizes.includes(rawSize) ? rawSize : '1280x720';
  const seconds = normalizeSeconds(opts.seconds);

  const body = JSON.stringify({
    prompt,
    model: safeModel,
    seconds,
    size
  });

  const r = await fetchFn(OPENAI_VIDEO_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || JSON.stringify(j) || `OpenAI Videos HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status >= 400 && r.status < 600 ? r.status : 502;
    throw err;
  }
  return j;
}

async function retrieveSoraVideo(fetchFn, videoId) {
  const key = openAiKey();
  if (!key) throw new Error('OPENAI_API_KEY is not configured.');

  const id = String(videoId || '').trim();
  if (!id || !/^[\w-]+$/.test(id)) throw new Error('Invalid video id.');

  const r = await fetchFn(`${OPENAI_VIDEO_BASE}/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` }
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || `OpenAI HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status >= 400 && r.status < 600 ? r.status : 502;
    throw err;
  }
  return j;
}

module.exports = {
  openAiKey,
  createSoraVideo,
  retrieveSoraVideo,
  OPENAI_VIDEO_BASE
};
