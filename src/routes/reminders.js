const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// A student's reminders (newest first). Tutors won't normally have any.
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, body, seen, created_at FROM reminders WHERE student_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({
    reminders: rows.map((r) => ({ id: r.id, body: r.body, seen: !!r.seen, createdAt: r.created_at })),
    unseen: rows.filter((r) => !r.seen).length,
  });
});

// Mark all as seen.
router.post('/seen', requireAuth, (req, res) => {
  db.prepare('UPDATE reminders SET seen = 1 WHERE student_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
