'use strict';

const path = require('path');
const {
  resolveDataDir,
  expectedPassword,
  passwordsMatch,
  buildProperties,
  buildManagementCustomers,
  assignedIds,
  createStore,
  prettyDate,
  buildCalendar,
  formatUtc
} = require('./eliteTasks');

const REPEAT_LABEL = {
  once: 'Once',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  every3: 'Every 3 weeks',
  every4: 'Every 4 weeks'
};

function listedStaff(staff) {
  return staff.filter((person) => {
    const name = String(person.name || '').toLowerCase();
    return name !== 'petr' && name !== 'maya';
  });
}

function registerEliteTasksRoutes(app, deps) {
  const readClientFull = deps && deps.readClientFull;
  const writeClientFull = deps && deps.writeClientFull;
  const sendMail = deps && typeof deps.sendMail === 'function' ? deps.sendMail : null;
  if (typeof readClientFull !== 'function' || typeof writeClientFull !== 'function') {
    throw new Error('Elite Tasks requires the Elite Management client list.');
  }

  const dataDir = resolveDataDir();
  const store = createStore(dataDir);
  const page = path.join(__dirname, '..', 'public', 'elite-tasks.html');

  function noIndex(res) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Cache-Control', 'private, no-store');
  }

  function sendPage(req, res) {
    noIndex(res);
    res.sendFile(page);
  }

  app.use((req, res, next) => {
    const requestPath = String(req.path || '');
    if (
      /^\/elite-taskmgmt(?:\/|$)/i.test(requestPath) ||
      /^\/elite-tasks\.html$/i.test(requestPath) ||
      /^\/api\/elite-tasks(?:\/|$)/i.test(requestPath)
    ) {
      noIndex(res);
    }
    next();
  });

  function passwordFrom(req) {
    const header = String(req.get('x-elite-tasks-password') || '').trim();
    if (header) return header;
    const auth = String(req.get('authorization') || '').trim();
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return '';
  }

  function tokenFrom(req) {
    return String(req.get('x-elite-tasks-token') || '').trim();
  }

  function managerOk(req) {
    return passwordsMatch(passwordFrom(req), expectedPassword());
  }

  async function cleanerFrom(req) {
    return store.findByToken(tokenFrom(req));
  }

  async function properties() {
    return store.listCustomers();
  }

  async function propertyById(id) {
    const list = await properties();
    return list.find((item) => item.id === id) || null;
  }

  function clockLabel(value) {
    const [hour, minute] = String(value || '00:00').split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return minute ? `${h}:${String(minute).padStart(2, '0')} ${suffix}` : `${h} ${suffix}`;
  }

  function hoursLabel(minutes) {
    const hours = Number(minutes) / 60;
    const text = Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hours`;
    return text;
  }

  function htmlEscape(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function staffPageUrl(req, person) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const slug = String(person.name || 'cleaner').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cleaner';
    return `${proto}://${req.get('host')}/Elite-TaskMgmt/${slug}/${person.token}`;
  }

  function assignmentMessage(req, person, jobs, property) {
    const ordered = jobs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const place = (property && (property.propertyName || property.label)) || first.propertyName || 'Property';
    const address = (property && property.address) || first.address || '';
    const door = (property && property.doorCode) || '';
    const phone = (property && property.phone) || '';
    const notes = [property && property.notes, ...ordered.map((job) => job.visitNote)].map((item) => String(item || '').trim()).filter(Boolean);
    const uniqueNotes = [...new Set(notes)];
    const sameTime = ordered.every((job) => job.startTime === first.startTime && job.durationMinutes === first.durationMinutes);
    const when = sameTime
      ? `${clockLabel(first.startTime)} · ${hoursLabel(first.durationMinutes)}${first.deepClean ? ' · Deep clean' : ''}`
      : ordered.slice(0, 8).map((job) => `${prettyDate(job.date)} · ${clockLabel(job.startTime)} · ${hoursLabel(job.durationMinutes)}`).join('\n');
    const dates = ordered.length > 8
      ? `${ordered.slice(0, 6).map((job) => prettyDate(job.date)).join(', ')} and ${ordered.length - 6} more through ${prettyDate(last.date)}`
      : ordered.map((job) => prettyDate(job.date)).join(', ');
    const repeat = ordered.length > 1 ? (REPEAT_LABEL[first.recurrence] || 'Repeating') : '';
    const link = staffPageUrl(req, person);
    const lines = [
      `Hi ${person.name},`,
      '',
      'A clean has been assigned to you.',
      '',
      `Property: ${place}`,
      address ? `Address: ${address}` : '',
      sameTime ? `When: ${when}` : when,
      `Dates: ${dates}`,
      repeat ? `Repeats: ${repeat}` : '',
      door ? `Door code: ${door}` : '',
      phone ? `Phone: ${phone}` : '',
      uniqueNotes.length ? `Notes: ${uniqueNotes.join(' / ')}` : '',
      '',
      `Open your cleans: ${link}`
    ].filter((line) => line !== '');
    const text = lines.join('\n');
    const html = lines.map((line) => `<p>${htmlEscape(line)}</p>`).join('');
    return {
      to: person.email,
      subject: `New clean · ${place} · ${prettyDate(first.date)}`,
      text,
      html
    };
  }

  async function mailAssignments(req, assignments) {
    const emailed = [];
    let emailPending = false;
    if (!assignments || !assignments.length) return { emailed, emailPending };
    const staff = await store.view((state) => state.staff);
    for (const group of assignments) {
      const person = staff.find((item) => item.id === group.staffId);
      const jobs = Array.isArray(group.jobs) ? group.jobs.filter(Boolean) : [];
      if (!person || !person.active || person.emailAlerts !== true || !person.email || !jobs.length) continue;
      if (!sendMail) {
        emailPending = true;
        continue;
      }
      const property = await propertyById(jobs[0].propertyId);
      try {
        await sendMail(assignmentMessage(req, person, jobs, property));
        emailed.push(person.name);
      } catch (err) {
        emailPending = true;
        console.error('[EliteTasks] assignment email failed for', person.name, err && err.message);
      }
    }
    return { emailed, emailPending };
  }

  async function finishJobs(res, status, req, result) {
    const mail = await mailAssignments(req, result && result.assignments);
    const body = { ...(result || {}) };
    delete body.assignments;
    res.status(status).json({ ok: true, ...body, emailed: mail.emailed, emailPending: mail.emailPending });
  }

  function presentJob(job, props, staff, role) {
    const property = props.find((item) => item.id === job.propertyId);
    const ids = assignedIds(job);
    const people = ids.map((id) => staff.find((item) => item.id === id)).filter(Boolean);
    const person = people[0] || null;
    return {
      id: job.id,
      seriesId: job.seriesId || '',
      recurrence: job.recurrence,
      date: job.date,
      startTime: job.startTime,
      durationMinutes: job.durationMinutes,
      deepClean: job.deepClean === true,
      staffId: ids[0] || '',
      staffIds: ids,
      staffName: people.map((item) => item.name).join(', '),
      staffColor: person ? person.color : '#57534e',
      status: job.status,
      acknowledgedAt: job.acknowledgedAt,
      completedAt: job.completedAt,
      visitNote: job.visitNote || '',
      alertDate: job.alertDate || '',
      alertTime: job.alertTime || '',
      propertyId: job.propertyId,
      clientId: '',
      propertyName: property
        ? (property.propertyName || property.clientId || property.name || job.propertyName || '')
        : (job.propertyName || ''),
      address: property ? property.address : (job.address || ''),
      phone: property ? property.phone : '',
      doorCode: property ? property.doorCode : '',
      propertyNotes: property ? property.notes : '',
      frequency: property ? property.frequency : '',
      ...(role === 'manager' ? {
        payment: job.payment || '',
        invoicedAt: job.invoicedAt || null,
        paidAt: job.paidAt || null
      } : {})
    };
  }

  function rangeFrom(req) {
    const today = String(req.query.today || '').trim();
    return {
      from: String(req.query.from || '').trim(),
      to: String(req.query.to || '').trim(),
      blockFrom: String(req.query.blockFrom || '').trim(),
      blockTo: String(req.query.blockTo || '').trim(),
      today
    };
  }

  async function handle(res, fn) {
    try {
      await fn();
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[EliteTasks]', err);
      res.status(status).json({ error: err.message || 'Something went wrong.' });
    }
  }

  function sendStaffPage(req, res) {
    if (!/^[a-f0-9]{32,}$/i.test(String(req.params.token || ''))) {
      noIndex(res);
      return res.status(404).type('html').send('<!doctype html><meta name="robots" content="noindex,nofollow"><title>Not found</title><p>This link is not valid.</p>');
    }
    return sendPage(req, res);
  }

  function sendCalendar(req, res) {
    noIndex(res);
    handle(res, async () => {
      const token = String(req.params.token || '');
      const found = await store.view((state) => {
        const person = state.staff.find((item) => item.active && passwordsMatch(token, item.token));
        const accepted = (job) => job.status === 'acknowledged' || job.status === 'completed';
        if (person) {
          return {
            kind: 'person',
            person,
            staff: state.staff,
            jobs: person.calendarSync === false
              ? []
              : state.jobs.filter((job) => accepted(job) && assignedIds(job).includes(person.id))
          };
        }
        if (passwordsMatch(token, state.calendarToken)) {
          return {
            kind: 'all',
            staff: state.staff,
            jobs: state.calendarSync === false ? [] : state.jobs.filter(accepted)
          };
        }
        return null;
      });
      if (!found) {
        res.status(404).type('text/plain').send('This calendar link is not valid.');
        return;
      }
      const props = await properties();
      const events = found.jobs.map((job) => {
        const shown = presentJob(job, props, found.staff);
        const place = shown.propertyName || 'Clean';
        const when = new Date(job.acknowledgedAt || job.completedAt || job.createdAt || Date.now());
        return {
          id: job.id,
          date: job.date,
          startTime: job.startTime,
          durationMinutes: job.durationMinutes,
          summary: found.kind === 'all' && shown.staffName ? `${shown.staffName} · ${place}` : place,
          location: shown.address || '',
          description: [
            shown.deepClean ? 'Deep clean' : '',
            shown.staffName ? `Cleaner: ${shown.staffName}` : '',
            shown.doorCode ? `Door code: ${shown.doorCode}` : '',
            shown.phone ? `Phone: ${shown.phone}` : '',
            shown.propertyNotes || '',
            shown.visitNote || ''
          ].filter(Boolean).join('\n'),
          stamp: formatUtc(Number.isNaN(when.getTime()) ? new Date() : when)
        };
      });
      const name = found.kind === 'all' ? 'Elite accepted cleans' : `${found.person.name} accepted cleans`;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="elite-cleans.ics"');
      res.send(buildCalendar(events, { name }));
    });
  }

  app.get(['/Elite-TaskMgmt/calendar/:token.ics', '/elite-taskmgmt/calendar/:token.ics'], sendCalendar);
  app.get(['/Elite-TaskMgmt', '/elite-taskmgmt'], sendPage);
  app.get(['/Elite-TaskMgmt/c/:token', '/elite-taskmgmt/c/:token'], sendStaffPage);
  app.get(['/Elite-TaskMgmt/:name/:token', '/elite-taskmgmt/:name/:token'], sendStaffPage);

  app.post('/api/elite-tasks/auth/login', (req, res) => {
    noIndex(res);
    const expected = expectedPassword();
    if (!expected) {
      return res.status(503).json({ ok: false, error: 'Admin sign-in is not configured.' });
    }
    const password = String(req.body?.password || '');
    if (!passwordsMatch(password, expected)) {
      return res.status(401).json({ ok: false, error: 'Incorrect password.' });
    }
    return res.json({ ok: true });
  });

  app.get('/api/elite-tasks/week', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) {
        res.status(401).json({ error: 'Sign in required.' });
        return;
      }
      const props = await properties();
      const snap = await store.snapshot(rangeFrom(req));
      res.json({
        ok: true,
        role: 'manager',
        staff: listedStaff(snap.staff).map((person) => ({
          id: person.id,
          name: person.name,
          active: person.active,
          color: person.color,
          token: person.token,
          email: person.email || '',
          emailAlerts: person.emailAlerts === true,
          completed: snap.stats[person.id]?.completed || 0,
          acknowledged: snap.stats[person.id]?.acknowledged || 0,
          outstanding: snap.stats[person.id]?.outstanding || 0
        })),
        calendarToken: snap.calendarToken || '',
        calendarSync: snap.calendarSync !== false,
        properties: props.map((item) => ({
          id: item.id,
          name: item.name,
          propertyName: item.propertyName || '',
          address: item.address,
          phone: item.phone,
          doorCode: item.doorCode,
          notes: item.notes,
          frequency: item.frequency,
          cleaner: item.cleaner,
          label: item.propertyName || item.name
        })),
        jobs: snap.jobs.map((job) => presentJob(job, props, snap.staff, 'manager')),
        blocks: snap.blocks.map((block) => ({
          id: block.id,
          staffId: block.staffId,
          staffName: snap.staff.find((person) => person.id === block.staffId)?.name || '',
          startDate: block.startDate,
          endDate: block.endDate,
          note: block.note
        }))
      });
    });
  });

  app.get('/api/elite-tasks/me', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) {
        res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
        return;
      }
      const props = await properties();
      const snap = await store.snapshot(rangeFrom(req));
      const jobs = snap.jobs.filter((job) => assignedIds(job).includes(person.id));
      const blocks = snap.blocks.filter((block) => block.staffId === person.id);
      res.json({
        ok: true,
        role: 'cleaner',
        staff: { id: person.id, name: person.name, color: person.color },
        calendarSync: person.calendarSync !== false,
        jobs: jobs.map((job) => presentJob(job, props, snap.staff)),
        blocks: blocks.map((block) => ({
          id: block.id,
          staffId: block.staffId,
          startDate: block.startDate,
          endDate: block.endDate,
          note: block.note
        }))
      });
    });
  });

  app.post('/api/elite-tasks/settings', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const result = await store.setCalendarSync((req.body || {}).calendarSync === true);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/me/settings', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const result = await store.setCalendarSync((req.body || {}).calendarSync === true, person.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/staff', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const person = await store.addStaff(req.body?.name);
      res.status(201).json({ ok: true, staff: { id: person.id, name: person.name, token: person.token } });
    });
  });

  app.patch('/api/elite-tasks/staff/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const body = req.body || {};
      const patch = { rotateToken: Boolean(body.rotateToken) };
      if (body.name) patch.name = body.name;
      if (typeof body.active === 'boolean') patch.active = body.active;
      if (Object.prototype.hasOwnProperty.call(body, 'email')) patch.email = body.email;
      if (typeof body.emailAlerts === 'boolean') patch.emailAlerts = body.emailAlerts;
      const person = await store.updateStaff(req.params.id, patch);
      res.json({
        ok: true,
        staff: {
          id: person.id,
          name: person.name,
          active: person.active,
          email: person.email || '',
          emailAlerts: person.emailAlerts === true,
          token: person.token
        }
      });
    });
  });

  app.delete('/api/elite-tasks/staff/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const result = await store.deleteStaff(req.params.id);
      res.json({ ok: true, ...result });
    });
  });

  app.get('/api/elite-tasks/report', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const report = await store.report();
      res.json({ ok: true, weeks: report.weeks });
    });
  });

  app.post('/api/elite-tasks/jobs/:id/payment', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const payment = String((req.body && req.body.payment) || '');
      const result = await store.setPayment(req.params.id, payment);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/jobs', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const body = req.body || {};
      const property = await propertyById(String(body.propertyId || ''));
      if (!property) {
        res.status(400).json({ error: 'Choose a customer.' });
        return;
      }
      const result = await store.createJobs({
        property,
        staffId: String(body.staffId || ''),
        staffIds: Array.isArray(body.staffIds) ? body.staffIds.map((id) => String(id)) : [],
        date: String(body.date || ''),
        startTime: String(body.startTime || ''),
        durationMinutes: body.durationMinutes,
        deepClean: body.deepClean === true,
        recurrence: String(body.recurrence || 'once'),
        weeksAhead: body.weeksAhead,
        visitNote: body.visitNote,
        alertDate: body.alertDate,
        alertTime: body.alertTime,
        allowClash: body.allowClash === true
      });
      await finishJobs(res, 201, req, result);
    });
  });

  app.patch('/api/elite-tasks/jobs/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const body = req.body || {};
      let property = null;
      if (body.propertyId) {
        property = await propertyById(String(body.propertyId));
        if (!property) {
          res.status(400).json({ error: 'Choose a customer.' });
          return;
        }
      }
      const patch = { applyTo: body.applyTo === 'future' ? 'future' : 'one', allowClash: body.allowClash === true };
      if (body.startTime) patch.startTime = String(body.startTime);
      if (body.durationMinutes != null && body.durationMinutes !== '') patch.durationMinutes = body.durationMinutes;
      if (typeof body.deepClean === 'boolean') patch.deepClean = body.deepClean;
      if (Array.isArray(body.staffIds)) patch.staffIds = body.staffIds.map((id) => String(id));
      else if (body.staffId) patch.staffId = String(body.staffId);
      if (body.date) patch.date = String(body.date);
      if (body.status) patch.status = String(body.status);
      if (Object.prototype.hasOwnProperty.call(body, 'visitNote')) patch.visitNote = body.visitNote;
      if (Object.prototype.hasOwnProperty.call(body, 'alertDate') || Object.prototype.hasOwnProperty.call(body, 'alertTime')) {
        patch.alertDate = body.alertDate || '';
        patch.alertTime = body.alertTime || '';
      }
      const result = await store.updateJob(req.params.id, patch, property);
      await finishJobs(res, 200, req, result);
    });
  });

  app.delete('/api/elite-tasks/jobs/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const scope = req.query.scope === 'future' ? 'future' : 'one';
      const result = await store.deleteJobs(req.params.id, scope);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/jobs/:id/extend', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const result = await store.extendSeries(req.params.id, req.body?.weeks || 12);
      await finishJobs(res, 200, req, result);
    });
  });

  app.post('/api/elite-tasks/blocks', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const body = req.body || {};
      const block = await store.addBlock({
        staffId: String(body.staffId || ''),
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || body.startDate || ''),
        note: body.note
      });
      res.status(201).json({ ok: true, block });
    });
  });

  app.delete('/api/elite-tasks/blocks/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const result = await store.deleteBlock(req.params.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/properties', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const customer = await store.addCustomer(req.body || {});
      res.status(201).json({ ok: true, property: customer });
    });
  });

  app.put('/api/elite-tasks/properties/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const customer = await store.updateCustomer(req.params.id, req.body || {});
      res.json({ ok: true, property: customer });
    });
  });

  app.delete('/api/elite-tasks/properties/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      if (!managerOk(req)) return res.status(401).json({ error: 'Sign in required.' });
      const result = await store.deleteCustomer(req.params.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/me/jobs/:id/ack', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const result = await store.setStatus(req.params.id, 'acknowledged', person.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/me/jobs/:id/unack', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const result = await store.unacknowledge(req.params.id, person.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/me/jobs/:id/complete', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const result = await store.setStatus(req.params.id, 'completed', person.id);
      res.json({ ok: true, ...result });
    });
  });

  app.post('/api/elite-tasks/me/blocks', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const body = req.body || {};
      const block = await store.addBlock({
        staffId: person.id,
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || body.startDate || ''),
        note: body.note
      });
      res.status(201).json({ ok: true, block });
    });
  });

  app.delete('/api/elite-tasks/me/blocks/:id', (req, res) => {
    noIndex(res);
    handle(res, async () => {
      const person = await cleanerFrom(req);
      if (!person) return res.status(401).json({ error: 'This link is not valid. Ask for a new cleaner link.' });
      const result = await store.deleteBlock(req.params.id, person.id);
      res.json({ ok: true, ...result });
    });
  });

  let imported = [];
  try {
    imported = buildProperties(readClientFull());
  } catch (err) {
    console.error('[EliteTasks] customer list was not copied from Elite Management', err);
  }
  let managementClients = [];
  if (deps && typeof deps.readClients === 'function') {
    try {
      managementClients = buildManagementCustomers(deps.readClients());
    } catch (err) {
      console.error('[EliteTasks] Elite Management client list was not read', err);
    }
  }
  if (managementClients.length) {
    store.adoptManagementClients(managementClients);
  } else {
    store.seedCustomers(imported);
    store.backfillPropertyNames(imported);
  }
  store.mergeExtraProperties();

  const passSource = String(process.env.ELITE_TASKS_PASSWORD || '').trim()
    ? 'ELITE_TASKS_PASSWORD'
    : String(process.env.ELITE_INVOICES_AUTH_PASS || '').trim()
      ? 'ELITE_INVOICES_AUTH_PASS'
      : 'not configured';
  console.log('[EliteTasks] data dir:', dataDir);
  console.log('[EliteTasks] management: /Elite-TaskMgmt');
  console.log('[EliteTasks] auth:', passSource);
}

module.exports = { registerEliteTasksRoutes };
