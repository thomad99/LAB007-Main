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

function newStaffCode(used) {
  const taken = used || new Set();
  let code = '';
  do {
    code = crypto.randomBytes(4).toString('hex');
  } while (taken.has(code));
  return code;
}

function ensureStaffCodes(staff) {
  const used = new Set();
  let changed = false;
  staff.forEach((person) => {
    const current = String(person.token || '').toLowerCase();
    if (/^[a-f0-9]{8}$/.test(current) && !used.has(current)) {
      person.token = current;
      used.add(current);
      return;
    }
    const code = newStaffCode(used);
    person.token = code;
    used.add(code);
    changed = true;
  });
  return changed;
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

function sundayOf(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
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
  const used = new Set();
  return SEED_STAFF.map((name, index) => {
    const token = newStaffCode(used);
    used.add(token);
    return {
      id: slug(name),
      name,
      email: '',
      emailAlerts: false,
      calendarSync: true,
      token,
      color: COLORS[index % COLORS.length],
      active: true,
      createdAt: new Date().toISOString()
    };
  });
}

function ensurePetra(staff) {
  if (staff.some((person) => person.name.toLowerCase() === 'petra')) return false;
  let id = 'petra';
  let n = 2;
  while (staff.some((person) => person.id === id)) id = `petra-${n++}`;
  staff.push({
    id,
    name: 'Petra',
    email: '',
    emailAlerts: false,
    calendarSync: true,
    token: newStaffCode(new Set(staff.map((person) => String(person.token || '').toLowerCase()))),
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
    blocks: Array.isArray(data.blocks) ? data.blocks.map(normalizeBlock).filter(Boolean) : [],
    calendarToken: /^[a-f0-9]{32,}$/i.test(String(data.calendarToken || '')) ? String(data.calendarToken) : '',
    calendarSync: data.calendarSync !== false,
    customersSource: data.customersSource === 'management-clients' ? 'management-clients' : '',
    extraProperties: data.extraProperties === 'siesta-rentals' ? 'siesta-rentals' : ''
  };
}

const EXTRA_PROPERTIES = [
  ['1010A Point of Rocks', '1010A Point of Rocks'],
  ['1010 Point of Rocks', '1010 Point of Rocks'],
  ['1012 Point of Rocks', '1012 Point of Rocks'],
  ['1010 - 1012', '1010 - 1012 Point of Rocks'],
  ['1386 Moonmist', '1386 Moonmist'],
  ['Alameda', '2400 Alameda Ave'],
  ['Banyan', '4171 Roberts Point Rd'],
  ['Bay Shore Cottage', '4522 Bayshore Rd Front Cottage'],
  ['Bay Shore House', '4523 Bayshore Rd Back House'],
  ['Bohemian', '2432 Alameda Ave'],
  ['Coastal Chic', '2448 Valencia Dr.'],
  ['Coralline', '1143 N Moonmist Crt'],
  ['Dreamview', '564 Beach Rd #3'],
  ['Garden Villa', '1149 N Moonmist Crt'],
  ['Gulf and Bay Paradise', '5770 Midnight Pass Rd #110C'],
  ['Jamaica Royale #203', '5831 Midnight Pass Rd #203'],
  ['Jamaica Royale #806', '5830 Midnight Pass Rd #806'],
  ['Jamaica Royale #T22', '5831 Midnight Pass Rd T22'],
  ['Laughing Gull', '1272 Moonmist Circle'],
  ["Lil' Nauti", '1211 Moonmist Circle'],
  ['Paradise Palms', '1204 Moonmist Circle'],
  ['Patterson', '844 Patterson Rd'],
  ['Serenity', '564 Beach Rd #2'],
  ['Southgate Breeze', '2509 Allison Dr'],
  ['Southside Suite', '2003 S Osprey'],
  ['Surfside', '564 Beach Rd #1'],
  ['Terrace', '5400 Ocean Blvd 10-2'],
  ['The Beach House', '564 Beach Rd (All 3 Units)'],
  ['Villa Krystal', '1370 Moonmist Dr']
];

function ensureCalendarToken(state) {
  if (state.calendarToken) return false;
  state.calendarToken = newToken();
  return true;
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
  const propertyName = cleanText(raw.propertyName != null ? raw.propertyName : (raw.clientId || ''), 160);
  const address = cleanText(raw.address, 1000);
  const id = slug(raw.id || propertyName || name || address);
  if (!id || (!name && !propertyName)) return null;
  return {
    id,
    name: name || propertyName,
    propertyName,
    address,
    phone: cleanText(raw.phone, 80),
    doorCode: cleanText(raw.doorCode, 80),
    notes: cleanText(raw.notes, 4000),
    frequency: cleanText(raw.frequency, 80),
    cleaner: cleanText(raw.cleaner, 80),
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function buildManagementCustomers(clients) {
  return (Array.isArray(clients) ? clients : []).map((client) => {
    const lines = Array.isArray(client && client.billToLines)
      ? client.billToLines
      : String((client && client.address) || '').split('\n');
    return {
      id: slug((client && (client.id || client.displayName)) || ''),
      client: cleanText((client && (client.displayName || client.id)) || '', 160),
      address: lines.map((line) => cleanText(line, 200)).filter(Boolean).join('\n').slice(0, 1000)
    };
  }).filter((item) => item.id && item.client);
}

function customerFromImport(item) {
  return normalizeCustomer({
    id: item.id,
    name: item.name || item.clientId || item.address,
    propertyName: item.clientId || item.label || '',
    address: item.address,
    phone: item.phone,
    doorCode: item.doorCode,
    notes: item.notes,
    frequency: item.frequency,
    cleaner: item.cleaner
  });
}

function storedEmail(value) {
  const text = String(value || '').trim().toLowerCase().slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

function normalizeStaff(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 40);
  const id = slug(raw.id || name);
  if (!id || !name) return null;
  const email = storedEmail(raw.email);
  return {
    id,
    name,
    email,
    emailAlerts: email && raw.emailAlerts === true,
    calendarSync: raw.calendarSync !== false,
    token: cleanText(raw.token, 80).toLowerCase(),
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
    payment: raw.payment === 'paid' || raw.payment === 'invoiced' ? raw.payment : '',
    invoicedAt: raw.payment === 'paid' || raw.payment === 'invoiced' ? (cleanText(raw.invoicedAt, 40) || null) : null,
    paidAt: raw.payment === 'paid' ? (cleanText(raw.paidAt, 40) || null) : null,
    photos: normalizePhotos(raw.photos),
    createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString()
  };
}

function normalizePhotos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const id = String(item.id || '').toLowerCase();
    const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(item.mime) ? item.mime : '';
    if (!/^[a-f0-9]{16}$/.test(id) || !mime) return null;
    return {
      id,
      name: cleanText(item.name, 120) || 'photo',
      mime,
      createdAt: cleanText(item.createdAt, 40) || new Date().toISOString()
    };
  }).filter(Boolean).slice(0, 12);
}

function photoExtension(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/jpeg') return '.jpg';
  return '';
}

function buildReport(jobs, staff) {
  const people = new Map((staff || []).map((person) => [person.id, person.name]));
  const weeks = new Map();
  (jobs || []).forEach((job) => {
    const start = sundayOf(job.date);
    const row = weeks.get(start) || {
      start,
      end: addDays(start, 6),
      total: 0,
      paid: 0,
      cleaners: {},
      outstanding: []
    };
    row.total += 1;
    assignedIds(job).forEach((id) => {
      row.cleaners[id] = (row.cleaners[id] || 0) + 1;
    });
    if (job.payment === 'paid') row.paid += 1;
    else if (job.payment === 'invoiced') {
      row.outstanding.push({
        id: job.id,
        date: job.date,
        startTime: job.startTime,
        propertyName: job.propertyName || 'Property',
        staffName: assignedIds(job).map((id) => people.get(id) || 'Cleaner').join(', ')
      });
    }
    weeks.set(start, row);
  });
  return {
    weeks: [...weeks.values()]
      .sort((a, b) => b.start.localeCompare(a.start))
      .map((row) => ({
        start: row.start,
        end: row.end,
        total: row.total,
        paid: row.paid,
        outstandingCount: row.outstanding.length,
        cleaners: Object.entries(row.cleaners)
          .map(([id, count]) => ({ id, name: people.get(id) || 'Cleaner', count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        outstanding: row.outstanding.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      }))
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
      ensureCalendarToken(fresh);
      writeFile(fresh);
      return fresh;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = normalizeState(parsed);
    const addedPetra = ensurePetra(state.staff);
    const shortened = ensureStaffCodes(state.staff);
    const addedCalendar = ensureCalendarToken(state);
    if (!Array.isArray(parsed.staff) || !parsed.staff.length || addedPetra || shortened || addedCalendar) writeFile(state);
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

  function photoFile(jobId, photo) {
    const ext = photoExtension(photo && photo.mime);
    const root = path.resolve(dir, 'photos');
    const file = path.resolve(root, String(jobId || ''), `${photo && photo.id}${ext}`);
    const rel = path.relative(root, file);
    if (!ext || !photo || !/^[a-f0-9]{16}$/.test(photo.id) || rel.startsWith('..') || path.isAbsolute(rel)) return '';
    return file;
  }

  function requireActiveStaff(state, staffId) {
    const person = staffById(state, staffId);
    if (!person || !person.active) fail(400, 'Choose an active cleaner.');
    return person;
  }

  function assignProperty(job, property) {
    job.propertyId = property.id;
    job.propertyName = cleanText(property.propertyName || property.clientId || property.name || property.address, 160);
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

  function sameCrew(a, b) {
    const left = assignedIds(a).slice().sort();
    const right = assignedIds(b).slice().sort();
    return left.length === right.length && left.every((id, index) => id === right[index]);
  }

  function acknowledgeSeries(state, job) {
    const targets = job.seriesId
      ? state.jobs.filter((item) => item.seriesId === job.seriesId && sameCrew(item, job))
      : [job];
    targets.forEach((item) => applyStatus(item, 'acknowledged'));
    return targets.length;
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
            payment: '',
            invoicedAt: null,
            paidAt: null,
            photos: [],
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
          warnings,
          assignments: staffIds.map((staffId) => ({ staffId, jobs }))
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
        const previousCrew = new Map(targets.map((item) => [item.id, assignedIds(item).slice()]));
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
        if (patch.status === 'acknowledged') acknowledgeSeries(state, job);
        else if (patch.status) applyStatus(job, patch.status);
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
        const added = new Map();
        targets.forEach((item) => {
          const prior = previousCrew.get(item.id) || [];
          assignedIds(item).forEach((staffId) => {
            if (prior.includes(staffId)) return;
            const list = added.get(staffId) || [];
            list.push(item);
            added.set(staffId, list);
          });
        });
        return {
          count: targets.length,
          warnings,
          assignments: [...added.entries()].map(([staffId, jobs]) => ({ staffId, jobs }))
        };
      });
    },
    deleteJobs(id, scope) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id);
        if (!job) fail(404, 'Clean not found.');
        const before = state.jobs.length;
        const removed = scope === 'future' && job.seriesId
          ? state.jobs.filter((item) => item.seriesId === job.seriesId && item.date >= job.date)
          : state.jobs.filter((item) => item.id === id);
        const removedIds = new Set(removed.map((item) => item.id));
        state.jobs = state.jobs.filter((item) => !removedIds.has(item.id));
        removed.forEach((item) => {
          fs.rmSync(path.join(dir, 'photos', item.id), { recursive: true, force: true });
        });
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
            payment: '',
            invoicedAt: null,
            paidAt: null,
            photos: [],
            createdAt: new Date().toISOString()
          });
        }
        if (!created.length) fail(400, 'Nothing new to add.');
        state.jobs.push(...created);
        return {
          added: created.length,
          lastDate: created[created.length - 1].date,
          assignments: assignedIds(last).map((staffId) => ({ staffId, jobs: created }))
        };
      });
    },
    setStatus(id, status, staffId) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id && (!staffId || assignedIds(item).includes(staffId)));
        if (!job) fail(404, 'Clean not found.');
        const count = status === 'acknowledged' ? acknowledgeSeries(state, job) : (applyStatus(job, status), 1);
        return { id: job.id, status: job.status, acknowledgedAt: job.acknowledgedAt, completedAt: job.completedAt, count };
      });
    },
    addJobPhotos(id, staffId, files) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id && (!staffId || assignedIds(item).includes(staffId)));
        if (!job) fail(404, 'Clean not found.');
        const incoming = Array.isArray(files) ? files : [];
        if (!incoming.length) fail(400, 'Choose a photo to upload.');
        if (!Array.isArray(job.photos)) job.photos = [];
        if (job.photos.length + incoming.length > 12) fail(400, 'This clean can hold 12 photos.');
        const written = [];
        try {
          incoming.forEach((file) => {
            const mime = file && file.mime;
            if (!photoExtension(mime) || !Buffer.isBuffer(file.buffer) || !file.buffer.length) fail(400, 'Use a JPEG, PNG, or WebP photo.');
            if (file.buffer.length > 8 * 1024 * 1024) fail(400, 'Each photo must be 8 MB or smaller.');
            const photo = {
              id: crypto.randomBytes(8).toString('hex'),
              name: cleanText(file.name, 120) || 'photo',
              mime,
              createdAt: new Date().toISOString()
            };
            const dest = photoFile(job.id, photo);
            if (!dest) fail(400, 'Could not save that photo.');
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, file.buffer);
            written.push(dest);
            job.photos.push(photo);
          });
        } catch (err) {
          written.forEach((dest) => fs.rmSync(dest, { force: true }));
          throw err;
        }
        return { photos: job.photos.map((photo) => ({ id: photo.id, name: photo.name, mime: photo.mime })) };
      });
    },
    readJobPhoto(id, photoId, staffId) {
      return view((state) => {
        const job = state.jobs.find((item) => item.id === id && (!staffId || assignedIds(item).includes(staffId)));
        if (!job) fail(404, 'Photo not found.');
        const photo = (job.photos || []).find((item) => item.id === String(photoId || '').toLowerCase());
        if (!photo) fail(404, 'Photo not found.');
        const dest = photoFile(job.id, photo);
        if (!dest || !fs.existsSync(dest)) fail(404, 'Photo not found.');
        return { mime: photo.mime, buffer: fs.readFileSync(dest) };
      });
    },
    setPayment(id, payment) {
      return mutate((state) => {
        const job = state.jobs.find((item) => item.id === id);
        if (!job) fail(404, 'Clean not found.');
        const now = new Date().toISOString();
        if (payment === 'none') {
          job.payment = '';
          job.invoicedAt = null;
          job.paidAt = null;
        } else if (payment === 'invoiced') {
          job.payment = 'invoiced';
          job.invoicedAt = job.invoicedAt || now;
          job.paidAt = null;
        } else if (payment === 'paid') {
          job.payment = 'paid';
          job.invoicedAt = job.invoicedAt || now;
          job.paidAt = job.paidAt || now;
        } else {
          fail(400, 'Choose invoice sent or paid.');
        }
        return { id: job.id, payment: job.payment || '', invoicedAt: job.invoicedAt, paidAt: job.paidAt };
      });
    },
    report() {
      return view((state) => buildReport(state.jobs, state.staff));
    },
    setCalendarSync(on, staffId) {
      return mutate((state) => {
        if (!staffId) {
          state.calendarSync = on === true;
          return { calendarSync: state.calendarSync };
        }
        const person = staffById(state, staffId);
        if (!person) fail(404, 'Cleaner not found.');
        person.calendarSync = on === true;
        return { calendarSync: person.calendarSync };
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
          email: '',
          emailAlerts: false,
          token: newStaffCode(new Set(state.staff.map((item) => String(item.token || '').toLowerCase()))),
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
        if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
          const raw = String(patch.email || '').trim();
          if (raw && !storedEmail(raw)) fail(400, 'Enter a valid email address.');
          person.email = storedEmail(raw);
          if (!person.email) person.emailAlerts = false;
        }
        if (typeof patch.emailAlerts === 'boolean') {
          if (patch.emailAlerts && !person.email) fail(400, 'Add an email address before turning alerts on.');
          person.emailAlerts = patch.emailAlerts;
        }
        if (typeof patch.active === 'boolean') person.active = patch.active;
        if (patch.rotateToken) person.token = newStaffCode(new Set(state.staff.map((item) => String(item.token || '').toLowerCase())));
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
    adoptManagementClients(incoming) {
      return mutate((state) => {
        if (state.customersSource === 'management-clients') {
          return { synced: false, count: (state.customers || []).length };
        }
        const list = Array.isArray(incoming) ? incoming.filter((item) => item && item.client) : [];
        if (!list.length) return { synced: false, count: (state.customers || []).length };
        const existing = Array.isArray(state.customers) ? state.customers : [];
        const byId = new Map(existing.map((customer) => [customer.id, customer]));
        const byLabel = new Map();
        existing.forEach((customer) => {
          [customer.id, customer.propertyName, customer.name].forEach((key) => {
            const label = String(key || '').trim().toLowerCase();
            if (label && !byLabel.has(label)) byLabel.set(label, customer);
          });
        });
        const next = list.map((item) => {
          const match = byId.get(item.id) || byLabel.get(String(item.client).trim().toLowerCase()) || null;
          return {
            id: match ? match.id : item.id,
            name: item.client,
            propertyName: item.client,
            address: item.address,
            phone: match ? match.phone : '',
            doorCode: match ? match.doorCode : '',
            notes: match ? match.notes : '',
            frequency: match ? match.frequency : '',
            cleaner: match ? match.cleaner : '',
            createdAt: match ? match.createdAt : ''
          };
        });
        state.customers = normalizeCustomers(next);
        state.customersSource = 'management-clients';
        return { synced: true, count: state.customers.length };
      });
    },
    mergeExtraProperties() {
      return mutate((state) => {
        if (state.extraProperties === 'siesta-rentals') {
          return { added: 0, total: EXTRA_PROPERTIES.length };
        }
        if (!Array.isArray(state.customers)) state.customers = [];
        const names = new Set();
        state.customers.forEach((customer) => {
          [customer.propertyName, customer.name].forEach((value) => {
            const key = String(value || '').trim().toLowerCase();
            if (key) names.add(key);
          });
        });
        let added = 0;
        EXTRA_PROPERTIES.forEach(([propertyName, address]) => {
          if (names.has(propertyName.toLowerCase())) return;
          const customer = normalizeCustomer({
            id: slug(propertyName),
            name: propertyName,
            propertyName,
            address
          });
          let n = 2;
          while (state.customers.some((item) => item.id === customer.id)) customer.id = `${slug(propertyName)}-${n++}`;
          state.customers.push(customer);
          names.add(propertyName.toLowerCase());
          added += 1;
        });
        state.customers.sort((a, b) => String(a.propertyName || a.name).localeCompare(String(b.propertyName || b.name), undefined, { numeric: true, sensitivity: 'base' }));
        state.extraProperties = 'siesta-rentals';
        return { added, total: EXTRA_PROPERTIES.length };
      });
    },
    backfillPropertyNames(catalog) {
      return enqueue(() => {
        const state = read();
        if (!Array.isArray(state.customers)) return { updated: 0 };
        const byId = new Map();
        (catalog || []).forEach((item) => {
          if (item && item.id) byId.set(item.id, item);
        });
        let updated = 0;
        state.customers.forEach((customer) => {
          if (customer.propertyName) return;
          const source = byId.get(customer.id);
          const label = cleanText(source && (source.clientId || source.label), 160);
          const owner = cleanText(source && source.name, 160);
          if (owner && customer.name && customer.name.toLowerCase() !== owner.toLowerCase()) {
            customer.propertyName = customer.name;
            updated += 1;
            return;
          }
          if (!label) return;
          customer.propertyName = label;
          updated += 1;
        });
        state.jobs.forEach((job) => {
          const customer = state.customers.find((item) => item.id === job.propertyId);
          const label = customer && customer.propertyName;
          if (label && job.propertyName !== label) {
            job.propertyName = label;
            updated += 1;
          }
        });
        if (updated) writeFile(state);
        return { updated };
      });
    },
    addCustomer(input) {
      return mutate((state) => {
        const name = cleanText(input && input.name, 160);
        const address = cleanText(input && input.address, 1000);
        if (!name) fail(400, 'Enter the customer name.');
        if (!address) fail(400, 'Enter the address.');
        if (!Array.isArray(state.customers)) state.customers = [];
        if (state.customers.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.address.toLowerCase() === address.toLowerCase())) {
          fail(400, 'That customer is already on the list.');
        }
        const customer = normalizeCustomer({
          id: slug(name),
          name,
          propertyName: name,
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
        const address = Object.prototype.hasOwnProperty.call(patch, 'address') ? cleanText(patch.address, 1000) : customer.address;
        if (!name && !Object.prototype.hasOwnProperty.call(patch, 'propertyName')) fail(400, 'Enter the client.');
        if (customers.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase() && item.address.toLowerCase() === address.toLowerCase())) {
          fail(400, 'That customer is already on the list.');
        }
        customer.name = name;
        if (Object.prototype.hasOwnProperty.call(patch, 'propertyName')) {
          const label = cleanText(patch.propertyName, 160);
          if (!label) fail(400, 'Enter the client.');
          customer.propertyName = label;
          customer.name = label;
        }
        customer.address = address;
        if (customer.propertyName) {
          state.jobs.forEach((job) => {
            if (job.propertyId === customer.id) job.propertyName = customer.propertyName;
          });
        }
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
        const jobs = state.jobs
          .filter((job) => job.date >= from && job.date <= to)
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        const blocks = state.blocks
          .filter((block) => block.startDate <= blockTo && block.endDate >= blockFrom)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        const stats = {};
        state.jobs.forEach((job) => {
          assignedIds(job).forEach((id) => {
            const row = stats[id] || (stats[id] = { completed: 0, acknowledged: 0, outstanding: 0 });
            if (job.status === 'completed') row.completed += 1;
            else if (job.status === 'acknowledged') row.acknowledged += 1;
            else row.outstanding += 1;
          });
        });
        return { staff: state.staff, jobs, blocks, stats, calendarToken: state.calendarToken || '', calendarSync: state.calendarSync !== false };
      });
    }
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatUtc(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function zoneOffsetMs(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const map = {};
  fmt.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour) % 24, Number(map.minute), Number(map.second));
  return asUtc - date.getTime();
}

function zonedToUtc(isoDate, time, timeZone) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  const second = zoneOffsetMs(first, timeZone);
  return new Date(guess - second);
}

