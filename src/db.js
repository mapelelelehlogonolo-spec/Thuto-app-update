// SQLite database setup. Uses a single file (data/thuto.db) so it works on
// any host with a persistent disk (Render, Railway, Fly.io, a VPS, Docker).
// NOTE: Serverless platforms with an ephemeral filesystem (e.g. plain Vercel
// functions) will NOT persist this file between requests -- use a host with
// a real disk, or swap this file for a hosted Postgres/MySQL client.
//
// Uses Node's built-in `node:sqlite` module (no native build step, no npm
// compile) -- which is why this app requires Node 22.5+.

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'thuto.db'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS academies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  invite_code   TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('tutor','student')),
  academy_id    INTEGER NOT NULL REFERENCES academies(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id       INTEGER NOT NULL REFERENCES academies(id),
  created_by       INTEGER NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  subject          TEXT,
  scheduled_at     TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  daily_room_name  TEXT,
  daily_room_url   TEXT,
  started_at       TEXT,
  ended_at         TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id  INTEGER NOT NULL REFERENCES academies(id),
  created_by  INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'Notes',
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id       INTEGER NOT NULL REFERENCES academies(id),
  created_by       INTEGER NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  question_count   INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id  INTEGER NOT NULL REFERENCES academies(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Additive migration: give library_items file-upload columns if missing.
// (node:sqlite has no "ADD COLUMN IF NOT EXISTS", so check the table info.)
const libCols = db.prepare("PRAGMA table_info(library_items)").all().map((c) => c.name);
for (const [col, type] of [
  ['file_key', 'TEXT'],
  ['file_name', 'TEXT'],
  ['mime_type', 'TEXT'],
  ['size_bytes', 'INTEGER'],
]) {
  if (!libCols.includes(col)) db.exec(`ALTER TABLE library_items ADD COLUMN ${col} ${type}`);
}

// Additive migration: chat attachments (documents + voice notes).
const chatCols = db.prepare("PRAGMA table_info(chat_messages)").all().map((c) => c.name);
for (const [col, type] of [
  ['kind', "TEXT NOT NULL DEFAULT 'text'"],
  ['file_key', 'TEXT'],
  ['file_name', 'TEXT'],
  ['mime_type', 'TEXT'],
  ['size_bytes', 'INTEGER'],
  ['duration_ms', 'INTEGER'],
]) {
  if (!chatCols.includes(col)) db.exec(`ALTER TABLE chat_messages ADD COLUMN ${col} ${type}`);
}

// Additive migration: student billing, profiles, library groups.
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
for (const [col, type] of [
  ['monthly_fee', 'INTEGER NOT NULL DEFAULT 0'],
  ['avatar_key', 'TEXT'],
  ['phone', 'TEXT'],
  ['bio', 'TEXT'],
]) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}

const libCols2 = db.prepare("PRAGMA table_info(library_items)").all().map((c) => c.name);
if (!libCols2.includes('group_name')) db.exec("ALTER TABLE library_items ADD COLUMN group_name TEXT");
if (!libCols2.includes('deleted_at')) db.exec("ALTER TABLE library_items ADD COLUMN deleted_at TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id  INTEGER NOT NULL REFERENCES academies(id),
  student_id  INTEGER NOT NULL REFERENCES users(id),
  amount      INTEGER NOT NULL,
  period      TEXT NOT NULL,               -- 'YYYY-MM' the payment is for
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id  INTEGER NOT NULL REFERENCES academies(id),
  student_id  INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  seen        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
