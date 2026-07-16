require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { loadUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const libraryRoutes = require('./routes/library');
const assessmentRoutes = require('./routes/assessments');
const chatRoutes = require('./routes/chat');
const learnerRoutes = require('./routes/learners');
const profileRoutes = require('./routes/profile');
const reminderRoutes = require('./routes/reminders');
const reportRoutes = require('./routes/report');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('replace_with')) {
  console.error('\nJWT_SECRET is not set. Copy .env.example to .env and fill it in before starting.\n');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/learners', learnerRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/report', reportRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Friendly error for oversized uploads (multer LIMIT_FILE_SIZE) and other errors.
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is too large. Videos must be under 35 MB; other files under 40 MB.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Thuto is running: http://localhost:${port}`);
});
