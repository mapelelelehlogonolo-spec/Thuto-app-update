const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT m.id, m.body, m.created_at, u.name AS author, u.role AS author_role, m.user_id
              FROM chat_messages m JOIN users u ON u.id = m.user_id
              WHERE m.academy_id = ? ORDER BY m.created_at ASC LIMIT 200`)
    .all(req.user.academy_id);
  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      body: r.body,
      author: r.author,
      authorRole: r.author_role,
      mine: r.user_id === req.user.id,
      createdAt: r.created_at,
    })),
  });
});

router.post('/', requireAuth, (req, res) => {
  const { body } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  db.prepare('INSERT INTO chat_messages (academy_id, user_id, body) VALUES (?, ?, ?)')
    .run(req.user.academy_id, req.user.id, String(body).trim().slice(0, 1000));
  res.status(201).json({ ok: true });
});

module.exports = router;
