(() => {
  const FRESH_MS = 45000;
  const POLL_MS = 550;
  const CONFIG_POLL_MS = 5000;
  let lastIso = '';
  let hiddenTimer = null;
  let lastConfigAt = 0;
  let voiceStyle = 'neon-edge';

  const style = document.createElement('style');
  style.textContent = `
    #buckVoiceOverlay {
      position: fixed; inset: 0; z-index: 2147483000;
      display: none; align-items: center; justify-content: center;
      padding: clamp(10px, 2.6vw, 34px);
      background:
        radial-gradient(circle at 24% 18%, rgba(255, 209, 102, .18), transparent 30%),
        radial-gradient(circle at 80% 70%, rgba(118, 244, 197, .12), transparent 34%),
        linear-gradient(135deg, rgba(2, 4, 8, .95), rgba(10, 13, 18, .92));
      color: #f8f3e7;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
      text-align: left; pointer-events: none; backdrop-filter: blur(10px);
    }
    #buckVoiceOverlay.active { display: flex; }
    #buckVoiceOverlay .voiceCard {
      width: calc(100vw - clamp(20px, 5.2vw, 68px));
      max-width: none; min-height: min(78vh, 520px); box-sizing: border-box;
      display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(22px, 4vw, 58px);
      align-items: center; padding: clamp(20px, 4vw, 64px);
      border: 1px solid rgba(255, 209, 102, .34); border-radius: clamp(28px, 4vw, 54px);
      background: linear-gradient(135deg, rgba(8, 10, 16, .88), rgba(21, 15, 6, .70));
      box-shadow: 0 0 90px rgba(255, 209, 102, .22), inset 0 0 80px rgba(255, 209, 102, .055);
    }
    #buckVoiceOverlay .aliveSpinner {
      width: clamp(150px, 23vw, 340px); aspect-ratio: 1; border-radius: 50%; object-fit: cover;
      mix-blend-mode: screen;
      filter: drop-shadow(0 0 34px rgba(255, 209, 102, .86)) drop-shadow(0 0 80px rgba(220, 184, 52, .34));
      animation: buckVoiceSpin 1.15s linear infinite, buckVoicePulse 1.35s ease-in-out infinite;
    }
    #buckVoiceOverlay .copy { min-width: 0; display: grid; gap: clamp(12px, 2vw, 26px); }
    #buckVoiceOverlay .title {
      font-size: clamp(46px, 9vw, 132px); font-weight: 1000; letter-spacing: -.07em; line-height: .86;
      color: #fff7de; text-shadow: 0 0 34px rgba(255, 209, 102, .28);
    }
    #buckVoiceOverlay .message {
      min-height: 1.2em; font-size: clamp(28px, 5.2vw, 76px); line-height: 1.02; font-weight: 950;
      letter-spacing: -.045em; color: #76f4c5; text-shadow: 0 0 26px rgba(118, 244, 197, .25);
      overflow-wrap: anywhere; text-wrap: balance;
    }
    #buckVoiceOverlay .message.empty { color: rgba(248, 243, 231, .62); font-size: clamp(24px, 4vw, 54px); }
    #buckVoiceOverlay.neon-edge {
      align-items: flex-start;
      justify-content: flex-end;
      background: transparent;
      color: #eafcff;
      backdrop-filter: none;
    }
    #buckVoiceOverlay.neon-edge::before {
      content: "";
      position: fixed;
      inset: clamp(8px, 1.2vw, 18px);
      border: clamp(2px, .35vw, 5px) solid rgba(0, 217, 255, .72);
      border-radius: clamp(18px, 3vw, 48px);
      box-shadow: 0 0 22px rgba(0, 217, 255, .88), 0 0 54px rgba(255, 42, 168, .46), inset 0 0 28px rgba(0, 217, 255, .44);
      animation: buckVoiceEdgePulse 1.45s ease-in-out infinite;
      pointer-events: none;
    }
    #buckVoiceOverlay.neon-edge .voiceCard {
      grid-template-columns: minmax(0, 1fr);
      width: auto;
      min-height: 0;
      max-width: min(42vw, 640px);
      gap: 8px;
      padding: clamp(9px, 1.2vw, 18px) clamp(12px, 1.6vw, 24px);
      border-color: rgba(0, 217, 255, .44);
      border-radius: clamp(14px, 1.5vw, 24px);
      background: rgba(2, 9, 20, .58);
      box-shadow: 0 0 32px rgba(0, 217, 255, .24), inset 0 0 22px rgba(255, 42, 168, .06);
    }
    #buckVoiceOverlay.neon-edge .aliveSpinner {
      display: none;
    }
    #buckVoiceOverlay.neon-edge .title {
      display: none;
    }
    #buckVoiceOverlay.neon-edge .message {
      display: none;
    }
    @keyframes buckVoiceSpin { to { transform: rotate(360deg); } }
    @keyframes buckVoicePulse { 0%,100%{ opacity:.84; filter: drop-shadow(0 0 26px rgba(255, 209, 102, .68)); } 50%{ opacity:1; filter: drop-shadow(0 0 46px rgba(255, 209, 102, .96)); } }
    @keyframes buckVoiceNeonPulse { 0%,100%{ opacity:.84; filter: drop-shadow(0 0 26px rgba(0, 217, 255, .68)); } 50%{ opacity:1; filter: drop-shadow(0 0 46px rgba(255, 42, 168, .76)); } }
    @keyframes buckVoiceEdgePulse { 0%,100%{ opacity:.72; filter:brightness(.95); } 50%{ opacity:1; filter:brightness(1.28); } }
    @media (max-width: 760px) {
      #buckVoiceOverlay .voiceCard { grid-template-columns: 1fr; justify-items: center; text-align: center; }
      #buckVoiceOverlay .aliveSpinner { width: min(48vw, 220px); }
      #buckVoiceOverlay.neon-edge .voiceCard { max-width: 86vw; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'buckVoiceOverlay';
  overlay.innerHTML = `
    <div class="voiceCard">
      <img class="aliveSpinner" src="/loading-swirl-transparent.png" alt="Buck listening" />
      <div class="copy">
        <div class="title">Buck Listening</div>
        <div class="message empty">Say your command…</div>
      </div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  async function refreshConfig(force = false) {
    const now = Date.now();
    if (!force && now - lastConfigAt < CONFIG_POLL_MS) return;
    lastConfigAt = now;
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      const data = await res.json();
      voiceStyle = data?.voiceFeedback?.style || 'neon-edge';
      overlay.classList.toggle('neon-edge', voiceStyle === 'neon-edge');
    } catch (_) {}
  }

  function cleanMessage(raw, kind) {
    let text = String(raw || '')
      .replace(/^Buck\s+Listening[.…:\-\s]*/i, '')
      .replace(/^Listening[.…:\-\s]*/i, '')
      .replace(/^Buck\s+Thinking[.…:\-\s]*/i, '')
      .replace(/^Thinking…?$/i, '')
      .trim();
    if (kind === 'working') text = text || 'Thinking…';
    return text;
  }

  function show(kind, rawMessage) {
    const isWorking = kind === 'working';
    const message = cleanMessage(rawMessage, kind);
    overlay.classList.toggle('neon-edge', voiceStyle === 'neon-edge');
    overlay.querySelector('.title').textContent = isWorking ? 'Buck Thinking' : 'Buck Listening';
    const msg = overlay.querySelector('.message');
    msg.textContent = message || 'Say your command…';
    msg.classList.toggle('empty', !message || message === 'Say your command…');
    overlay.classList.add('active');
    clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => overlay.classList.remove('active'), FRESH_MS);
  }
  function hide() { overlay.classList.remove('active'); }

  async function poll() {
    try {
      await refreshConfig();
      const res = await fetch('/api/feedback', { cache: 'no-store' });
      const data = await res.json();
      const iso = data.updatedAt || '';
      if (!iso) return hide();
      const age = Date.now() - new Date(iso).getTime();
      if (age > FRESH_MS) return hide();
      const kind = data.kind || '';
      if (!['listening', 'working'].includes(kind)) return hide();
      if (iso === lastIso) return;
      lastIso = iso;
      show(kind, data.message || '');
    } catch (_) {}
  }
  setInterval(poll, POLL_MS);
  refreshConfig(true);
  poll();
})();
