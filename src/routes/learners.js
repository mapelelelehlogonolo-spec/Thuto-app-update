const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Roster + simple stats for the signed-in user's academy.
router.get('/', requireAuth, (req, res) => {
  const students = db
    .prepare(`SELECT id, name, email, created_at FROM users
              WHERE academy_id = ? AND role = 'student' ORDER BY created_at DESC`)
    .all(req.user.academy_id);
  const tutors = db
    .prepare(`SELECT id, name, email, created_at FROM users
              WHERE academy_id = ? AND role = 'tutor' ORDER BY created_at ASC`)
    .all(req.user.academy_id);
  res.json({
    students: students.map((s) => ({ id: s.id, name: s.name, email: s.email, joinedAt: s.created_at })),
    tutors: tutors.map((t) => ({ id: t.id, name: t.name, email: t.email, joinedAt: t.created_at })),
  });
});

// Lightweight analytics numbers derived from real rows.
router.get('/analytics', requireAuth, (req, res) => {
  const aid = req.user.academy_id;
  const studentCount = db.prepare("SELECT COUNT(*) c FROM users WHERE academy_id = ? AND role = 'student'").get(aid).c;
  const classCount = db.prepare('SELECT COUNT(*) c FROM classes WHERE academy_id = ?').get(aid).c;
  const liveNow = db.prepare("SELECT COUNT(*) c FROM classes WHERE academy_id = ? AND status = 'live'").get(aid).c;
  const endedCount = db.prepare("SELECT COUNT(*) c FROM classes WHERE academy_id = ? AND status = 'ended'").get(aid).c;
  const libraryCount = db.prepare('SELECT COUNT(*) c FROM library_items WHERE academy_id = ?').get(aid).c;
  const assessmentCount = db.prepare('SELECT COUNT(*) c FROM assessments WHERE academy_id = ?').get(aid).c;
  const messageCount = db.prepare('SELECT COUNT(*) c FROM chat_messages WHERE academy_id = ?').get(aid).c;
  res.json({
    studentCount, classCount, liveNow, endedCount, libraryCount, assessmentCount, messageCount,
  });
});

module.exports = router;
