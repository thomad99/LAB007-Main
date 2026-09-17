/**
 * Elite Management — Contracts tab (clone of Marketing Manager e-sign, Elite clients only)
 */
(function (global) {
  const DEFAULT_AGENT_IDENTITY = 'Elite Cleaning (Owner)';
  const AGENT_IDENTITIES = [
    'LAB007 Owners',
    'Elite Cleaning (Owner)',
    'Tiger Lily Floral (Owner)'
  ];

  function initEliteContracts(deps) {
    const apiFetch = deps.apiFetch;
    const setStatus = deps.setStatus || function () {};
    const escapeHtml = deps.escapeHtml;
    const getClients = deps.getClients || function () { return []; };
    const onAuthFail = deps.onAuthFail || function () {};

    const root = document.getElementById('contractsPanel');
    if (!root) return { load() {}, selectedClientId() { return ''; } };

    const state = {
      loaded: false,
      stats: { total: 0, pending: 0, signed: 0 },
      contracts: [],
      agentSig: { profiles: {}, agentIdentity: DEFAULT_AGENT_IDENTITY },
      selectedId: '',
      browserOpen: false,
      browserStatus: 'all',
      browserClientId: 'all',
      clientQuery: ''
    };

    const agentIdentityOptions = (selected) =>
      AGENT_IDENTITIES.map(
        (identity) =>
          `<option value="${escapeHtml(identity)}"${identity === selected ? ' selected' : ''}>${escapeHtml(identity)}</option>`
      ).join('');

    function fmtDate(value) {
      const s = String(value || '');
      if (!s) return '';
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s.slice(0, 10);
      return d.toLocaleDateString();
    }

    async function api(path, options) {
      const opts = options || {};
      const headers = Object.assign({}, opts.headers || {});
      if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await apiFetch(path, Object.assign({}, opts, { headers }));
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (typeof onAuthFail === 'function') onAuthFail();
        throw new Error('Session expired. Enter password again.');
      }
      if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
      return data;
    }

    async function copyText(value) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (_) {}
      return false;
    }

    async function openAuthedFile(url) {
      const res = await apiFetch(url);
      if (res.status === 401) {
        if (typeof onAuthFail === 'function') onAuthFail();
        throw new Error('Session expired. Enter password again.');
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not open document');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const popup = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('Pop-up blocked. Allow pop-ups to view the document.');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    }

    function clients() {
      return (getClients() || [])
        .slice()
        .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), undefined, { sensitivity: 'base' }));
    }

    function selectedClient() {
      return clients().find((c) => c.id === state.selectedId) || null;
    }

    function bindSigPad(canvas, opts) {
      const ctx = canvas.getContext('2d');
      let drawing = false;
      let hasInk = false;
      function fillWhite() {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      function pointerXY(ev) {
        const r = canvas.getBoundingClientRect();
        const src = ev.touches ? ev.touches[0] : ev;
        return {
          x: (src.clientX - r.left) * (canvas.width / r.width),
          y: (src.clientY - r.top) * (canvas.height / r.height)
        };
      }
      function startDraw(ev) {
        ev.preventDefault();
        drawing = true;
        const p = pointerXY(ev);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }
      function moveDraw(ev) {
        if (!drawing) return;
        ev.preventDefault();
        const p = pointerXY(ev);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#111111';
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasInk = true;
      }
      function endDraw() {
        drawing = false;
      }
      fillWhite();
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', moveDraw);
      window.addEventListener('mouseup', endDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', moveDraw, { passive: false });
      canvas.addEventListener('touchend', endDraw, { passive: false });
      const apiPad = {
        fillWhite,
        hasInk() { return hasInk; },
        setHasInk(v) { hasInk = Boolean(v); },
        clear() {
          fillWhite();
          hasInk = false;
        },
        toDataUrl() {
          return canvas.toDataURL('image/jpeg', 0.92);
        },
        drawImageUrl(url) {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              fillWhite();
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              hasInk = true;
              resolve(true);
            };
            img.onerror = () => resolve(false);
            img.src = url;
          });
        }
      };
      if (opts && opts.onReady) opts.onReady(apiPad);
      return apiPad;
    }

    function contractRowHtml(ct, extras) {
      const statusClass = ct.status === 'signed' ? 'em-st-done' : 'em-st-pending';
      const statusText = ct.status === 'signed' ? 'Signed' : 'Pending signature';
      const extraActions = extras || '';
      return `
        <div class="em-contract-row">
          <div class="em-contract-main">
            <div class="em-contract-title">${escapeHtml(ct.title || 'Contract')}</div>
            <div class="em-small">${escapeHtml(ct.customerName || 'Client')} • Created ${escapeHtml(fmtDate(ct.createdAt))} • Signer: ${escapeHtml(ct.signerRoleLabel || 'Customer')}</div>
            ${
              ct.includeAgentSignature && ct.agentSignatureDate
                ? `<div class="em-small">Owner signature: ${escapeHtml(ct.agentIdentity || DEFAULT_AGENT_IDENTITY)} • ${escapeHtml(ct.agentSignatureDate)}</div>`
                : ''
            }
            ${ct.signedAt ? `<div class="em-small">Signed ${escapeHtml(fmtDate(ct.signedAt))} by ${escapeHtml(ct.signerRoleLabel || 'Customer')} ${escapeHtml(ct.signerName || 'Signer')}</div>` : ''}
          </div>
          <div class="em-contract-actions">
            <span class="em-status-badge ${statusClass}">${statusText}</span>
            <button type="button" class="btn-secondary btn-small" data-open-contract="${escapeHtml(ct.signPath)}">Open</button>
            <button type="button" class="btn-secondary btn-small" data-copy-contract="${escapeHtml(ct.signPath)}">Copy link</button>
            ${
              ct.status === 'signed' && ct.signedDocumentPath
                ? `<button type="button" class="btn-secondary btn-small" data-view-file="${escapeHtml(ct.signedDocumentPath)}">Signed doc</button>`
                : ct.documentPath
                  ? `<button type="button" class="btn-secondary btn-small" data-view-file="${escapeHtml(ct.documentPath)}">Doc</button>`
                  : ''
            }
            ${extraActions}
            <button type="button" class="btn-danger btn-small" data-delete-contract="${escapeHtml(ct.id)}" data-delete-client="${escapeHtml(ct.customerId || '')}">Delete</button>
          </div>
        </div>
      `;
    }

    function bindContractRowActions(el, afterDelete) {
      el.querySelectorAll('[data-open-contract]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = btn.getAttribute('data-open-contract');
          if (p) window.open(p, '_blank', 'noopener');
        });
      });
      el.querySelectorAll('[data-copy-contract]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const p = btn.getAttribute('data-copy-contract');
          if (!p) return;
          const full = `${window.location.origin}${p}`;
          const ok = await copyText(full);
          if (ok) setStatus('Signing link copied.');
          else prompt('Copy signing link', full);
        });
      });
      el.querySelectorAll('[data-view-file]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await openAuthedFile(btn.getAttribute('data-view-file'));
          } catch (err) {
            setStatus(err.message, true);
          }
        });
      });
      el.querySelectorAll('[data-delete-contract]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const contractId = btn.getAttribute('data-delete-contract');
          const clientId = btn.getAttribute('data-delete-client');
          if (!contractId || !clientId) return;
          if (!confirm('Delete this contract/document and all signed copies?')) return;
          try {
            await api(`/api/elite-invoices/clients/${encodeURIComponent(clientId)}/contracts/${encodeURIComponent(contractId)}`, {
              method: 'DELETE'
            });
            setStatus('Contract deleted.');
            if (afterDelete) await afterDelete();
            else await refresh();
          } catch (err) {
            setStatus(err.message, true);
          }
        });
      });
      el.querySelectorAll('[data-jump-client]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = btn.getAttribute('data-jump-client');
          if (!cid) return;
          state.selectedId = cid;
          render();
          document.getElementById('em-contract-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function renderBrowser() {
      const el = document.getElementById('em-contract-browser');
      if (!el) return;
      const statusFilter = state.browserStatus || 'all';
      const clientFilter = state.browserClientId || 'all';
      const filtered = (state.contracts || []).filter((ct) => {
        const st = String(ct.status || 'pending');
        if (statusFilter !== 'all' && st !== statusFilter) return false;
        if (clientFilter !== 'all' && String(ct.customerId || '') !== clientFilter) return false;
        return true;
      });
      const clientOptions = clients()
        .map((c) => `<option value="${escapeHtml(c.id)}"${clientFilter === c.id ? ' selected' : ''}>${escapeHtml(c.displayName || 'Client')}</option>`)
        .join('');
      el.style.display = state.browserOpen ? '' : 'none';
      el.innerHTML = `
        <div class="em-browser-head">
          <h3>Contracts browser</h3>
          <button type="button" class="btn-secondary btn-small" id="em-browser-close">Close</button>
        </div>
        <div class="em-browser-filters">
          <select id="em-browser-status" class="em-select">
            <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All statuses</option>
            <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending only</option>
            <option value="signed"${statusFilter === 'signed' ? ' selected' : ''}>Signed only</option>
          </select>
          <select id="em-browser-client" class="em-select">
            <option value="all">All clients</option>
            ${clientOptions}
          </select>
        </div>
        <p class="em-small">${filtered.length} contract(s) shown</p>
        <div class="em-contract-list">
          ${
            filtered.length
              ? filtered.map((ct) => contractRowHtml(ct, `<button type="button" class="btn-secondary btn-small" data-jump-client="${escapeHtml(ct.customerId || '')}">Client</button>`)).join('')
              : '<p class="em-muted">No contracts match this filter.</p>'
          }
        </div>
      `;
      document.getElementById('em-browser-close')?.addEventListener('click', () => {
        state.browserOpen = false;
        renderBrowser();
      });
      document.getElementById('em-browser-status')?.addEventListener('change', (e) => {
        state.browserStatus = e.target.value || 'all';
        renderBrowser();
      });
      document.getElementById('em-browser-client')?.addEventListener('change', (e) => {
        state.browserClientId = e.target.value || 'all';
        renderBrowser();
      });
      bindContractRowActions(el, refresh);
    }

    function renderKpis() {
      const el = document.getElementById('em-contract-kpis');
      if (!el) return;
      el.innerHTML = `
        <button type="button" class="week-kpi em-kpi-click" data-contract-filter="all">
          <label>Contracts total</label>
          <strong>${state.stats.total || 0}</strong>
        </button>
        <button type="button" class="week-kpi em-kpi-click" data-contract-filter="pending">
          <label>Pending</label>
          <strong>${state.stats.pending || 0}</strong>
        </button>
        <button type="button" class="week-kpi em-kpi-click" data-contract-filter="signed">
          <label>Signed</label>
          <strong>${state.stats.signed || 0}</strong>
        </button>
      `;
      el.querySelectorAll('[data-contract-filter]').forEach((card) => {
        card.addEventListener('click', () => {
          state.browserOpen = true;
          state.browserStatus = card.getAttribute('data-contract-filter') || 'all';
          renderBrowser();
        });
      });
    }

    function renderClientList() {
      const el = document.getElementById('em-client-list');
      if (!el) return;
      const q = String(state.clientQuery || '').trim().toLowerCase();
      const rows = clients().filter((c) => {
        if (!q) return true;
        const hay = `${c.displayName || ''} ${c.billToName || ''} ${c.email || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!rows.length) {
        el.innerHTML = '<p class="em-muted">No invoice clients match. Add a client on the Invoices tab first.</p>';
        return;
      }
      el.innerHTML = rows
        .map((c) => {
          const active = c.id === state.selectedId ? ' is-active' : '';
          return `<button type="button" class="em-client-btn${active}" data-client-id="${escapeHtml(c.id)}">
            <span class="em-client-name">${escapeHtml(c.displayName || 'Client')}</span>
            <span class="em-small">${escapeHtml(c.billToName || c.email || '')}</span>
          </button>`;
        })
        .join('');
      el.querySelectorAll('[data-client-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedId = btn.getAttribute('data-client-id') || '';
          renderWork();
          renderClientList();
        });
      });
    }

    function bindAgentSignatureUi() {
      const canvas = document.getElementById('em-agent-sig-canvas');
      if (!canvas) return;
      const frame = document.getElementById('em-sig-frame');
      const identityEl = document.getElementById('em-agent-sig-identity');
      const nameEl = document.getElementById('em-agent-sig-name');
      const statusEl = document.getElementById('em-agent-sig-status');
      const pad = bindSigPad(canvas);
      let loadVersion = 0;

      async function loadProfile(identity) {
        const version = ++loadVersion;
        const profile = state.agentSig?.profiles?.[identity] || {};
        pad.clear();
        if (nameEl) nameEl.value = profile.agentName || '';
        if (!profile.signatureDataUrl) {
          if (statusEl) statusEl.textContent = `No signature saved for ${identity}.`;
          return;
        }
        const ok = await pad.drawImageUrl(profile.signatureDataUrl);
        if (version !== loadVersion) return;
        if (statusEl) statusEl.textContent = ok ? `Saved signature loaded for ${identity}.` : 'Could not load saved signature.';
      }

      loadProfile(identityEl?.value || DEFAULT_AGENT_IDENTITY);
      identityEl?.addEventListener('change', () => {
        state.agentSig.agentIdentity = identityEl.value || DEFAULT_AGENT_IDENTITY;
        loadProfile(state.agentSig.agentIdentity);
      });
      document.getElementById('em-agent-sig-clear')?.addEventListener('click', () => {
        pad.clear();
        if (statusEl) statusEl.textContent = 'Cleared.';
      });
      document.getElementById('em-agent-sig-save')?.addEventListener('click', async () => {
        if (!pad.hasInk()) return alert('Draw your signature first.');
        frame?.classList.remove('em-sig-saved');
        frame?.classList.add('em-sig-saving');
        if (statusEl) statusEl.textContent = 'Saving…';
        const t0 = Date.now();
        try {
          const agentName = String(nameEl?.value || '').trim();
          const agentIdentity = identityEl?.value || DEFAULT_AGENT_IDENTITY;
          const saved = await api('/api/elite-invoices/agent-signature', {
            method: 'POST',
            body: JSON.stringify({
              signatureDataUrl: pad.toDataUrl(),
              agentName,
              agentIdentity
            })
          });
          const elapsed = Date.now() - t0;
          if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
          frame?.classList.remove('em-sig-saving');
          frame?.classList.add('em-sig-saved');
          state.agentSig.profiles[agentIdentity] = {
            hasSignature: true,
            signatureDataUrl: pad.toDataUrl(),
            agentName: saved?.agentName || agentName,
            updatedAt: saved?.updatedAt || new Date().toISOString()
          };
          state.agentSig.agentIdentity = saved?.agentIdentity || agentIdentity;
          if (statusEl) statusEl.textContent = `Saved for ${state.agentSig.agentIdentity}.`;
          window.setTimeout(() => frame?.classList.remove('em-sig-saved'), 3200);
        } catch (e) {
          alert(e.message);
        } finally {
          frame?.classList.remove('em-sig-saving');
        }
      });
      document.getElementById('em-agent-sig-remove')?.addEventListener('click', async () => {
        const agentIdentity = identityEl?.value || DEFAULT_AGENT_IDENTITY;
        if (!confirm(`Remove the saved signature for ${agentIdentity}?`)) return;
        try {
          await api(
            '/api/elite-invoices/agent-signature?agentIdentity=' + encodeURIComponent(agentIdentity),
            { method: 'DELETE' }
          );
          delete state.agentSig.profiles[agentIdentity];
          pad.clear();
          if (nameEl) nameEl.value = '';
          if (statusEl) statusEl.textContent = `Removed signature for ${agentIdentity}.`;
        } catch (e) {
          alert(e.message);
        }
      });
    }

    async function loadClientContracts() {
      const listEl = document.getElementById('em-contracts-list');
      const cust = selectedClient();
      if (!listEl || !cust) return;
      try {
        const data = await api(`/api/elite-invoices/clients/${encodeURIComponent(cust.id)}/contracts`);
        const contracts = data.contracts || [];
        const signedCount = contracts.filter((x) => x.status === 'signed').length;
        const pendingCount = contracts.length - signedCount;
        if (!contracts.length) {
          listEl.innerHTML = '<p class="em-muted">No contracts yet for this client.</p>';
          return;
        }
        listEl.innerHTML =
          `<div class="em-list-head">
            <span class="em-pill">Client contracts: ${contracts.length}</span>
            <span class="em-pill">Pending: ${pendingCount}</span>
            <span class="em-pill">Signed: ${signedCount}</span>
            <div class="em-list-head-actions">
              <button type="button" class="btn-secondary btn-small" id="em-refresh-contracts">Refresh list</button>
              <button type="button" class="btn-danger btn-small" id="em-delete-all-contracts">Delete all</button>
            </div>
          </div>` + contracts.map((ct) => contractRowHtml(ct)).join('');
        bindContractRowActions(listEl, async () => {
          await refresh();
          await loadClientContracts();
        });
        document.getElementById('em-refresh-contracts')?.addEventListener('click', () => loadClientContracts());
        document.getElementById('em-delete-all-contracts')?.addEventListener('click', async () => {
          if (!confirm(`Delete ALL contracts and signed files for "${cust.displayName}"? This cannot be undone.`)) return;
          await api(`/api/elite-invoices/clients/${encodeURIComponent(cust.id)}/contracts`, { method: 'DELETE' });
          await refresh();
          await loadClientContracts();
        });
      } catch (err) {
        listEl.innerHTML = `<p class="em-error">${escapeHtml(err.message)}</p>`;
      }
    }

    function renderWork() {
      const el = document.getElementById('em-contract-work');
      if (!el) return;
      const cust = selectedClient();
      if (!cust) {
        el.innerHTML = '<p class="em-muted">Select a client from the Invoices roster to create or manage contracts. Existing Marketing Manager customers are not imported.</p>';
        return;
      }
      const agentDesignerIdentity = state.agentSig?.agentIdentity || DEFAULT_AGENT_IDENTITY;
      const agentDesignerProfile = state.agentSig?.profiles?.[agentDesignerIdentity] || {};
      el.innerHTML = `
        <div class="em-work-head">
          <h2>${escapeHtml(cust.displayName || 'Client')}</h2>
          <p class="em-muted">${escapeHtml(cust.billToName || '')}${cust.email ? ` • ${escapeHtml(cust.email)}` : ''}</p>
        </div>

        <details class="em-details" id="em-agent-sig-details">
          <summary>Agent signature (you)</summary>
          <p class="em-small">Each business keeps its own printed name and signature. Choose a business to load, edit, save, or remove only that signature.</p>
          <div class="em-sig-frame" id="em-sig-frame">
            <div class="em-sig-frame-rot" aria-hidden="true"></div>
            <div class="em-sig-frame-inner">
              <canvas id="em-agent-sig-canvas" width="520" height="140" class="em-agent-sig-canvas"></canvas>
            </div>
          </div>
          <label class="em-label" for="em-agent-sig-identity">Signing as</label>
          <select id="em-agent-sig-identity" class="em-select">${agentIdentityOptions(agentDesignerIdentity)}</select>
          <label class="em-label" for="em-agent-sig-name">Printed name (added below the signature on documents)</label>
          <input type="text" id="em-agent-sig-name" class="em-input" maxlength="200" placeholder="e.g. Jane Doe" value="${escapeHtml(agentDesignerProfile.agentName || '')}" />
          <div class="em-inline-actions">
            <button type="button" class="btn-secondary" id="em-agent-sig-clear">Clear</button>
            <button type="button" class="btn" id="em-agent-sig-save">Save Agent signature</button>
            <button type="button" class="btn-danger" id="em-agent-sig-remove">Remove saved</button>
            <span class="em-muted" id="em-agent-sig-status"></span>
          </div>
        </details>

        <details class="em-details" id="em-contract-create-details">
          <summary>Create a doc to sign</summary>
          <input type="text" id="em-contract-create-title" class="em-input" placeholder="Document title" />
          <div id="em-contract-create-body" class="em-rich-editor" contenteditable="true"></div>
          <label class="em-check">
            <input type="checkbox" id="em-include-agent-sig" checked />
            <span>Include my saved owner signature, dated today.</span>
          </label>
          <label class="em-label" for="em-contract-create-agent-identity">Who will I sign this as?</label>
          <select id="em-contract-create-agent-identity" class="em-select">${agentIdentityOptions(DEFAULT_AGENT_IDENTITY)}</select>
          <button type="button" class="btn" id="em-create-contract">Save doc for signing</button>
          <p class="em-small">Paste rich text directly. A signing section is automatically added if missing.</p>
        </details>

        <details class="em-details" id="em-contract-upload-details">
          <summary>Upload a doc for signing</summary>
          <input type="text" id="em-contract-upload-title" class="em-input" placeholder="Uploaded document title (optional)" />
          <label class="em-label" for="em-contract-signer-role">Who will sign this document?</label>
          <select id="em-contract-signer-role" class="em-select">
            <option value="customer" selected>Customer</option>
            <option value="employee">Employee</option>
          </select>
          <label class="em-check">
            <input type="checkbox" id="em-upload-include-agent-sig" checked />
            <span>Include my saved owner signature, dated today.</span>
          </label>
          <label class="em-label" for="em-contract-upload-agent-identity">Who will I sign this as?</label>
          <select id="em-contract-upload-agent-identity" class="em-select">${agentIdentityOptions(DEFAULT_AGENT_IDENTITY)}</select>
          <input type="file" id="em-contract-upload-file" class="em-input" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" />
          <button type="button" class="btn" id="em-upload-contract">Create E-Sign Doc</button>
          <p class="em-small">Supported: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG (max 25MB).</p>
        </details>

        <details class="em-details" id="em-contract-view-details" open>
          <summary>View contracts</summary>
          <div id="em-contracts-list"><p class="em-muted">Loading contracts…</p></div>
        </details>
      `;

      bindAgentSignatureUi();

      document.getElementById('em-create-contract')?.addEventListener('click', async () => {
        const titleEl = document.getElementById('em-contract-create-title');
        const bodyEl = document.getElementById('em-contract-create-body');
        const includeAgent = Boolean(document.getElementById('em-include-agent-sig')?.checked);
        const agentIdentity =
          document.getElementById('em-contract-create-agent-identity')?.value || DEFAULT_AGENT_IDENTITY;
        const title = String(titleEl?.value || '').trim();
        const bodyHtml = String(bodyEl?.innerHTML || '').trim();
        const body = String(bodyEl?.innerText || '').trim();
        if (!title) return alert('Document title is required.');
        if (!body) return alert('Document body is required.');
        if (includeAgent && !state.agentSig?.profiles?.[agentIdentity]?.signatureDataUrl) {
          return alert(`Save a signature for ${agentIdentity} first, or turn off the owner signature.`);
        }
        try {
          await api(`/api/elite-invoices/clients/${encodeURIComponent(cust.id)}/contracts`, {
            method: 'POST',
            body: JSON.stringify({
              title,
              body,
              bodyHtml,
              includeAgentSignature: includeAgent,
              agentIdentity
            })
          });
          if (titleEl) titleEl.value = '';
          if (bodyEl) bodyEl.innerHTML = '';
          const viewDetails = document.getElementById('em-contract-view-details');
          if (viewDetails) viewDetails.open = true;
          setStatus('Contract saved for signing.');
          await refresh();
          await loadClientContracts();
        } catch (err) {
          setStatus(err.message, true);
        }
      });

      document.getElementById('em-upload-contract')?.addEventListener('click', async () => {
        const uploadBtn = document.getElementById('em-upload-contract');
        const fileInput = document.getElementById('em-contract-upload-file');
        const titleInput = document.getElementById('em-contract-upload-title');
        const file = fileInput?.files && fileInput.files[0];
        if (!file) return alert('Select a document file to upload.');
        const includeAgent = Boolean(document.getElementById('em-upload-include-agent-sig')?.checked);
        const agentIdentity =
          document.getElementById('em-contract-upload-agent-identity')?.value || DEFAULT_AGENT_IDENTITY;
        if (includeAgent && !state.agentSig?.profiles?.[agentIdentity]?.signatureDataUrl) {
          return alert(`Save a signature for ${agentIdentity} first, or turn off the owner signature.`);
        }
        const fd = new FormData();
        fd.append('document', file);
        if (titleInput?.value?.trim()) fd.append('title', titleInput.value.trim());
        fd.append('signerRole', document.getElementById('em-contract-signer-role')?.value || 'customer');
        fd.append('includeAgentSignature', includeAgent ? '1' : '0');
        fd.append('agentIdentity', agentIdentity);
        const originalLabel = uploadBtn?.textContent || 'Create E-Sign Doc';
        try {
          if (uploadBtn) {
            uploadBtn.classList.add('is-loading');
            uploadBtn.textContent = 'Creating...';
            uploadBtn.disabled = true;
          }
          await api(`/api/elite-invoices/clients/${encodeURIComponent(cust.id)}/contracts/upload`, {
            method: 'POST',
            body: fd
          });
          if (titleInput) titleInput.value = '';
          if (fileInput) fileInput.value = '';
          const viewDetails = document.getElementById('em-contract-view-details');
          if (viewDetails) viewDetails.open = true;
          setStatus('E-sign document created.');
          await refresh();
          await loadClientContracts();
        } catch (err) {
          setStatus(err.message, true);
        } finally {
          if (uploadBtn) {
            uploadBtn.classList.remove('is-loading');
            uploadBtn.textContent = originalLabel;
            uploadBtn.disabled = false;
          }
        }
      });

      loadClientContracts();
    }

    function render() {
      renderKpis();
      renderBrowser();
      renderClientList();
      renderWork();
    }

    async function refresh() {
      const [stats, contractsResp, agentResp] = await Promise.all([
        api('/api/elite-invoices/contracts/stats').catch(() => ({ total: 0, pending: 0, signed: 0 })),
        api('/api/elite-invoices/contracts').catch(() => ({ contracts: [] })),
        api('/api/elite-invoices/agent-signature').catch(() => ({ profiles: {} }))
      ]);
      state.stats = stats || { total: 0, pending: 0, signed: 0 };
      state.contracts = (contractsResp && contractsResp.contracts) || [];
      state.agentSig = {
        profiles: agentResp?.profiles || {},
        agentIdentity: agentResp?.defaultIdentity || state.agentSig.agentIdentity || DEFAULT_AGENT_IDENTITY
      };
      const all = clients();
      if (state.selectedId && !all.find((c) => c.id === state.selectedId)) state.selectedId = '';
      if (!state.selectedId && all.length) state.selectedId = all[0].id;
      render();
    }

    document.getElementById('em-client-search')?.addEventListener('input', (e) => {
      state.clientQuery = e.target.value || '';
      renderClientList();
    });

    return {
      async load(force) {
        if (state.loaded && !force) {
          render();
          return;
        }
        setStatus('Loading contracts...');
        await refresh();
        state.loaded = true;
        setStatus('');
      },
      selectedClientId() {
        return state.selectedId;
      }
    };
  }

  global.initEliteContracts = initEliteContracts;
})(window);
