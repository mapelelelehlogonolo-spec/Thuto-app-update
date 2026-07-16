const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function serialize(r) {
  return { id: r.id, title: r.title, kind: r.kind, note: r.note, createdAt: r.created_at };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM library_items WHERE academy_id = ? ORDER BY created_at DESC')
    .all(req.user.academy_id);
  res.json({ items: rows.map(serialize) });
});

router.post('/', requireAuth, requireRole('tutor'), (req, res) => {
  const { title, kind, note } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const info = db
    .prepare('INSERT INTO library_items (academy_id, created_by, title, kind, note) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.academy_id, req.user.id, title, kind || 'Notes', note || null);
  const created = db.prepare('SELECT * FROM library_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item: serialize(created) });
});

module.exports = router;
