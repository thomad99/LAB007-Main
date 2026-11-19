(() => {
  const TOKEN_MATCH = location.pathname.match(/\/Elite-TaskMgmt\/(?:(?:c|[a-z0-9-]+)\/)?([a-f0-9]{8})\/?$/i);
  const TOKEN = TOKEN_MATCH ? decodeURIComponent(TOKEN_MATCH[1]) : '';
  const MODE = TOKEN ? 'cleaner' : 'manager';
  const PASS_KEY = 'eliteTasksPassword';
  const REC = {
    once: 'One time',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    every3: 'Every 3 weeks',
    every4: 'Every 4 weeks'
  };
  const TIMES = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const DURATIONS = [60, 90, 120, 150, 180, 240];

  const state = {
    password: localStorage.getItem(PASS_KEY) || '',
    weekStart: linkedVisit().date || todayISO(),
    openedOn: linkedVisit().date,
    openedAt: linkedVisit().time,
    screen: 'week',
    filter: 'all',
    propertyQuery: '',
    data: null,
    saving: false,
    staffPicked: false,
    recurrencePicked: false,
    zoomDays: defaultDays(),
    calendarMode: 'zoom',
    fitDays: 0,
    fitHourPx: 0,
    fitLocked: false,
    fitTrimmed: false,
    report: null,
    reportLoading: false,
    reportWeek: sundayOf(todayISO()),
    invoiceMonday: invoiceMonday(todayISO())
  };

  const gate = document.getElementById('gate');
  const shell = document.getElementById('shell');
  const view = document.getElementById('view');
  const toolbar = document.getElementById('toolbar');
  const tabs = document.getElementById('tabs');
  const bottomNav = document.getElementById('bottomNav');
  document.body.classList.add(MODE === 'cleaner' ? 'mode-cleaner' : 'mode-manager');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function linkedVisit() {
    const params = new URLSearchParams(location.search);
    const date = params.get('date') || '';
    const time = params.get('time') || '';
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      time: /^\d{2}:\d{2}$/.test(time) ? time : ''
    };
  }

  function todayISO() {
    const now = new Date();
    return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function dateParts(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, days) {
    const [year, month, day] = String(iso).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function sundayOf(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }

  function invoiceMonday(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    const add = weekday === 1 ? 0 : (8 - weekday) % 7;
    date.setUTCDate(date.getUTCDate() + add);
    return date.toISOString().slice(0, 10);
  }

  function weekdayIndex(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function minutesOf(value) {
    const [hour, minute] = String(value || '00:00').split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
  }

  function prettyDate(iso) {
    return dateParts(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatTime(value) {
    const [hour, minute] = String(value || '00:00').split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
  }

  function formatDuration(minutes) {
    const n = Number(minutes) || 0;
    if (n % 30 === 0 && n >= 60) {
      const hours = n / 60;
      return `${hours} hr`;
    }
    return `${n} min`;
  }

  function formatRange(start, minutes) {
    const [hour, minute] = String(start).split(':').map(Number);
    const total = hour * 60 + minute + Number(minutes || 0);
    const end = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    return `${formatTime(start)} – ${formatTime(end)}`;
  }

  function formatStamp(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function statusLabel(status) {
    if (status === 'acknowledged') return 'Acknowledged';
    if (status === 'completed') return 'Completed';
    return 'Not acknowledged';
  }

  function safeColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : '#0f6e56';
  }

  function suggestRecurrence(frequency) {
    const text = String(frequency || '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.includes('bi')) return 'biweekly';
    if (text.includes('3')) return 'every3';
    if (text.includes('month') || text.includes('4 week')) return 'every4';
    if (text.includes('week')) return 'weekly';
    return 'once';
  }

  function suggestStaffId(cleanerField, staff) {
    const aliases = { petr: 'petr', petra: 'petra', maya: 'maya', maja: 'maya', sarah: 'sarah', jill: 'jill', kylie: 'kylie' };
    const hits = [];
    String(cleanerField || '').toLowerCase().split(/[^a-z]+/).forEach((part) => {
      const name = aliases[part];
      if (!name) return;
      const person = staff.find((item) => item.active && item.name.toLowerCase() === name);
      if (person && !hits.includes(person.id)) hits.push(person.id);
    });
    return hits.length === 1 ? hits[0] : '';
  }

  function phoneHref(phone) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : '';
  }

  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4600);
  }

  function hideBoot() {
    const boot = document.getElementById('boot');
    if (boot) boot.hidden = true;
  }

  const kioskQuery = window.matchMedia('(max-width: 899px), (hover: none) and (pointer: coarse)');
  function mobileKiosk() {
    return kioskQuery.matches;
  }

  let kioskEntered = false;
  function enterKiosk() {
    if (!mobileKiosk()) return;
    const root = document.documentElement;
    if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return;
    try {
      const pending = root.requestFullscreen({ navigationUI: 'hide' });
      kioskEntered = true;
      if (pending && typeof pending.catch === 'function') pending.catch(() => { kioskEntered = false; });
    } catch {
      try { root.requestFullscreen(); kioskEntered = true; } catch { /* the page still fills the window */ }
    }
  }

  let kioskArmed = false;
  function armKiosk() {
    if (!mobileKiosk() || kioskArmed) return;
    kioskArmed = true;
    document.addEventListener('pointerdown', () => enterKiosk(), { once: true });
  }

  function applyKiosk() {
    const on = mobileKiosk();
    document.body.classList.toggle('kiosk', on);
    if (on) {
      armKiosk();
      return;
    }
    if (kioskEntered && document.fullscreenElement && document.exitFullscreen) {
      kioskEntered = false;
      const pending = document.exitFullscreen();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    }
  }

  if (typeof kioskQuery.addEventListener === 'function') {
    kioskQuery.addEventListener('change', () => {
      if (shell.hidden) return;
      applyKiosk();
    });
  }

  function showLogin(message) {
    if (MODE === 'cleaner') return showCleanerError(message || 'This link is not valid.');
    hideBoot();
    document.body.classList.remove('kiosk');
    document.body.classList.add('login');
    gate.hidden = false;
    shell.hidden = true;
    const err = document.getElementById('loginError');
    if (!err) return;
    err.hidden = !message;
    err.textContent = message || '';
  }

  function showCleanerError(message) {
    hideBoot();
    document.body.classList.remove('kiosk');
    document.body.classList.add('login');
    gate.hidden = false;
    shell.hidden = true;
    gate.innerHTML = `<div class="login-card"><p class="eyebrow">Elite Cleaning Services</p><h1>Link not valid</h1><p>${esc(message || 'Ask for a new cleaner link.')}</p></div>`;
  }

  function showShell() {
    hideBoot();
    document.body.classList.remove('login');
    gate.hidden = true;
    shell.hidden = false;
    applyKiosk();
  }

  async function api(url, options) {
    const headers = { ...(options && options.headers) };
    if (options && options.body) headers['Content-Type'] = 'application/json';
    if (MODE === 'manager' && state.password) headers['x-elite-tasks-password'] = state.password;
    if (MODE === 'cleaner') headers['x-elite-tasks-token'] = TOKEN;
    let response;
    try {
      response = await fetch(url, { ...options, headers, cache: 'no-store' });
    } catch {
      const err = new Error('Can’t reach the server.');
      err.status = 0;
      throw err;
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      if (MODE === 'manager') {
        localStorage.removeItem(PASS_KEY);
        state.password = '';
        showLogin(data.error || 'Sign in again.');
      }
      const err = new Error(data.error || 'Not signed in');
      err.status = 401;
      throw err;
    }
    if (!response.ok) {
      const err = new Error(data.error || 'Something went wrong.');
      err.status = response.status;
      throw err;
    }
    return data;
  }

  async function guard(fn) {
    if (state.saving) return;
    state.saving = true;
    try {
      await fn();
    } catch (err) {
      if (err.status !== 401) toast(err.message || 'Something went wrong.');
    } finally {
      state.saving = false;
    }
  }

  function weekQuery() {
    const from = addDays(state.weekStart, -14);
    const to = addDays(state.weekStart, 13);
    const today = todayISO();
    const params = new URLSearchParams({ from, to, today });
    if (MODE === 'cleaner') {
      params.set('blockFrom', today);
      params.set('blockTo', addDays(today, 120));
    }
    return params.toString();
  }

  async function loadWeek(options) {
    const keep = options && options.keepScroll;
    const previous = document.getElementById('gcal');
    state.savedScroll = keep && previous ? { left: previous.scrollLeft, top: previous.scrollTop } : null;
    const y = window.scrollY;
    const path = MODE === 'cleaner' ? '/api/elite-tasks/me' : '/api/elite-tasks/week';
    state.data = await api(`${path}?${weekQuery()}`);
    showShell();
    render();
    window.scrollTo(0, keep ? y : 0);
  }

  function jobStaffIds(job) {
    const ids = Array.isArray(job && job.staffIds) ? job.staffIds.filter(Boolean) : [];
    if (job && job.staffId && !ids.includes(job.staffId)) ids.unshift(job.staffId);
    return ids;
  }

  function people() {
    const list = ((state.data && state.data.staff) || []).slice();
    return list.sort((a, b) => {
      const rank = (person) => String(person && person.name || '').toLowerCase() === 'petra' ? 0 : 1;
      return rank(a) - rank(b);
    });
  }

  function activePeople() {
    const list = people();
    return Array.isArray(list) ? list.filter((person) => person.active) : [];
  }

  function visibleJobs() {
    const jobs = (state.data && state.data.jobs) || [];
    return jobs.filter((job) => {
      if (state.filter === 'needs') return job.status === 'scheduled';
      if (state.filter !== 'all') return jobStaffIds(job).includes(state.filter);
      return true;
    });
  }

  function render() {
    const who = document.getElementById('who');
    if (MODE === 'cleaner') {
      const name = state.data && state.data.staff ? state.data.staff.name : 'Cleaner';
      who.textContent = `${name} · your cleans`;
      who.hidden = false;
    } else {
      who.textContent = '';
      who.hidden = true;
    }
    renderNav();
    renderToolbar();
    view.classList.toggle('fill', state.screen === 'week');
    if (state.screen === 'properties' && MODE === 'manager') renderProperties();
    else if (state.screen === 'staff' && MODE === 'manager') renderStaff();
    else if (state.screen === 'reports' && MODE === 'manager') renderReports();
    else renderWeek();
  }

  let menuOpen = false;

  function renderNav() {
    if (MODE !== 'manager') {
      tabs.innerHTML = '';
      bottomNav.hidden = true;
      menuOpen = false;
      return;
    }
    const main = [['week', 'Tasks'], ['properties', 'Properties'], ['staff', 'Staff']];
    const button = ([id, label]) => `<button type="button" data-action="screen" data-screen="${id}" class="${state.screen === id ? 'on' : ''}">${label}</button>`;
    tabs.innerHTML = main.concat([['reports', 'Reports']]).map(button).join('');
    const handle = `<button type="button" class="bottom-handle" data-action="toggle-menu" aria-expanded="${menuOpen ? 'true' : 'false'}" aria-label="${menuOpen ? 'Close menu' : 'Open menu'}"><span></span></button>`;
    bottomNav.classList.toggle('open', menuOpen);
    bottomNav.innerHTML = menuOpen
      ? `<button type="button" class="bottom-backdrop" data-action="close-menu" aria-label="Close menu"></button><div class="bottom-panel">${handle}<div class="bottom-sheet">${main.map(button).join('')}</div></div>`
      : handle;
    bottomNav.hidden = false;
  }

  function placeLabel(job) {
    return job.propertyName || 'Property';
  }

  function renderToolbar() {
    if (state.screen !== 'week') {
      toolbar.innerHTML = '';
      return;
    }
    const end = addDays(state.weekStart, 6);
    const jobs = visibleJobs().filter((job) => job.date >= state.weekStart && job.date <= end);
    const waiting = jobs.filter((job) => job.status === 'scheduled').length;
    const skipped = jobs.filter((job) => job.status === 'completed' && !job.acknowledgedAt).length;
    const summary = !jobs.length
      ? '<span class="hint">No cleans this week</span>'
      : waiting
        ? `<span class="summary warn">${waiting} not acknowledged</span>`
        : skipped
          ? `<span class="summary warn">${skipped} completed without acknowledgement</span>`
          : '<span class="summary ok">All acknowledged</span>';
    const filters = MODE === 'manager' ? renderFilters() : '';
    const listIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path></svg>';
    const zoomIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    const days = defaultDays();
    const sliderIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><circle cx="15" cy="7" r="2.3" fill="currentColor"></circle><circle cx="9" cy="12" r="2.3" fill="currentColor"></circle><circle cx="14" cy="17" r="2.3" fill="currentColor"></circle></svg>';
    const prevIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5L8.5 12l6 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    const nextIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5L15.5 12l-6 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    const viewButtons = `<button type="button" class="btn ghost icon-btn" data-action="fit-calendar" aria-label="Fit, next 7 days" aria-pressed="${state.calendarMode === 'fit' ? 'true' : 'false'}">${listIcon}</button>
          <button type="button" class="btn ghost icon-btn" data-action="zoom-two" aria-label="Zoom, next ${days} days" aria-pressed="${state.calendarMode === 'zoom' ? 'true' : 'false'}">${zoomIcon}</button>`;
    toolbar.innerHTML = `
      <div class="weekbar">
        <div class="week-nav">
          <button type="button" class="btn ghost week-arrow icon-btn" data-action="prev-week" aria-label="Previous week">${prevIcon}</button>
          <button type="button" class="btn ghost" data-action="this-week">Today</button>
          <button type="button" class="btn ghost week-arrow icon-btn" data-action="next-week" aria-label="Next week">${nextIcon}</button>
          ${viewButtons}
          <button type="button" class="btn ghost icon-btn" data-action="open-settings" aria-label="Settings">${sliderIcon}</button>
        </div>
        <div class="week-title">
          ${summary}
        </div>
      </div>
      ${filters}`;
  }

  function renderFilters() {
    const list = people().filter((person) => person.active || (state.data.jobs || []).some((job) => jobStaffIds(job).includes(person.id)));
    const waiting = (state.data.jobs || []).filter((job) => job.status === 'scheduled').length;
    const chips = [
      ['all', 'All'],
      ['needs', waiting ? `Waiting Ack (${waiting})` : 'Waiting Ack'],
      ...list.map((person) => [person.id, person.name])
    ];
    return `<div class="filters">${chips.map(([id, label]) =>
      `<button type="button" class="chip ${state.filter === id ? 'on' : ''}" data-action="filter" data-filter="${esc(id)}">${esc(label)}</button>`
    ).join('')}</div>`;
  }

  function scrollToLinkedVisit(scroller) {
    if (!state.openedOn || state.openedOn !== state.weekStart || !state.openedAt) return false;
    const heads = [...scroller.querySelectorAll('.gcal-dayhead')];
    const cols = [...scroller.querySelectorAll('.gcal-col')];
    const index = heads.findIndex((head) => head.dataset.date === state.openedOn);
    const col = cols[index];
    if (!col) return false;
    const event = [...col.querySelectorAll('.gcal-event')].find((button) => button.dataset.time === state.openedAt);
    if (!event) return false;
    const top = event.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const header = scroller.querySelector('.gcal-head');
    scroller.scrollTop = Math.max(0, top - (header ? header.offsetHeight : 0) - 8);
    return true;
  }

  function renderWeek() {
    const jobs = visibleJobs();
    const today = todayISO();
    const days = Array.from({ length: zoomDays() }, (_, index) => addDays(state.weekStart, index));
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    view.innerHTML = `<div class="gcal" id="gcal">
      <div class="gcal-head">
        ${days.map((date) => `<div class="gcal-dayhead ${date === today ? 'today' : ''}" data-date="${date}">
          <span class="gcal-dow">${names[weekdayIndex(date)]}</span>
          <span class="gcal-dom ${date === today ? 'today' : ''}">${dateParts(date).getDate()}</span>
          ${MODE === 'manager' ? `<button type="button" class="gcal-plus" data-action="add" data-date="${date}" aria-label="Add a clean on ${esc(prettyDate(date))}">+</button>` : ''}
        </div>`).join('')}
      </div>
      <div class="gcal-body">
        ${days.map((date) => {
          const dayJobs = jobs.filter((job) => job.date === date).sort((a, b) =>
            minutesOf(a.startTime) - minutesOf(b.startTime) ||
            String(a.staffName || '').localeCompare(String(b.staffName || '')) ||
            String(a.id).localeCompare(String(b.id))
          );
          return `<div class="gcal-col ${date === today ? 'today' : ''}">
            ${dayJobs.map((job) => renderEvent(job)).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>`;
    const scroller = document.getElementById('gcal');
    if (!scroller) return;
    layoutCalendar();
    bindCalendarZoom(scroller);
    if (state.savedScroll) {
      scroller.scrollLeft = state.savedScroll.left;
      scroller.scrollTop = state.savedScroll.top;
      state.savedScroll = null;
      return;
    }
    const head = scroller.querySelector(`.gcal-dayhead[data-date="${state.weekStart}"]`);
    if (head) {
      const delta = head.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
      scroller.scrollLeft += delta;
    }
    if (scrollToLinkedVisit(scroller)) return;
    scroller.scrollTop = 0;
  }

  function mobileCalendar() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function defaultDays() {
    const saved = Number(localStorage.getItem('eliteTasksDays'));
    if (saved >= 1 && saved <= 7) return saved;
    return 7;
  }

  function zoomDays() {
    if (state.calendarMode === 'fit' && state.fitDays >= 1) return state.fitDays;
    const chosen = Number(state.zoomDays);
    if (chosen >= 1 && chosen <= 7) return chosen;
    return defaultDays();
  }

  function setZoomDays(days) {
    state.calendarMode = 'zoom';
    const next = Math.min(7, Math.max(1, days));
    if (next === zoomDays() && state.zoomDays === next) return;
    state.zoomDays = next;
    localStorage.setItem('eliteTasksDays', String(next));
    render();
  }

  function layoutCalendar() {
    const scroller = document.getElementById('gcal');
    if (!scroller) return;
    const count = scroller.querySelectorAll('.gcal-dayhead').length || 28;
    const slot = scroller.clientWidth / Math.max(1, zoomDays());
    const columns = Array.from({ length: count }, () => `${slot}px`).join(' ');
    scroller.classList.toggle('gcal-narrow', slot < 96);
    scroller.querySelectorAll('.gcal-head, .gcal-body').forEach((row) => {
      row.style.gridTemplateColumns = columns;
    });
  }

  function bindCalendarZoom(scroller) {
    let pinch = null;
    const distance = (event) => {
      const [a, b] = event.touches;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    scroller.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) pinch = distance(event);
    }, { passive: true });
    scroller.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 2 || !pinch) return;
      const next = distance(event);
      if (next > pinch * 1.2) {
        pinch = next;
        setZoomDays(zoomDays() - 1);
      } else if (next < pinch * 0.8) {
        pinch = next;
        setZoomDays(zoomDays() + 1);
      }
    }, { passive: true });
    scroller.addEventListener('touchend', () => { pinch = null; });
    scroller.addEventListener('wheel', (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoomDays(zoomDays() + (event.deltaY > 0 ? 1 : -1));
    }, { passive: false });
  }

  window.addEventListener('resize', () => {
    if (state.screen === 'reports') {
      renderReports();
      return;
    }
    layoutCalendar();
  });

  function renderEvent(job) {
    const tone = job.status === 'acknowledged' || job.status === 'completed' ? job.status : 'scheduled';
    const who = job.staffName || '';
    const place = placeLabel(job);
    const label = `${place}${who ? `, ${who}` : ''}`;
    return `<button type="button" class="gcal-event ${tone}" data-action="open-job" data-id="${esc(job.id)}" data-time="${esc(job.startTime)}" title="${esc(label)}" aria-label="${esc(label)}">
      <span>${esc(place)}</span>
      ${who ? `<span>${esc(who)}</span>` : ''}
    </button>`;
  }

  function renderProperties() {
    const query = state.propertyQuery;
    view.innerHTML = `
      <p class="hint">Property name and address are stored here. Door code and notes show when a booking is opened, and stay off the calendar.</p>
      <label>Find a property
        <input id="propFilter" type="search" placeholder="Property or address" value="${esc(query)}">
      </label>
      <div id="propertyList" class="stack"></div>
      <form id="addPropertyForm" class="panel" style="margin-top:12px">
        <h2>Add a property</h2>
        <label>Property name<input name="name" type="text" maxlength="160" required placeholder="Property name"></label>
        <label>Address<textarea name="address" maxlength="1000" rows="3" required placeholder="Street, city, postal code"></textarea></label>
        <label>Door code<input name="doorCode" type="text" maxlength="80" autocomplete="off" placeholder="Optional"></label>
        <label>Notes<textarea name="notes" maxlength="4000" rows="3" placeholder="Optional"></textarea></label>
        <button class="btn primary block" type="submit">Add property</button>
      </form>`;
    renderPropertyList();
  }

  function renderPropertyList() {
    const box = document.getElementById('propertyList');
    if (!box) return;
    const q = state.propertyQuery.trim().toLowerCase();
    const list = ((state.data && state.data.properties) || []).filter((property) => {
      if (!q) return true;
      return `${property.propertyName || ''} ${property.name || ''} ${property.label || ''} ${property.address || ''} ${property.doorCode || ''} ${property.notes || ''}`.toLowerCase().includes(q);
    });
    if (!list.length) {
      box.innerHTML = '<p class="hint">No properties yet. Add one below.</p>';
      return;
    }
    box.innerHTML = list.map((property) => `<article class="prop-card">
      <h3>${esc(property.propertyName || property.label || property.name || 'Property')}</h3>
      <div class="detail-grid">
        <div class="detail-tile wide"><span class="tile-label">Address</span><strong class="pre">${property.address ? esc(property.address) : 'No address'}</strong></div>
        <div class="detail-tile code"><span class="tile-label">Door code</span><strong>${property.doorCode ? esc(property.doorCode) : 'Not set'}</strong></div>
        <div class="detail-tile"><span class="tile-label">Notes</span><strong class="pre">${property.notes ? esc(property.notes) : 'None'}</strong></div>
      </div>
      <div class="row-actions">
        <button type="button" class="btn primary" data-action="edit-property" data-id="${esc(property.id)}">Edit</button>
        <button type="button" class="btn danger" data-action="delete-property" data-id="${esc(property.id)}" data-name="${esc(property.propertyName || property.name || 'this property')}">Delete</button>
      </div>
    </article>`).join('');
  }

  function staffUrl(person) {
    return `${location.origin}/Elite-TaskMgmt/${person.token}`;
  }

  function calendarHttps(token) {
    return `${location.origin}/Elite-TaskMgmt/calendar/${token}.ics`;
  }

  function calendarSyncOn() {
    return !state.data || state.data.calendarSync !== false;
  }

  function openSettings() {
    const syncOn = calendarSyncOn();
    const days = defaultDays();
    const token = MODE === 'cleaner' ? TOKEN : (state.data && state.data.calendarToken);
    const https = token ? calendarHttps(token) : '';
    const webcal = https.replace(/^https?:/i, 'webcal:');
    const syncBody = !syncOn
      ? '<p class="hint">Calendar sync is off. A phone that already subscribed drops these cleans the next time it refreshes.</p>'
      : !https
        ? '<p class="hint">The calendar link is not ready yet.</p>'
        : `<p class="hint">${MODE === 'cleaner' ? 'Your accepted cleans.' : 'Every accepted clean.'} A clean shows on the phone after it is acknowledged, and leaves the phone calendar if it is un-acknowledged. The phone refreshes about once an hour.</p>
          <a class="btn primary block" href="${esc(webcal)}">Subscribe on this phone</a>
          <label>Google Calendar link<input type="text" readonly value="${esc(https)}"></label>
          <button type="button" class="btn ghost block" data-action="copy-text" data-text="${esc(https)}">Copy link</button>`;
    openSheet(`<div>
      ${sheetHead('Settings')}
      <label>Calendar sync</label>
      ${choiceButtons('calendarSync', [['1', 'On'], ['0', 'Off']], syncOn ? '1' : '0')}
      <label>Default view</label>
      ${choiceButtons('defaultDays', [1, 2, 3, 4, 5, 6, 7].map((count) => [String(count), `${count} day${count === 1 ? '' : 's'}`]), String(days))}
      <p class="hint">The calendar opens on today and the next days you choose. Fit still shows 7 days.</p>
      <div id="syncBox">${syncBody}</div>
    </div>`);
  }

  function renderStaff() {
    const list = people();
    view.innerHTML = `<p class="hint">Copy a private link and text it to that cleaner. The link is their sign-in. These pages are hidden from Google.</p>
      <div class="staff-grid">${list.map((person) => {
        const url = staffUrl(person);
        return `<article class="staff-card" style="border-top:4px solid ${safeColor(person.color)}">
          <h3 class="person"><span class="dot" style="background:${safeColor(person.color)}"></span>${esc(person.name)}${person.active ? '' : ' · inactive'}</h3>
          <div class="totals">
            <span class="completed">Completed<strong>${person.completed || 0}</strong></span>
            <span class="acknowledged">Acknowledged<strong>${person.acknowledged || 0}</strong></span>
            <span class="outstanding">Outstanding<strong>${person.outstanding || 0}</strong></span>
          </div>
          <p class="hint">${person.email ? esc(person.email) : 'No email saved'} · Email alerts ${person.emailAlerts ? 'on' : 'off'}</p>
          ${person.name === 'Petra' ? '<p class="hint">Admin, can be assigned cleans</p>' : ''}
          <div class="row-actions">
            <button type="button" class="btn primary" data-action="edit-staff" data-id="${esc(person.id)}">Edit</button>
            <button type="button" class="btn ghost" data-action="copy-link" data-id="${esc(person.id)}" data-url="${esc(url)}">Copy link</button>
            <button type="button" class="btn ghost" data-action="toggle-staff" data-id="${esc(person.id)}" data-name="${esc(person.name)}" data-next="${person.active ? 'false' : 'true'}">${person.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </article>`;
      }).join('')}</div>
      <form id="addStaffForm" class="panel" style="margin-top:12px">
        <h2>Add a cleaner</h2>
        <label>Name<input name="name" type="text" maxlength="40" required placeholder="Name"></label>
        <button class="btn primary block" type="submit">Add cleaner</button>
      </form>`;
  }

  function mailNote(result) {
    if (result && Array.isArray(result.emailed) && result.emailed.length) return ` Emailed ${result.emailed.join(', ')}.`;
    if (result && result.emailPending) return ' Email alerts are on, but outgoing email is not configured yet.';
    return '';
  }

  function openStaffEditor(id) {
    const person = people().find((item) => item.id === id);
    if (!person) return;
    openSheet(`<form id="staffForm" data-id="${esc(person.id)}">
      ${sheetHead('Edit cleaner')}
      <label>Name<input name="name" type="text" maxlength="40" required value="${esc(person.name || '')}"></label>
      <label>Email<input name="email" type="email" maxlength="120" value="${esc(person.email || '')}" placeholder="name@email.com"></label>
      <label>Email alerts</label>
      <input type="hidden" name="emailAlerts" value="${person.emailAlerts ? '1' : '0'}">
      ${choiceButtons('emailAlerts', [['1', 'On'], ['0', 'Off']], person.emailAlerts ? '1' : '0')}
      <p class="hint">When alerts are on, assigning a clean emails the property, address, time, and door code.</p>
      <button class="btn primary block" type="submit" style="margin-top:14px">Save</button>
    </form>`);
  }

  function openSheet(html, kind) {
    document.querySelector('.sheet-card').classList.toggle('visit-card', kind === 'visit');
    document.getElementById('sheetBody').innerHTML = html;
    document.getElementById('sheet').hidden = false;
    const title = document.getElementById('sheetTitle');
    if (title) title.focus();
  }

  function closeSheet() {
    photoUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    const lightbox = document.getElementById('photoLightbox');
    if (lightbox) lightbox.hidden = true;
    document.querySelector('.sheet-card').classList.remove('visit-card');
    document.getElementById('sheet').hidden = true;
    document.getElementById('sheetBody').innerHTML = '';
  }

  function sheetHead(title) {
    return `<div class="sheet-head"><h2 id="sheetTitle" tabindex="-1">${title}</h2><button type="button" class="btn ghost small" data-action="close-sheet">Close</button></div>`;
  }

  function staffButtons(selected) {
    const on = new Set(selected);
    const list = activePeople();
    people().forEach((person) => {
      if (on.has(person.id) && !list.some((item) => item.id === person.id)) list.push(person);
    });
    if (!list.length) return '<p class="hint">Add a cleaner on the Staff tab first.</p>';
    return `<div class="choices">${list.map((person) =>
      `<button type="button" class="choice" data-action="toggle-cleaner" data-value="${esc(person.id)}" aria-pressed="${on.has(person.id) ? 'true' : 'false'}">${esc(person.name)}</button>`
    ).join('')}</div>`;
  }

  function selectedStaff(form) {
    return String(form.elements.namedItem('staffIds').value || '').split(',').map((id) => id.trim()).filter(Boolean);
  }

  function setStaff(form, ids) {
    const unique = [];
    ids.forEach((id) => {
      if (id && !unique.includes(id)) unique.push(id);
    });
    form.elements.namedItem('staffIds').value = unique.join(',');
    form.querySelectorAll('[data-action="toggle-cleaner"]').forEach((button) => {
      button.setAttribute('aria-pressed', unique.includes(button.dataset.value) ? 'true' : 'false');
    });
  }

  function choiceButtons(group, options, selected) {
    return `<div class="choices">${options.map(([value, label]) =>
      `<button type="button" class="choice" data-action="pick-choice" data-group="${group}" data-value="${esc(value)}" aria-pressed="${value === selected ? 'true' : 'false'}">${esc(label)}</button>`
    ).join('')}</div>`;
  }

  function openAdd(date) {
    const preset = state.filter !== 'all' && state.filter !== 'needs' ? state.filter : '';
    state.staffPicked = Boolean(preset);
    state.recurrencePicked = false;
    openSheet(jobForm({
      mode: 'create',
      date,
      staffIds: preset ? [preset] : [],
      startTime: '10:00',
      durationMinutes: 120,
      recurrence: 'once',
      weeksAhead: 26,
      visitNote: ''
    }));
  }

  function openEdit(job) {
    state.staffPicked = true;
    state.recurrencePicked = true;
    openSheet(jobForm({ mode: 'edit', ...job }));
    if (job.propertyId) pickProperty(job.propertyId);
  }

  function jobForm(job) {
    const editing = job.mode === 'edit';
    const chosen = jobStaffIds(job);
    return `<form id="jobForm" data-mode="${editing ? 'edit' : 'create'}" data-id="${esc(job.id || '')}">
      ${sheetHead(editing ? 'Edit clean' : 'Add a clean')}
      <input type="hidden" name="propertyId" value="${esc(job.propertyId || '')}">
      <input type="hidden" name="staffIds" value="${esc(chosen.join(','))}">
      <input type="hidden" name="recurrence" value="${esc(job.recurrence || 'once')}">
      <label id="propertySearchLabel">Property
        <input id="propertySearch" type="search" placeholder="Search customers" autocomplete="off">
      </label>
      <div id="propertyChosen"><p class="hint">Search an existing customer.</p></div>
      <div id="propertyResults"></div>
      <label>Date<input name="date" type="date" required value="${esc(job.date || '')}"></label>
      <label>Start time</label>
      ${choiceButtons('time', TIMES.map((time) => [time, formatTime(time)]), job.startTime || '10:00')}
      <input name="startTime" type="time" min="10:00" required value="${esc(job.startTime || '10:00')}" style="margin-top:8px">
      <label>Expected time</label>
      <input type="hidden" name="deepClean" value="${job.deepClean ? '1' : '0'}">
      ${choiceButtons('duration', DURATIONS.map((mins) => [String(mins), formatDuration(mins)]).concat([['deep', 'Deep clean']]), job.deepClean ? 'deep' : String(job.durationMinutes || 120))}
      <input name="durationMinutes" type="number" min="15" max="480" step="15" required value="${esc(job.durationMinutes || 120)}" style="margin-top:8px">
      <label>Cleaners</label>
      <p class="hint">Select each cleaner on this clean.</p>
      ${staffButtons(chosen)}
      ${editing ? '' : `<label>Repeat</label>${choiceButtons('recurrence', Object.entries(REC), job.recurrence || 'once')}
        <div id="aheadBox" ${job.recurrence && job.recurrence !== 'once' ? '' : 'hidden'}>
          <label>Schedule ahead
            <select name="weeksAhead">
              <option value="8">8 weeks</option>
              <option value="12">12 weeks</option>
              <option value="26" selected>6 months</option>
              <option value="52">1 year</option>
            </select>
          </label>
          <p class="hint">Acknowledging one visit covers every visit on this schedule with the same cleaner. A swapped cleaner acknowledges their own visits.</p>
        </div>`}
      <label>Note for this visit<textarea name="visitNote" maxlength="500" placeholder="Side door, bring supplies, extra oven...">${esc(job.visitNote || '')}</textarea></label>
      ${editing ? '<p class="hint">Changing the time, cleaner, or property asks them to acknowledge again.</p>' : ''}
      <div class="stack" style="margin-top:14px">
        <button class="btn primary" type="submit" data-apply="one">${editing ? 'Save this visit' : 'Book cleans'}</button>
        ${editing && job.seriesId ? '<button class="btn ghost" type="submit" data-apply="future">Save this and future visits</button>' : ''}
      </div>
    </form>`;
  }

  function openJob(id) {
    const job = ((state.data && state.data.jobs) || []).find((item) => item.id === id);
    if (!job) return;
    openSheet(visitSheet(job), 'visit');
    hydratePhotos();
  }

  function visitIcon(name) {
    const paths = {
      clock: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v5l3 2"></path>',
      pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.2"></circle>',
      key: '<circle cx="8" cy="14" r="3"></circle><path d="M11 14h10l-2 2 2 2"></path>',
      phone: '<path d="M8 5h3l1 4-2 1a12 12 0 0 0 5 5l1-2 4 1v3c0 1-1 2-2 2A15 15 0 0 1 5 7c0-1 1-2 2-2z"></path>',
      check: '<path d="M5 12l5 5L20 7"></path>',
      doc: '<path d="M7 3h7l5 5v13H7z"></path><path d="M14 3v5h5"></path>'
    };
    return `<svg class="visit-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  function visitDate(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC'
    }).toUpperCase();
  }

  function initials(name) {
    const letters = String(name || '').split(',').map((part) => part.trim()[0]).filter(Boolean).join('').slice(0, 2);
    return letters.toUpperCase() || '?';
  }

  function visitSheet(job) {
    const place = placeLabel(job);
    const address = String(job.address || '').trim();
    const showAddress = address && address.toLowerCase() !== place.toLowerCase();
    const mapQuery = encodeURIComponent(address || place);
    const acked = job.status === 'acknowledged' || job.status === 'completed';
    const done = job.status === 'completed';
    const ackTone = done ? 'completed' : acked ? 'acknowledged' : 'scheduled';
    const doneTone = done ? 'completed' : 'scheduled';
    const doneAction = MODE === 'manager' ? 'manager-status' : 'complete';
    const doneStatus = MODE === 'manager' ? ' data-status="completed"' : '';
    const ackStep = progressStep('Cleaner acknowledged', ackTone, MODE === 'cleaner' && job.status === 'scheduled' ? `data-action="ack" data-id="${esc(job.id)}"` : '');
    const doneStep = progressStep('Cleaning completed', doneTone, done ? '' : `data-action="${doneAction}" data-id="${esc(job.id)}"${doneStatus}`);
    const doneButton = done
      ? ''
      : `<button type="button" class="visit-done" data-action="${doneAction}" data-id="${esc(job.id)}"${doneStatus}>${visitIcon('check')} Mark completed</button>`;
    const more = [];
    if (MODE === 'manager') {
      more.push(`<button type="button" class="btn ghost" data-action="edit-job" data-id="${esc(job.id)}">Edit</button>`);
      if (job.status !== 'scheduled') more.push(`<button type="button" class="btn ghost" data-action="manager-status" data-id="${esc(job.id)}" data-status="scheduled">Mark not acknowledged</button>`);
      if (job.seriesId) more.push(`<button type="button" class="btn ghost" data-action="extend-job" data-id="${esc(job.id)}">Add 12 more weeks</button>`);
      more.push(`<button type="button" class="btn danger" data-action="delete-job" data-id="${esc(job.id)}" data-scope="one">Delete this visit</button>`);
      if (job.seriesId) more.push(`<button type="button" class="btn danger" data-action="delete-job" data-id="${esc(job.id)}" data-scope="future">Delete this and future visits</button>`);
    } else if (job.status === 'acknowledged') {
      more.push(`<button type="button" class="btn ghost" data-action="unack" data-id="${esc(job.id)}">Un-acknowledge</button>`);
    }
    const menu = more.length
      ? `<details class="visit-menu"><summary aria-label="More actions">···</summary><div class="visit-menu-list">${more.join('')}</div></details>`
      : '';
    const phone = MODE === 'manager' && job.phone ? (() => {
      const href = phoneHref(job.phone);
      const text = href ? href.replace(/^tel:/, 'sms:') : '';
      return `<div class="visit-row">${visitIcon('phone')}<div class="grow"><span class="tile-label">Contact phone</span><strong>${esc(job.phone)}</strong></div>${text ? `<a class="visit-chip" href="${esc(text)}">Text</a>` : ''}${href ? `<a class="visit-chip" href="${esc(href)}">Call</a>` : ''}</div>`;
    })() : '';
    return `<div class="visit">
      <div class="visit-top">
        <div>
          <p class="visit-date">${esc(visitDate(job.date))}</p>
          <h2 id="sheetTitle" tabindex="-1">${esc(place)}</h2>
        </div>
        <div class="visit-tools">
          ${menu}
          <button type="button" class="visit-close" data-action="close-sheet" aria-label="Close">×</button>
        </div>
      </div>
      <div class="visit-when">
        <p class="visit-time">${visitIcon('clock')}<span>${esc(formatRange(job.startTime, job.durationMinutes))}${job.deepClean ? ' · Deep clean' : ''}</span></p>
        <span class="pill ${esc(job.status)}">${esc(statusLabel(job.status))}</span>
      </div>
      ${job.seriesId ? `<p class="hint">${esc(REC[job.recurrence] || 'Repeating')}</p>` : ''}
      <div class="visit-cleaner">
        <span class="visit-avatar">${esc(initials(job.staffName))}</span>
        <div class="grow"><span class="tile-label">Assigned cleaner</span><strong>${esc(job.staffName || 'Unassigned')}</strong></div>
      </div>
      <div class="visit-row">
        ${visitIcon('pin')}
        <div class="grow"><span class="tile-label">Property / address</span><strong>${esc(place)}</strong>${showAddress ? `<span class="pre">${esc(address)}</span>` : ''}</div>
        <a class="visit-chip" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener">Map</a>
      </div>
      <div class="visit-row">
        ${visitIcon('key')}
        <div class="grow"><span class="tile-label">Door code</span><strong>${job.doorCode ? esc(job.doorCode) : 'None on file'}</strong></div>
        ${job.doorCode ? `<button type="button" class="visit-chip" data-action="copy-text" data-text="${esc(job.doorCode)}">Copy</button>` : ''}
      </div>
      ${phone}
      ${job.propertyNotes ? `<div class="visit-row"><div class="grow"><span class="tile-label">Property notes</span><strong class="pre">${esc(job.propertyNotes)}</strong></div></div>` : ''}
      ${job.visitNote ? `<div class="visit-row"><div class="grow"><span class="tile-label">This visit</span><strong class="pre">${esc(job.visitNote)}</strong></div></div>` : ''}
      ${photoGallery(job)}
      ${MODE === 'cleaner' ? staffActions(job) : `<h3 class="visit-section">Visit progress</h3>
      ${ackStep}
      ${doneStep}
      ${job.seriesId && job.status === 'scheduled' ? '<p class="hint">Acknowledging covers every visit on this schedule with the same cleaner.</p>' : ''}
      ${billingCards(job)}
      ${doneButton}`}
    </div>`;
  }

  function staffActions(job) {
    const acked = job.status === 'acknowledged' || job.status === 'completed';
    const done = job.status === 'completed';
    return `<div class="visit-actions">
      <button type="button" class="visit-done" data-action="ack" data-id="${esc(job.id)}" ${acked ? 'disabled' : ''}>${visitIcon('check')} ${acked ? 'Acknowledged' : 'Acknowledge'}</button>
      <button type="button" class="visit-done" data-action="complete" data-id="${esc(job.id)}" ${done ? 'disabled' : ''}>${visitIcon('check')} ${done ? 'Completed' : 'Mark completed'}</button>
      <button type="button" class="visit-done visit-upload" data-action="pick-photos" data-id="${esc(job.id)}">Upload photos</button>
      <input id="visitPhotoInput" type="file" accept="image/*" multiple hidden>
    </div>
    ${job.seriesId && job.status === 'scheduled' ? '<p class="hint">Acknowledging covers every visit on this schedule with the same cleaner.</p>' : ''}`;
  }

  function photoGallery(job) {
    const photos = Array.isArray(job.photos) ? job.photos : [];
    if (!photos.length) return '';
    return `<h3 class="visit-section">Photos</h3><div class="visit-photos">${photos.map((photo) => `<button type="button" data-action="view-photo" data-id="${esc(job.id)}" data-photo="${esc(photo.id)}" data-name="${esc(photo.name || 'Photo')}"><img alt="${esc(photo.name || 'Photo')}" data-photo-src="${esc(job.id)}:${esc(photo.id)}"></button>`).join('')}</div>`;
  }

  const photoUrls = [];
  function trackPhotoUrl(url) {
    photoUrls.push(url);
    return url;
  }

  async function photoBlob(jobId, photoId) {
    const headers = {};
    if (MODE === 'manager' && state.password) headers['x-elite-tasks-password'] = state.password;
    if (MODE === 'cleaner') headers['x-elite-tasks-token'] = TOKEN;
    const response = await fetch(`/api/elite-tasks/jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(photoId)}`, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error('Photo unavailable');
    return response.blob();
  }

  function hydratePhotos() {
    document.querySelectorAll('#sheetBody img[data-photo-src]').forEach((img) => {
      const [jobId, photoId] = String(img.dataset.photoSrc || '').split(':');
      if (!jobId || !photoId) return;
      photoBlob(jobId, photoId).then((blob) => {
        img.src = trackPhotoUrl(URL.createObjectURL(blob));
      }).catch(() => {
        img.alt = 'Photo unavailable';
      });
    });
  }

  function preparePhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that photo.'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1800;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Could not prepare that photo.'));
              return;
            }
            resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.82);
        };
        img.onerror = () => reject(new Error('Use a JPEG or PNG photo.'));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadVisitPhotos(jobId, files) {
    const body = new FormData();
    for (const file of [...files].slice(0, 8)) body.append('photos', await preparePhoto(file), 'photo.jpg');
    const headers = {};
    if (MODE === 'cleaner') headers['x-elite-tasks-token'] = TOKEN;
    const response = await fetch(`/api/elite-tasks/me/jobs/${encodeURIComponent(jobId)}/photos`, { method: 'POST', headers, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || 'Could not upload the photos.');
      err.status = response.status;
      throw err;
    }
    toast(files.length === 1 ? 'Photo added' : 'Photos added');
    await loadWeek({ keepScroll: true });
    openJob(jobId);
  }

  function showPhoto(url, name) {
    let box = document.getElementById('photoLightbox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'photoLightbox';
      box.className = 'photo-lightbox';
      box.hidden = true;
      box.innerHTML = '<button type="button" data-action="close-photo" aria-label="Close photo">×</button><img alt="">';
      document.body.appendChild(box);
    }
    const image = box.querySelector('img');
    image.src = url;
    image.alt = name || 'Photo';
    box.hidden = false;
  }

  function progressStep(label, tone, attrs) {
    const body = `<span class="visit-dot ${tone}"></span><span>${label}</span>`;
    if (!attrs) return `<div class="visit-step ${tone}">${body}</div>`;
    return `<button type="button" class="visit-step ${tone}" ${attrs}>${body}</button>`;
  }

  function billingCards(job) {
    if (MODE !== 'manager') return '';
    const invoiced = job.payment === 'invoiced' || job.payment === 'paid';
    const paid = job.payment === 'paid';
    const invoicePayment = invoiced ? 'none' : 'invoiced';
    const paidPayment = paid ? 'invoiced' : 'paid';
    return `<h3 class="visit-section">Billing</h3>
      <div class="visit-bill">
        ${tickBox('Invoiced', invoiced, `data-action="payment" data-id="${esc(job.id)}" data-payment="${invoicePayment}"${paid ? ' disabled' : ''}`)}
        ${tickBox('Paid', paid, `data-action="payment" data-id="${esc(job.id)}" data-payment="${paidPayment}"`)}
      </div>`;
  }

  function tickBox(label, on, attrs) {
    return `<button type="button" class="visit-tick ${on ? 'on' : ''}" aria-pressed="${on ? 'true' : 'false'}" ${attrs}><span class="box" aria-hidden="true"></span><span>${label}</span></button>`;
  }

  function weekdayName(iso) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayIndex(iso)];
  }

  function invoiceBounds() {
    const current = invoiceMonday(todayISO());
    const mondays = ((state.report && state.report.invoices) || []).map((period) => period.monday).sort();
    const earliest = mondays.length ? mondays[0] : current;
    return { min: earliest < current ? earliest : current, max: current };
  }

  function selectedInvoice() {
    const monday = state.invoiceMonday || invoiceMonday(todayISO());
    const found = ((state.report && state.report.invoices) || []).find((period) => period.monday === monday);
    return found || { monday, start: addDays(monday, -6), end: monday, toBillCustomers: 0, toBillCleans: 0, customers: [] };
  }

  function invoiceRangeLabel(period) {
    const year = String(period.end).slice(0, 4);
    return `${weekdayName(period.start)}, ${prettyDate(period.start)} – ${weekdayName(period.end)}, ${prettyDate(period.end)}, ${year}`;
  }

  function invoiceCleanRow(job) {
    const invoiced = job.payment === 'invoiced' || job.payment === 'paid';
    const paid = job.payment === 'paid';
    return `<tr>
      <td>${esc(prettyDate(job.date))}</td>
      <td>${esc(formatTime(job.startTime))}</td>
      <td>${esc(job.staffName || 'Unassigned')}</td>
      <td>${billingTags(invoiced, paid, `data-id="${esc(job.id)}" data-action="payment"`)}</td>
    </tr>`;
  }

  function billingTags(invoiced, paid, attrs) {
    const invoicePayment = invoiced && !paid ? 'none' : 'invoiced';
    const paidPayment = paid ? (String(attrs).includes('tag-customer') ? 'unpay' : 'invoiced') : 'paid';
    return `<div class="visit-bill">
      ${tickBox('Invoiced', invoiced, `${attrs} data-payment="${invoicePayment}"${paid ? ' disabled' : ''}`)}
      ${tickBox('Paid', paid, `${attrs} data-payment="${paidPayment}"`)}
    </div>`;
  }

  function customerBilling(customer) {
    const cleans = customer.cleans || [];
    const invoiced = cleans.length > 0 && cleans.every((job) => job.payment === 'invoiced' || job.payment === 'paid');
    const paid = cleans.length > 0 && cleans.every((job) => job.payment === 'paid');
    return billingTags(invoiced, paid, `data-action="tag-customer" data-property="${esc(customer.propertyId || customer.propertyName)}"`);
  }

  function customerStatus(customer) {
    const cleans = customer.cleans || [];
    const paid = cleans.filter((job) => job.payment === 'paid').length;
    const open = cleans.filter((job) => !job.payment).length;
    if (cleans.length && paid === cleans.length) return 'Paid';
    if (!open) return 'Invoiced';
    return `${open} clean${open === 1 ? '' : 's'} to tag`;
  }

  function invoiceCustomerCard(customer) {
    const address = String(customer.address || '').split('\n').map((line) => line.trim()).filter(Boolean)[0] || '';
    return `<article class="invoice-card">
      <header>
        <div>
          <h3>${esc(customer.propertyName || 'Property')}</h3>
          ${address ? `<p class="hint">${esc(address)}</p>` : ''}
          <p class="hint">${esc(customerStatus(customer))}</p>
        </div>
        ${customerBilling(customer)}
      </header>
      <table class="report-table"><thead><tr><th>Date</th><th>Time</th><th>Cleaner</th><th>Billing</th></tr></thead><tbody>
        ${customer.cleans.map(invoiceCleanRow).join('')}
      </tbody></table>
    </article>`;
  }

  function renderInvoiceReport() {
    const bounds = invoiceBounds();
    const period = selectedInvoice();
    const customers = period.customers || [];
    const toBill = customers.filter((customer) => customer.toBill > 0);
    const invoiced = customers.filter((customer) => !customer.toBill && customer.paid < (customer.cleans || []).length);
    const paid = customers.filter((customer) => (customer.cleans || []).length && customer.paid === customer.cleans.length);
    const who = toBill.length
      ? `<ul class="invoice-who">${toBill.map((customer) => `<li><div><strong>${esc(customer.propertyName)}</strong><span>${esc(customerStatus(customer))}</span></div>${customerBilling(customer)}</li>`).join('')}</ul>`
      : '<p class="hint">No one left to bill for this period.</p>';
    const section = (title, list) => (list.length ? `<h2>${title}</h2>${list.map(invoiceCustomerCard).join('')}` : '');
    return `<section class="invoice-report">
      <h2>Invoice report</h2>
      <div class="week-nav">
        <button type="button" class="btn ghost week-arrow" data-action="invoice-prev" aria-label="Previous invoice period" ${period.monday <= bounds.min ? 'disabled' : ''}>‹</button>
        <strong>${esc(invoiceRangeLabel(period))}</strong>
        <button type="button" class="btn ghost week-arrow" data-action="invoice-next" aria-label="Next invoice period" ${period.monday >= bounds.max ? 'disabled' : ''}>›</button>
      </div>
      <p class="hint">Tag a customer Invoiced or Paid. Paid also closes Invoiced, for people who pay without an invoice.</p>
      <div class="report-grid">
        <div class="report-kpi"><span>To bill</span><strong>${toBill.length}</strong></div>
        <div class="report-kpi"><span>Invoiced</span><strong>${invoiced.length}</strong></div>
        <div class="report-kpi"><span>Paid</span><strong>${paid.length}</strong></div>
      </div>
      <h2>Who to bill</h2>
      ${who}
      ${section('Still to tag', toBill)}
      ${section('Invoiced', invoiced)}
      ${section('Paid', paid)}
    </section>`;
  }

  function weekLabel(start, end) {
    const startYear = String(start).slice(0, 4);
    const endYear = String(end).slice(0, 4);
    if (startYear === endYear) return `${prettyDate(start)} – ${prettyDate(end)}, ${startYear}`;
    return `${prettyDate(start)}, ${startYear} – ${prettyDate(end)}, ${endYear}`;
  }

  function reportBounds() {
    const weeks = (state.report && state.report.weeks) || [];
    const today = sundayOf(todayISO());
    if (!weeks.length) return { min: today, max: today };
    const starts = weeks.map((week) => week.start).sort();
    const latest = starts[starts.length - 1];
    return { min: starts[0], max: latest > today ? latest : today };
  }

  function selectedReportWeek() {
    const start = state.reportWeek || sundayOf(todayISO());
    const end = addDays(start, 6);
    const found = ((state.report && state.report.weeks) || []).find((week) => week.start === start);
    return found || { start, end, total: 0, paid: 0, outstandingCount: 0, cleaners: [], outstanding: [] };
  }

  async function loadReport() {
    state.report = await api(`/api/elite-tasks/report?today=${encodeURIComponent(todayISO())}`);
    const bounds = reportBounds();
    if (state.reportWeek < bounds.min) state.reportWeek = bounds.min;
    if (state.reportWeek > bounds.max) state.reportWeek = bounds.max;
    const invoice = invoiceBounds();
    if (!state.invoiceMonday) state.invoiceMonday = invoice.max;
    if (state.invoiceMonday < invoice.min) state.invoiceMonday = invoice.min;
    if (state.invoiceMonday > invoice.max) state.invoiceMonday = invoice.max;
    renderReports();
  }

  function renderReports() {
    if (window.matchMedia('(max-width: 799px)').matches) {
      view.innerHTML = '<p class="hint">Reports are for a larger screen.</p>';
      return;
    }
    if (!state.report) {
      view.innerHTML = '<p class="hint">Loading report…</p>';
      if (!state.reportLoading) {
        state.reportLoading = true;
        Promise.resolve(guard(() => loadReport())).finally(() => { state.reportLoading = false; });
      }
      return;
    }
    const bounds = reportBounds();
    const week = selectedReportWeek();
    const cleanerRows = week.cleaners.length
      ? week.cleaners.map((person) => `<tr><td>${esc(person.name)}</td><td>${person.count}</td></tr>`).join('')
      : '<tr><td colspan="2">No cleans this week</td></tr>';
    const outstandingRows = week.outstanding.length
      ? week.outstanding.map((job) => `<tr><td>${esc(prettyDate(job.date))}</td><td>${esc(job.propertyName)}</td><td>${esc(job.staffName || 'Unassigned')}</td><td>$ Payment requested</td></tr>`).join('')
      : '<tr><td colspan="4">No outstanding payments this week</td></tr>';
    const history = (state.report.weeks || []).map((item) => `<tr class="${item.start === week.start ? 'on' : ''}">
      <td><button type="button" data-action="report-week" data-start="${esc(item.start)}">${esc(weekLabel(item.start, item.end))}</button></td>
      <td>${item.total}</td>
      <td>${esc(item.cleaners.map((person) => `${person.name} ${person.count}`).join(', ') || '—')}</td>
      <td>${item.outstandingCount}</td>
      <td>${item.paid}</td>
    </tr>`).join('');
    view.innerHTML = `${renderInvoiceReport()}<div class="report">
      <div class="week-nav">
        <button type="button" class="btn ghost week-arrow" data-action="report-prev" aria-label="Previous report week" ${week.start <= bounds.min ? 'disabled' : ''}>‹</button>
        <strong>${esc(weekLabel(week.start, week.end))}</strong>
        <button type="button" class="btn ghost week-arrow" data-action="report-next" aria-label="Next report week" ${week.start >= bounds.max ? 'disabled' : ''}>›</button>
      </div>
      <p class="hint">Sunday through Saturday. A clean with more than one cleaner counts for each person.</p>
      <div class="report-grid">
        <div class="report-kpi"><span>Total cleans</span><strong>${week.total}</strong></div>
        <div class="report-kpi"><span>Outstanding payments</span><strong>${week.outstandingCount}</strong></div>
        <div class="report-kpi"><span>Paid</span><strong>${week.paid}</strong></div>
      </div>
      <h2>Cleans per cleaner</h2>
      <table class="report-table"><thead><tr><th>Cleaner</th><th>Cleans</th></tr></thead><tbody>${cleanerRows}</tbody></table>
      <h2>Outstanding payments</h2>
      <table class="report-table"><thead><tr><th>Date</th><th>Client</th><th>Cleaner</th><th>Payment</th></tr></thead><tbody>${outstandingRows}</tbody></table>
      <h2>Past weeks</h2>
      <table class="report-table"><thead><tr><th>Week</th><th>Total cleans</th><th>Cleans per cleaner</th><th>Outstanding</th><th>Paid</th></tr></thead><tbody>${history || '<tr><td colspan="5">No cleans yet</td></tr>'}</tbody></table>
    </div>`;
  }

  function openBlock(date) {
    const staffChoices = MODE === 'manager' ? `<label>Cleaner</label>${choiceButtons('staffId', activePeople().map((person) => [person.id, person.name]), state.filter !== 'all' && state.filter !== 'needs' ? state.filter : '')}` : '';
    openSheet(`<form id="blockForm">
      ${sheetHead(MODE === 'cleaner' ? 'Block dates' : 'Mark unavailable')}
      <input type="hidden" name="staffId" value="${MODE === 'cleaner' ? esc(state.data.staff.id) : esc(state.filter !== 'all' && state.filter !== 'needs' ? state.filter : '')}">
      ${staffChoices}
      <label>From<input name="startDate" type="date" required value="${esc(date || todayISO())}"></label>
      <label>Through<input name="endDate" type="date" required value="${esc(date || todayISO())}"></label>
      <label>Note<input name="note" type="text" maxlength="200" placeholder="Vacation, sick day..."></label>
      <button class="btn primary block" type="submit" style="margin-top:14px">Save unavailable dates</button>
    </form>`);
  }

  function openProperty(id) {
    const property = ((state.data && state.data.properties) || []).find((item) => item.id === id);
    if (!property) return;
    openSheet(`<form id="propertyForm" data-id="${esc(property.id)}">
      ${sheetHead('Edit property')}
      <label>Property name<input name="propertyName" type="text" maxlength="160" required value="${esc(property.propertyName || property.label || property.name || '')}"></label>
      <label>Address<textarea name="address" maxlength="1000" rows="4">${esc(property.address || '')}</textarea></label>
      <label>Door code<input name="doorCode" type="text" maxlength="80" autocomplete="off" value="${esc(property.doorCode || '')}"></label>
      <label>Notes<textarea name="notes" maxlength="4000" rows="4">${esc(property.notes || '')}</textarea></label>
      <p class="hint">Saved only on this schedule.</p>
      <button class="btn primary block" type="submit">Save property</button>
    </form>`);
  }

  function setChoice(form, group, value) {
    const hidden = form.elements.namedItem(group);
    if (hidden) hidden.value = value;
    form.querySelectorAll(`[data-group="${group}"]`).forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.value === value ? 'true' : 'false');
    });
  }

  function propertyTitle(property) {
    return property.propertyName || property.label || property.name || 'Property';
  }

  function renderPropertyResults(query) {
    const box = document.getElementById('propertyResults');
    const form = document.getElementById('jobForm');
    if (!box || !form || form.dataset.propertyMode === 'locked') return;
    const raw = String(query || '').trim();
    const q = raw.toLowerCase();
    if (!q) {
      box.innerHTML = '';
      return;
    }
    const props = (state.data && state.data.properties) || [];
    const list = props.filter((property) => `${property.propertyName || ''} ${property.name || ''} ${property.label || ''} ${property.address || ''}`.toLowerCase().includes(q)).slice(0, 12);
    const matches = list.map((property) => `<button type="button" class="pick" data-action="pick-property" data-id="${esc(property.id)}">
      <strong>${esc(propertyTitle(property))}</strong><span>${esc(property.address || 'No address')}</span>
    </button>`).join('');
    const add = '<button type="button" class="pick add" data-action="show-add-customer">+ Add customer</button>';
    box.innerHTML = `${matches || '<p class="hint">No matching customer.</p>'}${add}`;
  }

  function showAddCustomer() {
    const form = document.getElementById('jobForm');
    const box = document.getElementById('propertyResults');
    if (!form || !box) return;
    form.dataset.propertyMode = 'add';
    const raw = String(document.getElementById('propertySearch')?.value || '').trim();
    box.innerHTML = `<div class="pick">
      <strong>New customer</strong>
      <label>Name<input id="newPropertyName" type="text" maxlength="160" value="${esc(raw)}"></label>
      <label>Address lines<textarea id="newPropertyAddress" maxlength="1000" rows="3" placeholder="Street, city, postal code"></textarea></label>
      <button type="button" class="btn primary" data-action="add-booking-property">Add customer</button>
    </div>`;
    document.getElementById('newPropertyName')?.focus();
  }

  async function addBookingProperty() {
    const name = String(document.getElementById('newPropertyName')?.value || '').trim();
    const address = document.getElementById('newPropertyAddress')?.value || '';
    if (!name) return toast('Type the customer name.');
    if (!String(address).trim()) return toast('Enter the address.');
    const created = await api('/api/elite-tasks/properties', {
      method: 'POST',
      body: JSON.stringify({ name, address })
    });
    const property = { ...created.property, label: created.property.name };
    if (!state.data.properties) state.data.properties = [];
    state.data.properties.push(property);
    state.data.properties.sort((a, b) => String(a.propertyName || a.name || a.label).localeCompare(String(b.propertyName || b.name || b.label), undefined, { numeric: true, sensitivity: 'base' }));
    pickProperty(property.id);
    toast('Customer added');
  }

  function clearProperty() {
    const form = document.getElementById('jobForm');
    if (!form) return;
    form.elements.namedItem('propertyId').value = '';
    form.dataset.propertyMode = 'search';
    const searchLabel = document.getElementById('propertySearchLabel');
    if (searchLabel) searchLabel.hidden = false;
    const chosen = document.getElementById('propertyChosen');
    if (chosen) chosen.innerHTML = '<p class="hint">Search an existing customer.</p>';
    const results = document.getElementById('propertyResults');
    if (results) results.innerHTML = '';
    const search = document.getElementById('propertySearch');
    if (search) {
      search.value = '';
      search.focus();
    }
  }

  function pickProperty(id) {
    const form = document.getElementById('jobForm');
    if (!form) return;
    form.elements.namedItem('propertyId').value = id;
    form.dataset.propertyMode = 'locked';
    const property = ((state.data && state.data.properties) || []).find((item) => item.id === id);
    const searchLabel = document.getElementById('propertySearchLabel');
    if (searchLabel) searchLabel.hidden = true;
    const search = document.getElementById('propertySearch');
    if (search) search.value = '';
    const results = document.getElementById('propertyResults');
    if (results) results.innerHTML = '';
    const chosen = document.getElementById('propertyChosen');
    if (property && chosen) {
      chosen.innerHTML = `<div class="pick on">
        <strong>${esc(propertyTitle(property))}</strong>
        <span>${esc(property.address || 'No address')}</span>
      </div>
      <button type="button" class="btn ghost small" data-action="clear-property">Change</button>`;
    }
    if (property && !state.staffPicked) {
      const suggested = suggestStaffId(property.cleaner, people());
      if (suggested) setStaff(form, [suggested]);
    }
    if (property && !state.recurrencePicked && form.dataset.mode !== 'edit') {
      setChoice(form, 'recurrence', suggestRecurrence(property.frequency));
      const ahead = document.getElementById('aheadBox');
      if (ahead) ahead.hidden = form.elements.namedItem('recurrence').value === 'once';
    }
  }

  async function submitJob(form, applyTo) {
    const body = {
      propertyId: form.elements.namedItem('propertyId').value,
      staffIds: selectedStaff(form),
      date: form.elements.namedItem('date').value,
      startTime: form.elements.namedItem('startTime').value,
      durationMinutes: Number(form.elements.namedItem('durationMinutes').value),
      deepClean: form.elements.namedItem('deepClean').value === '1',
      visitNote: form.elements.namedItem('visitNote').value,
      allowClash: form.dataset.allowClash === '1',
      applyTo
    };
    if (!body.propertyId) return toast('Choose a property.');
    if (!body.staffIds.length) return toast('Choose a cleaner.');
    if (!body.date || !body.startTime) return toast('Choose a date and start time.');
    if (minutesOf(body.startTime) < 10 * 60) return toast('The earliest start time is 10:00 AM.');
    try {
      if (form.dataset.mode === 'edit') {
        const result = await api(`/api/elite-tasks/jobs/${encodeURIComponent(form.dataset.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast(`${applyTo === 'future' ? 'Updated this visit and the future visits.' : 'Visit updated.'}${mailNote(result)}`);
      } else {
        body.recurrence = form.elements.namedItem('recurrence').value || 'once';
        body.weeksAhead = Number((form.elements.namedItem('weeksAhead') || {}).value || 26);
        const result = await api('/api/elite-tasks/jobs', { method: 'POST', body: JSON.stringify(body) });
        const noun = result.count === 1 ? 'clean' : 'cleans';
        toast(`Booked ${result.count} ${noun} through ${prettyDate(result.lastDate)}.${mailNote(result)}`);
      }
    } catch (err) {
      if (err.status === 409) {
        showClash(form, err.message, applyTo);
        return;
      }
      throw err;
    }
    closeSheet();
    await loadWeek({ keepScroll: true });
  }

  function showClash(form, message, applyTo) {
    let box = form.querySelector('#clashBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'clashBox';
      box.className = 'clash';
      const actions = form.querySelector('.stack');
      form.insertBefore(box, actions || null);
    }
    box.hidden = false;
    box.dataset.apply = applyTo || 'one';
    box.innerHTML = `<p><strong>Already booked</strong></p><p>${esc(message)}</p>
      <div class="stack">
        <button type="button" class="btn primary" data-action="clash-continue">Continue anyway</button>
        <button type="button" class="btn ghost" data-action="clash-change">Change cleaner</button>
      </div>`;
    box.scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'close-sheet') return closeSheet();
    if (action === 'toggle-menu') {
      menuOpen = !menuOpen;
      renderNav();
      return;
    }
    if (action === 'close-menu') {
      menuOpen = false;
      renderNav();
      return;
    }
    if (action === 'screen') {
      menuOpen = false;
      state.screen = target.dataset.screen;
      render();
      return;
    }
    if (action === 'filter') {
      state.filter = target.dataset.filter;
      render();
      return;
    }
    if (action === 'next-week' || action === 'prev-week' || action === 'this-week') {
      if (action === 'next-week') state.weekStart = addDays(state.weekStart, 7);
      if (action === 'prev-week') state.weekStart = addDays(state.weekStart, -7);
      if (action === 'this-week') state.weekStart = todayISO();
      guard(() => loadWeek());
      return;
    }
    if (action === 'zoom-in' || action === 'zoom-out') {
      setZoomDays(zoomDays() + (action === 'zoom-in' ? -1 : 1));
      return;
    }
    if (action === 'zoom-two') {
      state.calendarMode = 'zoom';
      state.zoomDays = defaultDays();
      state.fitHourPx = 0;
      state.weekStart = todayISO();
      guard(() => loadWeek());
      return;
    }
    if (action === 'fit-calendar') {
      state.calendarMode = 'fit';
      state.fitHourPx = 0;
      state.fitLocked = false;
      state.fitDays = 7;
      state.weekStart = todayISO();
      guard(() => loadWeek());
      return;
    }
    if (action === 'refresh') {
      const button = target.closest('button');
      button.classList.add('spin');
      Promise.resolve(guard(() => loadWeek({ keepScroll: true }))).finally(() => button.classList.remove('spin'));
      return;
    }
    if (action === 'add') return openAdd(target.dataset.date);
    if (action === 'open-job') return openJob(target.dataset.id);
    if (action === 'edit-job') {
      const job = ((state.data && state.data.jobs) || []).find((item) => item.id === target.dataset.id);
      if (job) openEdit(job);
      return;
    }
    if (action === 'edit-property') return openProperty(target.dataset.id);
    if (action === 'delete-property') {
      if (!window.confirm(`Delete ${target.dataset.name}? Cleans already booked stay on the calendar.`)) return;
      guard(async () => {
        await api(`/api/elite-tasks/properties/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
        toast('Customer deleted');
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'block-range') return openBlock(todayISO());
    if (action === 'toggle-cleaner') {
      const form = target.closest('#jobForm');
      if (!form) return;
      state.staffPicked = true;
      form.dataset.allowClash = '';
      const clash = form.querySelector('#clashBox');
      if (clash) clash.remove();
      const current = selectedStaff(form);
      const id = target.dataset.value;
      setStaff(form, current.includes(id) ? current.filter((item) => item !== id) : current.concat(id));
      return;
    }
    if (action === 'clash-continue') {
      const form = target.closest('#jobForm');
      if (!form) return;
      form.dataset.allowClash = '1';
      guard(() => submitJob(form, target.closest('#clashBox').dataset.apply || 'one'));
      return;
    }
    if (action === 'clash-change') {
      const form = target.closest('#jobForm');
      const box = target.closest('#clashBox');
      if (form) form.dataset.allowClash = '';
      if (box) box.remove();
      const cleaner = form && form.querySelector('[data-action="toggle-cleaner"]');
      if (cleaner) cleaner.focus();
      return;
    }
    if (action === 'open-settings') {
      openSettings();
      return;
    }
    if (action === 'pick-choice' && target.dataset.group === 'calendarSync') {
      guard(async () => {
        const on = target.dataset.value === '1';
        const path = MODE === 'cleaner' ? '/api/elite-tasks/me/settings' : '/api/elite-tasks/settings';
        await api(path, { method: 'POST', body: JSON.stringify({ calendarSync: on }) });
        if (state.data) state.data.calendarSync = on;
        toast(on ? 'Calendar sync on' : 'Calendar sync off');
        openSettings();
      });
      return;
    }
    if (action === 'pick-choice' && target.dataset.group === 'defaultDays') {
      const days = Math.min(7, Math.max(1, Number(target.dataset.value) || 2));
      localStorage.setItem('eliteTasksDays', String(days));
      state.calendarMode = 'zoom';
      state.zoomDays = days;
      state.fitHourPx = 0;
      state.weekStart = todayISO();
      target.parentElement.querySelectorAll('[data-group="defaultDays"]').forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.value === String(days) ? 'true' : 'false');
      });
      guard(() => loadWeek());
      return;
    }
    if (action === 'pick-choice') {
      const form = target.closest('form');
      if (!form) return;
      setChoice(form, target.dataset.group, target.dataset.value);
      if (target.dataset.group === 'staffId') state.staffPicked = true;
      if (target.dataset.group === 'recurrence') {
        state.recurrencePicked = true;
        const ahead = document.getElementById('aheadBox');
        if (ahead) ahead.hidden = target.dataset.value === 'once';
      }
      if (target.dataset.group === 'time') form.elements.namedItem('startTime').value = target.dataset.value;
      if (target.dataset.group === 'duration') {
        const deep = target.dataset.value === 'deep';
        form.elements.namedItem('deepClean').value = deep ? '1' : '0';
        if (deep) form.elements.namedItem('durationMinutes').value = '360';
        else form.elements.namedItem('durationMinutes').value = target.dataset.value;
      }
      return;
    }
    if (action === 'pick-property') return pickProperty(target.dataset.id);
    if (action === 'clear-property') return clearProperty();
    if (action === 'show-add-customer') return showAddCustomer();
    if (action === 'add-booking-property') {
      guard(() => addBookingProperty());
      return;
    }
    if (action === 'copy-text') {
      guard(async () => {
        await navigator.clipboard.writeText(target.dataset.text || '');
        toast('Copied');
      });
      return;
    }
    if (action === 'edit-staff') {
      openStaffEditor(target.dataset.id);
      return;
    }
    if (action === 'copy-link') {
      const text = target.dataset.url || '';
      guard(async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          throw new Error('Could not copy the link.');
        }
        toast('Link copied');
      });
      return;
    }
    if (action === 'ack' || action === 'complete' || action === 'unack') {
      guard(async () => {
        const path = action === 'ack' ? 'ack' : action === 'unack' ? 'unack' : 'complete';
        const data = await api(`/api/elite-tasks/me/jobs/${encodeURIComponent(target.dataset.id)}/${path}`, { method: 'POST', body: '{}' });
        toast(action === 'ack' ? (data.count > 1 ? 'Acknowledged this schedule' : 'Acknowledged') : action === 'unack' ? 'Not acknowledged' : 'Marked completed');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'pick-photos') {
      const input = document.getElementById('visitPhotoInput');
      if (!input) return;
      input.onchange = () => {
        const files = [...input.files];
        input.value = '';
        if (!files.length) return;
        guard(() => uploadVisitPhotos(target.dataset.id, files));
      };
      input.click();
      return;
    }
    if (action === 'view-photo') {
      guard(async () => {
        const blob = await photoBlob(target.dataset.id, target.dataset.photo);
        showPhoto(trackPhotoUrl(URL.createObjectURL(blob)), target.dataset.name);
      });
      return;
    }
    if (action === 'close-photo') {
      const lightbox = document.getElementById('photoLightbox');
      if (lightbox) lightbox.hidden = true;
      return;
    }
    if (action === 'invoice-prev' || action === 'invoice-next') {
      const bounds = invoiceBounds();
      const next = addDays(state.invoiceMonday || invoiceMonday(todayISO()), action === 'invoice-next' ? 7 : -7);
      if (next < bounds.min || next > bounds.max) return;
      state.invoiceMonday = next;
      renderReports();
      return;
    }
    if (action === 'tag-customer') {
      const period = selectedInvoice();
      const key = target.dataset.property;
      const customer = (period.customers || []).find((item) => (item.propertyId || item.propertyName) === key);
      const requested = target.dataset.payment;
      const payment = requested === 'unpay' ? 'invoiced' : requested;
      const ids = !customer ? [] : customer.cleans.filter((job) => {
        if (requested === 'paid') return job.payment !== 'paid';
        if (requested === 'invoiced') return !job.payment;
        if (requested === 'unpay') return job.payment === 'paid';
        return job.payment === 'invoiced';
      }).map((job) => job.id);
      if (!ids.length) return;
      guard(async () => {
        for (const id of ids) {
          await api(`/api/elite-tasks/jobs/${encodeURIComponent(id)}/payment`, {
            method: 'POST',
            body: JSON.stringify({ payment })
          });
        }
        await loadWeek({ keepScroll: true });
        await loadReport();
      });
      return;
    }
    if (action === 'report-prev' || action === 'report-next') {
      const bounds = reportBounds();
      const next = addDays(state.reportWeek, action === 'report-next' ? 7 : -7);
      if (next < bounds.min || next > bounds.max) return;
      state.reportWeek = next;
      renderReports();
      return;
    }
    if (action === 'report-week') {
      state.reportWeek = target.dataset.start;
      renderReports();
      return;
    }
    if (action === 'payment') {
      const id = target.dataset.id;
      const payment = target.dataset.payment;
      guard(async () => {
        await api(`/api/elite-tasks/jobs/${encodeURIComponent(id)}/payment`, {
          method: 'POST',
          body: JSON.stringify({ payment })
        });
        await loadWeek({ keepScroll: true });
        if (state.screen === 'reports') await loadReport();
        else openJob(id);
      });
      return;
    }
    if (action === 'manager-status') {
      guard(async () => {
        await api(`/api/elite-tasks/jobs/${encodeURIComponent(target.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: target.dataset.status })
        });
        toast('Status updated');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'delete-job') {
      const future = target.dataset.scope === 'future';
      if (!window.confirm(future ? 'Remove this clean and every later visit in the series?' : 'Remove this clean?')) return;
      guard(async () => {
        await api(`/api/elite-tasks/jobs/${encodeURIComponent(target.dataset.id)}?scope=${future ? 'future' : 'one'}`, { method: 'DELETE' });
        toast('Removed');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'extend-job') {
      if (!window.confirm('Schedule 12 more weeks of this repeat?')) return;
      guard(async () => {
        const result = await api(`/api/elite-tasks/jobs/${encodeURIComponent(target.dataset.id)}/extend`, {
          method: 'POST',
          body: JSON.stringify({ weeks: 12 })
        });
        toast(`Added ${result.added} more visits through ${prettyDate(result.lastDate)}.${mailNote(result)}`);
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'delete-block') {
      const label = target.dataset.label ? `${target.dataset.label}'s block` : 'this block';
      if (!window.confirm(`Clear ${label}?`)) return;
      guard(async () => {
        const path = MODE === 'cleaner'
          ? `/api/elite-tasks/me/blocks/${encodeURIComponent(target.dataset.id)}`
          : `/api/elite-tasks/blocks/${encodeURIComponent(target.dataset.id)}`;
        await api(path, { method: 'DELETE' });
        toast('Unavailable dates cleared');
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'toggle-staff') {
      const next = target.dataset.next === 'true';
      if (!window.confirm(next ? `Activate ${target.dataset.name}?` : `Deactivate ${target.dataset.name}? Their link will stop working.`)) return;
      guard(async () => {
        await api(`/api/elite-tasks/staff/${encodeURIComponent(target.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: next })
        });
        toast(next ? 'Cleaner activated' : 'Cleaner deactivated');
        await loadWeek({ keepScroll: true });
      });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (event.target.id !== 'newPropertyAddress' && event.target.id !== 'newPropertyName')) return;
    event.preventDefault();
    const button = document.querySelector('[data-action="add-booking-property"]');
    if (button) button.click();
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'propertySearch') {
      const form = document.getElementById('jobForm');
      if (form) form.dataset.propertyMode = 'search';
      renderPropertyResults(event.target.value);
    }
    if (event.target.id === 'propFilter') {
      state.propertyQuery = event.target.value;
      renderPropertyList();
    }
    const form = event.target.closest('#jobForm');
    if (!form) return;
    if (event.target.name === 'startTime') setChoice(form, 'time', event.target.value);
    if (event.target.name === 'durationMinutes') {
      const deep = form.elements.namedItem('deepClean').value === '1';
      setChoice(form, 'duration', deep ? 'deep' : event.target.value);
    }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.id === 'loginForm') {
      event.preventDefault();
      enterKiosk();
      const password = new FormData(form).get('password');
      guard(async () => {
        const response = await fetch('/api/elite-tasks/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showLogin(data.error || 'Incorrect password.');
        state.password = String(password || '');
        localStorage.setItem(PASS_KEY, state.password);
        await loadWeek();
      });
      return;
    }
    if (form.id === 'jobForm') {
      event.preventDefault();
      const applyTo = event.submitter && event.submitter.dataset.apply === 'future' ? 'future' : 'one';
      guard(() => submitJob(form, applyTo));
      return;
    }
    if (form.id === 'blockForm') {
      event.preventDefault();
      guard(async () => {
        const body = {
          staffId: form.elements.namedItem('staffId').value,
          startDate: form.elements.namedItem('startDate').value,
          endDate: form.elements.namedItem('endDate').value,
          note: form.elements.namedItem('note').value
        };
        if (MODE === 'manager' && !body.staffId) return toast('Choose a cleaner.');
        const path = MODE === 'cleaner' ? '/api/elite-tasks/me/blocks' : '/api/elite-tasks/blocks';
        await api(path, { method: 'POST', body: JSON.stringify(body) });
        toast('Dates blocked');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (form.id === 'propertyForm') {
      event.preventDefault();
      guard(async () => {
        await api(`/api/elite-tasks/properties/${encodeURIComponent(form.dataset.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            propertyName: form.elements.namedItem('propertyName').value,
            address: form.elements.namedItem('address').value,
            doorCode: form.elements.namedItem('doorCode').value,
            notes: form.elements.namedItem('notes').value
          })
        });
        toast('Customer saved');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (form.id === 'addPropertyForm') {
      event.preventDefault();
      guard(async () => {
        await api('/api/elite-tasks/properties', {
          method: 'POST',
          body: JSON.stringify({
            name: form.elements.namedItem('name').value,
            address: form.elements.namedItem('address').value,
            doorCode: form.elements.namedItem('doorCode').value,
            notes: form.elements.namedItem('notes').value
          })
        });
        toast('Customer added');
        state.propertyQuery = '';
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (form.id === 'staffForm') {
      event.preventDefault();
      guard(async () => {
        await api(`/api/elite-tasks/staff/${encodeURIComponent(form.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.elements.namedItem('name').value,
            email: form.elements.namedItem('email').value,
            emailAlerts: form.elements.namedItem('emailAlerts').value === '1'
          })
        });
        toast('Cleaner saved');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (form.id === 'addStaffForm') {
      event.preventDefault();
      guard(async () => {
        await api('/api/elite-tasks/staff', {
          method: 'POST',
          body: JSON.stringify({ name: form.elements.namedItem('name').value })
        });
        toast('Cleaner added');
        await loadWeek({ keepScroll: true });
      });
      return;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const sheet = document.getElementById('sheet');
    if (sheet && !sheet.hidden) {
      closeSheet();
      return;
    }
    if (menuOpen) {
      menuOpen = false;
      renderNav();
    }
  });

  if (MODE === 'cleaner') {
    loadWeek().catch((err) => showCleanerError(err.message));
  } else if (state.password) {
    loadWeek().catch((err) => {
      if (err.status !== 401) showLogin(err.message);
    });
  } else {
    showLogin();
  }
})();
