# Thuto — real accounts + real live video

This is a working web app (not a mockup): tutors and students sign up for
real accounts, tutors schedule classes, and "Go live" opens a real Daily.co
video call — everyone's actual camera and microphone, not a placeholder grid.

## What's inside

- **Backend:** Node.js + Express, SQLite database (`better-sqlite3`).
- **Auth:** real signup/login with hashed passwords and signed session
  cookies (no third-party login required).
- **Video:** [Daily.co](https://daily.co) powers the actual video calls —
  it handles camera/mic, connecting people across any network, and scaling
  up to a full class. The server creates a private room per class and issues
  each participant a scoped join token; the browser embeds Daily's call UI.
- **Frontend:** plain HTML/CSS/JS, styled to match the original Thuto design
  (`public/styles.css`, `public/index.html`, `public/dashboard.html`,
  `public/live.html`).

## How the pieces fit together

1. A tutor signs up → this creates an **academy** with a random invite code.
2. Students sign up with that invite code → they join the same academy.
3. The tutor schedules a **class** (title, subject, time, duration).
4. When it's time, the tutor clicks **Go live** → the server creates a
   private Daily.co room for that class and gives the tutor a join token
   (as the room owner).
5. Students see the class flip to "live" and click **Join** → the server
   gives them their own join token for the same room.
6. Everyone's browser opens the Daily call UI, which asks for camera/mic
   permission and connects them — this is the real thing, not a demo.

## Running it locally

Requirements: Node.js 22.5 or newer (needed for `node:sqlite`, the built-in
database module this app uses — no native/compiled dependency to install,
which also means no build tools required on your host).

```bash
cd thuto-app
npm install
cp .env.example .env
```

Edit `.env`:

- `JWT_SECRET` — generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `DAILY_API_KEY` — from [dashboard.daily.co](https://dashboard.daily.co) →
  **Developers**. Free tier is enough to test with a few people; check
  Daily's pricing if you expect many concurrent full classes.

Then:

```bash
npm start
```

Open `http://localhost:3000`. Sign up as a tutor first (this creates your
academy and gives you an invite code), then sign up a second account as a
student using that code to test a full class.

## Deploying it for real

This app needs a host with a **persistent filesystem** (the SQLite database
is a file on disk) and long-running Node processes — not a serverless
platform like plain Vercel functions. Good options:

- **Render** (render.com) — free/low-cost web service with a persistent disk.
- **Railway** (railway.app) — similar, very quick to set up from a GitHub repo.
- **Fly.io** — more control, still simple for a single Node app.
- Any VPS (DigitalOcean, Linode, etc.) running Node behind a reverse proxy
  (nginx/Caddy) with a process manager like `pm2`.

General steps on any of these:

1. Push this folder to a GitHub repository.
2. Connect that repo to your chosen host.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Add `JWT_SECRET` and `DAILY_API_KEY` as environment variables in the
   host's dashboard (do not commit `.env`).
5. Make sure the host gives the app a persistent disk/volume so
   `data/thuto.db` survives restarts and deploys.
6. Once it's live, put the app behind HTTPS (most of the hosts above do this
   automatically) — camera/microphone access in browsers requires HTTPS on
   any domain other than `localhost`.

## Notes and next steps

- The current build covers accounts, class scheduling, and live video —
  the core of what makes the earlier mockup "real." Things like payments,
  a content library, auto-marked tests, and analytics from the original
  design mockup are not wired to real data yet; the dashboard focuses on
  classes so the video feature could be built and verified properly.
- Password reset, email verification, and rate limiting on login attempts
  aren't implemented — worth adding before real public sign-ups.
- `data/thuto.db` is created automatically on first run.


## Pages included

Dashboard, Analytics, Classes (+ live video), Library, Assessments, Chats,
and Learners -- all backed by the database. Responsive: sidebar on desktop,
hamburger menu on mobile.
