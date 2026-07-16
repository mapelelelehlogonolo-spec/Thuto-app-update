const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'thuto_session';

function signSession(userId) {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function setSessionCookie(res, userId) {
  res.cookie(COOKIE_NAME, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Attaches req.user if a valid session cookie is present; otherwise leaves it undefined.
function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, academy_id FROM users WHERE id = ?').get(uid);
    if (user) req.user = user;
  } catch {
    // invalid/expired token — treat as signed out
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
    if (req.user.role !== role) return res.status(403).json({ error: `Only a ${role} can do this.` });
    next();
  };
}

module.exports = { COOKIE_NAME, setSessionCookie, clearSessionCookie, loadUser, requireAuth, requireRole };
