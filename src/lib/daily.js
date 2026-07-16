// Thin wrapper around the Daily.co REST API. Docs: https://docs.daily.co/reference/rest-api
// All calls run server-side only -- the DAILY_API_KEY never reaches the browser.

const DAILY_API = 'https://api.daily.co/v1';

function apiKey() {
  const key = process.env.DAILY_API_KEY;
  if (!key || key.startsWith('replace_with')) {
    throw new Error('DAILY_API_KEY is not set. Add it to your .env file -- see .env.example.');
  }
  return key;
}

async function dailyFetch(pathname, options = {}) {
  const res = await fetch(`${DAILY_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Daily returns { error: "invalid-request-error", info: "the real reason" }.
    // Surface `info` first -- that's the human-readable detail that tells you
    // exactly what to fix.
    const message = body?.info || body?.error || `Daily API error (${res.status})`;
    throw new Error(message);
  }
  return body;
}

// Creates a fresh private room for one class. Only the widely-supported room
// properties are set here so it works on Daily's free/starter plans too.
// Rooms expire automatically a few hours after the class ends.
async function createRoom(roomName, durationMinutes = 60) {
  const expSeconds = Math.floor(Date.now() / 1000) + Math.max(durationMinutes, 30) * 60 + 3600;
  return dailyFetch('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        exp: expSeconds,
        enable_chat: true,
        enable_screenshare: true,
      },
    }),
  });
}

async function getRoom(roomName) {
  try {
    return await dailyFetch(`/rooms/${encodeURIComponent(roomName)}`);
  } catch {
    return null;
  }
}

// A meeting token scopes who a participant is inside the room: tutors join as
// the room owner (can end the call for everyone, mute others, etc.).
async function createMeetingToken(roomName, { userName, isOwner }) {
  const body = await dailyFetch('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: !!isOwner,
      },
    }),
  });
  return body.token;
}

module.exports = { createRoom, getRoom, createMeetingToken };
