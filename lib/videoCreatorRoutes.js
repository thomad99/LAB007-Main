'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const FormDataMultipart = require('form-data');
const { createSoraVideo, retrieveSoraVideo, openAiKey } = require('./videoCreatorSoraApi');

const whisperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const mt = String(file.mimetype || '').toLowerCase();
    const okExt = /\.(webm|wav|mp3|m4a|mp4|mpeg|mpga|flac|ogg|opus)$/i.test(name);
    const okMt =
      /^audio\//.test(mt) ||
      /^video\/(mp4|webm|quicktime)/.test(mt) ||
      applicationOctet(mt);
    if (okExt || okMt) cb(null, true);
    else cb(new Error('Use a common audio/video file (mp3, wav, m4a, webm, mp4, flac, …).'));
  }
});

function applicationOctet(mt) {
  return mt === 'application/octet-stream';
}

/** Extract YouTube video ID from common URL shapes */
function parseYoutubeVideoId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').slice(0, 11);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const mEmbed = u.pathname.match(/\/embed\/([\w-]{11})/);
      if (mEmbed) return mEmbed[1];
      const mShort = u.pathname.match(/\/shorts\/([\w-]{11})/);
      if (mShort) return mShort[1];
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeImageQuery(q) {
  const s = String(q || '')
    .trim()
    .slice(0, 240)
    .replace(/[^a-zA-Z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || 'nature';
}

async function fetchPexelsImageUrl(query, fetchFn) {
  const key = String(process.env.PEXELS_API_KEY || '').trim();
  if (!key) return null;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const r = await fetchFn(url, {
    headers: { Authorization: key }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.photos || !j.photos.length) return null;
  const p = j.photos[Math.floor(Math.random() * Math.min(j.photos.length, 3))];
  return p.src?.large || p.src?.medium || p.src?.original || null;
}

function whisperRouteHandler(req, res) {
  return new Promise((resolve) => {
    whisperUpload.single('audio')(req, res, (err) => {
      if (err) {
        res.status(400).json({ ok: false, error: err.message || 'Upload rejected.' });
        return resolve();
      }
      resolve();
    });
  });
}

function registerVideoCreatorRoutes(app) {
  const fetchFn =
    global.fetch ||
    ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

  app.get('/videocreator', (req, res) => {
    const p = path.join(__dirname, '..', 'public', 'videocreator.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/VideoCreator', (req, res) => res.redirect(301, '/videocreator'));

  /** Returns plain text transcript (joined lines) */
  app.get('/api/videocreator/youtube-transcript', async (req, res) => {
    try {
      const urlOrId = req.query.url || req.query.videoId || '';
      const videoId = parseYoutubeVideoId(urlOrId);
      if (!videoId) {
        return res.status(400).json({ ok: false, error: 'Invalid or missing YouTube URL/video id.' });
      }
      const mod = await import('youtube-transcript');
      const fetchTr =
        mod.fetchTranscript ||
        (mod.default && mod.default.fetchTranscript) ||
        (mod.YoutubeTranscript && mod.YoutubeTranscript.fetchTranscript);
      if (typeof fetchTr !== 'function') {
        return res.status(500).json({ ok: false, error: 'Transcript module not available.' });
      }
      const chunks = await fetchTr(videoId);
      const lines = Array.isArray(chunks)
        ? chunks.map((c) => String(c.text || c.snippet || '').trim()).filter(Boolean)
        : [];
      const text = lines.join(' ');
      return res.json({
        ok: true,
        videoId,
        text: text.trim(),
        lineCount: lines.length
      });
    } catch (e) {
      const msg = e.message || String(e);
      const status =
        /disabled|available|could not retrieve|blocked|Too Many Requests/i.test(msg) ? 502 : 400;
      return res.status(status).json({ ok: false, error: msg || 'Could not load transcript.' });
    }
  });

  /**
   * JSON { url, source, attribution? } — client uses url as img src (may redirect).
   * Without PEXELS_API_KEY uses loremflickr tag search (demo; not guaranteed topical).
   */
  /** OpenAI Whisper — transcribe uploaded audio/video (same billable key as GPT). Uses OPENAI_API_KEY or OPENAI_KEY. */
  app.get('/api/videocreator/whisper-status', (req, res) => {
    const key = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
    return res.json({
      ok: true,
      configured: Boolean(key),
      model: process.env.VIDEOCREATOR_WHISPER_MODEL?.trim() || 'whisper-1',
      maxUploadMb: 25
    });
  });

  app.post('/api/videocreator/whisper-transcribe', async (req, res) => {
    await whisperRouteHandler(req, res);
    if (res.headersSent) return;

    try {
      const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
      if (!openAiKey) {
        return res.status(503).json({
          ok: false,
          error: 'OPENAI_API_KEY (or OPENAI_KEY) is not set on the server — required for Whisper API.'
        });
      }

      const fileObj = req.file;
      if (!fileObj?.buffer?.length) {
        return res.status(400).json({
          ok: false,
          error: 'No file received. Upload as multipart field name "audio".'
        });
      }

      let filename = String(fileObj.originalname || 'recording.webm').replace(
        /[^a-zA-Z0-9._-]+/g,
        '_'
      );
      filename = filename.slice(-120);
      if (!/[.](webm|wav|mp3|m4a|mp4|mpeg|flac|ogg|opus)$/i.test(filename)) {
        filename += '.webm';
      }

      const model = process.env.VIDEOCREATOR_WHISPER_MODEL?.trim() || 'whisper-1';
      const fd = new FormDataMultipart();
      fd.append('file', fileObj.buffer, {
        filename,
        contentType: fileObj.mimetype || 'application/octet-stream'
      });
      fd.append('model', model);
      const lang = String(req.body?.language || '').trim().toLowerCase();
      if (lang && /^[a-z]{2}(-[a-z]{2})?$/i.test(lang)) {
        fd.append('language', lang.split('-')[0]);
      }

      const r = await fetchFn('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          ...fd.getHeaders()
        },
        body: fd
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j?.error?.message || j?.error || `Whisper HTTP ${r.status}`;
        return res.status(502).json({ ok: false, error: String(msg) });
      }
      const text = String(j.text || '').trim();
      return res.json({ ok: true, text, model, provider: 'openai-whisper' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Whisper transcription failed.' });
    }
  });

  /** OpenAI Videos API — Sora 2 jobs (requires org access to video generation). */
  app.get('/api/videocreator/sora-status', (req, res) => {
    const configured = Boolean(openAiKey());
    return res.json({
      ok: true,
      configured,
      info:
        configured
          ? 'If OpenAI returns "model denied" / 403, your API key/project may not have Sora Videos access yet.'
          : 'Set OPENAI_API_KEY (or OPENAI_KEY) on the server.'
    });
  });

  app.post('/api/videocreator/sora-create', async (req, res) => {
    try {
      const body = req.body || {};
      const prompt = String(body.prompt || '').trim();
      const model = body.model === 'sora-2-pro' ? 'sora-2-pro' : 'sora-2';
      const seconds = body.seconds || '8';
      const size = typeof body.size === 'string' ? body.size : undefined;
      const video = await createSoraVideo(fetchFn, {
        prompt,
        model,
        seconds,
        size
      });
      return res.json({ ok: true, video });
    } catch (e) {
      const st = Number(e.status);
      const status = st >= 400 && st < 600 ? st : /required|prompt/i.test(e.message) ? 400 : 502;
      return res.status(status).json({ ok: false, error: e.message || 'Sora job failed.' });
    }
  });

  app.get('/api/videocreator/sora-job/:videoId', async (req, res) => {
    try {
      const video = await retrieveSoraVideo(fetchFn, req.params.videoId);
      return res.json({ ok: true, video });
    } catch (e) {
      const st = Number(e.status);
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({ ok: false, error: e.message || 'Retrieve failed.' });
    }
  });

  app.get('/api/videocreator/sora-content/:videoId', async (req, res) => {
    try {
      const key = openAiKey();
      if (!key) {
        return res.status(503).json({ error: 'OPENAI_API_KEY not configured.' });
      }
      const vid = String(req.params.videoId || '').trim();
      if (!/^[\w-]+$/.test(vid)) {
        return res.status(400).json({ error: 'Invalid video id.' });
      }
      const variant = req.query.variant ? String(req.query.variant) : '';
      let url = `https://api.openai.com/v1/videos/${encodeURIComponent(vid)}/content`;
      if (variant === 'thumbnail' || variant === 'spritesheet') {
        url += `?variant=${encodeURIComponent(variant)}`;
      }

      const r = await fetchFn(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` }
      });

      if (!r.ok) {
        const t = await r.text();
        return res
          .status(r.status)
          .type('text/plain')
          .send(t.slice(0, 2000) || `OpenAI HTTP ${r.status}`);
      }

      const ct = r.headers.get('content-type') || 'video/mp4';
      res.setHeader('Content-Type', ct);
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.send(buf);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Download failed.' });
    }
  });

  app.get('/api/videocreator/image', async (req, res) => {
    try {
      const q = sanitizeImageQuery(req.query.q);
      try {
        const pexelsUrl = await fetchPexelsImageUrl(q, fetchFn);
        if (pexelsUrl) {
          return res.json({
            ok: true,
            url: pexelsUrl,
            source: 'pexels',
            query: q
          });
        }
      } catch {
        /* fall through */
      }
      const tag = encodeURIComponent(q.replace(/\s+/g, ',').slice(0, 120));
      const url = `https://loremflickr.com/1920/1080/${tag}`;
      return res.json({
        ok: true,
        url,
        source: 'loremflickr',
        query: q,
        note: 'Set PEXELS_API_KEY on the server for better image matches.'
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Image lookup failed.' });
    }
  });
}

module.exports = { registerVideoCreatorRoutes, parseYoutubeVideoId };
