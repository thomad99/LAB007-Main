'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const {
  addDays,
  mondayOf,
  occurrenceDates,
  buildProperties,
  patchClientProperty,
  expectedPassword,
  createStore
} = require('../lib/eliteTasks');
const { registerEliteTasksRoutes } = require('../lib/eliteTasksRoutes');

function testDates() {
  assert.strictEqual(mondayOf('2026-11-16'), '2026-11-16');
  assert.strictEqual(mondayOf('2026-11-15'), '2026-11-09');
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
  assert.deepStrictEqual(snap.staff.map((person) => person.name), ['Petra', 'Sarah', 'Jill', 'Kylie', 'Petr', 'Maya']);
  const petr = snap.staff.find((person) => person.name === 'Petr');
  const created = await store.createJobs({
    property: { id: '85', clientId: '#85', name: 'Tracy', address: 'Siesta' },
    staffId: petr.id,
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
    staffId: petr.id,
    date: '2026-11-16',
    startTime: '09:30',
    durationMinutes: 120,
    recurrence: 'once',
    weeksAhead: 1
  }), /10:00 AM/);
  const week = await store.snapshot({ from: '2026-11-16', to: '2026-12-31', today: '2026-11-16' });
  assert.strictEqual(week.jobs[0].alertDate, '2026-11-16');
  assert.strictEqual(week.jobs[0].alertTime, '08:00');
  assert.strictEqual(week.jobs[1].alertDate, '2026-11-23');
  assert.strictEqual(week.jobs[1].alertTime, '08:00');
  const first = week.jobs[0];
  await store.setStatus(first.id, 'acknowledged', petr.id);
  await assert.rejects(() => store.setStatus(first.id, 'acknowledged', 'jill'), /Clean not found/);
  const after = await store.snapshot({ from: '2026-11-16', to: '2026-11-16', today: '2026-11-16' });
  assert.strictEqual(after.jobs[0].status, 'acknowledged');
  const cleared = await store.unacknowledge(first.id, petr.id);
  assert.strictEqual(cleared.status, 'scheduled');
  assert.strictEqual(cleared.acknowledgedAt, null);
  await assert.rejects(() => store.unacknowledge(first.id, petr.id), /not acknowledged/);
  await store.setStatus(first.id, 'acknowledged', petr.id);
  await store.setStatus(first.id, 'completed', petr.id);
  const done = await store.snapshot({ from: '2026-11-16', to: '2026-11-16', today: '2026-11-16' });
  assert.strictEqual(done.jobs[0].status, 'completed');
  assert.ok(done.jobs[0].acknowledgedAt);
  const removed = await store.deleteJobs(week.jobs[1].id, 'future');
  assert.strictEqual(removed.removed, 3);
  const left = await store.snapshot({ from: '2026-11-16', to: '2026-12-31', today: '2026-11-16' });
  assert.strictEqual(left.jobs.length, 1);
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
    assert.ok(week.properties.some((item) => item.name === 'Tracy' && item.doorCode === '1111' && item.address === 'Siesta Key'));
    assert.ok(!JSON.stringify(week.properties).match(/Price per Visit|"Pay"/));
    const petr = week.staff.find((person) => person.name === 'Petr');
    const jill = week.staff.find((person) => person.name === 'Jill');
    const property = week.properties.find((item) => item.name === 'Tracy');
    const adminPage = await fetch(`${base}/Elite-TaskMgmt`);
    assert.match(adminPage.headers.get('x-robots-tag') || '', /noindex/i);
    await adminPage.text();
    const staffPage = await fetch(`${base}/Elite-TaskMgmt/petr/${petr.token}`);
    assert.strictEqual(staffPage.status, 200);
    assert.match(staffPage.headers.get('x-robots-tag') || '', /noindex/i);
    await staffPage.text();
    const createdRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: petr.id,
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
    assert.strictEqual(booked.jobs[0].propertyName, 'Tracy');
    assert.strictEqual(booked.jobs[0].address, 'Siesta Key');
    assert.ok(!JSON.stringify(booked.jobs).match(/Price per Visit|"Pay"/));
    const wrongAck = await fetch(`${base}/api/elite-tasks/me/jobs/${booked.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': jill.token },
      body: '{}'
    });
    assert.strictEqual(wrongAck.status, 404);
    const ackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${booked.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': petr.token },
      body: '{}'
    });
    assert.strictEqual(ackRes.status, 200);
    const mineRes = await fetch(`${base}/api/elite-tasks/me?from=2026-11-16&to=2026-12-31&today=2026-11-16`, {
      headers: { 'x-elite-tasks-token': petr.token }
    });
    const mine = await mineRes.json();
    assert.strictEqual(mine.staff.name, 'Petr');
    assert.strictEqual(mine.staff.token, undefined);
    assert.strictEqual(mine.properties, undefined);
    assert.ok(mine.jobs.every((job) => job.staffId === petr.id));
    assert.strictEqual(mine.jobs[0].status, 'acknowledged');
    assert.strictEqual(mine.jobs[0].doorCode, '1111');
    const unackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/unack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': petr.token },
      body: '{}'
    });
    assert.strictEqual(unackRes.status, 200);
    const unacked = await unackRes.json();
    assert.strictEqual(unacked.status, 'scheduled');
    assert.strictEqual(unacked.acknowledgedAt, null);
    const reackRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': petr.token },
      body: '{}'
    });
    assert.strictEqual(reackRes.status, 200);
    const doneRes = await fetch(`${base}/api/elite-tasks/me/jobs/${mine.jobs[0].id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': petr.token },
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
      body: JSON.stringify({ name: 'Siesta House', address: '100 Beach Rd', doorCode: '4321', notes: 'Lockbox on the left' })
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
    assert.ok(afterDelete.properties.some((item) => item.name === 'Siesta House'));
    assert.ok(!afterDelete.properties.some((item) => item.name === 'Gulf Cottage'));
    const blockRes = await fetch(`${base}/api/elite-tasks/me/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-elite-tasks-token': petr.token },
      body: JSON.stringify({ startDate: '2026-11-20', endDate: '2026-11-22', note: 'Off' })
    });
    assert.strictEqual(blockRes.status, 201);
    const warnRes = await fetch(`${base}/api/elite-tasks/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        propertyId: property.id,
        staffId: petr.id,
        date: '2026-11-20',
        startTime: '10:00',
        durationMinutes: 60,
        recurrence: 'once'
      })
    });
    const warn = await warnRes.json();
    assert.strictEqual(warn.count, 1);
    assert.ok(warn.warnings.some((line) => /unavailable/i.test(line)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousPass == null) delete process.env.ELITE_TASKS_PASSWORD;
    else process.env.ELITE_TASKS_PASSWORD = previousPass;
    if (previousDir == null) delete process.env.ELITE_TASKS_DATA_DIR;
    else process.env.ELITE_TASKS_DATA_DIR = previousDir;
  }
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
  testProperties();
  await testStore();
  await testPetraAndAlerts();
  await testCustomers();
  await testHttp();
  console.log('elite tasks tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
