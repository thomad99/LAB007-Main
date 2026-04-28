/**
 * Marketing Manager — customers, tasks, dashboards (uses /api/marketing-manager/*)
 */
(function () {
  const state = { data: { customers: [] }, catalog: { directory: { usa: [], paid: [] }, campaigns: [] } };
  let selectedId = null;

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

  async function refresh() {
    const [st, cat] = await Promise.all([
      api('/api/marketing-manager/state'),
      api('/api/marketing-manager/catalog')
    ]);
    state.data = st;
    state.catalog = cat;
    if (selectedId && !state.data.customers.find((c) => c.id === selectedId)) selectedId = null;
    if (!selectedId && state.data.customers.length) selectedId = state.data.customers[0].id;
    render();
  }

  function renderOverview() {
    const g = globalStats();
    const el = $('#mm-overview');
    if (!el) return;
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
      </div>
    `;
  }

  function renderCustomerList() {
    const wrap = $('#mm-sidebar');
    if (!wrap) return;
    const rows = (state.data.customers || [])
      .map((c) => {
        const active = c.id === selectedId ? ' is-active' : '';
        const counts = countTasks(c);
        return `
      <button type="button" class="mm-cust-btn${active}" data-id="${c.id}">
        <span class="mm-cust-name">${escapeHtml(c.name)}</span>
        <span class="mm-cust-meta">${counts.completed}/${counts.total} done</span>
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
        await api('/api/marketing-manager/customers', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() })
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
        <div class="mm-kw-suggestions" id="mm-kw-suggestions"></div>
        <h4 class="mm-like-title">LIKE list</h4>
        <ul class="mm-like-list" id="mm-like-list"></ul>
        <label class="mm-notes-label">Notes</label>
        <textarea class="mm-textarea" id="mm-kw-notes" rows="3">${escapeHtml(task.notes || '')}</textarea>
        <button type="button" class="btn-mm" id="mm-kw-save-notes">Save notes</button>
      `;
      renderLikeList(cust.id, task, liked);
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
          sugEl.innerHTML = '';
          const likes = new Set(task.likedKeywords || []);
          (res.suggestions || []).forEach((kw) => {
            if (!kw || likes.has(kw)) return;
            const row = document.createElement('div');
            row.className = 'mm-sug-row';
            const sp = document.createElement('span');
            sp.textContent = kw;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn-mm-tiny';
            b.textContent = '＋ LIKE';
            b.addEventListener('click', async () => {
              const cur = state.data.customers.find((x) => x.id === cust.id);
              const t = cur?.tasks?.find((x) => x.id === task.id);
              const existing = (t && t.kind === 'keywords' && t.likedKeywords) || [];
              const next = [...new Set([...existing, kw])];
              await patchTask(cust.id, task.id, { likedKeywords: next });
            });
            row.appendChild(sp);
            row.appendChild(b);
            sugEl.appendChild(row);
          });
        } catch (e) {
          sugEl.textContent = e.message;
        }
      });
      $('#mm-kw-save-notes')?.addEventListener('click', async () => {
        await patchTask(cust.id, task.id, { notes: $('#mm-kw-notes').value });
      });
      return;
    }

    if (task.kind === 'campaign') {
      tool.innerHTML = `
        <p>${escapeHtml(task.description || '')}</p>
        <label class="mm-notes-label">Campaign notes</label>
        <textarea class="mm-textarea" id="mm-camp-notes" rows="5">${escapeHtml(task.notes || '')}</textarea>
        <button type="button" class="btn-mm" id="mm-camp-save">Save</button>
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

  function renderMain() {
    const main = $('#mm-main');
    if (!main) return;
    const cust = state.data.customers.find((c) => c.id === selectedId);
    if (!cust) {
      main.innerHTML = `<p class="mm-muted">Select or add a client to manage tasks.</p>`;
      return;
    }

    const co = countTasks(cust);
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
          <p class="mm-muted">${escapeHtml(cust.notes || 'No notes — click Edit.')}</p>
        </div>
        <div class="mm-main-actions">
          <button type="button" class="btn-mm-ghost" id="mm-edit-customer">Edit customer</button>
          <button type="button" class="btn-mm-danger" id="mm-del-customer">Delete</button>
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
      const name = prompt('Customer name', cust.name);
      if (!name || !name.trim()) return;
      const notes = prompt('Notes', cust.notes || '') ?? '';
      await api(`/api/marketing-manager/customers/${cust.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), notes })
      });
      await refresh();
    });

    $('#mm-del-customer')?.addEventListener('click', async () => {
      if (!confirm(`Delete customer "${cust.name}" and all tasks?`)) return;
      await api(`/api/marketing-manager/customers/${cust.id}`, { method: 'DELETE' });
      selectedId = null;
      await refresh();
    });

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
