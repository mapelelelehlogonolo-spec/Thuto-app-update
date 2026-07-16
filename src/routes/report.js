const express = require('express');
const db = require('../db');
const ai = require('../lib/ai');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Gather a real snapshot of everything happening in the academy.
function gatherData(academyId) {
  const period = currentPeriod();
  const one = (sql, ...a) => db.prepare(sql).get(academyId, ...a);
  const all = (sql, ...a) => db.prepare(sql).all(academyId, ...a);

  const students = all("SELECT * FROM users WHERE academy_id = ? AND role = 'student'");
  let expected = 0, collected = 0, paidCount = 0;
  for (const s of students) {
    expected += s.monthly_fee || 0;
    const paid = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE student_id = ? AND period = ?').get(s.id, period).t;
    collected += Math.min(paid, s.monthly_fee || paid);
    if ((s.monthly_fee || 0) > 0 && paid >= s.monthly_fee) paidCount++;
  }
  const collectedThisMonth = one('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE academy_id = ? AND period = ?', period).t;
  const collectedAllTime = one('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE academy_id = ?').t;

  const classes = all('SELECT title, subject, status, scheduled_at, created_at FROM classes WHERE academy_id = ? ORDER BY created_at DESC LIMIT 20');
  const libraryByKind = all('SELECT kind, COUNT(*) n FROM library_items WHERE academy_id = ? AND deleted_at IS NULL GROUP BY kind');
  const assessments = all('SELECT title, status, question_count FROM assessments WHERE academy_id = ?');
  const messageCount = one('SELECT COUNT(*) n FROM chat_messages WHERE academy_id = ?').n;
  const activeChatters = one('SELECT COUNT(DISTINCT user_id) n FROM chat_messages WHERE academy_id = ?').n;
  const newStudentsThisMonth = students.filter((s) => (s.created_at || '').startsWith(period)).length;

  return {
    period,
    students: {
      total: students.length,
      newThisMonth: newStudentsThisMonth,
      paidThisMonth: paidCount,
      unpaidThisMonth: students.filter((s) => (s.monthly_fee || 0) > 0).length - paidCount,
      withNoFee: students.filter((s) => (s.monthly_fee || 0) === 0).length,
    },
    money: {
      currency: 'R',
      expectedThisMonth: expected,
      collectedThisMonth,
      outstandingThisMonth: Math.max(0, expected - collected),
      collectedAllTime,
    },
    classes: {
      total: classes.length,
      live: classes.filter((c) => c.status === 'live').length,
      scheduled: classes.filter((c) => c.status === 'scheduled').length,
      ended: classes.filter((c) => c.status === 'ended').length,
      recent: classes.slice(0, 8).map((c) => ({ title: c.title, subject: c.subject, status: c.status })),
    },
    library: { byKind: libraryByKind, total: libraryByKind.reduce((s, r) => s + r.n, 0) },
    assessments: { total: assessments.length, open: assessments.filter((a) => a.status === 'open').length },
    chat: { messages: messageCount, activeParticipants: activeChatters },
  };
}

function buildPrompt(academyName, data) {
  return `You are an academy operations analyst. Write a clear, encouraging but honest report for the owner of "${academyName}", a tutoring academy. Use the real data below (currency is South African Rand, shown as R).

DATA (JSON):
${JSON.stringify(data, null, 2)}

Write the report in plain language for a non-technical tutor. Use these sections with short headings and bullet points:
1. Overview - a 2-3 sentence summary of how the academy is doing this month.
2. Money - fees collected, outstanding, and what it means.
3. Students - growth, who has and hasn't paid, engagement.
4. Teaching activity - classes run/scheduled, library content, assessments, chat activity.
5. Recommendations - 3 to 5 specific, practical actions the tutor should take next.
Keep it concise (under 350 words). Do not invent numbers that are not in the data. If something is zero or empty, acknowledge it and suggest a first step.`;
}

// Generate the AI report (tutor only).
router.get('/', requireAuth, requireRole('tutor'), async (req, res) => {
  if (!ai.isConfigured()) {
    return res.status(400).json({ error: 'AI is not set up yet. Add a GEMINI_API_KEY (free at aistudio.google.com/apikey) to enable reports.' });
  }
  try {
    const data = gatherData(req.user.academy_id);
    const academy = db.prepare('SELECT name FROM academies WHERE id = ?').get(req.user.academy_id);
    const report = await ai.generateText(buildPrompt(academy?.name || 'the academy', data));
    res.json({ report, data, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Lightweight status so the UI knows whether to show the button as enabled.
router.get('/status', requireAuth, (req, res) => res.json({ configured: ai.isConfigured() }));

module.exports = router;
