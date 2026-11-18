'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const {
  addDays,
  mondayOf,
  invoiceMonday,
  occurrenceDates,
  buildProperties,
  buildManagementCustomers,
  patchClientProperty,
  expectedPassword,
  createStore,
  buildCalendar
} = require('../lib/eliteTasks');
const { registerEliteTasksRoutes } = require('../lib/eliteTasksRoutes');

function testCalendarTime() {
  const winter = buildCalendar([{ id: 'j1', date: '2026-11-18', startTime: '10:00', durationMinutes: 120, summary: 'Beach road', location: '10 Gulf Dr' }]);
  assert.ok(winter.includes('DTSTART:20261118T150000Z'));
  assert.ok(winter.includes('DTEND:20261118T170000Z'));
  assert.ok(winter.includes('SUMMARY:Beach road'));
  const summer = buildCalendar([{ id: 'j2', date: '2026-07-15', startTime: '10:00', durationMinutes: 60, summary: 'Beach road' }]);
  assert.ok(summer.includes('DTSTART:20260715T140000Z'));
}

function testDates() {
  assert.strictEqual(mondayOf('2026-11-16'), '2026-11-16');
  assert.strictEqual(mondayOf('2026-11-15'), '2026-11-09');
  assert.strictEqual(invoiceMonday('2026-11-16'), '2026-11-16');
  assert.strictEqual(invoiceMonday('2026-11-15'), '2026-11-16');
  assert.strictEqual(invoiceMonday('2026-11-17'), '2026-11-23');
  assert.strictEqual(invoiceMonday('2026-11-18'), '2026-11-23');
  assert.strictEqual(addDays('2026-11-16', 14), '2026-11-30');
  assert.deepStrictEqual(occurrenceDates('2026-11-16', 'weekly', 4), [
    '2026-11-16',
    '2026-11-23',
    '2026-11-30',
    '2026-12-07'
  ]);
  const biweekly = occurrenceDates('2026-11-16', 'biweekly', 26);
  assert.strictEqual(biweekly.length, 13);
  assert.strictEqual(biweekly[0], '2026-11-16');
  assert.strictEqual(biweekly[12], addDays('2026-11-16', 168));
  assert.deepStrictEqual(occurrenceDates('2026-11-16', 'once', 26), ['2026-11-16']);
}

function testProperties() {
  const data = {
    columns: ['Client ID', 'Name', 'Address', 'Access Code', 'Notes'],
    rows: [
      { 'Client ID': '#85', Name: 'Tracy', Address: 'Siesta', 'Access Code': '1111', Notes: 'Gate' },
      { 'Client ID': 'A', Name: 'One', Address: '1 Main', 'Access Code': '', Notes: '' },
      { 'Client ID': 'A', Name: 'Two', Address: '2 Main', 'Access Code': '', Notes: '' }
    ]
  };
  const props = buildProperties(data);
  assert.strictEqual(props.find((item) => item.clientId === '#85').id, '85');
  assert.strictEqual(props.find((item) => item.clientId === '#85').doorCode, '1111');
  const dupes = props.filter((item) => item.clientId === 'A');
  assert.strictEqual(dupes.length, 2);
  assert.notStrictEqual(dupes[0].id, dupes[1].id);
  const target = props.find((item) => item.name === 'Two');
  patchClientProperty(data, target.id, { doorCode: '2468', notes: 'Use the side door' });
  assert.strictEqual(data.rows[target.index]['Access Code'], '2468');
  assert.strictEqual(data.rows[target.index].Notes, 'Use the side door');
  assert.strictEqual(data.rows[0]['Access Code'], '1111');
}

