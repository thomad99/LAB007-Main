/**
 * Persisted scheduled jobs (JSON). Env:
 *   SCHEDULED_JOBS_PATH — full path to JSON file (optional)
 *   LAB007_DATA_DIR — directory containing scheduled-jobs.json when path not set
 */

'use strict';

const fs = require('fs');
const path = require('path');

function jobsFilePath() {
  const explicit = String(process.env.SCHEDULED_JOBS_PATH || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'scheduled-jobs.json');
  return path.join(path.dirname(__dirname), 'data', 'scheduled-jobs.json');
}

function readJobs() {
  const p = jobsFilePath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.jobs) ? j.jobs : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  const p = jobsFilePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ jobs, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

function addJob(job) {
  const jobs = readJobs();
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

function removeJob(id) {
  const jobs = readJobs().filter((j) => j.id !== id);
  writeJobs(jobs);
}

function updateJob(id, patch) {
  const jobs = readJobs();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return null;
  jobs[i] = { ...jobs[i], ...patch };
  writeJobs(jobs);
  return jobs[i];
}

module.exports = {
  jobsFilePath,
  readJobs,
  writeJobs,
  addJob,
  removeJob,
  updateJob
};
