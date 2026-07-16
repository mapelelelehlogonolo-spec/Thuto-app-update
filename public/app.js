// Shared helpers used across pages.

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
  });
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

function toast(message) {
  const t = document.getElementById('toastbar');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function requireSession() {
  try {
    const { user } = await apiFetch('/api/auth/me');
    return user;
  } catch {
    window.location.href = '/';
    return null;
  }
}
