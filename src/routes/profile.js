const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const multer = require('multer');
const db = require('../db');
const storage = require('../lib/storage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function profileOf(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    phone: u.phone, bio: u.bio, hasAvatar: !!u.avatar_key,
  };
}

router.get('/', requireAuth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: profileOf(u) });
});

// Update name, phone, bio, and optionally email (kept unique).
router.patch('/', requireAuth, (req, res) => {
  const { name, phone, bio, email } = req.body || {};
  if (email && email.toLowerCase() !== req.user.email) {
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), req.user.id);
    if (taken) return res.status(409).json({ error: 'That email is already in use.' });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase(), req.user.id);
  }
  db.prepare('UPDATE users SET name = COALESCE(?, name), phone = ?, bio = ? WHERE id = ?')
    .run(name && name.trim() ? name.trim() : null, (phone || '').trim() || null, (bio || '').trim() || null, req.user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: profileOf(u) });
});

// Change password.
router.post('/password', requireAuth, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  if (!nextPw || String(nextPw).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash)) return res.status(401).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(nextPw, 10), req.user.id);
  res.json({ ok: true });
});

// Upload / replace avatar (image only).
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  if (!(req.file.mimetype || '').startsWith('image/')) return res.status(400).json({ error: 'Avatar must be an image.' });
  const key = `avatars/user-${req.user.id}-${crypto.randomBytes(3).toString('hex')}.img`;
  try { await storage.putObject(key, req.file.buffer, req.file.mimetype); }
  catch (err) { return res.status(502).json({ error: 'Upload failed: ' + err.message }); }
  db.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').run(key, req.user.id);
  res.json({ ok: true });
});

// Serve any academy member's avatar image.
router.get('/avatar/:userId', requireAuth, async (req, res) => {
  const u = db.prepare('SELECT avatar_key FROM users WHERE id = ? AND academy_id = ?').get(req.params.userId, req.user.academy_id);
  if (!u || !u.avatar_key) return res.status(404).end();
  try {
    const url = await storage.getDownloadUrl(u.avatar_key, 'avatar', true);
    if (url) return res.redirect(url);
    const lp = storage.localPath(u.avatar_key);
    if (!lp) return res.status(404).end();
    return res.sendFile(lp);
  } catch { res.status(502).end(); }
});

module.exports = router;
