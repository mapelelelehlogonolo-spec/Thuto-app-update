const express = require('express');
const crypto = require('node:crypto');
const multer = require('multer');
const db = require('../db');
const storage = require('../lib/storage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
// Voice notes and shared documents run through the same storage layer.
// 40 MB cap -- comfortably fits videos up to 35 MB, plus images, audio, docs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

function serialize(r, meId) {
  return {
    id: r.id,
    body: r.body,
    kind: r.kind || 'text',
    author: r.author,
    authorRole: r.author_role,
    mine: r.user_id === meId,
    hasFile: !!r.file_key,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT m.*, u.name AS author, u.role AS author_role
              FROM chat_messages m JOIN users u ON u.id = m.user_id
              WHERE m.academy_id = ? ORDER BY m.created_at ASC LIMIT 300`)
    .all(req.user.academy_id);
  res.json({ messages: rows.map((r) => serialize(r, req.user.id)) });
});

// Send a message. Three shapes, all via this one endpoint:
//   - plain text: JSON or form field `body`
//   - a document:  multipart with `file` and kind "file"
//   - a voice note: multipart with `file` (audio) and kind "voice" + durationMs
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const body = (req.body.body || '').toString().trim();
  let kind = (req.body.kind || 'text').toString();
  let fileKey = null, fileName = null, mimeType = null, sizeBytes = null;
  let durationMs = req.body.durationMs ? Number(req.body.durationMs) : null;

  if (req.file) {
    if (kind !== 'voice') kind = 'file';
    fileName = kind === 'voice' ? `voice-note-${Date.now()}.webm` : req.file.originalname;
    mimeType = req.file.mimetype;
    sizeBytes = req.file.size;
    fileKey = `academy-${req.user.academy_id}/chat/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${fileName}`;
    try {
      await storage.putObject(fileKey, req.file.buffer, mimeType);
    } catch (err) {
      return res.status(502).json({ error: 'Upload failed: ' + err.message });
    }
  } else {
    kind = 'text';
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  db.prepare(`INSERT INTO chat_messages (academy_id, user_id, body, kind, file_key, file_name, mime_type, size_bytes, duration_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.academy_id, req.user.id, body.slice(0, 1000), kind, fileKey, fileName, mimeType, sizeBytes, durationMs);
  res.status(201).json({ ok: true });
});

// Download / stream a chat attachment (document or voice note).
router.get('/:id/file', requireAuth, async (req, res) => {
  const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
  if (!m || m.academy_id !== req.user.academy_id || !m.file_key) return res.status(404).json({ error: 'Not found.' });
  // Images, videos, audio and voice notes open inline; other docs download.
  const mime = m.mime_type || '';
  const inline = m.kind === 'voice' || mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
  try {
    const url = await storage.getDownloadUrl(m.file_key, m.file_name, inline);
    if (url) return res.redirect(url);
    const localPath = storage.localPath(m.file_key);
    if (!localPath) return res.status(404).json({ error: 'File missing from storage.' });
    if (inline) {
      res.type(mime || 'application/octet-stream');
      return res.sendFile(localPath);
    }
    return res.download(localPath, m.file_name || 'download');
  } catch (err) {
    res.status(502).json({ error: 'Download failed: ' + err.message });
  }
});

module.exports = router;
