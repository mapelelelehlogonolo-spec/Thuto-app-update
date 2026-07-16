const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function serialize(r) {
  return {
    id: r.id,
    title: r.title,
    durationMinutes: r.duration_minutes,
    questionCount: r.question_count,
    status: r.status,
    createdAt: r.created_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM assessments WHERE academy_id = ? ORDER BY created_at DESC')
    .all(req.user.academy_id);
  res.json({ assessments: rows.map(serialize) });
});

router.post('/', requireAuth, requireRole('tutor'), (req, res) => {
  const { title, durationMinutes, questionCount } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const info = db
    .prepare('INSERT INTO assessments (academy_id, created_by, title, duration_minutes, question_count) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.academy_id, req.user.id, title, Number(durationMinutes) || 30, Number(questionCount) || 0);
  const created = db.prepare('SELECT * FROM assessments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ assessment: serialize(created) });
});

router.post('/:id/close', requireAuth, requireRole('tutor'), (req, res) => {
  const a = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!a || a.academy_id !== req.user.academy_id) return res.status(404).json({ error: 'Not found.' });
  db.prepare("UPDATE assessments SET status = 'closed' WHERE id = ?").run(a.id);
  const updated = db.prepare('SELECT * FROM assessments WHERE id = ?').get(a.id);
  res.json({ assessment: serialize(updated) });
});

module.exports = router;
