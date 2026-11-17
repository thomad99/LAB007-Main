'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED_STAFF = ['Petra', 'Sarah', 'Jill', 'Kylie'];
const COLORS = ['#0f6e56', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#3f6212'];
const RECURRENCE_DAYS = { once: 0, weekly: 7, biweekly: 14, every3: 21, every4: 28 };
const MAX_OCCURRENCES = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function resolveDataDir() {
  const explicit = String(process.env.ELITE_TASKS_DATA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'elite-tasks');
  return path.join(__dirname, '..', 'data', 'elite-tasks');
}

function normalizeSecret(raw, fallback) {
  if (raw == null || String(raw).trim() === '') return fallback;
  let pass = String(raw).trim();
  if (
    (pass.startsWith('"') && pass.endsWith('"')) ||
    (pass.startsWith("'") && pass.endsWith("'"))
  ) {
    pass = pass.slice(1, -1).trim();
  }
  return pass || fallback;
}

function expectedPassword() {
  const specific = normalizeSecret(process.env.ELITE_TASKS_PASSWORD, '');
  if (specific) return specific;
  return normalizeSecret(process.env.ELITE_INVOICES_AUTH_PASS, '');
}

function passwordsMatch(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash('sha256').update(String(given), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function newToken() {
  return crypto.randomBytes(18).toString('hex');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!/^[\p{L}][\p{L} .'-]{0,39}$/u.test(text)) {
    fail(400, 'Enter a name using letters.');
  }
  return text;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function assertDate(value, label) {
  if (!isIsoDate(value)) fail(400, `${label} must be a real date.`);
  return String(value);
}

function addDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function mondayOf(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function isTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return false;
  const [h, m] = String(value).split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function assertStartTime(value) {
  if (!isTime(value)) fail(400, 'Choose a start time.');
  const [hour] = String(value).split(':').map(Number);
  if (hour < 10) fail(400, 'The earliest start time is 10:00 AM.');
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

function rangesOverlap(aStart, aDur, bStart, bDur) {
  const as = timeToMinutes(aStart);
  const bs = timeToMinutes(bStart);
  return as < bs + bDur && bs < as + aDur;
}

function occurrenceDates(start, recurrence, weeksAhead) {
  const step = RECURRENCE_DAYS[recurrence];
  if (!step) return [start];
  const span = Math.min(52, Math.max(1, Number(weeksAhead) || 26)) * 7;
  const endExclusive = addDays(start, span);
  const dates = [];
  for (let date = start; date < endExclusive && dates.length < MAX_OCCURRENCES; date = addDays(date, step)) {
    dates.push(date);
  }
  return dates;
}

function field(row, name) {
  if (!row || typeof row !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const key = Object.keys(row).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? row[key] : '';
}

function columnKey(columns, name) {
  const found = (columns || []).find((item) => String(item).toLowerCase() === name.toLowerCase());
  if (found) return found;
  columns.push(name);
  return name;
}

function buildProperties(data) {
  const source = data && typeof data === 'object' ? data : {};
  const rows = Array.isArray(source.rows) ? source.rows : [];
  const bases = rows.map((row, index) => {
    const clientId = slug(field(row, 'Client ID'));
    return clientId || slug(`${field(row, 'Name')}-${field(row, 'Address')}`) || `row-${index + 1}`;
  });
  const counts = new Map();
  bases.forEach((base) => counts.set(base, (counts.get(base) || 0) + 1));
  const used = new Map();
  const properties = rows.map((row, index) => {
    let id = bases[index];
    if (counts.get(id) > 1) {
      const n = (used.get(id) || 0) + 1;
      used.set(id, n);
      id = `${id}-${n}`;
    }
    const clientId = cleanText(field(row, 'Client ID'), 80);
    const name = cleanText(field(row, 'Name'), 160);
    const address = cleanText(field(row, 'Address'), 240);
    return {
      id,
      index,
      clientId,
      name,
      address,
      phone: cleanText(field(row, 'Phone number'), 80),
      doorCode: cleanText(field(row, 'Access Code'), 80),
      notes: cleanText(field(row, 'Notes'), 4000),
      frequency: cleanText(field(row, 'Frequency'), 80),
      cleaner: cleanText(field(row, 'Cleaner'), 80),
      label: clientId || address || `Property ${index + 1}`
    };
  }).filter((item) => item.clientId || item.name || item.address);
  properties.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  return properties;
}

function patchClientProperty(data, propertyId, fields) {
  const source = data && typeof data === 'object' ? data : { columns: [], rows: [] };
  if (!Array.isArray(source.columns)) source.columns = [];
  if (!Array.isArray(source.rows)) source.rows = [];
  const props = buildProperties(source);
  const prop = props.find((item) => item.id === propertyId);
  if (!prop) fail(404, 'Property not found on the Elite Management client list.');
  const doorKey = columnKey(source.columns, 'Access Code');
  const notesKey = columnKey(source.columns, 'Notes');
  const row = source.rows[prop.index];
  if (!row || typeof row !== 'object') fail(404, 'Property not found on the Elite Management client list.');
  if (Object.prototype.hasOwnProperty.call(fields, 'doorCode')) {
    row[doorKey] = cleanText(fields.doorCode, 80);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'notes')) {
    row[notesKey] = cleanText(fields.notes, 4000);
  }
  return source;
}

function suggestRecurrence(frequency) {
  const text = String(frequency || '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.includes('bi')) return 'biweekly';
  if (text.includes('3')) return 'every3';
  if (text.includes('month') || text.includes('4 week')) return 'every4';
  if (text.includes('week')) return 'weekly';
  return 'once';
}

function seedStaff() {
  return SEED_STAFF.map((name, index) => ({
    id: slug(name),
    name,
    token: newToken(),
    color: COLORS[index % COLORS.length],
    active: true,
    createdAt: new Date().toISOString()
  }));
}

function ensurePetra(staff) {
  if (staff.some((person) => person.name.toLowerCase() === 'petra')) return false;
  let id = 'petra';
  let n = 2;
  while (staff.some((person) => person.id === id)) id = `petra-${n++}`;
  staff.push({
    id,
    name: 'Petra',
    token: newToken(),
    color: COLORS[staff.length % COLORS.length],
    active: true,
    createdAt: new Date().toISOString()
  });
  return true;
}

function daysBetween(fromIso, toIso) {
  const [ys, ms, ds] = String(fromIso).split('-').map(Number);
  const [ye, me, de] = String(toIso).split('-').map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86400000);
}

function alertPlan(cleanDate, input) {
  const alertDate = String((input && input.alertDate) || '').trim();
  const alertTime = String((input && input.alertTime) || '').trim();
  if (!alertDate && !alertTime) return null;
  if (!isIsoDate(alertDate)) fail(400, 'Choose an alert date.');
  if (!isTime(alertTime)) fail(400, 'Choose an alert time.');
  const offset = daysBetween(cleanDate, alertDate);
  if (offset < -14 || offset > 14) fail(400, 'Set the alert within 14 days of the clean.');
  return { offset, alertTime };
}

function normalizeState(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const staff = Array.isArray(data.staff) ? data.staff.map(normalizeStaff).filter(Boolean) : [];
  return {
    version: 1,
    staff: staff.length ? staff : seedStaff(),
    customers: Array.isArray(data.customers) ? normalizeCustomers(data.customers) : null,
    jobs: Array.isArray(data.jobs) ? data.jobs.map(normalizeJob).filter(Boolean) : [],
    blocks: Array.isArray(data.blocks) ? data.blocks.map(normalizeBlock).filter(Boolean) : []
  };
}

function normalizeCustomers(list) {
  const used = new Set();
  const customers = [];
  list.forEach((raw) => {
    const item = normalizeCustomer(raw);
    if (!item) return;
    let id = item.id;
    let n = 2;
    while (used.has(id)) id = `${item.id}-${n++}`;
    item.id = id;
    used.add(id);
    customers.push(item);
  });
  return customers;
}

function normalizeCustomer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 160);
  const address = cleanText(raw.address, 240);
  const id = slug(raw.id || name || address);
  if (!id || !name) return null;
  return {
    id,
    name,
    address,
    phone: cleanText(raw.phone, 80),
    doorCode: cleanText(raw.doorCode, 80),
    notes: cleanText(raw.notes, 4000),
    frequency: cleanText(raw.frequency, 80),
    cleaner: cleanText(raw.cleaner, 80),
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function customerFromImport(item) {
  return normalizeCustomer({
    id: item.id,
    name: item.name || item.clientId || item.address,
    address: item.address,
    phone: item.phone,
    doorCode: item.doorCode,
    notes: item.notes,
    frequency: item.frequency,
    cleaner: item.cleaner
  });
}

function normalizeStaff(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 40);
  const id = slug(raw.id || name);
  if (!id || !name) return null;
  return {
    id,
    name,
    token: cleanText(raw.token, 80) || newToken(),
    color: /^#[0-9a-fA-F]{6}$/.test(String(raw.color || '')) ? String(raw.color) : COLORS[0],
    active: raw.active !== false,
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function assignedIds(raw) {
  const ids = [];
  const list = Array.isArray(raw && raw.staffIds) ? raw.staffIds : [];
  list.forEach((id) => {
    const clean = cleanText(id, 80);
    if (clean && !ids.includes(clean)) ids.push(clean);
  });
  const single = cleanText(raw && raw.staffId, 80);
  if (single && !ids.includes(single)) ids.unshift(single);
  return ids.slice(0, 8);
}

function normalizeJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id, 40);
  const date = String(raw.date || '');
  const startTime = String(raw.startTime || '');
  if (!id || !isIsoDate(date) || !isTime(startTime)) return null;
  const recurrence = RECURRENCE_DAYS[raw.recurrence] != null ? raw.recurrence : 'once';
  const status = ['scheduled', 'acknowledged', 'completed'].includes(raw.status) ? raw.status : 'scheduled';
  const duration = Math.max(15, Math.min(480, parseInt(raw.durationMinutes, 10) || 120));
  const staffIds = assignedIds(raw);
  return {
    id,
    seriesId: cleanText(raw.seriesId, 40),
    recurrence,
    propertyId: cleanText(raw.propertyId, 80),
    propertyName: cleanText(raw.propertyName, 160),
    clientCode: cleanText(raw.clientCode, 80),
    address: cleanText(raw.address, 240),
    date,
    startTime,
    durationMinutes: duration,
    deepClean: raw.deepClean === true,
    staffId: staffIds[0] || '',
    staffIds,
    status,
    acknowledgedAt: status === 'scheduled' ? null : (cleanText(raw.acknowledgedAt, 40) || null),
    completedAt: status === 'completed' ? (cleanText(raw.completedAt, 40) || null) : null,
    visitNote: cleanText(raw.visitNote, 500),
    alertDate: isIsoDate(raw.alertDate) ? String(raw.alertDate) : '',
    alertTime: isTime(raw.alertTime) ? String(raw.alertTime) : '',
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id, 40);
  const startDate = String(raw.startDate || '');
  const endDate = String(raw.endDate || startDate);
  if (!id || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return null;
  return {
    id,
    staffId: cleanText(raw.staffId, 80),
    startDate,
    endDate,
    note: cleanText(raw.note, 200),
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function createStore(dataDir) {
  const dir = dataDir || resolveDataDir();
  const file = path.join(dir, 'tasks.json');
  let cache = null;
  let queue = Promise.resolve();

  function enqueue(fn) {
    const run = queue.then(fn, fn);
    queue = run.then(() => {}, () => {});
    return run;
  }

  function readFromDisk() {
    if (!fs.existsSync(file)) {
      const fresh = normalizeState({});
      writeFile(fresh);
      return fresh;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = normalizeState(parsed);
    const addedPetra = ensurePetra(state.staff);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length || addedPetra) writeFile(state);
    return state;
  }

  function writeFile(state) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    try {
      fs.renameSync(tmp, file);
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') throw err;
      fs.rmSync(file, { force: true });
      fs.renameSync(tmp, file);
    }
    cache = state;
  }

  function read() {
    if (!cache) cache = readFromDisk();
    return cache;
  }

  function mutate(fn) {
    return enqueue(() => {
      const copy = JSON.parse(JSON.stringify(read()));
      const result = fn(copy);
      writeFile(copy);
      return result;
    });
  }

  function view(fn) {
    return enqueue(() => fn(read()));
  }

  function staffById(state, id) {
    return state.staff.find((person) => person.id === id) || null;
  }

  function requireActiveStaff(state, staffId) {
    const person = staffById(state, staffId);
    if (!person || !person.active) fail(400, 'Choose an active cleaner.');
    return person;
  }

  function assignProperty(job, property) {
    job.propertyId = property.id;
    job.propertyName = cleanText(property.name || property.clientId || property.address, 160);
    job.clientCode = cleanText(property.clientId, 80);
    job.address = cleanText(property.address, 240);
  }

  function issuesFor(state, drafts, ignoreIds) {
    const skip = new Set(ignoreIds || []);
    const byName = new Map();
    drafts.forEach((draft) => {
      assignedIds(draft).forEach((staffId) => {
        const person = staffById(state, staffId);
        const name = person ? person.name : 'Cleaner';
        const row = byName.get(name) || { overlaps: 0, overlapOn: '' };
        const overlap = state.jobs.find((job) =>
          !skip.has(job.id) &&
          assignedIds(job).includes(staffId) &&
          job.date === draft.date &&
          rangesOverlap(job.startTime, job.durationMinutes, draft.startTime, draft.durationMinutes)
        );
        if (overlap) {
          row.overlaps += 1;
          if (!row.overlapOn) row.overlapOn = prettyDate(draft.date);
        }
        byName.set(name, row);
      });
    });
    const warnings = [];
    byName.forEach((row, name) => {
      if (row.overlaps) {
        const when = row.overlaps === 1 ? row.overlapOn : `${row.overlaps} days, first ${row.overlapOn}`;
        warnings.push(`${name} is already booked on ${when}.`);
      }
    });
    return warnings;
  }

  function isBlocked(state, staffId, date) {
    return state.blocks.some((item) =>
      item.staffId === staffId &&
      item.startDate <= date &&
      date <= item.endDate
    );
  }

  function assertBookable(state, drafts) {
    const hits = [];
    drafts.forEach((draft) => {
      assignedIds(draft).forEach((staffId) => {
        if (isBlocked(state, staffId, draft.date)) hits.push({ staffId, date: draft.date });
      });
    });
    if (!hits.length) return;
    hits.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.staffId).localeCompare(String(b.staffId)));
    const person = staffById(state, hits[0].staffId);
    const name = person ? person.name : 'This cleaner';
    const same = hits.filter((hit) => hit.staffId === hits[0].staffId);
    const first = prettyDate(same[0].date);
    const more = same.length > 1 ? ` and ${same.length - 1} other day${same.length === 2 ? '' : 's'}` : '';
    const others = [...new Set(hits.map((hit) => hit.staffId))].filter((id) => id !== hits[0].staffId);
    const also = others.length
      ? ` ${others.map((id) => (staffById(state, id) || {}).name || 'Another cleaner').join(' and ')} also blocked a selected day.`
      : '';
    fail(400, `${name} blocked ${first}${more}.${also} Choose another day or cleaner.`);
  }

  function collectStaff(state, input) {
    const ids = assignedIds(input);
    if (!ids.length) fail(400, 'Choose a cleaner.');
    ids.forEach((id) => requireActiveStaff(state, id));
    return ids;
  }

  function applyStatus(job, status) {
    const now = new Date().toISOString();
    if (status === 'scheduled') {
      job.status = 'scheduled';
      job.acknowledgedAt = null;
      job.completedAt = null;
      return;
    }
    if (status === 'acknowledged') {
      if (job.status === 'completed') return;
      job.status = 'acknowledged';
      job.acknowledgedAt = job.acknowledgedAt || now;
      return;
    }
    if (status === 'completed') {
      job.status = 'completed';
      job.completedAt = job.completedAt || now;
      return;
    }
    fail(400, 'Unknown status.');
  }

  return {
    file,
    view,
    createJobs(input) {
      return mutate((state) => {
        const date = assertDate(input.date, 'Date');
        assertStartTime(input.startTime);
        const duration = parseInt(input.durationMinutes, 10);
        if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
          fail(400, 'Duration must be between 15 minutes and 8 hours.');
        }
        const recurrence = String(input.recurrence || 'once');
        if (RECURRENCE_DAYS[recurrence] == null) fail(400, 'Choose how often this clean repeats.');
        const weeksAhead = Math.min(52, Math.max(1, parseInt(input.weeksAhead, 10) || 26));
        const staffIds = collectStaff(state, input);
        if (!input.property || !input.property.id) fail(400, 'Choose a property.');
        const dates = occurrenceDates(date, recurrence, weeksAhead);
        const seriesId = dates.length > 1 ? newId('s') : '';
        const now = new Date().toISOString();
        const plan = alertPlan(date, input);
        const jobs = dates.map((day) => {
          const job = {
            id: newId('j'),
            seriesId,
            recurrence,
            propertyId: '',
            propertyName: '',
            clientCode: '',
            address: '',
            date: day,
            startTime: input.startTime,
            durationMinutes: duration,
            deepClean: input.deepClean === true,
            staffId: staffIds[0],
            staffIds: staffIds.slice(),
            status: 'scheduled',
            acknowledgedAt: null,
            completedAt: null,
            visitNote: cleanText(input.visitNote, 500),
            alertDate: plan ? addDays(day, plan.offset) : '',
            alertTime: plan ? plan.alertTime : '',
            createdAt: now
          };
          assignProperty(job, input.property);
          return job;
        });
        assertBookable(state, jobs);
        const warnings = issuesFor(state, jobs);
        if (warnings.length && input.allowClash !== true) fail(409, warnings.join(' '));
        state.jobs.push(...jobs);
        return {
          count: jobs.length,
          firstDate: jobs[0].date,
          lastDate: jobs[jobs.length - 1].date,
          seriesId,
          warnings
        };
      });
    },
    updateJob(id, patch, property) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id);
        if (!job) fail(404, 'Clean not found.');
        const nextStaff = Array.isArray(patch.staffIds) || patch.staffId ? collectStaff(state, patch) : null;
        if (patch.startTime) assertStartTime(patch.startTime);
        if (patch.durationMinutes != null) {
          const duration = parseInt(patch.durationMinutes, 10);
          if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
            fail(400, 'Duration must be between 15 minutes and 8 hours.');
          }
          patch.durationMinutes = duration;
        }
        if (patch.date) assertDate(patch.date, 'Date');
        const hasAlert = Object.prototype.hasOwnProperty.call(patch, 'alertDate') || Object.prototype.hasOwnProperty.call(patch, 'alertTime');
        const anchorDate = patch.date || job.date;
        const plan = hasAlert ? alertPlan(anchorDate, patch) : null;
        const future = patch.applyTo === 'future' && job.seriesId;
        const targets = future
          ? state.jobs.filter((item) => item.seriesId === job.seriesId && item.date >= job.date)
          : [job];
        const scheduleChange = Boolean(nextStaff || patch.date || patch.startTime || patch.durationMinutes != null);
        if (nextStaff || patch.date) {
          assertBookable(state, targets.map((item) => ({
            staffIds: nextStaff || assignedIds(item),
            date: !future && item.id === job.id && patch.date ? patch.date : item.date
          })));
        }
        if (scheduleChange) {
          const drafts = targets.map((item) => ({
            staffIds: nextStaff || assignedIds(item),
            date: !future && item.id === job.id && patch.date ? patch.date : item.date,
            startTime: patch.startTime || item.startTime,
            durationMinutes: patch.durationMinutes != null ? patch.durationMinutes : item.durationMinutes
          }));
          const warnings = issuesFor(state, drafts, targets.map((item) => item.id));
          if (warnings.length && patch.allowClash !== true) fail(409, warnings.join(' '));
        }
        if (patch.status) applyStatus(job, patch.status);
        targets.forEach((item) => {
          let material = false;
          if (patch.startTime && item.startTime !== patch.startTime) {
            item.startTime = patch.startTime;
            material = true;
          }
          if (patch.durationMinutes && item.durationMinutes !== patch.durationMinutes) {
            item.durationMinutes = patch.durationMinutes;
            material = true;
          }
          if (typeof patch.deepClean === 'boolean' && Boolean(item.deepClean) !== patch.deepClean) {
            item.deepClean = patch.deepClean;
            material = true;
          }
          if (nextStaff && assignedIds(item).join('\n') !== nextStaff.join('\n')) {
            item.staffIds = nextStaff.slice();
            item.staffId = nextStaff[0];
            material = true;
          }
          if (property && item.propertyId !== property.id) {
            assignProperty(item, property);
            material = true;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'visitNote')) {
            item.visitNote = cleanText(patch.visitNote, 500);
          }
          if (hasAlert) {
            const itemDate = item.id === job.id && patch.date ? patch.date : item.date;
            item.alertDate = plan ? addDays(itemDate, plan.offset) : '';
            item.alertTime = plan ? plan.alertTime : '';
          }
          if (material && item.status !== 'completed') {
            item.status = 'scheduled';
            item.acknowledgedAt = null;
            item.completedAt = null;
          }
        });
        if (patch.date && !future && job.date !== patch.date) {
          job.date = patch.date;
          if (job.status !== 'completed') {
            job.status = 'scheduled';
            job.acknowledgedAt = null;
            job.completedAt = null;
          }
        }
        const warnings = issuesFor(state, targets, targets.map((item) => item.id));
        return { count: targets.length, warnings };
      });
    },
    deleteJobs(id, scope) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id);
        if (!job) fail(404, 'Clean not found.');
        const before = state.jobs.length;
        if (scope === 'future' && job.seriesId) {
          state.jobs = state.jobs.filter((item) => !(item.seriesId === job.seriesId && item.date >= job.date));
        } else {
          state.jobs = state.jobs.filter((item) => item.id !== id);
        }
        return { removed: before - state.jobs.length };
      });
    },
    extendSeries(id, weeks) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id);
        if (!job) fail(404, 'Clean not found.');
        if (!job.seriesId || !RECURRENCE_DAYS[job.recurrence]) fail(400, 'This clean does not repeat.');
        const step = RECURRENCE_DAYS[job.recurrence];
        const series = state.jobs.filter((item) => item.seriesId === job.seriesId).sort((a, b) => a.date.localeCompare(b.date));
        const span = Math.min(52, Math.max(1, parseInt(weeks, 10) || 12));
        if (series.length >= 80) fail(400, 'This repeat is already scheduled far ahead.');
        const last = series[series.length - 1];
        const endExclusive = addDays(last.date, span * 7 + 1);
        const alertOffset = last.alertDate && last.alertTime ? daysBetween(last.date, last.alertDate) : null;
        const created = [];
        for (let date = addDays(last.date, step); date < endExclusive && series.length + created.length < 80 && created.length < MAX_OCCURRENCES; date = addDays(date, step)) {
          if (assignedIds(last).some((id) => isBlocked(state, id, date))) continue;
          created.push({
            ...last,
            id: newId('j'),
            date,
            alertDate: alertOffset == null ? '' : addDays(date, alertOffset),
            alertTime: alertOffset == null ? '' : last.alertTime,
            status: 'scheduled',
            acknowledgedAt: null,
            completedAt: null,
            createdAt: new Date().toISOString()
          });
        }
        if (!created.length) fail(400, 'Nothing new to add.');
        state.jobs.push(...created);
        return { added: created.length, lastDate: created[created.length - 1].date };
      });
    },
    setStatus(id, status, staffId) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id && (!staffId || assignedIds(item).includes(staffId)));
        if (!job) fail(404, 'Clean not found.');
        applyStatus(job, status);
        return { id: job.id, status: job.status, acknowledgedAt: job.acknowledgedAt, completedAt: job.completedAt };
      });
    },
    unacknowledge(id, staffId) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id && (!staffId || assignedIds(item).includes(staffId)));
        if (!job) fail(404, 'Clean not found.');
        if (job.status !== 'acknowledged') fail(400, 'This clean is not acknowledged.');
        applyStatus(job, 'scheduled');
        return { id: job.id, status: job.status, acknowledgedAt: job.acknowledgedAt, completedAt: job.completedAt };
      });
    },
    addBlock(input) {
      return mutate((state) => {
        const person = requireActiveStaff(state, input.staffId);
        const startDate = assertDate(input.startDate, 'Start date');
        const endDate = assertDate(input.endDate || startDate, 'End date');
        if (endDate < startDate) fail(400, 'The end date is before the start date.');
        const [ys, ms, ds] = startDate.split('-').map(Number);
        const [ye, me, de] = endDate.split('-').map(Number);
        const span = Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86400000);
        if (span > 120) fail(400, 'Block 120 days or fewer at a time.');
        const covered = state.blocks.some((block) =>
          block.staffId === person.id && block.startDate <= startDate && endDate <= block.endDate
        );
        if (covered) fail(400, 'Those dates are already blocked.');
        const block = {
          id: newId('b'),
          staffId: person.id,
          startDate,
          endDate,
          note: cleanText(input.note, 200),
          createdAt: new Date().toISOString()
        };
        state.blocks.push(block);
        return block;
      });
    },
    deleteBlock(id, staffId) {
      return mutate((state) => {
        const block = state.blocks.find((item) => item.id === id && (!staffId || item.staffId === staffId));
        if (!block) fail(404, 'Blocked dates not found.');
        state.blocks = state.blocks.filter((item) => item.id !== id);
        return { removed: 1 };
      });
    },
    addStaff(name) {
      return mutate((state) => {
        const clean = cleanName(name);
        if (state.staff.some((person) => person.name.toLowerCase() === clean.toLowerCase())) {
          fail(400, `${clean} is already on the team.`);
        }
        const person = {
          id: slug(clean) || 'staff',
          name: clean,
          token: newToken(),
          color: COLORS[state.staff.length % COLORS.length],
          active: true,
          createdAt: new Date().toISOString()
        };
        const base = person.id;
        let n = 2;
        while (state.staff.some((item) => item.id === person.id)) {
          person.id = `${base}-${n++}`;
        }
        state.staff.push(person);
        return person;
      });
    },
    updateStaff(id, patch) {
      return mutate((state) => {
        const person = staffById(state, id);
        if (!person) fail(404, 'Cleaner not found.');
        if (patch.name) {
          const clean = cleanName(patch.name);
          if (state.staff.some((item) => item.id !== id && item.name.toLowerCase() === clean.toLowerCase())) {
            fail(400, `${clean} is already on the team.`);
          }
          person.name = clean;
        }
        if (typeof patch.active === 'boolean') person.active = patch.active;
        if (patch.rotateToken) person.token = newToken();
        return person;
      });
    },
    deleteStaff(id) {
      return mutate((state) => {
        const person = staffById(state, id);
        if (!person) fail(404, 'Cleaner not found.');
        if (state.jobs.some((job) => assignedIds(job).includes(id)) || state.blocks.some((block) => block.staffId === id)) {
          fail(400, 'Deactivate this cleaner instead. Their cleans stay on the calendar.');
        }
        state.staff = state.staff.filter((item) => item.id !== id);
        return { removed: 1 };
      });
    },
    listCustomers() {
      return view((state) => state.customers || []);
    },
    seedCustomers(incoming) {
      return mutate((state) => {
        if (Array.isArray(state.customers)) return { seeded: false, count: state.customers.length };
        const seeded = normalizeCustomers((incoming || []).map(customerFromImport).filter(Boolean));
        state.customers = seeded;
        return { seeded: true, count: seeded.length };
      });
    },
    addCustomer(input) {
      return mutate((state) => {
        const name = cleanText(input && input.name, 160);
        const address = cleanText(input && input.address, 240);
        if (!name) fail(400, 'Enter the customer name.');
        if (!address) fail(400, 'Enter the address.');
        if (!Array.isArray(state.customers)) state.customers = [];
        if (state.customers.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.address.toLowerCase() === address.toLowerCase())) {
          fail(400, 'That customer is already on the list.');
        }
        const customer = normalizeCustomer({
          id: slug(name),
          name,
          address,
          phone: input.phone,
          doorCode: input.doorCode,
          notes: input.notes
        });
        let n = 2;
        while (state.customers.some((item) => item.id === customer.id)) customer.id = `${slug(name)}-${n++}`;
        state.customers.push(customer);
        state.customers.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        return customer;
      });
    },
    updateCustomer(id, patch) {
      return mutate((state) => {
        const customers = state.customers || [];
        const customer = customers.find((item) => item.id === id);
        if (!customer) fail(404, 'Customer not found.');
        const name = Object.prototype.hasOwnProperty.call(patch, 'name') ? cleanText(patch.name, 160) : customer.name;
        const address = Object.prototype.hasOwnProperty.call(patch, 'address') ? cleanText(patch.address, 240) : customer.address;
        if (!name) fail(400, 'Enter the customer name.');
        if (!address) fail(400, 'Enter the address.');
        if (customers.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase() && item.address.toLowerCase() === address.toLowerCase())) {
          fail(400, 'That customer is already on the list.');
        }
        customer.name = name;
        customer.address = address;
        if (Object.prototype.hasOwnProperty.call(patch, 'phone')) customer.phone = cleanText(patch.phone, 80);
        if (Object.prototype.hasOwnProperty.call(patch, 'doorCode')) customer.doorCode = cleanText(patch.doorCode, 80);
        if (Object.prototype.hasOwnProperty.call(patch, 'notes')) customer.notes = cleanText(patch.notes, 4000);
        return customer;
      });
    },
    deleteCustomer(id) {
      return mutate((state) => {
        const customers = state.customers || [];
        if (!customers.some((item) => item.id === id)) fail(404, 'Customer not found.');
        state.customers = customers.filter((item) => item.id !== id);
        return { removed: 1 };
      });
    },
    findByToken(token) {
      return view((state) => {
        if (!token) return null;
        return state.staff.find((person) => person.active && passwordsMatch(token, person.token)) || null;
      });
    },
    snapshot(range) {
      return view((state) => {
        const from = assertDate(range.from, 'From');
        const to = assertDate(range.to, 'To');
        if (to < from) fail(400, 'The week range is backwards.');
        const blockFrom = range.blockFrom ? assertDate(range.blockFrom, 'Block from') : from;
        const blockTo = range.blockTo ? assertDate(range.blockTo, 'Block to') : to;
        const today = range.today && isIsoDate(range.today) ? range.today : from;
        const jobs = state.jobs
          .filter((job) => job.date >= from && job.date <= to)
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        const blocks = state.blocks
          .filter((block) => block.startDate <= blockTo && block.endDate >= blockFrom)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        const stats = {};
        state.jobs.forEach((job) => {
          assignedIds(job).forEach((id) => {
            const row = stats[id] || (stats[id] = { upcoming: 0, needsAck: 0 });
            if (job.date >= today && job.status !== 'completed') row.upcoming += 1;
            if (job.date >= today && job.status === 'scheduled') row.needsAck += 1;
          });
        });
        return { staff: state.staff, jobs, blocks, stats };
      });
    }
  };
}

module.exports = {
  SEED_STAFF,
  RECURRENCE_DAYS,
  resolveDataDir,
  expectedPassword,
  passwordsMatch,
  addDays,
  mondayOf,
  occurrenceDates,
  buildProperties,
  assignedIds,
  patchClientProperty,
  suggestRecurrence,
  createStore,
  isIsoDate
};
