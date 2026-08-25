'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = process.env.MOM_AI_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'valkyrie-ai-author');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'ratings.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, model TEXT NOT NULL, policy_version INTEGER NOT NULL,
  prompt_version INTEGER NOT NULL, critic_version INTEGER NOT NULL,
  hook INTEGER NOT NULL, atmosphere INTEGER NOT NULL, coherence INTEGER NOT NULL,
  agency INTEGER NOT NULL, pacing INTEGER NOT NULL, mom_fit INTEGER NOT NULL,
  finale INTEGER NOT NULL, approved INTEGER NOT NULL, validator_passed INTEGER NOT NULL,
  repairs INTEGER NOT NULL, latency_ms INTEGER NOT NULL, created_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS outcomes (
  id INTEGER PRIMARY KEY, model TEXT NOT NULL, validator_passed INTEGER NOT NULL,
  repairs INTEGER NOT NULL, latency_ms INTEGER NOT NULL, created_at INTEGER NOT NULL
)`);

function recordReview(review) {
  const ratings = review.ratings;
  db.prepare(`INSERT INTO reviews (
    model, policy_version, prompt_version, critic_version, hook, atmosphere, coherence,
    agency, pacing, mom_fit, finale, approved, validator_passed, repairs, latency_ms, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(review.model, review.policyVersion, review.promptVersion, review.criticVersion,
      ratings.hook, ratings.atmosphere, ratings.coherence, ratings.agency, ratings.pacing, ratings.momFit,
      ratings.finale, review.approved ? 1 : 0, review.validatorPassed ? 1 : 0,
      review.repairs || 0, review.latencyMs || 0, Date.now());
}
function recordOutcome(outcome) {
  db.prepare('INSERT INTO outcomes (model, validator_passed, repairs, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(outcome.model, outcome.validatorPassed ? 1 : 0, outcome.repairs || 0, outcome.latencyMs || 0, Date.now());
}

function modelScores() {
  const rows = db.prepare(`SELECT model, COUNT(*) AS samples,
    AVG((hook + atmosphere + coherence + agency + pacing + mom_fit + finale) / 7.0) AS narrative,
    AVG(approved) AS approval FROM reviews GROUP BY model HAVING samples >= 5`).all();
  const outcomes = Object.fromEntries(db.prepare('SELECT model, AVG(validator_passed) AS valid, AVG(repairs) AS repairs, AVG(latency_ms) AS latency FROM outcomes GROUP BY model').all().map((row) => [row.model, row]));
  return Object.fromEntries(rows.map((row) => [row.model,
    row.narrative * 0.6 + row.approval * 5 * 0.2 + ((outcomes[row.model] || {}).valid || 0) * 5 * 0.15 - Math.min((outcomes[row.model] || {}).repairs || 0, 3) * 0.1 - Math.min(((outcomes[row.model] || {}).latency || 0) / 60000, 1) * 0.05
  ]));
}

module.exports = { recordReview, recordOutcome, modelScores, dataDir };
