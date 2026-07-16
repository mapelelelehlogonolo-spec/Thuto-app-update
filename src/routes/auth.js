const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const db = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

function makeInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
}

function publicUser(user, academy) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    academy: academy ? { id: academy.id, name: academy.name, inviteCode: academy.invite_code } : null,
  };
}

// node:sqlite's DatabaseSync has no db.transaction() helper (that's a
// better-sqlite3-only API) -- wrap multi-statement writes in BEGIN/COMMIT
// by hand so a failure partway through cannot leave a half-created academy.
function runInTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Tutor signup: creates a brand-new academy owned by this tutor.
router.post('/signup/tutor', (req, res) => {
  const { name, email, password, academyName } = req.body || {};
  if (!name || !email || !password || !academyName) {
    return res.status(400).json({ error: 'name, email, password and academyName are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  let userId, academyId;
  try {
    ({ userId, academyId } = runInTransaction(db, () => {
      let inviteCode = makeInviteCode();
      while (db.prepare('SELECT id FROM academies WHERE invite_code = ?').get(inviteCode)) {
        inviteCode = makeInviteCode();
      }
      const academyInfo = db
        .prepare('INSERT INTO academies (name, invite_code) VALUES (?, ?)')
        .run(academyName, inviteCode);
      const passwordHash = bcrypt.hashSync(password, 10);
      const userInfo = db
        .prepare('INSERT INTO users (email, password_hash, name, role, academy_id) VALUES (?, ?, ?, ?, ?)')
        .run(email.toLowerCase(), passwordHash, name, 'tutor', academyInfo.lastInsertRowid);
      db.prepare('UPDATE academies SET owner_user_id = ? WHERE id = ?').run(userInfo.lastInsertRowid, academyInfo.lastInsertRowid);
      return { userId: userInfo.lastInsertRowid, academyId: academyInfo.lastInsertRowid };
    }));
  } catch (err) {
    return res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }

  const user = db.prepare('SELECT id, email, name, role, academy_id FROM users WHERE id = ?').get(userId);
  const academy = db.prepare('SELECT * FROM academies WHERE id = ?').get(academyId);
  setSessionCookie(res, user.id);
  res.status(201).json({ user: publicUser(user, academy) });
});

// Student signup: joins an existing academy via its invite code.
router.post('/signup/student', (req, res) => {
  const { name, email, password, inviteCode } = req.body || {};
  if (!name || !email || !password || !inviteCode) {
    return res.status(400).json({ error: 'name, email, password and inviteCode are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const academy = db.prepare('SELECT * FROM academies WHERE invite_code = ?').get(inviteCode.toUpperCase());
  if (!academy) return res.status(404).json({ error: 'That invite code was not found. Check it with your tutor.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, role, academy_id) VALUES (?, ?, ?, ?, ?)')
    .run(email.toLowerCase(), passwordHash, name, 'student', academy.id);

  const user = db.prepare('SELECT id, email, name, role, academy_id FROM users WHERE id = ?').get(info.lastInsertRowid);
  setSessionCookie(res, user.id);
  res.status(201).json({ user: publicUser(user, academy) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const academy = db.prepare('SELECT * FROM academies WHERE id = ?').get(user.academy_id);
  setSessionCookie(res, user.id);
  res.json({ user: publicUser(user, academy) });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const academy = db.prepare('SELECT * FROM academies WHERE id = ?').get(req.user.academy_id);
  res.json({ user: publicUser(req.user, academy) });
});

module.exports = router;
