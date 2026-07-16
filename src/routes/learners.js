const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Build a student row with fee + this-month payment status.
function studentWithStatus(s, period) {
  const paidRow = db
    .prepare('SELECT SUM(amount) AS total FROM payments WHERE student_id = ? AND period = ?')
    .get(s.id, period);
  const paidThisMonth = paidRow && paidRow.total ? paidRow.total : 0;
  const status = paidThisMonth >= (s.monthly_fee || 0) && (s.monthly_fee || 0) > 0
    ? 'paid'
    : (paidThisMonth > 0 ? 'partial' : 'unpaid');
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    monthlyFee: s.monthly_fee || 0,
    paidThisMonth,
    status: (s.monthly_fee || 0) === 0 ? 'no-fee' : status,
    hasAvatar: !!s.avatar_key,
    joinedAt: s.created_at,
  };
}

// Roster + team.
router.get('/', requireAuth, (req, res) => {
  const period = currentPeriod();
  const students = db
    .prepare("SELECT * FROM users WHERE academy_id = ? AND role = 'student' ORDER BY created_at DESC")
    .all(req.user.academy_id)
    .map((s) => studentWithStatus(s, period));
  const tutors = db
    .prepare("SELECT id, name, email, avatar_key, created_at FROM users WHERE academy_id = ? AND role = 'tutor' ORDER BY created_at ASC")
    .all(req.user.academy_id)
    .map((t) => ({ id: t.id, name: t.name, email: t.email, hasAvatar: !!t.avatar_key, joinedAt: t.created_at }));
  res.json({ students, tutors, period });
});

// Tutor adds a student manually. Returns a temporary password to share.
router.post('/', requireAuth, requireRole('tutor'), (req, res) => {
  const { name, email, monthlyFee } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required.' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'A user with that email already exists.' });
  const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 chars
  const hash = bcrypt.hashSync(tempPassword, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, name, role, academy_id, monthly_fee) VALUES (?, ?, ?, 'student', ?, ?)")
    .run(String(email).toLowerCase(), hash, name, req.user.academy_id, Number(monthlyFee) || 0);
  const s = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ student: studentWithStatus(s, currentPeriod()), tempPassword });
});

function loadStudent(req, res, next) {
  const s = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!s || s.academy_id !== req.user.academy_id) return res.status(404).json({ error: 'Student not found.' });
  req.student = s;
  next();
}

// Tutor removes a student (and their payments/reminders).
router.delete('/:id', requireAuth, requireRole('tutor'), loadStudent, (req, res) => {
  db.prepare('DELETE FROM payments WHERE student_id = ?').run(req.student.id);
  db.prepare('DELETE FROM reminders WHERE student_id = ?').run(req.student.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.student.id);
  res.json({ ok: true });
});

// Set a student's monthly fee.
router.patch('/:id/fee', requireAuth, requireRole('tutor'), loadStudent, (req, res) => {
  const fee = Number(req.body?.monthlyFee);
  if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'monthlyFee must be a number >= 0.' });
  db.prepare('UPDATE users SET monthly_fee = ? WHERE id = ?').run(Math.round(fee), req.student.id);
  const s = db.prepare('SELECT * FROM users WHERE id = ?').get(req.student.id);
  res.json({ student: studentWithStatus(s, currentPeriod()) });
});

// Record a payment for the current month.
router.post('/:id/pay', requireAuth, requireRole('tutor'), loadStudent, (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number.' });
  const period = req.body?.period || currentPeriod();
  db.prepare('INSERT INTO payments (academy_id, student_id, amount, period) VALUES (?, ?, ?, ?)')
    .run(req.user.academy_id, req.student.id, Math.round(amount), period);
  const s = db.prepare('SELECT * FROM users WHERE id = ?').get(req.student.id);
  res.status(201).json({ student: studentWithStatus(s, currentPeriod()) });
});

// Remind one student (in-app).
router.post('/:id/remind', requireAuth, requireRole('tutor'), loadStudent, (req, res) => {
  const body = (req.body?.body || 'Reminder: please settle your outstanding fees.').toString().slice(0, 300);
  db.prepare('INSERT INTO reminders (academy_id, student_id, body) VALUES (?, ?, ?)')
    .run(req.user.academy_id, req.student.id, body);
  res.status(201).json({ ok: true });
});

// Remind everyone who hasn't fully paid this month.
router.post('/remind-unpaid', requireAuth, requireRole('tutor'), (req, res) => {
  const period = currentPeriod();
  const body = (req.body?.body || 'Reminder: your fees for this month are outstanding. Please settle when you can.').toString().slice(0, 300);
  const students = db.prepare("SELECT * FROM users WHERE academy_id = ? AND role = 'student'").all(req.user.academy_id);
  let count = 0;
  for (const s of students) {
    const st = studentWithStatus(s, period);
    if (st.status === 'unpaid' || st.status === 'partial') {
      db.prepare('INSERT INTO reminders (academy_id, student_id, body) VALUES (?, ?, ?)').run(req.user.academy_id, s.id, body);
      count++;
    }
  }
  res.json({ remindedCount: count });
});

// Revenue summary for the tutor.
router.get('/revenue', requireAuth, requireRole('tutor'), (req, res) => {
  const aid = req.user.academy_id;
  const period = currentPeriod();
  const thisMonth = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE academy_id = ? AND period = ?').get(aid, period).t;
  const allTime = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE academy_id = ?').get(aid).t;
  const students = db.prepare("SELECT * FROM users WHERE academy_id = ? AND role = 'student'").all(aid);
  let expected = 0, outstanding = 0;
  for (const s of students) {
    const fee = s.monthly_fee || 0;
    expected += fee;
    const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE student_id = ? AND period = ?').get(s.id, period).t;
    outstanding += Math.max(0, fee - paid);
  }
  const recent = db.prepare(`SELECT p.amount, p.period, p.created_at, u.name AS student
                             FROM payments p JOIN users u ON u.id = p.student_id
                             WHERE p.academy_id = ? ORDER BY p.created_at DESC LIMIT 15`).all(aid);
  res.json({
    period, collectedThisMonth: thisMonth, collectedAllTime: allTime,
    expectedThisMonth: expected, outstandingThisMonth: outstanding,
    recent: recent.map((r) => ({ student: r.student, amount: r.amount, period: r.period, at: r.created_at })),
  });
});

// Analytics counts (used by dashboard/analytics stat cards).
router.get('/analytics', requireAuth, (req, res) => {
  const aid = req.user.academy_id;
  const period = currentPeriod();
  const c = (sql, ...a) => db.prepare(sql).get(aid, ...a).c;
  res.json({
    studentCount: c("SELECT COUNT(*) c FROM users WHERE academy_id = ? AND role = 'student'"),
    classCount: c('SELECT COUNT(*) c FROM classes WHERE academy_id = ?'),
    liveNow: c("SELECT COUNT(*) c FROM classes WHERE academy_id = ? AND status = 'live'"),
    endedCount: c("SELECT COUNT(*) c FROM classes WHERE academy_id = ? AND status = 'ended'"),
    libraryCount: c('SELECT COUNT(*) c FROM library_items WHERE academy_id = ?'),
    assessmentCount: c('SELECT COUNT(*) c FROM assessments WHERE academy_id = ?'),
    messageCount: c('SELECT COUNT(*) c FROM chat_messages WHERE academy_id = ?'),
    collectedThisMonth: db.prepare('SELECT COALESCE(SUM(amount),0) c FROM payments WHERE academy_id = ? AND period = ?').get(aid, period).c,
  });
});

module.exports = router;
