/**
 * Marketing Manager — customers, tasks, dashboards (uses /api/marketing-manager/*)
 */
(function () {
  const state = {
    data: { customers: [] },
    catalog: { directory: { usa: [], paid: [] }, campaigns: [] },
    contractStats: { total: 0, pending: 0, signed: 0 },
    contracts: [],
    agentSig: { hasSignature: false, updatedAt: null, signatureDataUrl: '' }
  };
  let selectedId = null;
  const contractBrowser = {
    open: false,
    status: 'all',
    customerId: 'all'
  };

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function statusClass(st) {
    if (st === 'completed') return 'mm-st-done';
    if (st === 'started') return 'mm-st-started';
    return 'mm-st-todo';
  }

  function statusLabel(st) {
    if (st === 'completed') return 'Completed';
    if (st === 'started') return 'Started';
    return 'Not started';
  }

  function cycleStatus(st) {
    if (st === 'not_started') return 'started';
    if (st === 'started') return 'completed';
    return 'not_started';
  }

  function countTasks(c) {
    const t = c.tasks || [];
    return {
      total: t.length,
      not_started: t.filter((x) => x.status === 'not_started').length,
      started: t.filter((x) => x.status === 'started').length,
      completed: t.filter((x) => x.status === 'completed').length
    };
  }

  function directoryProgress(task) {
    const list = task.checklist || [];
    if (!list.length) return 0;
    const done = list.filter((r) => r.done).length;
    return Math.round((done / list.length) * 100);
  }

  function globalStats() {
    const customers = state.data.customers || [];
    let total = 0;
    let ns = 0;
    let s = 0;
    let c = 0;
    customers.forEach((cust) => {
      (cust.tasks || []).forEach((t) => {
        total += 1;
        if (t.status === 'not_started') ns += 1;
        else if (t.status === 'started') s += 1;
        else c += 1;
      });
    });
    return { customers: customers.length, total, not_started: ns, started: s, completed: c };
  }

  async function api(path, opt) {
    const r = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opt
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  async function apiForm(path, method, formData) {
    const r = await fetch(path, { method, body: formData });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  async function refresh() {
    const [st, cat, cstats, contractsResp, agentResp] = await Promise.all([
      api('/api/marketing-manager/state'),
      api('/api/marketing-manager/catalog'),
      api('/api/marketing-manager/contracts/stats').catch(() => ({ total: 0, pending: 0, signed: 0 })),
      api('/api/marketing-manager/contracts').catch(() => ({ contracts: [] })),
      api('/api/marketing-manager/agent-signature').catch(() => ({ hasSignature: false }))
    ]);
    state.data = st;
    state.catalog = cat;
    state.contractStats = cstats || { total: 0, pending: 0, signed: 0 };
    state.contracts = (contractsResp && contractsResp.contracts) || [];
    state.agentSig = {
      hasSignature: Boolean(agentResp?.hasSignature && agentResp?.signatureDataUrl),
      updatedAt: agentResp?.updatedAt || null,
      signatureDataUrl: agentResp?.signatureDataUrl || ''
    };
    if (selectedId && !state.data.customers.find((c) => c.id === selectedId)) selectedId = null;
    if (!selectedId && state.data.customers.length) selectedId = state.data.customers[0].id;
    render();
  }

  function renderOverview() {
    const g = globalStats();
    const el = $('#mm-overview');
    if (!el) return;
    const statusFilter = contractBrowser.status || 'all';
    const customerFilter = contractBrowser.customerId || 'all';
    const allContracts = state.contracts || [];
    const filteredContracts = allContracts.filter((ct) => {
      const st = String(ct.status || 'pending');
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (customerFilter !== 'all' && String(ct.customerId || '') !== customerFilter) return false;
      return true;
    });
    const customerOptions = (state.data.customers || [])
      .map((c) => `<option value="${escapeHtml(c.id)}"${customerFilter === c.id ? ' selected' : ''}>${escapeHtml(c.name || 'Customer')}</option>`)
      .join('');
    el.innerHTML = `
      <div class="mm-dash-grid">
        <div class="mm-dash-card">
          <div class="mm-dash-val">${g.customers}</div>
          <div class="mm-dash-label">Customers</div>
        </div>
        <div class="mm-dash-card">
          <div class="mm-dash-val">${g.total}</div>
          <div class="mm-dash-label">Total tasks</div>
        </div>
        <div class="mm-dash-card mm-accent-todo">
          <div class="mm-dash-val">${g.not_started}</div>
          <div class="mm-dash-label">Not started</div>
        </div>
        <div class="mm-dash-card mm-accent-started">
          <div class="mm-dash-val">${g.started}</div>
          <div class="mm-dash-label">Started</div>
        </div>
        <div class="mm-dash-card mm-accent-done">
          <div class="mm-dash-val">${g.completed}</div>
          <div class="mm-dash-label">Completed</div>
        </div>
        <div class="mm-dash-card mm-clickable" data-contract-filter="all">
          <div class="mm-dash-val">${state.contractStats.total || 0}</div>
          <div class="mm-dash-label">Contracts total</div>
        </div>
        <div class="mm-dash-card mm-accent-started mm-clickable" data-contract-filter="pending">
          <div class="mm-dash-val">${state.contractStats.pending || 0}</div>
          <div class="mm-dash-label">Contracts pending</div>
        </div>
        <div class="mm-dash-card mm-accent-done mm-clickable" data-contract-filter="signed">
          <div class="mm-dash-val">${state.contractStats.signed || 0}</div>
          <div class="mm-dash-label">Contracts signed</div>
        </div>
      </div>
      <div class="mm-contract-browser" id="mm-contract-browser" style="display:${contractBrowser.open ? '' : 'none'};">
        <div class="mm-contract-browser-head">
          <h3>Contracts browser</h3>
          <button type="button" class="btn-mm-ghost" id="mm-contract-browser-close">Close</button>
        </div>
        <div class="mm-contract-filters">
          <select id="mm-contract-status-filter" class="mm-select">
            <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All statuses</option>
            <option value="pending"${statusFilter === 'pending' ? ' selected' : ''}>Pending only</option>
            <option value="signed"${statusFilter === 'signed' ? ' selected' : ''}>Signed only</option>
          </select>
          <select id="mm-contract-customer-filter" class="mm-select">
            <option value="all">All customers</option>
            ${customerOptions}
          </select>
        </div>
        <p class="mm-small">${filteredContracts.length} contract(s) shown</p>
        <div class="mm-contract-list">
          ${
            filteredContracts.length
              ? filteredContracts
                  .map((ct) => {
                    const stClass = ct.status === 'signed' ? 'mm-st-done' : 'mm-st-started';
                    const stLabel = ct.status === 'signed' ? 'Signed' : 'Pending';
                    return `
                    <div class="mm-contract-row">
                      <div class="mm-contract-row-main">
                        <div class="mm-contract-row-title">${escapeHtml(ct.title || 'Contract')}</div>
                        <div class="mm-small">${escapeHtml(ct.customerName || 'Customer')} • Created ${escapeHtml(fmtDate(ct.createdAt))}</div>
                        ${
                          ct.includeAgentSignature && ct.agentSignatureDate
                            ? `<div class="mm-small">Agent on doc: ${escapeHtml(ct.agentSignatureDate)}</div>`
                            : ''
                        }
                        ${ct.signedAt ? `<div class="mm-small">Signed ${escapeHtml(fmtDate(ct.signedAt))} by ${escapeHtml(ct.signerName || 'Signer')}</div>` : ''}
                      </div>
                      <div class="mm-contract-row-actions">
                        <span class="mm-status-badge ${stClass}">${stLabel}</span>
                        <button type="button" class="btn-mm-tiny" data-open-contract="${escapeHtml(ct.signPath)}">Open</button>
                        <button type="button" class="btn-mm-tiny" data-copy-contract="${escapeHtml(ct.signPath)}">Copy link</button>
                        ${ct.signedDocumentPath ? `<a class="btn-mm-tiny" href="${escapeHtml(ct.signedDocumentPath)}" target="_blank" rel="noopener" style="text-decoration:none;">Signed file</a>` : ''}
                        <button type="button" class="btn-mm-ghost" data-jump-customer="${escapeHtml(ct.customerId || '')}" style="padding:4px 10px;font-size:11px;">Customer</button>
                      </div>
                    </div>
                  `;
                  })
                  .join('')
              : '<p class="mm-muted">No contracts match this filter.</p>'
          }
        </div>
      </div>
    `;
    el.querySelectorAll('[data-contract-filter]').forEach((card) => {
      card.addEventListener('click', () => {
        contractBrowser.open = true;
        contractBrowser.status = card.getAttribute('data-contract-filter') || 'all';
        renderOverview();
      });
    });
    $('#mm-contract-browser-close')?.addEventListener('click', () => {
      contractBrowser.open = false;
      renderOverview();
    });
    $('#mm-contract-status-filter')?.addEventListener('change', (e) => {
      contractBrowser.status = e.target.value || 'all';
      renderOverview();
    });
    $('#mm-contract-customer-filter')?.addEventListener('change', (e) => {
      contractBrowser.customerId = e.target.value || 'all';
      renderOverview();
    });
    el.querySelectorAll('[data-open-contract]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-open-contract');
        if (!p) return;
        window.open(p, '_blank', 'noopener');
      });
    });
    el.querySelectorAll('[data-copy-contract]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = btn.getAttribute('data-copy-contract');
        if (!p) return;
        const full = `${window.location.origin}${p}`;
        const ok = await copyText(full);
        if (ok) alert('Signing link copied.');
        else prompt('Copy signing link', full);
      });
    });
    el.querySelectorAll('[data-jump-customer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-jump-customer');
        if (!cid) return;
        selectedId = cid;
        render();
        document.getElementById('mm-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderCustomerList() {
    const wrap = $('#mm-sidebar');
    if (!wrap) return;
    const rows = (state.data.customers || [])
      .map((c) => {
        const active = c.id === selectedId ? ' is-active' : '';
        const counts = countTasks(c);
        const site = c.website ? c.website.replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
        return `
      <button type="button" class="mm-cust-btn${active}" data-id="${c.id}">
        <span class="mm-cust-row">
          ${c.logoUrl ? `<img class="mm-cust-logo" src="${escapeHtml(c.logoUrl)}" alt="${escapeHtml(c.name)} logo" />` : ''}
          <span class="mm-cust-name">${escapeHtml(c.name)}</span>
        </span>
        <span class="mm-cust-meta">${counts.completed}/${counts.total} done${site ? ` • ${escapeHtml(site)}` : ''}</span>
      </button>`;
      })
      .join('');
    wrap.innerHTML = `
      <div class="mm-sidebar-head">
        <h3>Clients</h3>
        <button type="button" class="btn-mm" id="mm-add-customer">＋ Add</button>
      </div>
      <div class="mm-cust-list">${rows || '<p class="mm-muted">No clients yet.</p>'}</div>
    `;

    wrap.querySelectorAll('.mm-cust-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedId = btn.getAttribute('data-id');
        render();
      });
    });
    const addBtn = $('#mm-add-customer');
    if (addBtn)
      addBtn.addEventListener('click', async () => {
        const name = prompt('Customer / account name');
        if (!name || !name.trim()) return;
        const website = (prompt('Website (optional, e.g. example.com)') || '').trim();
        await api('/api/marketing-manager/customers', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), website })
        });
        await refresh();
      });
  }

  async function patchTask(customerId, taskId, body) {
    await api(`/api/marketing-manager/customers/${customerId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    await refresh();
  }

  function renderTaskDetail(cust, task) {
    const tool = $('#mm-task-tool');
    if (!tool) return;

    if (task.kind === 'directory') {
      const pct = directoryProgress(task);
      const usa = (task.checklist || []).filter((r) => r.section === 'usa');
      const paid = (task.checklist || []).filter((r) => r.section === 'paid');
      tool.innerHTML = `
        <div class="mm-tool-head">
          <span class="mm-pill">${pct}% directories checked</span>
          <button type="button" class="btn-mm-ghost" id="mm-dir-mark-all">Mark section…</button>
        </div>
        <div class="mm-dir-section"><h4>USA directories</h4>${renderDirRows(cust.id, task, usa)}</div>
        <div class="mm-dir-section"><h4>Paid platforms</h4>${renderDirRows(cust.id, task, paid)}</div>
      `;
      $('#mm-dir-mark-all')?.addEventListener('click', () => {
        const choice = prompt('Type usa, paid, or all to mark every item in that section complete', 'all');
        if (!choice) return;
        const ch = task.checklist.map((row) => {
          const lower = choice.trim().toLowerCase();
          if (lower === 'all') return { ...row, done: true };
          if (lower === 'usa' && row.section === 'usa') return { ...row, done: true };
          if (lower === 'paid' && row.section === 'paid') return { ...row, done: true };
          return row;
        });
        patchTask(cust.id, task.id, { checklist: ch });
      });
      bindDirectoryChecks(cust.id, task);
      return;
    }

    if (task.kind === 'keywords') {
      const liked = task.likedKeywords || [];
      tool.innerHTML = `
        <p class="mm-muted">Enter a few seeds; get suggestions and build your LIKE list for this customer.</p>
        <div class="mm-kw-row">
          <input type="text" class="mm-input" id="mm-kw-seeds" placeholder="e.g. patio furniture sarasota, outdoor dining" />
          <button type="button" class="btn-mm" id="mm-kw-suggest">Suggest keywords</button>
        </div>
        <p class="mm-small" id="mm-kw-source"></p>
        <div class="mm-kw-row" id="mm-kw-actions" style="display:none;">
          <button type="button" class="btn-mm-ghost" id="mm-kw-select-visible">Select visible</button>
          <button type="button" class="btn-mm-ghost" id="mm-kw-clear-selected">Clear</button>
          <button type="button" class="btn-mm" id="mm-kw-add-selected">Add selected to LIKE</button>
          <button type="button" class="btn-mm-danger-outline" id="mm-kw-dismiss-selected">Dismiss selected</button>
          <button type="button" class="btn-mm-ghost" id="mm-kw-load-more">Load more</button>
        </div>
        <p class="mm-small" id="mm-kw-meta"></p>
        <div class="mm-kw-suggestions" id="mm-kw-suggestions"></div>
        <h4 class="mm-like-title">LIKE list</h4>
        <ul class="mm-like-list" id="mm-like-list"></ul>
        <label class="mm-notes-label">Notes</label>
        <textarea class="mm-textarea" id="mm-kw-notes" rows="3">${escapeHtml(task.notes || '')}</textarea>
        <button type="button" class="btn-mm" id="mm-kw-save-notes">Save notes</button>
      `;
      renderLikeList(cust.id, task, liked);
      const kwUi = {
        suggestions: [],
        hidden: new Set(),
        selected: new Set(),
        visibleCount: 20
      };

      const renderSuggestionList = () => {
        const sugEl = $('#mm-kw-suggestions');
        const actionsEl = $('#mm-kw-actions');
        const metaEl = $('#mm-kw-meta');
        if (!sugEl || !actionsEl || !metaEl) return;

        const visibleAll = kwUi.suggestions.filter((kw) => !kwUi.hidden.has(kw));
        const visibleNow = visibleAll.slice(0, kwUi.visibleCount);
        actionsEl.style.display = visibleAll.length ? '' : 'none';
        sugEl.innerHTML = '';

        if (!visibleNow.length) {
          sugEl.textContent = 'No suggestions visible. Try new seeds or clear dismissed choices.';
        } else {
          visibleNow.forEach((kw) => {
            const row = document.createElement('label');
            row.className = 'mm-sug-row';
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.style.gap = '10px';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = kwUi.selected.has(kw);
            cb.addEventListener('change', () => {
              if (cb.checked) kwUi.selected.add(kw);
              else kwUi.selected.delete(kw);
              renderSuggestionList();
            });
            const sp = document.createElement('span');
            sp.textContent = kw;
            left.appendChild(cb);
            left.appendChild(sp);
            row.appendChild(left);
            sugEl.appendChild(row);
          });
        }

        const selectedVisibleCount = visibleNow.filter((kw) => kwUi.selected.has(kw)).length;
        metaEl.textContent = `${visibleAll.length} suggestions available • ${kwUi.selected.size} selected`;
        const loadMoreBtn = $('#mm-kw-load-more');
        if (loadMoreBtn) {
          const hasMore = visibleAll.length > visibleNow.length;
          loadMoreBtn.style.display = hasMore ? '' : 'none';
          loadMoreBtn.textContent = hasMore ? `Load more (${visibleAll.length - visibleNow.length})` : 'Load more';
        }
        const addBtn = $('#mm-kw-add-selected');
        if (addBtn) addBtn.disabled = kwUi.selected.size === 0;
        const dismissBtn = $('#mm-kw-dismiss-selected');
        if (dismissBtn) dismissBtn.disabled = kwUi.selected.size === 0;
        const selVisibleBtn = $('#mm-kw-select-visible');
        if (selVisibleBtn) selVisibleBtn.disabled = !visibleNow.length || selectedVisibleCount === visibleNow.length;
      };

      $('#mm-kw-suggest')?.addEventListener('click', async () => {
        const raw = ($('#mm-kw-seeds').value || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        if (!raw.length) {
          alert('Enter at least one keyword seed.');
          return;
        }
        const sugEl = $('#mm-kw-suggestions');
        const srcEl = $('#mm-kw-source');
        sugEl.textContent = 'Thinking…';
        try {
          const res = await api('/api/marketing-manager/keyword-suggest', {
            method: 'POST',
            body: JSON.stringify({ seeds: raw })
          });
          srcEl.textContent =
            res.source === 'anthropic'
              ? 'Suggestions from AI (refine seeds anytime).'
              : 'Suggestions from quick expansion (set ANTHROPIC_API_KEY for richer ideas).';
          const likes = new Set(task.likedKeywords || []);
          kwUi.suggestions = [...new Set((res.suggestions || []).map((x) => String(x || '').trim()).filter(Boolean))]
            .filter((kw) => !likes.has(kw));
          kwUi.hidden.clear();
          kwUi.selected.clear();
          kwUi.visibleCount = 20;
          renderSuggestionList();
        } catch (e) {
          sugEl.textContent = e.message;
        }
      });
      $('#mm-kw-select-visible')?.addEventListener('click', () => {
        const visibleAll = kwUi.suggestions.filter((kw) => !kwUi.hidden.has(kw));
        visibleAll.slice(0, kwUi.visibleCount).forEach((kw) => kwUi.selected.add(kw));
        renderSuggestionList();
      });
      $('#mm-kw-clear-selected')?.addEventListener('click', () => {
        kwUi.selected.clear();
        renderSuggestionList();
      });
      $('#mm-kw-load-more')?.addEventListener('click', () => {
        kwUi.visibleCount += 20;
        renderSuggestionList();
      });
      $('#mm-kw-dismiss-selected')?.addEventListener('click', () => {
        kwUi.selected.forEach((kw) => kwUi.hidden.add(kw));
        kwUi.selected.clear();
        renderSuggestionList();
      });
      $('#mm-kw-add-selected')?.addEventListener('click', async () => {
        if (!kwUi.selected.size) return;
        const cur = state.data.customers.find((x) => x.id === cust.id);
        const t = cur?.tasks?.find((x) => x.id === task.id);
        const existing = (t && t.kind === 'keywords' && t.likedKeywords) || [];
        const next = [...new Set([...existing, ...Array.from(kwUi.selected)])];
        await patchTask(cust.id, task.id, { likedKeywords: next });
      });
      $('#mm-kw-save-notes')?.addEventListener('click', async () => {
        await patchTask(cust.id, task.id, { notes: $('#mm-kw-notes').value });
      });
      return;
    }

    if (task.kind === 'campaign') {
      const showDescription = String(task.description || '').trim();
      tool.innerHTML = `
        ${showDescription ? `<p>${escapeHtml(showDescription)}</p>` : ''}
        <details class="mm-campaign-details">
          <summary>Campaign notes</summary>
          <label class="mm-notes-label">Campaign notes</label>
          <textarea class="mm-textarea" id="mm-camp-notes" rows="5">${escapeHtml(task.notes || '')}</textarea>
          <button type="button" class="btn-mm" id="mm-camp-save">Save</button>
        </details>
      `;
      $('#mm-camp-save')?.addEventListener('click', async () => {
        await patchTask(cust.id, task.id, { notes: $('#mm-camp-notes').value });
      });
    }
  }

  function renderDirRows(customerId, task, rows) {
    return `<div class="mm-dir-rows">${rows
      .map((row) => {
        const checked = row.done ? ' checked' : '';
        return `
      <label class="mm-dir-row">
        <input type="checkbox" data-cid="${customerId}" data-tid="${task.id}" data-rid="${row.id}"${checked} />
        <span class="mm-dir-name">${escapeHtml(row.name)}</span>
        <a href="${escapeHtml(row.url)}" target="_blank" rel="noopener" class="mm-dir-link">Open ↗</a>
      </label>`;
      })
      .join('')}</div>`;
  }

  function bindDirectoryChecks(customerId, task) {
    document.querySelectorAll('.mm-dir-row input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const rid = cb.getAttribute('data-rid');
        const ch = task.checklist.map((row) =>
          row.id === rid ? { id: row.id, done: cb.checked } : { id: row.id, done: row.done }
        );
        await patchTask(customerId, task.id, { checklist: ch });
      });
    });
  }

  function renderLikeList(customerId, task, liked) {
    const ul = $('#mm-like-list');
    if (!ul) return;
    ul.innerHTML = '';
    if (!liked.length) {
      const li = document.createElement('li');
      li.className = 'mm-muted';
      li.textContent = 'No keywords in LIKE list yet.';
      ul.appendChild(li);
      return;
    }
    liked.forEach((kw) => {
      const li = document.createElement('li');
      const sp = document.createElement('span');
      sp.textContent = kw;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-mm-tiny-danger';
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        const cur = state.data.customers.find((c) => c.id === customerId);
        const t = cur?.tasks?.find((x) => x.id === task.id);
        const list = (t && t.kind === 'keywords' && t.likedKeywords) || [];
        const next = list.filter((k) => k !== kw);
        await patchTask(customerId, task.id, { likedKeywords: next });
      });
      li.appendChild(sp);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
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

  function bindAgentSignatureUi() {
    const canvas = document.getElementById('mm-agent-sig-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('mm-agent-sig-status');
    let drawing = false;
    let hasInk = false;

    function fillWhite() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function pointerXY(ev) {
      const r = canvas.getBoundingClientRect();
      const src = ev.touches ? ev.touches[0] : ev;
      const x = (src.clientX - r.left) * (canvas.width / r.width);
      const y = (src.clientY - r.top) * (canvas.height / r.height);
      return { x, y };
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
    const existingUrl = state.agentSig?.signatureDataUrl;
    if (existingUrl) {
      const img = new Image();
      img.onload = () => {
        fillWhite();
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasInk = true;
        if (statusEl) statusEl.textContent = 'Saved signature loaded — draw to replace.';
      };
      img.onerror = () => {
        if (statusEl) statusEl.textContent = 'Could not load saved signature.';
      };
      img.src = existingUrl;
    } else if (statusEl) {
      statusEl.textContent = 'No Agent signature saved yet.';
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });

    $('#mm-agent-sig-clear')?.addEventListener('click', () => {
      fillWhite();
      hasInk = false;
      if (statusEl) statusEl.textContent = 'Cleared.';
    });
    $('#mm-agent-sig-save')?.addEventListener('click', async () => {
      if (!hasInk) return alert('Draw your signature first.');
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        await api('/api/marketing-manager/agent-signature', {
          method: 'POST',
          body: JSON.stringify({ signatureDataUrl: dataUrl })
        });
        state.agentSig = {
          hasSignature: true,
          signatureDataUrl: dataUrl,
          updatedAt: new Date().toISOString()
        };
        if (statusEl) statusEl.textContent = 'Saved on server.';
      } catch (e) {
        alert(e.message);
      }
    });
    $('#mm-agent-sig-remove')?.addEventListener('click', async () => {
      if (!confirm('Remove the saved Agent signature from the server?')) return;
      try {
        await api('/api/marketing-manager/agent-signature', { method: 'DELETE' });
        state.agentSig = { hasSignature: false, signatureDataUrl: '', updatedAt: null };
        fillWhite();
        hasInk = false;
        if (statusEl) statusEl.textContent = 'Removed.';
      } catch (e) {
        alert(e.message);
      }
    });
  }

  function renderMain() {
    const main = $('#mm-main');
    if (!main) return;
    const cust = state.data.customers.find((c) => c.id === selectedId);
    if (!cust) {
      main.innerHTML = `<p class="mm-muted">Select or add a client to manage tasks.</p>`;
      return;
    }

    const co = countTasks(cust);
    const socialRows = [
      ['Website', cust.website],
      ['Instagram', cust.instagram],
      ['Facebook', cust.facebook],
      ['LinkedIn', cust.linkedin],
      ['YouTube', cust.youtube],
      ['TikTok', cust.tiktok]
    ]
      .filter(([, v]) => v)
      .map(
        ([label, v]) =>
          `<p class="mm-muted">${escapeHtml(label)}: <a href="${escapeHtml(v)}" target="_blank" rel="noopener" style="color:var(--blue); text-decoration:none;">${escapeHtml(
            String(v).replace(/^https?:\/\//i, '')
          )}</a></p>`
      )
      .join('');
    const taskOpts = (cust.tasks || [])
      .map(
        (t) => `
      <option value="${t.id}">${escapeHtml(t.title)} (${statusLabel(t.status)})</option>`
      )
      .join('');

    main.innerHTML = `
      <div class="mm-main-head">
        <div>
          <h2>${escapeHtml(cust.name)}</h2>
          ${cust.logoUrl ? `<img src="${escapeHtml(cust.logoUrl)}" alt="${escapeHtml(cust.name)} logo" style="height:34px; max-width:180px; object-fit:contain; margin:8px 0 4px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); padding:4px;" />` : ''}
          ${socialRows}
          <p class="mm-muted">${escapeHtml(cust.notes || 'No notes — click Edit.')}</p>
        </div>
        <div class="mm-main-actions">
          <button type="button" class="btn-mm-ghost" id="mm-edit-customer">Edit customer</button>
          <button type="button" class="btn-mm-danger" id="mm-del-customer">Delete</button>
        </div>
      </div>
      <div id="mm-customer-edit-panel" class="mm-edit-panel" style="display:none;">
        <label class="mm-notes-label">Customer name</label>
        <input type="text" id="mm-edit-name" class="mm-input" value="${escapeHtml(cust.name)}" />
        <label class="mm-notes-label">Website</label>
        <input type="text" id="mm-edit-website" class="mm-input" value="${escapeHtml(cust.website || '')}" placeholder="https://example.com" />
        <label class="mm-notes-label">Instagram</label>
        <input type="text" id="mm-edit-instagram" class="mm-input" value="${escapeHtml(cust.instagram || '')}" placeholder="https://instagram.com/..." />
        <label class="mm-notes-label">Facebook</label>
        <input type="text" id="mm-edit-facebook" class="mm-input" value="${escapeHtml(cust.facebook || '')}" placeholder="https://facebook.com/..." />
        <label class="mm-notes-label">LinkedIn</label>
        <input type="text" id="mm-edit-linkedin" class="mm-input" value="${escapeHtml(cust.linkedin || '')}" placeholder="https://linkedin.com/..." />
        <label class="mm-notes-label">YouTube</label>
        <input type="text" id="mm-edit-youtube" class="mm-input" value="${escapeHtml(cust.youtube || '')}" placeholder="https://youtube.com/..." />
        <label class="mm-notes-label">TikTok</label>
        <input type="text" id="mm-edit-tiktok" class="mm-input" value="${escapeHtml(cust.tiktok || '')}" placeholder="https://tiktok.com/@..." />
        <label class="mm-notes-label">Notes</label>
        <textarea id="mm-edit-notes" class="mm-textarea" rows="3">${escapeHtml(cust.notes || '')}</textarea>
        <label class="mm-notes-label">Customer logo</label>
        <input type="file" id="mm-edit-logo-file" class="mm-input" accept="image/*" />
        <div class="mm-edit-actions">
          <button type="button" class="btn-mm" id="mm-save-customer">Save customer</button>
          <button type="button" class="btn-mm-ghost" id="mm-cancel-edit-customer">Cancel</button>
        </div>
      </div>
      <div class="mm-dash-grid mm-dash-inline">
        <div class="mm-dash-card mm-accent-todo"><div class="mm-dash-val">${co.not_started}</div><div class="mm-dash-label">Not started</div></div>
        <div class="mm-dash-card mm-accent-started"><div class="mm-dash-val">${co.started}</div><div class="mm-dash-label">Started</div></div>
        <div class="mm-dash-card mm-accent-done"><div class="mm-dash-val">${co.completed}</div><div class="mm-dash-label">Completed</div></div>
        <div class="mm-dash-card"><div class="mm-dash-val">${co.total}</div><div class="mm-dash-label">All tasks</div></div>
      </div>

      <div class="mm-add-task">
        <h3>Add task from template</h3>
        <div class="mm-add-buttons">
          <button type="button" class="btn-mm" id="mm-add-directory">Directory listings</button>
          <button type="button" class="btn-mm" id="mm-add-keywords">Keywords helper</button>
        </div>
        <details class="mm-campaign-details">
          <summary>Campaign starters (${state.catalog.campaigns?.length || 0})</summary>
          <div class="mm-campaign-grid" id="mm-campaign-buttons"></div>
        </details>
      </div>

      <div class="mm-task-panel">
        <label class="mm-muted">Active task</label>
        <select id="mm-task-select" class="mm-select">${taskOpts || '<option value="">No tasks yet</option>'}</select>
        <div id="mm-task-meta" class="mm-task-meta"></div>
        <div id="mm-task-tool" class="mm-task-tool"></div>
      </div>

      <div class="mm-task-panel">
        <details class="mm-campaign-details" id="mm-contracts-details">
          <summary>Electronic contracts</summary>
          <details class="mm-campaign-details mm-agent-sig-wrap">
            <summary>Agent signature (you)</summary>
            <p class="mm-small">Draw once and save. JPEG is used for PDF embedding. Check the box below when creating a doc to include your signature as Agency (LAB007), dated the day you generate the document.</p>
            <canvas id="mm-agent-sig-canvas" width="520" height="140" class="mm-agent-sig-canvas"></canvas>
            <div class="mm-task-meta" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              <button type="button" class="btn-mm-ghost" id="mm-agent-sig-clear">Clear</button>
              <button type="button" class="btn-mm" id="mm-agent-sig-save">Save Agent signature</button>
              <button type="button" class="btn-mm-danger-outline" id="mm-agent-sig-remove">Remove saved</button>
              <span class="mm-muted" id="mm-agent-sig-status" style="font-size:11px;"></span>
            </div>
          </details>
          <div class="mm-task-meta" id="mm-contracts-meta" style="margin-top:12px;">
            <button type="button" class="btn-mm" id="mm-new-contract">Create doc to sign</button>
            <button type="button" class="btn-mm-ghost" id="mm-refresh-contracts">Refresh</button>
            <button type="button" class="btn-mm-danger-outline" id="mm-delete-all-contracts">Delete ALL</button>
          </div>
          <div class="mm-task-meta" style="margin-top:12px;">
            <input type="text" id="mm-contract-create-title" class="mm-input" placeholder="Document title" />
            <div id="mm-contract-create-body" class="mm-rich-editor" style="margin-top:8px;" contenteditable="true"></div>
            <label class="mm-muted" style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;cursor:pointer;">
              <input type="checkbox" id="mm-include-agent-sig" style="margin-top:3px;" />
              <span>Include my Agent signature on this document (LAB007), dated today — requires a saved signature above.</span>
            </label>
            <button type="button" class="btn-mm" id="mm-create-contract" style="margin-top:8px;">Save doc for signing</button>
            <p class="mm-small">Paste rich text directly. A signing section is automatically added if missing.</p>
          </div>
          <div class="mm-task-meta" style="margin-top:12px;">
            <input type="text" id="mm-contract-upload-title" class="mm-input" placeholder="Uploaded document title (optional)" />
            <input type="file" id="mm-contract-upload-file" class="mm-input" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" style="margin-top:8px;" />
            <button type="button" class="btn-mm" id="mm-upload-contract" style="margin-top:8px;">Upload document for e-sign</button>
            <p class="mm-small">Supported: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG (max 25MB).</p>
          </div>
          <div id="mm-contracts-list" class="mm-task-tool"><p class="mm-muted">Loading contracts…</p></div>
        </details>
      </div>
    `;

    const campGrid = $('#mm-campaign-buttons');
    if (campGrid) {
      campGrid.innerHTML = (state.catalog.campaigns || [])
        .map(
          (p) =>
            `<button type="button" class="btn-mm-outline" data-campaign="${escapeHtml(p.key)}">${escapeHtml(
              p.title
            )}</button>`
        )
        .join('');
      campGrid.querySelectorAll('[data-campaign]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await api(`/api/marketing-manager/customers/${cust.id}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ kind: 'campaign', campaignKey: btn.getAttribute('data-campaign') })
          });
          await refresh();
        });
      });
    }

    $('#mm-add-directory')?.addEventListener('click', async () => {
      await api(`/api/marketing-manager/customers/${cust.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'directory' })
      });
      await refresh();
    });
    $('#mm-add-keywords')?.addEventListener('click', async () => {
      await api(`/api/marketing-manager/customers/${cust.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'keywords' })
      });
      await refresh();
    });

    $('#mm-edit-customer')?.addEventListener('click', async () => {
      const panel = $('#mm-customer-edit-panel');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    $('#mm-cancel-edit-customer')?.addEventListener('click', () => {
      const panel = $('#mm-customer-edit-panel');
      if (panel) panel.style.display = 'none';
    });
    $('#mm-save-customer')?.addEventListener('click', async () => {
      const name = String($('#mm-edit-name')?.value || '').trim();
      if (!name) return alert('Customer name is required.');
      const website = String($('#mm-edit-website')?.value || '').trim();
      const instagram = String($('#mm-edit-instagram')?.value || '').trim();
      const facebook = String($('#mm-edit-facebook')?.value || '').trim();
      const linkedin = String($('#mm-edit-linkedin')?.value || '').trim();
      const youtube = String($('#mm-edit-youtube')?.value || '').trim();
      const tiktok = String($('#mm-edit-tiktok')?.value || '').trim();
      const notes = String($('#mm-edit-notes')?.value || '');
      await api(`/api/marketing-manager/customers/${cust.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, website, instagram, facebook, linkedin, youtube, tiktok, notes })
      });
      const logoInput = $('#mm-edit-logo-file');
      const logo = logoInput?.files && logoInput.files[0];
      if (logo) {
        const fd = new FormData();
        fd.append('logo', logo);
        await apiForm(`/api/marketing-manager/customers/${cust.id}/logo`, 'POST', fd);
      }
      await refresh();
    });

    $('#mm-del-customer')?.addEventListener('click', async () => {
      if (!confirm(`Delete customer "${cust.name}" and all tasks?`)) return;
      await api(`/api/marketing-manager/customers/${cust.id}`, { method: 'DELETE' });
      selectedId = null;
      await refresh();
    });

    async function loadContracts() {
      const listEl = $('#mm-contracts-list');
      if (!listEl) return;
      try {
        const data = await api(`/api/marketing-manager/customers/${cust.id}/contracts`);
        const contracts = data.contracts || [];
        const signedCount = contracts.filter((x) => x.status === 'signed').length;
        const pendingCount = contracts.length - signedCount;
        if (!contracts.length) {
          listEl.innerHTML = '<p class="mm-muted">No contracts yet for this customer.</p>';
          return;
        }
        listEl.innerHTML =
          `<div class="mm-tool-head" style="margin-bottom:10px;">
            <span class="mm-pill">Customer contracts: ${contracts.length}</span>
            <span class="mm-pill">Pending: ${pendingCount}</span>
            <span class="mm-pill">Signed: ${signedCount}</span>
          </div>` +
          contracts
          .map((ct) => {
            const statusClass = ct.status === 'signed' ? 'mm-st-done' : 'mm-st-started';
            const statusText = ct.status === 'signed' ? 'Signed' : 'Pending signature';
            return `
              <div class="mm-sug-row">
                <div style="min-width:0;">
                  <div style="font-weight:600;">${escapeHtml(ct.title || 'Contract')}</div>
                  <div class="mm-small">Created: ${escapeHtml(fmtDate(ct.createdAt))}</div>
                  ${
                    ct.includeAgentSignature && ct.agentSignatureDate
                      ? `<div class="mm-small">Agent on document: ${escapeHtml(ct.agentSignatureDate)}</div>`
                      : ''
                  }
                  ${ct.signedAt ? `<div class="mm-small">Signed: ${escapeHtml(fmtDate(ct.signedAt))} by ${escapeHtml(ct.signerName || 'Signer')}</div>` : ''}
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                  <span class="mm-status-badge ${statusClass}">${statusText}</span>
                  <button type="button" class="btn-mm-tiny" data-open-contract="${escapeHtml(ct.signPath)}">Open</button>
                  <button type="button" class="btn-mm-tiny" data-copy-contract="${escapeHtml(ct.signPath)}">Copy link</button>
                  ${
                    ct.documentPath
                      ? `<a class="btn-mm-tiny" href="${escapeHtml(ct.documentPath)}" target="_blank" rel="noopener" style="text-decoration:none;">Doc</a>`
                      : ''
                  }
                  <button type="button" class="btn-mm-tiny-danger" data-delete-contract="${escapeHtml(ct.id)}">Delete</button>
                </div>
              </div>
            `;
          })
          .join('');
        listEl.querySelectorAll('[data-open-contract]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const p = btn.getAttribute('data-open-contract');
            if (!p) return;
            window.open(p, '_blank', 'noopener');
          });
        });
        listEl.querySelectorAll('[data-copy-contract]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const p = btn.getAttribute('data-copy-contract');
            if (!p) return;
            const full = `${window.location.origin}${p}`;
            const ok = await copyText(full);
            if (ok) alert('Signing link copied.');
            else prompt('Copy signing link', full);
          });
        });
        listEl.querySelectorAll('[data-delete-contract]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const contractId = btn.getAttribute('data-delete-contract');
            if (!contractId) return;
            if (!confirm('Delete this contract/document and all signed copies?')) return;
            await api(`/api/marketing-manager/customers/${cust.id}/contracts/${contractId}`, {
              method: 'DELETE'
            });
            await refresh();
            await loadContracts();
          });
        });
      } catch (err) {
        listEl.innerHTML = `<p class="mm-error">${escapeHtml(err.message)}</p>`;
      }
    }

    $('#mm-new-contract')?.addEventListener('click', () => {
      const details = $('#mm-contracts-details');
      if (details) details.open = true;
      document.getElementById('mm-contract-create-title')?.focus();
    });
    $('#mm-create-contract')?.addEventListener('click', async () => {
      const titleEl = document.getElementById('mm-contract-create-title');
      const bodyEl = document.getElementById('mm-contract-create-body');
      const includeAgent = Boolean(document.getElementById('mm-include-agent-sig')?.checked);
      const title = String(titleEl?.value || '').trim();
      const bodyHtml = String(bodyEl?.innerHTML || '').trim();
      const body = String(bodyEl?.innerText || '').trim();
      if (!title) return alert('Document title is required.');
      if (!body) return alert('Document body is required.');
      if (includeAgent && !state.agentSig?.signatureDataUrl) {
        return alert('Save your Agent signature first, or uncheck “Include my Agent signature”.');
      }
      await api(`/api/marketing-manager/customers/${cust.id}/contracts`, {
        method: 'POST',
        body: JSON.stringify({ title, body, bodyHtml, includeAgentSignature: includeAgent })
      });
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.innerHTML = '';
      const incEl = document.getElementById('mm-include-agent-sig');
      if (incEl) incEl.checked = false;
      await refresh();
      await loadContracts();
    });

    $('#mm-refresh-contracts')?.addEventListener('click', async () => {
      const details = $('#mm-contracts-details');
      if (details) details.open = true;
      await loadContracts();
    });
    $('#mm-upload-contract')?.addEventListener('click', async () => {
      const fileInput = $('#mm-contract-upload-file');
      const titleInput = $('#mm-contract-upload-title');
      const file = fileInput?.files && fileInput.files[0];
      if (!file) return alert('Select a document file to upload.');
      const fd = new FormData();
      fd.append('document', file);
      if (titleInput?.value?.trim()) fd.append('title', titleInput.value.trim());
      await apiForm(`/api/marketing-manager/customers/${cust.id}/contracts/upload`, 'POST', fd);
      if (titleInput) titleInput.value = '';
      if (fileInput) fileInput.value = '';
      await refresh();
      await loadContracts();
    });
    $('#mm-delete-all-contracts')?.addEventListener('click', async () => {
      if (!confirm(`Delete ALL contracts and signed files for "${cust.name}"? This cannot be undone.`)) return;
      await api(`/api/marketing-manager/customers/${cust.id}/contracts`, { method: 'DELETE' });
      await refresh();
      await loadContracts();
    });
    bindAgentSignatureUi();
    loadContracts();

    const sel = $('#mm-task-select');
    const tasks = cust.tasks || [];
    let selectedTask = tasks.find((t) => t.id === sel?.value) || tasks[0];

    function updateTaskChrome() {
      const task = tasks.find((t) => t.id === sel?.value);
      selectedTask = task;
      const meta = $('#mm-task-meta');
      if (!meta) return;
      if (!task) {
        meta.innerHTML = '';
        $('#mm-task-tool').innerHTML = '';
        return;
      }
      meta.innerHTML = `
        <div class="mm-task-bar">
          <span class="mm-status-badge ${statusClass(task.status)}">${statusLabel(task.status)}</span>
          <button type="button" class="btn-mm-ghost" id="mm-cycle-status">Cycle status</button>
          <button type="button" class="btn-mm-danger-outline" id="mm-del-task">Delete task</button>
        </div>
      `;
      $('#mm-cycle-status')?.addEventListener('click', async () => {
        await patchTask(cust.id, task.id, { status: cycleStatus(task.status) });
      });
      $('#mm-del-task')?.addEventListener('click', async () => {
        if (!confirm('Delete this task?')) return;
        await api(`/api/marketing-manager/customers/${cust.id}/tasks/${task.id}`, { method: 'DELETE' });
        await refresh();
      });
      renderTaskDetail(cust, task);
    }

    if (sel) {
      sel.addEventListener('change', updateTaskChrome);
      if (!sel.value && tasks[0]) sel.value = tasks[0].id;
    }
    updateTaskChrome();
  }

  function render() {
    renderOverview();
    renderCustomerList();
    renderMain();
  }

  window.addEventListener('DOMContentLoaded', () => {
    refresh().catch((e) => {
      console.error(e);
      const el = $('#mm-overview');
      if (el) el.innerHTML = `<p class="mm-error">Could not load Marketing Manager: ${escapeHtml(e.message)}</p>`;
    });
  });
})();