async function testStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-'));
  const store = createStore(dir);
  const snap = await store.snapshot({ from: '2026-11-16', to: '2026-11-22', today: '2026-11-16' });
  assert.deepStrictEqual(snap.staff.map((person) => person.name), ['Petra', 'Sarah', 'Jill', 'Kylie']);
  const sarah = snap.staff.find((person) => person.name === 'Sarah');
  const jill = snap.staff.find((person) => person.name === 'Jill');
  const created = await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: sarah.id,
    date: '2026-11-16',
    startTime: '10:00',
    durationMinutes: 120,
    recurrence: 'weekly',
    weeksAhead: 4,
    visitNote: 'Oven',
    alertDate: '2026-11-16',
    alertTime: '08:00'
  });
  assert.strictEqual(created.count, 4);
  await assert.rejects(() => store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: sarah.id,
    date: '2026-11-16',
    startTime: '09:30',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  }), /10:00 AM/);
  await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: sarah.id,
    date: '2026-11-17',
    startTime: '10:00',
    durationMinutes: 360,
    deepClean: true,
    recurrence: 'once',
    weeksAhead: 1
  });
  const week = await store.snapshot({ from: '2026-11-16', to: '2026-12-31', today: '2026-11-16' });
  assert.strictEqual(week.jobs[0].alertDate, '2026-11-16');
  assert.strictEqual(week.jobs[0].alertTime, '08:00');
  assert.strictEqual(week.jobs[0].deepClean, false);
  const deep = week.jobs.find((job) => job.date === '2026-11-17');
  assert.strictEqual(deep.deepClean, true);
  assert.strictEqual(deep.durationMinutes, 360);
  const nextWeekly = week.jobs.find((job) => job.date === '2026-11-23');
  assert.strictEqual(nextWeekly.alertDate, '2026-11-23');
  assert.strictEqual(nextWeekly.alertTime, '08:00');
  const first = week.jobs[0];
  const acked = await store.setStatus(first.id, 'acknowledged', sarah.id);
  assert.strictEqual(acked.count, 4);
  const seriesSnap = await store.snapshot({ from: '2026-11-16', to: '2026-12-31', today: '2026-11-16' });
  const seriesJobs = seriesSnap.jobs.filter((job) => job.seriesId && job.seriesId === first.seriesId);
  assert.strictEqual(seriesJobs.length, 4);
  assert.ok(seriesJobs.every((job) => job.status === 'acknowledged'));
  assert.strictEqual(seriesSnap.jobs.find((job) => job.date === '2026-11-17').status, 'scheduled');
  const swappedVisit = seriesJobs.find((job) => job.date === '2026-11-23');
  await store.updateJob(swappedVisit.id, { staffId: jill.id });
  const swapped = await store.snapshot({ from: '2026-11-23', to: '2026-11-23', today: '2026-11-16' });
  assert.strictEqual(swapped.jobs[0].staffId, jill.id);
  assert.strictEqual(swapped.jobs[0].status, 'scheduled');
  assert.strictEqual(swapped.jobs[0].acknowledgedAt, null);
  await store.setStatus(swapped.jobs[0].id, 'acknowledged', jill.id);
  const jillVisit = await store.snapshot({ from: '2026-11-23', to: '2026-11-23', today: '2026-11-16' });
  assert.strictEqual(jillVisit.jobs[0].status, 'acknowledged');
  const sarahLater = await store.snapshot({ from: '2026-11-30', to: '2026-11-30', today: '2026-11-16' });
  assert.strictEqual(sarahLater.jobs[0].staffId, sarah.id);
  assert.strictEqual(sarahLater.jobs[0].status, 'acknowledged');
  await assert.rejects(() => store.setStatus(first.id, 'acknowledged', 'jill'), /Clean not found/);
  const after = await store.snapshot({ from: '2026-11-16', to: '2026-11-16', today: '2026-11-16' });
  assert.strictEqual(after.jobs[0].status, 'acknowledged');
  const cleared = await store.unacknowledge(first.id, sarah.id);
  assert.strictEqual(cleared.status, 'scheduled');
  assert.strictEqual(cleared.acknowledgedAt, null);
  await assert.rejects(() => store.unacknowledge(first.id, sarah.id), /not acknowledged/);
  await store.setStatus(first.id, 'acknowledged', sarah.id);
  await store.setStatus(first.id, 'completed', sarah.id);
  const done = await store.snapshot({ from: '2026-11-16', to: '2026-11-16', today: '2026-11-16' });
  assert.strictEqual(done.jobs[0].status, 'completed');
  assert.ok(done.jobs[0].acknowledgedAt);
  const removed = await store.deleteJobs(nextWeekly.id, 'future');
  assert.strictEqual(removed.removed, 3);
  const left = await store.snapshot({ from: '2026-11-16', to: '2026-12-31', today: '2026-11-16' });
  assert.strictEqual(left.jobs.length, 2);
  assert.ok(left.jobs.some((job) => job.deepClean && job.date === '2026-11-17'));
  await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffIds: [sarah.id, jill.id],
    date: '2026-11-18',
    startTime: '11:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  });
  const paired = await store.snapshot({ from: '2026-11-18', to: '2026-11-18', today: '2026-11-16' });
  const shared = paired.jobs.find((job) => job.startTime === '11:00');
  assert.deepStrictEqual(shared.staffIds, [sarah.id, jill.id]);
  const bySarah = await store.setStatus(shared.id, 'acknowledged', sarah.id);
  assert.strictEqual(bySarah.status, 'acknowledged');
  await assert.rejects(() => store.setStatus(shared.id, 'completed', 'kylie'), /Clean not found/);
  await assert.rejects(() => store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: sarah.id,
    date: '2026-11-18',
    startTime: '11:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  }), /already booked/i);
  const held = await store.snapshot({ from: '2026-11-18', to: '2026-11-18', today: '2026-11-16' });
  assert.strictEqual(held.jobs.filter((job) => job.startTime === '11:00').length, 1);
  const forced = await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: sarah.id,
    date: '2026-11-18',
    startTime: '11:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1,
    allowClash: true
  });
  assert.strictEqual(forced.count, 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testPetraAndAlerts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-petra-'));
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({
    version: 1,
    staff: [{ id: 'sarah', name: 'Sarah', token: 'a'.repeat(32), color: '#0f6e56', active: true }],
    jobs: [],
    blocks: []
  }));
  const store = createStore(dir);
  const snap = await store.snapshot({ from: '2026-11-15', to: '2026-11-21', today: '2026-11-16' });
  const petra = snap.staff.find((person) => person.name === 'Petra');
  assert.ok(petra && petra.active);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
  assert.ok(saved.staff.some((person) => person.name === 'Petra'));
  const created = await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: petra.id,
    date: '2026-11-16',
    startTime: '10:00',
    durationMinutes: 120,
    recurrence: 'weekly',
    weeksAhead: 2,
    alertDate: '2026-11-15',
    alertTime: '18:00'
  });
  assert.strictEqual(created.count, 2);
  const week = await store.snapshot({ from: '2026-11-15', to: '2026-11-30', today: '2026-11-16' });
  assert.strictEqual(week.jobs[0].staffId, petra.id);
  assert.strictEqual(week.jobs[0].alertDate, '2026-11-15');
  assert.strictEqual(week.jobs[1].alertDate, '2026-11-22');
  await store.updateJob(week.jobs[0].id, { alertDate: '', alertTime: '', applyTo: 'one' });
  const cleared = await store.snapshot({ from: '2026-11-15', to: '2026-11-30', today: '2026-11-16' });
  assert.strictEqual(cleared.jobs[0].alertDate, '');
  assert.strictEqual(cleared.jobs[1].alertDate, '2026-11-22');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testCustomers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-customers-'));
  const store = createStore(dir);
  const first = await store.seedCustomers([{ id: '85', name: 'Tracy', address: 'Siesta', doorCode: '1111' }]);
  assert.strictEqual(first.seeded, true);
  assert.strictEqual(first.count, 1);
  const second = await store.seedCustomers([{ id: 'x', name: 'Other', address: 'Nope' }]);
  assert.strictEqual(second.seeded, false);
  assert.strictEqual(second.count, 1);
  const added = await store.addCustomer({ name: 'Beach House', address: '10 Gulf Dr' });
  const updated = await store.updateCustomer(added.id, { address: '12 Gulf Dr' });
  assert.strictEqual(updated.name, 'Beach House');
  assert.strictEqual(updated.address, '12 Gulf Dr');
  await store.deleteCustomer(added.id);
  const list = await store.listCustomers();
  assert.deepStrictEqual(list.map((item) => item.name), ['Tracy']);
  const filled = await store.backfillPropertyNames([{ id: '85', clientId: '#85', name: 'Tracy' }]);
  assert.strictEqual(filled.updated, 1);
  const labeled = await store.listCustomers();
  assert.strictEqual(labeled[0].propertyName, '#85');
  assert.strictEqual(labeled[0].name, 'Tracy');
  await store.updateCustomer('85', { name: 'Siesta House' });
  const renamedOwner = await store.listCustomers();
  assert.strictEqual(renamedOwner[0].name, 'Siesta House');
  assert.strictEqual(renamedOwner[0].propertyName, '#85');
  const again = await store.backfillPropertyNames([{ id: '85', clientId: '#85', name: 'Tracy' }]);
  assert.strictEqual(again.updated, 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testHttp() {
  const previousPass = process.env.ELITE_TASKS_PASSWORD;
  const previousDir = process.env.ELITE_TASKS_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-http-'));
  process.env.ELITE_TASKS_PASSWORD = 'test-pass';
  process.env.ELITE_TASKS_DATA_DIR = dir;
  let db = {
    columns: ['Client ID', 'Name', 'Address', 'Access Code', 'Notes', 'Frequency', 'Phone number'],
    rows: [{
      'Client ID': '#85',
      Name: 'Tracy',
      Address: 'Siesta Key',
      'Access Code': '1111',
      Notes: 'Gate',
      Frequency: 'weekly',
      'Phone number': '9415550100'
    }]
  };
  const app = express();
  app.use(express.json());
  registerEliteTasksRoutes(app, {
    readClientFull: () => JSON.parse(JSON.stringify(db)),
    writeClientFull: (data) => {
      db = JSON.parse(JSON.stringify(data));
      return db;
    }
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-11-22&today=2026-11-16`);
    assert.strictEqual(denied.status, 401);
    const badLogin = await fetch(`${base}/api/elite-tasks/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nope' })
    });
    assert.strictEqual(badLogin.status, 401);
    const headers = { 'Content-Type': 'application/json', 'x-elite-tasks-password': 'test-pass' };
    const weekRes = await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-12-31&today=2026-11-16`, { headers });
    const week = await weekRes.json();
    assert.strictEqual(week.role, 'manager');
    assert.ok(week.properties.some((item) => item.name === 'Tracy' && item.propertyName === '#85' && item.doorCode === '1111' && item.address === 'Siesta Key'));
    assert.ok(!JSON.stringify(week.properties).match(/Price per Visit|"Pay"/));
    const sarah = week.staff.find((person) => person.name === 'Sarah');
    const jill = week.staff.find((person) => person.name === 'Jill');
    assert.deepStrictEqual(week.staff.map((person) => person.name), ['Petra', 'Sarah', 'Jill', 'Kylie']);
    assert.ok(week.staff.every((person) => person.completed === 0 && person.acknowledged === 0 && person.outstanding === 0));
    for (const name of ['Petr', 'Maya']) {
      const added = await fetch(`${base}/api/elite-tasks/staff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name })
      });
      assert.strictEqual(added.status, 201);
    }
    const hidden = await (await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-12-31&today=2026-11-16`, { headers })).json();
    assert.deepStrictEqual(hidden.staff.map((person) => person.name), ['Petra', 'Sarah', 'Jill', 'Kylie']);
    const property = week.properties.find((item) => item.name === 'Tracy');
    const adminPage = await fetch(`${base}/Elite-TaskMgmt`);
    assert.match(adminPage.headers.get('x-robots-tag') || '', /noindex/i);
    await adminPage.text();
    const staffPage = await fetch(`${base}/Elite-TaskMgmt/sarah/${sarah.token}`);
    assert.strictEqual(staffPage.status, 200);
    assert.match(staffPage.headers.get('x-robots-tag') || '', /noindex/i);
    await staffPage.text();
    assert.match(sarah.token, /^[a-f0-9]{8}$/);
    const shortPage = await fetch(`${base}/Elite-TaskMgmt/${sarah.token}`);
    assert.strictEqual(shortPage.status, 200);
    const createdRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: sarah.id,
        date: '2026-11-16',
        startTime: '10:00',
        durationMinutes: 90,
        recurrence: 'biweekly',
        weeksAhead: 8,
        visitNote: 'Extra oven'
      })
    });
    const created = await createdRes.json();
    assert.strictEqual(createdRes.status, 201);
    assert.strictEqual(created.count, 4);
    const bookedRes = await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-12-31&today=2026-11-16`, { headers });
    const booked = await bookedRes.json();
    assert.strictEqual(booked.jobs.length, 4);
    assert.strictEqual(booked.jobs[0].status, 'scheduled');
    assert.strictEqual(booked.jobs[0].doorCode, '1111');
    assert.strictEqual(booked.jobs[0].propertyName, '#85');
    assert.strictEqual(booked.jobs[0].address, 'Siesta Key');
    assert.ok(!JSON.stringify(booked.jobs).match(/Price per Visit|"Pay"/));
    assert.strictEqual(booked.jobs[0].payment, '');
    const invoicedRes = await fetch(`${base}/api/elite-tasks/jobs/${booked.jobs[0].id}/payment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ payment: 'invoiced' })
    });
    assert.strictEqual(invoicedRes.status, 200);
    const paidRes = await fetch(`${base}/api/elite-tasks/jobs/${booked.jobs[1].id}/payment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ payment: 'paid' })
    });
    assert.strictEqual(paidRes.status, 200);
    const report = await (await fetch(`${base}/api/elite-tasks/report`, { headers })).json();
    const firstWeek = report.weeks.find((week) => week.start === '2026-11-15');
    assert.strictEqual(firstWeek.end, '2026-11-21');
    assert.strictEqual(firstWeek.total, 1);
    assert.strictEqual(firstWeek.outstandingCount, 1);
    assert.strictEqual(firstWeek.cleaners[0].name, 'Sarah');
    const paidWeek = report.weeks.find((week) => week.paid === 1);
    assert.strictEqual(paidWeek.start, '2026-11-29');
    const wrongAck = await fetch(`${base}/api/elite-tasks/me/jobs/${booked.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': jill.token },
      body: '{}'
    });
    assert.strictEqual(wrongAck.status, 404);
    const ackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${booked.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: '{}'
    });
    assert.strictEqual(ackRes.status, 200);
    const mineRes = await fetch(`${base}/api/elite-tasks/me?from=2026-11-16&to=2026-12-31&today=2026-11-16`, {
      headers: { 'x-elite-tasks-token': sarah.token }
    });
    const mine = await mineRes.json();
    assert.strictEqual(mine.staff.name, 'Sarah');
    assert.strictEqual(mine.staff.token, undefined);
    assert.strictEqual(mine.properties, undefined);
    assert.ok(mine.jobs.every((job) => job.staffId === sarah.id));
    assert.strictEqual(mine.jobs[0].status, 'acknowledged');
    assert.strictEqual(mine.jobs[0].doorCode, '1111');
    assert.strictEqual(mine.jobs[0].payment, undefined);
    assert.strictEqual(mine.jobs[0].phone, undefined);
    assert.strictEqual(booked.jobs[0].phone, '9415550100');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const photoForm = new FormData();
    photoForm.append('photos', new Blob([png], { type: 'image/png' }), 'dot.png');
    const photoRes = await fetch(`${base}/api/elite-tasks/me/jobs/${booked.jobs[0].id}/photos`, {
      method: 'POST',
      headers: { 'x-elite-tasks-token': sarah.token },
      body: photoForm
    });
    assert.strictEqual(photoRes.status, 201);
    const photoBody = await photoRes.json();
    assert.strictEqual(photoBody.photos.length, 1);
    const managerPhoto = await fetch(`${base}/api/elite-tasks/jobs/${booked.jobs[0].id}/photos/${photoBody.photos[0].id}`, { headers });
    assert.strictEqual(managerPhoto.status, 200);
    assert.match(managerPhoto.headers.get('content-type') || '', /image\/png/);
    assert.strictEqual((await managerPhoto.arrayBuffer()).byteLength, png.length);
    const strangerPhoto = await fetch(`${base}/api/elite-tasks/jobs/${booked.jobs[0].id}/photos/${photoBody.photos[0].id}`, {
      headers: { 'x-elite-tasks-token': jill.token }
    });
    assert.strictEqual(strangerPhoto.status, 404);
    const withPhotos = await (await fetch(`${base}/api/elite-tasks/me?from=2026-11-16&to=2026-12-31&today=2026-11-16`, {
      headers: { 'x-elite-tasks-token': sarah.token }
    })).json();
    assert.strictEqual(withPhotos.jobs.find((job) => job.id === booked.jobs[0].id).photos.length, 1);
    const unackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/unack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: '{}'
    });
    assert.strictEqual(unackRes.status, 200);
    const unacked = await unackRes.json();
    assert.strictEqual(unacked.status, 'scheduled');
    assert.strictEqual(unacked.acknowledgedAt, null);
    const reackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: '{}'
    });
    assert.strictEqual(reackRes.status, 200);
    const doneRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: '{}'
    });
    assert.strictEqual(doneRes.status, 200);
    const seenRes = await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-11-22&today=2026-11-16`, { headers });
    const seen = await seenRes.json();
    assert.strictEqual(seen.jobs[0].status, 'completed');
    assert.ok(seen.jobs[0].acknowledgedAt);
    const saveRes = await fetch(`${base}/api/elite-tasks/properties/${property.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ doorCode: '4321', notes: 'Lockbox on the left' })
    });
    assert.strictEqual(saveRes.status, 200);
    const refreshedRes = await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-11-22&today=2026-11-16`, { headers });
    const refreshed = await refreshedRes.json();
    assert.strictEqual(refreshed.jobs[0].doorCode, '4321');
    assert.strictEqual(refreshed.jobs[0].propertyNotes, 'Lockbox on the left');
    assert.strictEqual(db.rows[0]['Access Code'], '1111');
    const renamedRes = await fetch(`${base}/api/elite-tasks/properties/${property.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ propertyName: 'Siesta House', address: '100 Beach Rd', doorCode: '4321', notes: 'Lockbox on the left' })
    });
    assert.strictEqual(renamedRes.status, 200);
    const renamedWeek = await (await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-11-22&today=2026-11-16`, { headers })).json();
    assert.strictEqual(renamedWeek.jobs[0].propertyName, 'Siesta House');
    assert.strictEqual(renamedWeek.jobs[0].address, '100 Beach Rd');
    const addedRes = await fetch(`${base}/api/elite-tasks/properties`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Gulf Cottage', address: '4 Bay St' })
    });
    assert.strictEqual(addedRes.status, 201);
    const added = await addedRes.json();
    const deleteRes = await fetch(`${base}/api/elite-tasks/properties/${added.property.id}`, { method: 'DELETE', headers });
    assert.strictEqual(deleteRes.status, 200);
    const afterDelete = await (await fetch(`${base}/api/elite-tasks/week?from=2026-11-16&to=2026-11-22&today=2026-11-16`, { headers })).json();
    assert.ok(afterDelete.properties.some((item) => item.propertyName === 'Siesta House' && item.name === 'Siesta House'));
    assert.ok(!afterDelete.properties.some((item) => item.propertyName === 'Gulf Cottage'));
    const blockRes = await fetch(`${base}/api/elite-tasks/me/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: JSON.stringify({ startDate: '2026-11-20', endDate: '2026-11-22', note: 'Off' })
    });
    assert.strictEqual(blockRes.status, 201);
    const warnRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: sarah.id,
        date: '2026-11-20',
        startTime: '10:00',
        durationMinutes: 60,
        recurrence: 'once'
      })
    });
    const warn = await warnRes.json();
    assert.strictEqual(warnRes.status, 400);
    assert.ok(/blocked/i.test(warn.error));
    const openRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: jill.id,
        date: '2026-11-20',
        startTime: '10:00',
        durationMinutes: 60,
        recurrence: 'once'
      })
    });
    assert.strictEqual(openRes.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousPass == null) delete process.env.ELITE_TASKS_PASSWORD;
    else process.env.ELITE_TASKS_PASSWORD = previousPass;
    if (previousDir == null) delete process.env.ELITE_TASKS_DATA_DIR;
    else process.env.ELITE_TASKS_DATA_DIR = previousDir;
  }
}

async function testAssignmentEmail() {
  const previousPass = process.env.ELITE_TASKS_PASSWORD;
  const previousDir = process.env.ELITE_TASKS_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-mail-'));
  process.env.ELITE_TASKS_PASSWORD = 'test-pass';
  process.env.ELITE_TASKS_DATA_DIR = dir;
  const sent = [];
  const app = express();
  app.use(express.json());
  registerEliteTasksRoutes(app, {
    readClientFull: () => ({
      columns: ['Client ID', 'Name', 'Address', 'Access Code', 'Phone number'],
      rows: [{ 'Client ID': 'Beach road', Name: 'Owner Person', Address: '10 Gulf Dr', 'Access Code': '4321', 'Phone number': '9415550100' }]
    }),
    writeClientFull: (data) => data,
    sendMail: async (mail) => { sent.push(mail); }
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = { 'Content-Type': 'application/json', 'x-elite-tasks-password': 'test-pass' };
    const week = await (await fetch(`${base}/api/elite-tasks/week?from=2026-11-18&to=2026-12-31&today=2026-11-18`, { headers })).json();
    const sarah = week.staff.find((person) => person.name === 'Sarah');
    const jill = week.staff.find((person) => person.name === 'Jill');
    const property = week.properties.find((item) => item.propertyName === 'Beach road');
    const blocked = await fetch(`${base}/api/elite-tasks/staff/${sarah.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ emailAlerts: true })
    });
    assert.strictEqual(blocked.status, 400);
    const saved = await fetch(`${base}/api/elite-tasks/staff/${sarah.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Sarah', email: 'sarah@example.com', emailAlerts: true })
    });
    assert.strictEqual(saved.status, 200);
    const createdRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: sarah.id,
        date: '2026-11-18',
        startTime: '10:00',
        durationMinutes: 120,
        recurrence: 'weekly',
        weeksAhead: 4
      })
    });
    const created = await createdRes.json();
    assert.strictEqual(createdRes.status, 201);
    assert.strictEqual(created.count, 4);
    assert.strictEqual(created.assignments, undefined);
    assert.deepStrictEqual(created.emailed, ['Sarah']);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'sarah@example.com');
    assert.ok(sent[0].text.includes('Beach road'));
    assert.ok(sent[0].text.includes('10 Gulf Dr'));
    assert.ok(sent[0].text.includes('Door code: 4321'));
    assert.ok(sent[0].text.includes('date=2026-11-18'));
    assert.ok(sent[0].text.includes('time=10%3A00'));
    assert.ok(sent[0].html.includes('date=2026-11-18'));
    assert.ok(sent[0].html.includes('New Cleaning Assignment'));
    assert.ok(sent[0].html.includes('View My Cleaning Schedule'));
    assert.ok(sent[0].html.includes('elite-invoice-logo-rectangle.png'));
    assert.ok(sent[0].html.includes('10:00 AM'));
    assert.ok(sent[0].html.includes('Door code'));
    assert.ok(!sent[0].text.includes('Owner Person'));
    assert.ok(!sent[0].html.includes('Owner Person'));
    assert.ok(!sent[0].html.includes('9415550100'));
    const booked = await (await fetch(`${base}/api/elite-tasks/week?from=2026-11-18&to=2026-12-31&today=2026-11-18`, { headers })).json();
    const visits = booked.jobs.filter((job) => job.propertyName === 'Beach road').sort((a, b) => a.date.localeCompare(b.date));
    const quiet = await fetch(`${base}/api/elite-tasks/jobs/${visits[1].id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ staffId: jill.id })
    });
    const quietBody = await quiet.json();
    assert.strictEqual(quiet.status, 200);
    assert.deepStrictEqual(quietBody.emailed, []);
    assert.strictEqual(sent.length, 1);
    await fetch(`${base}/api/elite-tasks/staff/${jill.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ email: 'jill@example.com', emailAlerts: true })
    });
    const swapped = await fetch(`${base}/api/elite-tasks/jobs/${visits[2].id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ staffId: jill.id })
    });
    const swappedBody = await swapped.json();
    assert.deepStrictEqual(swappedBody.emailed, ['Jill']);
    assert.strictEqual(sent[1].to, 'jill@example.com');
    assert.ok(sent[1].text.includes('Beach road'));
    const quietCalendar = await fetch(`${base}/Elite-TaskMgmt/calendar/${sarah.token}.ics`);
    assert.strictEqual(quietCalendar.status, 200);
    assert.ok(!(await quietCalendar.text()).includes('BEGIN:VEVENT'));
    const ackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${visits[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: '{}'
    });
    assert.strictEqual(ackRes.status, 200);
    const sarahCalendar = await (await fetch(`${base}/Elite-TaskMgmt/calendar/${sarah.token}.ics`)).text();
    assert.ok(sarahCalendar.includes('SUMMARY:Beach road'));
    assert.ok(sarahCalendar.includes('DTSTART:20261118T150000Z'));
    assert.ok(sarahCalendar.includes('Door code: 4321'));
    assert.ok(!sarahCalendar.includes('Owner Person'));
    assert.ok(!sarahCalendar.includes('20261125T150000Z'));
    const allCalendar = await (await fetch(`${base}/Elite-TaskMgmt/calendar/${booked.calendarToken}.ics`)).text();
    assert.ok(allCalendar.includes('SUMMARY:Sarah · Beach road'));
    assert.ok(!allCalendar.includes('20261125T150000Z'));
    const paused = await fetch(`${base}/api/elite-tasks/settings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ calendarSync: false })
    });
    assert.strictEqual(paused.status, 200);
    const pausedFeed = await (await fetch(`${base}/Elite-TaskMgmt/calendar/${booked.calendarToken}.ics`)).text();
    assert.ok(!pausedFeed.includes('BEGIN:VEVENT'));
    const staffPaused = await fetch(`${base}/api/elite-tasks/me/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': sarah.token },
      body: JSON.stringify({ calendarSync: false })
    });
    assert.strictEqual(staffPaused.status, 200);
    const staffFeed = await (await fetch(`${base}/Elite-TaskMgmt/calendar/${sarah.token}.ics`)).text();
    assert.ok(!staffFeed.includes('BEGIN:VEVENT'));
    const missing = await fetch(`${base}/Elite-TaskMgmt/calendar/${'ab'.repeat(20)}.ics`);
    assert.strictEqual(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousPass == null) delete process.env.ELITE_TASKS_PASSWORD;
    else process.env.ELITE_TASKS_PASSWORD = previousPass;
    if (previousDir == null) delete process.env.ELITE_TASKS_DATA_DIR;
    else process.env.ELITE_TASKS_DATA_DIR = previousDir;
  }
}

