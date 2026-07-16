const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const daily = require('../lib/daily');

const router = express.Router();

function serializeClass(c) {
  return {
    id: c.id,
    title: c.title,
    subject: c.subject,
    scheduledAt: c.scheduled_at,
    durationMinutes: c.duration_minutes,
    status: c.status,
    startedAt: c.started_at,
  };
}

// List classes for the signed-in user's academy.
router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM classes WHERE academy_id = ? ORDER BY COALESCE(scheduled_at, created_at) DESC')
    .all(req.user.academy_id);
  res.json({ classes: rows.map(serializeClass) });
});

// Tutor schedules a new class.
router.post('/', requireAuth, requireRole('tutor'), (req, res) => {
  const { title, subject, scheduledAt, durationMinutes } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });

  const info = db
    .prepare(
      `INSERT INTO classes (academy_id, created_by, title, subject, scheduled_at, duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.academy_id, req.user.id, title, subject || null, scheduledAt || null, Number(durationMinutes) || 30);

  const created = db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ class: serializeClass(created) });
});

function loadClassForAcademy(req, res, next) {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!cls || cls.academy_id !== req.user.academy_id) {
    return res.status(404).json({ error: 'Class not found.' });
  }
  req.cls = cls;
  next();
}

// Tutor starts the live video room for a class (creates it in Daily if needed).
router.post('/:id/go-live', requireAuth, requireRole('tutor'), loadClassForAcademy, async (req, res) => {
  try {
    let roomName = req.cls.daily_room_name;
    if (!roomName) {
      roomName = `thuto-${req.cls.id}-${crypto.randomBytes(3).toString('hex')}`;
      const room = await daily.createRoom(roomName, req.cls.duration_minutes);
      db.prepare('UPDATE classes SET daily_room_name = ?, daily_room_url = ? WHERE id = ?').run(
        roomName,
        room.url,
        req.cls.id
      );
    }
    db.prepare(
      `UPDATE classes SET status = 'live', started_at = COALESCE(started_at, datetime('now')) WHERE id = ?`
    ).run(req.cls.id);

    const token = await daily.createMeetingToken(roomName, { userName: req.user.name, isOwner: true });
    const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.cls.id);
    res.json({ class: serializeClass(updated), roomUrl: updated.daily_room_url, token });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Student (or tutor rejoining) joins a class that's already live.
router.post('/:id/join', requireAuth, loadClassForAcademy, async (req, res) => {
  if (req.cls.status !== 'live' || !req.cls.daily_room_name) {
    return res.status(409).json({ error: 'This class is not live yet. Ask your tutor to go live.' });
  }
  try {
    const token = await daily.createMeetingToken(req.cls.daily_room_name, {
      userName: req.user.name,
      isOwner: req.user.role === 'tutor',
    });
    res.json({ class: serializeClass(req.cls), roomUrl: req.cls.daily_room_url, token });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Tutor ends the class for everyone.
router.post('/:id/end', requireAuth, requireRole('tutor'), loadClassForAcademy, (req, res) => {
  db.prepare(`UPDATE classes SET status = 'ended', ended_at = datetime('now') WHERE id = ?`).run(req.cls.id);
  const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.cls.id);
  res.json({ class: serializeClass(updated) });
});

module.exports = router;