function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcs(line) {
  const out = [];
  let rest = String(line || '');
  out.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest) {
    out.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return out.join('\r\n');
}

function buildCalendar(events, options) {
  const name = (options && options.name) || 'Elite cleans';
  const timeZone = (options && options.timeZone) || 'America/New_York';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elite Cleaning Services//Task Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H'
  ];
  (events || []).forEach((event) => {
    const start = zonedToUtc(event.date, event.startTime, timeZone);
    const end = new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60000);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(event.id)}@elite-taskmgmt`);
    lines.push(`DTSTAMP:${event.stamp || formatUtc(new Date())}`);
    lines.push(`DTSTART:${formatUtc(start)}`);
    lines.push(`DTEND:${formatUtc(end)}`);
    lines.push(`SUMMARY:${icsEscape(event.summary || 'Clean')}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcs).join('\r\n')}\r\n`;
}

module.exports = {
  SEED_STAFF,
  RECURRENCE_DAYS,
  resolveDataDir,
  expectedPassword,
  passwordsMatch,
  addDays,
  sundayOf,
  mondayOf,
  buildReport,
  occurrenceDates,
  buildProperties,
  buildManagementCustomers,
  assignedIds,
  patchClientProperty,
  suggestRecurrence,
  createStore,
  isIsoDate,
  prettyDate,
  buildCalendar,
  formatUtc
};