async function testPaymentReport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-report-'));
  const store = createStore(dir);
  const staff = (await store.snapshot({ from: '2026-11-15', to: '2026-11-22', today: '2026-11-16' })).staff;
  const sarah = staff.find((person) => person.name === 'Sarah');
  const jill = staff.find((person) => person.name === 'Jill');
  const property = { id: 'beach', name: 'Beach road', propertyName: 'Beach road', address: '10 Gulf Dr', doorCode: '1', notes: '' };
  const created = await store.createJobs({
    property,
    staffIds: [sarah.id, jill.id],
    date: '2026-11-15',
    startTime: '10:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  });
  const saturday = await store.createJobs({
    property,
    staffId: sarah.id,
    date: '2026-11-21',
    startTime: '11:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  });
  const next = await store.createJobs({
    property,
    staffId: jill.id,
    date: '2026-11-22',
    startTime: '10:00',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  });
  await store.setPayment(created.assignments[0].jobs[0].id, 'invoiced');
  await store.setPayment(saturday.assignments[0].jobs[0].id, 'paid');
  const report = await store.report('2026-11-22');
  const first = report.weeks.find((week) => week.start === '2026-11-15');
  assert.strictEqual(first.end, '2026-11-21');
  assert.strictEqual(first.total, 2);
  assert.strictEqual(first.paid, 1);
  assert.strictEqual(first.outstandingCount, 1);
  assert.strictEqual(first.outstanding[0].propertyName, 'Beach road');
  assert.deepStrictEqual(first.cleaners.map((person) => person.name).sort(), ['Jill', 'Sarah']);
  const sarahRow = first.cleaners.find((person) => person.name === 'Sarah');
  assert.strictEqual(sarahRow.count, 2);
  const later = report.weeks.find((week) => week.start === '2026-11-22');
  assert.strictEqual(later.total, 1);
  assert.strictEqual(later.outstandingCount, 0);
  const undone = await store.setPayment(created.assignments[0].jobs[0].id, 'none');
  assert.strictEqual(undone.payment, '');
  const cleared = await store.report('2026-11-22');
  assert.strictEqual(cleared.weeks.find((week) => week.start === '2026-11-15').outstandingCount, 0);
  const current = report.invoices.find((period) => period.monday === '2026-11-23');
  assert.strictEqual(current.start, '2026-11-17');
  assert.strictEqual(current.end, '2026-11-23');
  assert.strictEqual(current.toBillCustomers, 1);
  assert.strictEqual(current.toBillCleans, 1);
  assert.strictEqual(current.customers[0].propertyName, 'Beach road');
  const earlier = report.invoices.find((period) => period.monday === '2026-11-16');
  assert.strictEqual(earlier.start, '2026-11-10');
  assert.strictEqual(earlier.toBillCleans, 0);
  assert.strictEqual(earlier.customers[0].cleans[0].payment, 'invoiced');
  const midweek = await store.report('2026-11-18');
  assert.strictEqual(midweek.invoices.find((period) => period.monday === '2026-11-23').customers.length, 0);
  const direct = await store.setPayment(next.assignments[0].jobs[0].id, 'paid');
  assert.strictEqual(direct.payment, 'paid');
  assert.ok(direct.invoicedAt);
  assert.ok(direct.paidAt);
  assert.ok(next.assignments[0].jobs[0].id);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testManagementCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-management-'));
  const store = createStore(dir);
  await store.seedCustomers([
    { id: '85', name: 'Tracy', address: 'Siesta Key', doorCode: '5619', notes: 'Gate' },
    { id: 'beach-road', name: 'Owner', address: 'Sarasota', doorCode: '1' }
  ]);
  const incoming = buildManagementCustomers([
    { id: '85', displayName: '#85', billToName: 'Bay Oaks', billToLines: [], defaultAmount: 150 },
    { id: 'afton', displayName: 'Afton', billToName: 'Magdalena Halbowicz', billToLines: ['1350 Paddock Place', 'Bartlett, IL 60103'], defaultAmount: 200 }
  ]);
  const first = await store.adoptManagementClients(incoming);
  assert.strictEqual(first.synced, true);
  assert.strictEqual(first.count, 2);
  const list = await store.listCustomers();
  const house = list.find((item) => item.id === '85');
  assert.strictEqual(house.propertyName, '#85');
  assert.strictEqual(house.name, '#85');
  assert.strictEqual(house.address, '');
  assert.strictEqual(house.doorCode, '5619');
  assert.strictEqual(house.notes, 'Gate');
  const afton = list.find((item) => item.propertyName === 'Afton');
  assert.strictEqual(afton.address, '1350 Paddock Place\nBartlett, IL 60103');
  assert.ok(!list.some((item) => item.name === 'Tracy' || item.propertyName === 'Beach road' || item.name === 'Bay Oaks' || item.name === 'Magdalena Halbowicz'));
  await store.updateCustomer('85', { doorCode: '9999', notes: 'Side door' });
  const second = await store.adoptManagementClients(incoming);
  assert.strictEqual(second.synced, false);
  const kept = (await store.listCustomers()).find((item) => item.id === '85');
  assert.strictEqual(kept.doorCode, '9999');
  assert.strictEqual(kept.notes, 'Side door');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function testExtraProperties() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tasks-extra-'));
  const store = createStore(dir);
  await store.seedCustomers([
    { id: 'alameda', name: 'Alameda', label: 'Alameda', address: '2400 Alameda Ave', doorCode: '44', notes: 'Dogs' }
  ]);
  const first = await store.mergeExtraProperties();
  assert.strictEqual(first.added, first.total - 1);
  assert.ok(first.total >= 29);
  const list = await store.listCustomers();
  const alameda = list.find((item) => item.propertyName === 'Alameda');
  assert.strictEqual(alameda.doorCode, '44');
  assert.strictEqual(alameda.notes, 'Dogs');
  assert.strictEqual(alameda.address, '2400 Alameda Ave');
  const cottage = list.find((item) => item.propertyName === 'Bay Shore Cottage');
  assert.strictEqual(cottage.address, '4522 Bayshore Rd Front Cottage');
  const house = list.find((item) => item.propertyName === 'The Beach House');
  assert.strictEqual(house.address, '564 Beach Rd (All 3 Units)');
  const second = await store.mergeExtraProperties();
  assert.strictEqual(second.added, 0);
  await store.deleteCustomer(cottage.id);
  const third = await store.mergeExtraProperties();
  assert.strictEqual(third.added, 0);
  assert.ok(!(await store.listCustomers()).some((item) => item.propertyName === 'Bay Shore Cottage'));
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  const previousTasks = process.env.ELITE_TASKS_PASSWORD;
  const previousElite = process.env.ELITE_INVOICES_AUTH_PASS;
  delete process.env.ELITE_TASKS_PASSWORD;
  delete process.env.ELITE_INVOICES_AUTH_PASS;
  assert.strictEqual(expectedPassword(), '');
  process.env.ELITE_INVOICES_AUTH_PASS = '"from-render"';
  assert.strictEqual(expectedPassword(), 'from-render');
  process.env.ELITE_TASKS_PASSWORD = '"quoted-pass"';
  assert.strictEqual(expectedPassword(), 'quoted-pass');
  if (previousTasks == null) delete process.env.ELITE_TASKS_PASSWORD;
  else process.env.ELITE_TASKS_PASSWORD = previousTasks;
  if (previousElite == null) delete process.env.ELITE_INVOICES_AUTH_PASS;
  else process.env.ELITE_INVOICES_AUTH_PASS = previousElite;
  testDates();
  testCalendarTime();
  testProperties();
  await testStore();
  await testPetraAndAlerts();
  await testCustomers();
  await testManagementCopy();
  await testExtraProperties();
  await testPaymentReport();
  await testHttp();
  await testAssignmentEmail();
  console.log('elite tasks tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
