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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Thuto is running: http://localhost:${port}`);
});
