'use strict';

const path = require('path');
const {
  resolveDataDir,
  expectedPassword,
  passwordsMatch,
  buildProperties,
  createStore
} = require('./eliteTasks');

function registerEliteTasksRoutes(app, deps) {
  const readClientFull = deps && deps.readClientFull;
  const writeClientFull = deps && deps.writeClientFull;
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

  function presentJob(job, props, staff) {
    const property = props.find((item) => item.id === job.propertyId);
    const person = staff.find((item) => item.id === job.staffId);
    return {
      id: job.id,
      seriesId: job.seriesId || '',
      recurrence: job.recurrence,
      date: job.date,
      startTime: job.startTime,
      durationMinutes: job.durationMinutes,
      staffId: job.staffId,
      staffName: person ? person.name : '',
      staffColor: person ? person.color : '#57534e',
      status: job.status,
      acknowledgedAt: job.acknowledgedAt,
      completedAt: job.completedAt,
      visitNote: job.visitNote || '',
      alertDate: job.alertDate || '',
      alertTime: job.alertTime || '',
      propertyId: job.propertyId,
      clientId: '',
      propertyName: property ? property.name : (job.propertyName || ''),
      address: property ? property.address : (job.address || ''),
      phone: property ? property.phone : '',
      doorCode: property ? property.doorCode : '',
      propertyNotes: property ? property.notes : '',
      frequency: property ? property.frequency : ''
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
        staff: snap.staff.map((person) => ({
          id: person.id,
          name: person.name,
          active: person.active,
          color: person.color,
          token: person.token,
          upcoming: snap.stats[person.id]?.upcoming || 0,
          needsAck: snap.stats[person.id]?.needsAck || 0
        })),
        properties: props.map((item) => ({
          id: item.id,
          name: item.name,
          address: item.address,
          phone: item.phone,
          doorCode: item.doorCode,
          notes: item.notes,
          frequency: item.frequency,
          cleaner: item.cleaner,
          label: item.name
        })),
        jobs: snap.jobs.map((job) => presentJob(job, props, snap.staff)),
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
      const jobs = snap.jobs.filter((job) => job.staffId === person.id);
      const blocks = snap.blocks.filter((block) => block.staffId === person.id);
      res.json({
        ok: true,
        role: 'cleaner',
        staff: { id: person.id, name: person.name, color: person.color },
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
      const person = await store.updateStaff(req.params.id, patch);
      res.json({ ok: true, staff: { id: person.id, name: person.name, active: person.active, token: person.token } });
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
        date: String(body.date || ''),
        startTime: String(body.startTime || ''),
        durationMinutes: body.durationMinutes,
        recurrence: String(body.recurrence || 'once'),
        weeksAhead: body.weeksAhead,
        visitNote: body.visitNote,
        alertDate: body.alertDate,
        alertTime: body.alertTime
      });
      res.status(201).json({ ok: true, ...result });
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
      const patch = { applyTo: body.applyTo === 'future' ? 'future' : 'one' };
      if (body.startTime) patch.startTime = String(body.startTime);
      if (body.durationMinutes != null && body.durationMinutes !== '') patch.durationMinutes = body.durationMinutes;
      if (body.staffId) patch.staffId = String(body.staffId);
      if (body.date) patch.date = String(body.date);
      if (body.status) patch.status = String(body.status);
      if (Object.prototype.hasOwnProperty.call(body, 'visitNote')) patch.visitNote = body.visitNote;
      if (Object.prototype.hasOwnProperty.call(body, 'alertDate') || Object.prototype.hasOwnProperty.call(body, 'alertTime')) {
        patch.alertDate = body.alertDate || '';
        patch.alertTime = body.alertTime || '';
      }
      const result = await store.updateJob(req.params.id, patch, property);
      res.json({ ok: true, ...result });
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
      res.json({ ok: true, ...result });
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
  store.seedCustomers(imported);

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
