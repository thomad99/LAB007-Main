(() => {
  const TOKEN_MATCH = location.pathname.match(/\/Elite-TaskMgmt\/(?:c|[a-z0-9-]+)\/([a-f0-9]{32,})\/?$/i);
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
    weekStart: todayISO(),
    screen: 'week',
    filter: 'all',
    propertyQuery: '',
    data: null,
    saving: false,
    staffPicked: false,
    recurrencePicked: false,
    zoomDays: Number(localStorage.getItem('eliteTasksZoomDays')) || 0
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

  function weekTitle(start) {
    const left = dateParts(start);
    const end = dateParts(addDays(start, 6));
    if (left.getMonth() === end.getMonth() && left.getFullYear() === end.getFullYear()) {
      return left.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (left.getFullYear() === end.getFullYear()) {
      return `${left.toLocaleDateString(undefined, { month: 'short' })} – ${end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
    }
    return `${left.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
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

  function showLogin(message) {
    if (MODE === 'cleaner') return showCleanerError(message || 'This link is not valid.');
    hideBoot();
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

  function blocksOn(date) {
    return ((state.data && state.data.blocks) || []).filter((block) => {
      if (block.startDate > date || block.endDate < date) return false;
      if (state.filter !== 'all' && state.filter !== 'needs' && block.staffId !== state.filter) return false;
      return true;
    });
  }

  function overlaps(job, jobs) {
    const start = (value) => {
      const [hour, minute] = String(value).split(':').map(Number);
      return hour * 60 + minute;
    };
    return jobs.some((other) => {
      if (other.id === job.id || other.date !== job.date) return false;
      if (!jobStaffIds(job).some((id) => jobStaffIds(other).includes(id))) return false;
      const a = start(job.startTime);
      const b = start(other.startTime);
      return a < b + other.durationMinutes && b < a + job.durationMinutes;
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
    if (state.screen === 'properties' && MODE === 'manager') renderProperties();
    else if (state.screen === 'staff' && MODE === 'manager') renderStaff();
    else renderWeek();
  }

  function renderNav() {
    if (MODE !== 'manager') {
      tabs.innerHTML = '';
      bottomNav.hidden = true;
      return;
    }
    const html = [['week', 'Week'], ['properties', 'Properties'], ['staff', 'Staff']].map(([id, label]) =>
      `<button type="button" data-action="screen" data-screen="${id}" class="${state.screen === id ? 'on' : ''}">${label}</button>`
    ).join('');
    tabs.innerHTML = html;
    bottomNav.innerHTML = html;
    bottomNav.hidden = false;
  }

  function placeLabel(job) {
    return job.clientId || job.propertyName || 'Property';
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
    toolbar.innerHTML = `
      <div class="weekbar">
        <div class="week-nav">
          <button type="button" class="btn ghost" data-action="prev-week" aria-label="Previous week">‹</button>
          <button type="button" class="btn ghost" data-action="this-week">Today</button>
          <button type="button" class="btn ghost" data-action="next-week" aria-label="Next week">›</button>
          <button type="button" class="btn ghost" data-action="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" class="btn ghost" data-action="zoom-in" aria-label="Zoom in">+</button>
        </div>
        <div class="week-title">
          <strong>${esc(weekTitle(state.weekStart))}</strong>
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

  function renderWeek() {
    const jobs = visibleJobs();
    const allJobs = (state.data && state.data.jobs) || [];
    const today = todayISO();
    const days = Array.from({ length: 28 }, (_, index) => addDays(state.weekStart, index - 14));
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const span = gridWindow(jobs);
    const hours = [];
    for (let minute = span.start; minute < span.end; minute += 60) hours.push(minute);
    const hourPx = calendarHourPx();
    const height = hours.length * hourPx;
    const nowTop = nowLineTop(today, span, hourPx);
    view.innerHTML = `<div class="gcal" id="gcal">
      <div class="gcal-head">
        <div class="gcal-time"></div>
        ${days.map((date) => `<div class="gcal-dayhead ${date === today ? 'today' : ''}" data-date="${date}">
          <span class="gcal-dow">${names[weekdayIndex(date)]}</span>
          <span class="gcal-dom ${date === today ? 'today' : ''}">${dateParts(date).getDate()}</span>
          ${MODE === 'manager' ? `<button type="button" class="gcal-plus" data-action="add" data-date="${date}" aria-label="Add a clean on ${esc(prettyDate(date))}">+</button>` : ''}
        </div>`).join('')}
      </div>
      <div class="gcal-body">
        <div class="gcal-time">${hours.map((minute) => `<div class="gcal-hour"><span>${esc(formatTime(minutesToTime(minute)))}</span></div>`).join('')}</div>
        ${days.map((date) => {
          const placed = placeJobs(jobs.filter((job) => job.date === date)).placed;
          return `<div class="gcal-col ${date === today ? 'today' : ''}" style="height:${height}px">
            ${date === today && nowTop != null ? `<div class="gcal-now" style="top:${nowTop}px"></div>` : ''}
            ${placed.map((item) => renderEvent(item, span, hourPx, allJobs)).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>${renderBlockedList()}`;
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
    const gutter = scroller.querySelector('.gcal-head .gcal-time');
    if (head && gutter) {
      const delta = head.getBoundingClientRect().left - (scroller.getBoundingClientRect().left + gutter.getBoundingClientRect().width);
      scroller.scrollLeft += delta;
    }
    const line = scroller.querySelector('.gcal-now');
    if (line) {
      const lineTop = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, lineTop - 90);
    }
  }

  function mobileCalendar() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function zoomDays() {
    const chosen = Number(state.zoomDays);
    if (chosen >= 1 && chosen <= 7) return chosen;
    return mobileCalendar() ? 2 : 7;
  }

  function calendarHourPx() {
    const base = mobileCalendar() ? 2 : 7;
    return Math.max(40, Math.min(110, Math.round(52 * base / zoomDays())));
  }

  function setZoomDays(days) {
    const next = Math.min(7, Math.max(1, days));
    if (next === zoomDays() && state.zoomDays === next) return;
    state.zoomDays = next;
    localStorage.setItem('eliteTasksZoomDays', String(next));
    render();
  }

  function layoutCalendar() {
    const scroller = document.getElementById('gcal');
    if (!scroller) return;
    const count = scroller.querySelectorAll('.gcal-dayhead').length || 28;
    const slot = Math.max(1, Math.floor((scroller.clientWidth - 56) / zoomDays()));
    const columns = `56px ${Array.from({ length: count }, () => `${slot}px`).join(' ')}`;
    scroller.style.setProperty('--hour-px', `${calendarHourPx()}px`);
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

  window.addEventListener('resize', () => layoutCalendar());

  function gridWindow(jobs) {
    let start = 10 * 60;
    let end = 19 * 60;
    jobs.forEach((job) => {
      const begin = minutesOf(job.startTime);
      const finish = begin + (Number(job.durationMinutes) || 60);
      start = Math.min(start, Math.floor(begin / 60) * 60);
      end = Math.max(end, Math.ceil(finish / 60) * 60);
    });
    start = Math.max(0, start);
    end = Math.min(24 * 60, Math.max(end, start + 60));
    return { start, end };
  }

  function minutesToTime(total) {
    const hour = Math.floor(total / 60) % 24;
    const minute = total % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function nowLineTop(today, span, hourPx) {
    const first = addDays(state.weekStart, -14);
    const last = addDays(state.weekStart, 13);
    if (today < first || today > last) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < span.start || minutes > span.end) return null;
    return ((minutes - span.start) / 60) * hourPx;
  }

  function placeJobs(dayJobs) {
    const sorted = [...dayJobs].sort((a, b) =>
      minutesOf(a.startTime) - minutesOf(b.startTime) ||
      String(a.staffName || '').localeCompare(String(b.staffName || '')) ||
      String(a.id).localeCompare(String(b.id))
    );
    const items = sorted.map((job) => {
      const start = minutesOf(job.startTime);
      const end = start + (Number(job.durationMinutes) || 60);
      return { job, start, end, lane: 0, laneCount: 1 };
    });
    let maxLanes = 1;
    let index = 0;
    while (index < items.length) {
      let clusterEnd = items[index].end;
      let next = index + 1;
      const cluster = [items[index]];
      while (next < items.length && items[next].start < clusterEnd) {
        cluster.push(items[next]);
        clusterEnd = Math.max(clusterEnd, items[next].end);
        next += 1;
      }
      const laneEnds = [];
      cluster.forEach((item) => {
        let lane = laneEnds.findIndex((until) => until <= item.start);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(item.end);
        } else {
          laneEnds[lane] = item.end;
        }
        item.lane = lane;
      });
      const laneCount = Math.max(1, laneEnds.length);
      cluster.forEach((item) => { item.laneCount = laneCount; });
      maxLanes = Math.max(maxLanes, laneCount);
      index = next;
    }
    return { placed: items, lanes: maxLanes };
  }

  function renderEvent(item, span, hourPx, allJobs) {
    const job = item.job;
    const top = ((item.start - span.start) / 60) * hourPx;
    const height = Math.max(22, ((item.end - item.start) / 60) * hourPx - 3);
    const width = 100 / item.laneCount;
    const tone = job.status === 'acknowledged' || job.status === 'completed' ? job.status : 'scheduled';
    const flags = [];
    if (overlaps(job, allJobs)) flags.push('Overlaps');
    if (blocksOn(job.date).some((block) => !block.staffId || jobStaffIds(job).includes(block.staffId))) flags.push('Unavailable');
    const who = MODE === 'manager' ? job.staffName || '' : '';
    const place = placeLabel(job);
    return `<button type="button" class="gcal-event ${tone}" data-action="open-job" data-id="${esc(job.id)}" title="${esc(`${formatRange(job.startTime, job.durationMinutes)} ${place}`)}" style="top:${top}px;height:${height}px;left:calc(${item.lane * width}% + 2px);width:calc(${width}% - 4px)">
      <strong>${esc(formatTime(job.startTime))}${who ? ` · ${esc(who)}` : ''}</strong>
      ${job.deepClean ? '<span>Deep clean</span>' : ''}
      <span>${esc(place)}</span>
      ${job.address ? `<span>${esc(job.address)}</span>` : ''}
      ${flags.length && height > 46 ? `<span>${esc(flags.join(' · '))}</span>` : ''}
    </button>`;
  }

  function renderBlockedList() {
    if (MODE !== 'cleaner') return '';
    const today = todayISO();
    const blocks = ((state.data && state.data.blocks) || []).filter((block) => block.endDate >= today);
    const rows = blocks.length ? blocks.map((block) => `<div class="unavail">${esc(prettyDate(block.startDate))}${block.endDate === block.startDate ? '' : ` – ${esc(prettyDate(block.endDate))}`}${block.note ? ` · ${esc(block.note)}` : ''}
      <div><button type="button" class="btn danger small" data-action="delete-block" data-id="${esc(block.id)}">Remove</button></div></div>`).join('') : '<p class="hint">No upcoming days blocked.</p>';
    return `<section class="panel" style="margin-top:14px"><h2>Days you cannot work</h2>${rows}<div class="row-actions"><button type="button" class="btn ghost" data-action="block-range">Block dates</button></div></section>`;
  }

  function renderProperties() {
    const query = state.propertyQuery;
    view.innerHTML = `
      <p class="hint">This customer list is only for scheduling.</p>
      <label>Find a customer
        <input id="propFilter" type="search" placeholder="Name or address" value="${esc(query)}">
      </label>
      <div id="propertyList" class="stack"></div>
      <form id="addPropertyForm" class="panel" style="margin-top:12px">
        <h2>Add a customer</h2>
        <label>Name<input name="name" type="text" maxlength="160" required placeholder="Customer or property name"></label>
        <label>Address<input name="address" type="text" maxlength="240" required placeholder="Street address"></label>
        <label>Phone<input name="phone" type="text" maxlength="80" placeholder="Optional"></label>
        <label>Door code<input name="doorCode" type="text" maxlength="80" autocomplete="off" placeholder="Optional"></label>
        <button class="btn primary block" type="submit">Add customer</button>
      </form>`;
    renderPropertyList();
  }

  function renderPropertyList() {
    const box = document.getElementById('propertyList');
    if (!box) return;
    const q = state.propertyQuery.trim().toLowerCase();
    const list = ((state.data && state.data.properties) || []).filter((property) => {
      if (!q) return true;
      return `${property.name || ''} ${property.label || ''} ${property.address || ''} ${property.doorCode || ''} ${property.notes || ''}`.toLowerCase().includes(q);
    });
    if (!list.length) {
      box.innerHTML = '<p class="hint">No customers yet. Add one below.</p>';
      return;
    }
    box.innerHTML = list.map((property) => `<article class="prop-card">
      <h3>${esc(property.name || property.label || 'Customer')}</h3>
      <p class="hint">${esc(property.address || 'No address')}</p>
      <p><strong>Door code:</strong> ${property.doorCode ? esc(property.doorCode) : '<span class="hint">not set</span>'}</p>
      ${property.notes ? `<p class="pre">${esc(property.notes)}</p>` : ''}
      <div class="row-actions">
        <button type="button" class="btn primary" data-action="edit-property" data-id="${esc(property.id)}">Edit</button>
        <button type="button" class="btn danger" data-action="delete-property" data-id="${esc(property.id)}" data-name="${esc(property.name || 'this customer')}">Delete</button>
      </div>
    </article>`).join('');
  }

  function staffSlug(name) {
    return String(name || 'cleaner').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cleaner';
  }

  function staffUrl(person) {
    return `${location.origin}/Elite-TaskMgmt/${staffSlug(person.name)}/${person.token}`;
  }

  function renderStaff() {
    const list = people();
    view.innerHTML = `<p class="hint">Copy a private link and text it to that cleaner. The link is their sign-in. These pages are hidden from Google.</p>
      <div class="stack">${list.map((person) => {
        const url = staffUrl(person);
        return `<article class="staff-card">
          <h3 class="person"><span class="dot" style="background:${safeColor(person.color)}"></span>${esc(person.name)}${person.active ? '' : ' · inactive'}</h3>
          <p class="hint">${person.upcoming || 0} upcoming · ${person.needsAck || 0} not acknowledged${person.name === 'Petra' ? ' · admin, can be assigned cleans' : ''}</p>
          <label>Private link for ${esc(person.name)}<input type="text" readonly value="${esc(url)}" data-link-for="${esc(person.id)}"></label>
          <div class="row-actions">
            <button type="button" class="btn primary" data-action="copy-link" data-id="${esc(person.id)}">Copy ${esc(person.name)}'s link</button>
            <button type="button" class="btn ghost" data-action="rotate-link" data-id="${esc(person.id)}" data-name="${esc(person.name)}">New link</button>
            <button type="button" class="btn ghost" data-action="rename-staff" data-id="${esc(person.id)}" data-name="${esc(person.name)}">Rename</button>
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

  function openSheet(html) {
    document.getElementById('sheetBody').innerHTML = html;
    document.getElementById('sheet').hidden = false;
    const title = document.getElementById('sheetTitle');
    if (title) title.focus();
  }

  function closeSheet() {
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
  }

  function jobForm(job) {
    const editing = job.mode === 'edit';
    const chosen = jobStaffIds(job);
    return `<form id="jobForm" data-mode="${editing ? 'edit' : 'create'}" data-id="${esc(job.id || '')}">
      ${sheetHead(editing ? 'Edit clean' : 'Add a clean')}
      <input type="hidden" name="propertyId" value="${esc(job.propertyId || '')}">
      <input type="hidden" name="staffIds" value="${esc(chosen.join(','))}">
      <input type="hidden" name="recurrence" value="${esc(job.recurrence || 'once')}">
      <label>Property
        <input id="propertySearch" type="search" placeholder="Search or type a new name" autocomplete="off">
      </label>
      <div id="propertyChosen">${job.propertyId ? `<p class="hint">Selected: ${esc(placeLabel(job))}${job.address ? ` · ${esc(job.address)}` : ''}</p>` : '<p class="hint">Search an existing customer, or type a new name to add one.</p>'}</div>
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
          <p class="hint">Weekly and every-2-weeks cleans are booked now, one visit at a time, so each can be acknowledged.</p>
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
    const href = phoneHref(job.phone);
    const phone = job.phone ? (href ? `<p><a href="${esc(href)}">${esc(job.phone)}</a></p>` : `<p>${esc(job.phone)}</p>`) : '';
    const ackLine = job.acknowledgedAt ? `<p class="hint">Acknowledged ${esc(formatStamp(job.acknowledgedAt))}</p>` : (job.status === 'completed' ? '<p class="hint">Completed without a separate acknowledgement.</p>' : '<p class="summary warn">Not acknowledged yet.</p>');
    const doneLine = job.completedAt ? `<p class="hint">Completed ${esc(formatStamp(job.completedAt))}</p>` : '';
    const managerActions = MODE === 'manager' ? `<div class="stack">
      <button type="button" class="btn ghost" data-action="edit-job" data-id="${esc(job.id)}">Edit</button>
      ${job.status !== 'completed' ? `<button type="button" class="btn primary" data-action="manager-status" data-id="${esc(job.id)}" data-status="completed">Mark completed</button>` : ''}
      ${job.status !== 'scheduled' ? `<button type="button" class="btn ghost" data-action="manager-status" data-id="${esc(job.id)}" data-status="scheduled">Mark not acknowledged</button>` : ''}
      ${job.seriesId ? `<button type="button" class="btn ghost" data-action="extend-job" data-id="${esc(job.id)}">Add 12 more weeks</button>` : ''}
      <button type="button" class="btn danger" data-action="delete-job" data-id="${esc(job.id)}" data-scope="one">Delete this visit</button>
      ${job.seriesId ? `<button type="button" class="btn danger" data-action="delete-job" data-id="${esc(job.id)}" data-scope="future">Delete this and future visits</button>` : ''}
    </div>` : `<div class="stack">
      ${job.status === 'scheduled' ? `<button type="button" class="btn blue" data-action="ack" data-id="${esc(job.id)}">Acknowledge</button>` : ''}
      ${job.status === 'acknowledged' ? `<button type="button" class="btn ghost" data-action="unack" data-id="${esc(job.id)}">Un-acknowledge</button>` : ''}
      ${job.status !== 'completed' ? `<button type="button" class="btn primary" data-action="complete" data-id="${esc(job.id)}">Mark completed</button>` : ''}
    </div>`;
    openSheet(`<div>
      ${sheetHead(esc(placeLabel(job)))}
      <p><strong>${esc(prettyDate(job.date))}</strong> · ${esc(formatRange(job.startTime, job.durationMinutes))}${job.deepClean ? ' · Deep clean' : ''}</p>
      ${job.address ? `<p>${esc(job.address)}</p>` : ''}
      ${MODE === 'manager' ? `<p class="person"><span class="dot" style="background:${safeColor(job.staffColor)}"></span>${esc(job.staffName || 'Unassigned')}</p>` : ''}
      <p><span class="pill ${esc(job.status)}">${esc(statusLabel(job.status))}</span> ${job.seriesId ? esc(REC[job.recurrence] || '') : ''}</p>
      ${ackLine}${doneLine}
      <div class="code-box"><span>Door code</span><strong>${job.doorCode ? esc(job.doorCode) : 'None on file'}</strong>${job.doorCode ? `<button type="button" class="btn ghost small" data-action="copy-text" data-text="${esc(job.doorCode)}">Copy code</button>` : ''}</div>
      ${phone}
      ${job.propertyNotes ? `<p class="pre"><strong>Property notes</strong><br>${esc(job.propertyNotes)}</p>` : ''}
      ${job.visitNote ? `<p class="pre"><strong>This visit</strong><br>${esc(job.visitNote)}</p>` : ''}
      ${managerActions}
    </div>`);
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
      ${sheetHead('Edit customer')}
      <label>Name<input name="name" type="text" maxlength="160" required value="${esc(property.name || '')}"></label>
      <label>Address<input name="address" type="text" maxlength="240" required value="${esc(property.address || '')}"></label>
      <label>Phone<input name="phone" type="text" maxlength="80" value="${esc(property.phone || '')}"></label>
      <label>Door code<input name="doorCode" type="text" maxlength="80" autocomplete="off" value="${esc(property.doorCode || '')}"></label>
      <label>Notes<textarea name="notes" maxlength="4000">${esc(property.notes || '')}</textarea></label>
      <p class="hint">Saved only on this schedule.</p>
      <button class="btn primary block" type="submit">Save customer</button>
    </form>`);
  }

  function setChoice(form, group, value) {
    const hidden = form.elements.namedItem(group);
    if (hidden) hidden.value = value;
    form.querySelectorAll(`[data-group="${group}"]`).forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.value === value ? 'true' : 'false');
    });
  }

  function renderPropertyResults(query) {
    const box = document.getElementById('propertyResults');
    const form = document.getElementById('jobForm');
    if (!box || !form) return;
    const selected = form.elements.namedItem('propertyId').value;
    const raw = String(query || '').trim();
    const q = raw.toLowerCase();
    const props = (state.data && state.data.properties) || [];
    let list = [];
    if (q) list = props.filter((property) => `${property.name || ''} ${property.label || ''} ${property.address || ''}`.toLowerCase().includes(q)).slice(0, 12);
    else if (selected) list = props.filter((property) => property.id === selected);
    const keptAddress = document.getElementById('newPropertyAddress')?.value || '';
    const matches = list.map((property) => `<button type="button" class="pick ${property.id === selected ? 'on' : ''}" data-action="pick-property" data-id="${esc(property.id)}">
      <strong>${esc(property.label || property.name)}</strong><span>${esc(property.address || 'No address')}</span>
    </button>`).join('');
    const addNew = raw ? `<div class="pick">
      <strong>Add ${esc(raw)}</strong>
      <label>Address<input id="newPropertyAddress" type="text" maxlength="240" placeholder="Street address" value="${esc(keptAddress)}"></label>
      <button type="button" class="btn primary" data-action="add-booking-property" data-name="${esc(raw)}">Add customer</button>
    </div>` : '';
    box.innerHTML = matches || addNew ? `${matches}${addNew}` : (q ? '<p class="hint">No matching customer.</p>' : '');
  }

  async function addBookingProperty(name) {
    const address = document.getElementById('newPropertyAddress')?.value || '';
    if (!String(name || '').trim()) return toast('Type the customer name.');
    if (!String(address).trim()) return toast('Enter the address.');
    const created = await api('/api/elite-tasks/properties', {
      method: 'POST',
      body: JSON.stringify({ name, address })
    });
    const property = { ...created.property, label: created.property.name };
    if (!state.data.properties) state.data.properties = [];
    state.data.properties.push(property);
    state.data.properties.sort((a, b) => String(a.name || a.label).localeCompare(String(b.name || b.label), undefined, { numeric: true, sensitivity: 'base' }));
    const search = document.getElementById('propertySearch');
    if (search) search.value = '';
    pickProperty(property.id);
    toast('Customer added');
  }

  function pickProperty(id) {
    const form = document.getElementById('jobForm');
    if (!form) return;
    form.elements.namedItem('propertyId').value = id;
    const property = ((state.data && state.data.properties) || []).find((item) => item.id === id);
    const chosen = document.getElementById('propertyChosen');
    if (property && chosen) {
      chosen.innerHTML = `<p class="hint">Selected: ${esc(property.label)}. ${property.frequency ? `Frequency on file: ${esc(property.frequency)}. ` : ''}${property.cleaner ? `Cleaner on file: ${esc(property.cleaner)}.` : ''}</p>`;
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
    renderPropertyResults(document.getElementById('propertySearch')?.value || '');
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
        await api(`/api/elite-tasks/jobs/${encodeURIComponent(form.dataset.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast(applyTo === 'future' ? 'Updated this visit and the future visits.' : 'Visit updated.');
      } else {
        body.recurrence = form.elements.namedItem('recurrence').value || 'once';
        body.weeksAhead = Number((form.elements.namedItem('weeksAhead') || {}).value || 26);
        const result = await api('/api/elite-tasks/jobs', { method: 'POST', body: JSON.stringify(body) });
        const noun = result.count === 1 ? 'clean' : 'cleans';
        toast(`Booked ${result.count} ${noun} through ${prettyDate(result.lastDate)}.`);
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
    if (action === 'screen') {
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
    if (action === 'add-booking-property') {
      guard(() => addBookingProperty(target.dataset.name));
      return;
    }
    if (action === 'copy-text') {
      guard(async () => {
        await navigator.clipboard.writeText(target.dataset.text || '');
        toast('Copied');
      });
      return;
    }
    if (action === 'copy-link') {
      const input = document.querySelector(`[data-link-for="${CSS.escape(target.dataset.id)}"]`);
      const text = input ? input.value : '';
      guard(async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Link copied');
        } catch {
          if (input) input.select();
          toast('Select the link and copy it');
        }
      });
      return;
    }
    if (action === 'ack' || action === 'complete' || action === 'unack') {
      guard(async () => {
        const path = action === 'ack' ? 'ack' : action === 'unack' ? 'unack' : 'complete';
        await api(`/api/elite-tasks/me/jobs/${encodeURIComponent(target.dataset.id)}/${path}`, { method: 'POST', body: '{}' });
        toast(action === 'ack' ? 'Acknowledged' : action === 'unack' ? 'Not acknowledged' : 'Marked completed');
        closeSheet();
        await loadWeek({ keepScroll: true });
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
        toast(`Added ${result.added} more visits through ${prettyDate(result.lastDate)}.`);
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
    if (action === 'rotate-link') {
      if (!window.confirm(`Create a new link for ${target.dataset.name}? The old link will stop working.`)) return;
      guard(async () => {
        await api(`/api/elite-tasks/staff/${encodeURIComponent(target.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ rotateToken: true })
        });
        toast('New link ready');
        await loadWeek({ keepScroll: true });
      });
      return;
    }
    if (action === 'rename-staff') {
      openSheet(`<form id="renameForm" data-id="${esc(target.dataset.id)}">
        ${sheetHead('Rename cleaner')}
        <label>Name<input name="name" type="text" maxlength="40" required value="${esc(target.dataset.name || '')}"></label>
        <button class="btn primary block" type="submit" style="margin-top:14px">Save name</button>
      </form>`);
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
    if (event.key !== 'Enter' || event.target.id !== 'newPropertyAddress') return;
    event.preventDefault();
    const button = document.querySelector('[data-action="add-booking-property"]');
    if (button) button.click();
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'propertySearch') renderPropertyResults(event.target.value);
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
            name: form.elements.namedItem('name').value,
            address: form.elements.namedItem('address').value,
            phone: form.elements.namedItem('phone').value,
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
            phone: form.elements.namedItem('phone').value,
            doorCode: form.elements.namedItem('doorCode').value
          })
        });
        toast('Customer added');
        state.propertyQuery = '';
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
    if (form.id === 'renameForm') {
      event.preventDefault();
      guard(async () => {
        await api(`/api/elite-tasks/staff/${encodeURIComponent(form.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.elements.namedItem('name').value })
        });
        toast('Name saved');
        closeSheet();
        await loadWeek({ keepScroll: true });
      });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
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
