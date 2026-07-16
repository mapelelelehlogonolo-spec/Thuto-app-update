(function () {
  let me = null;
  const el = (id) => document.getElementById(id);

  const PAGES = {
    dash: ['Dashboard', 'Plan and teach your classes.'],
    analytics: ['Analytics', 'How your academy is doing.'],
    classes: ['Classes', 'Schedule and run live classes.'],
    library: ['Library', 'Everything you have published.'],
    assess: ['Assessments', 'Create tests for your learners.'],
    chats: ['Chats', 'Your academy group chat.'],
    learners: ['Learners', 'Your roster and teaching team.'],
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtWhen(iso) {
    if (!iso) return 'Not scheduled';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- navigation ----
  const side = el('side'), scrim = el('scrim');
  function closeMenu() { side.classList.remove('open'); scrim.classList.remove('show'); }
  function openMenu() { side.classList.add('open'); scrim.classList.add('show'); }
  el('hamburger').addEventListener('click', openMenu);
  scrim.addEventListener('click', closeMenu);

  function showPage(p) {
    Object.keys(PAGES).forEach((k) => {
      el('page-' + k).classList.toggle('on', k === p);
    });
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.page === p));
    el('pageTitle').textContent = PAGES[p][0];
    el('pageSub').textContent = PAGES[p][1];
    closeMenu();
    loadPage(p);
  }
  document.querySelectorAll('#nav a').forEach((a) => {
    a.addEventListener('click', () => showPage(a.dataset.page));
  });

  // ---- per-page loaders ----
  function statCard(n, label) {
    return `<div class="stat"><div class="n">${n}</div><div class="l">${esc(label)}</div></div>`;
  }

  async function loadStats(targetId) {
    try {
      const s = await apiFetch('/api/learners/analytics');
      const cards = [
        [s.studentCount, 'Learners'],
        [s.classCount, 'Classes'],
        [s.liveNow, 'Live now'],
        [s.libraryCount, 'Library items'],
        [s.assessmentCount, 'Tests'],
        [s.endedCount, 'Classes done'],
        [s.messageCount, 'Chat messages'],
        [me.academy ? me.academy.inviteCode : '-', 'Invite code'],
      ];
      el(targetId).innerHTML = cards.map(([n, l]) => statCard(n, l)).join('');
    } catch (e) {
      el(targetId).innerHTML = statCard('-', 'Could not load');
    }
  }

  function classRow(c) {
    let action = '';
    if (me.role === 'tutor') {
      if (c.status === 'live') action = `<button class="pillbtn live" data-go="${c.id}">Rejoin</button> <button class="cont" data-end="${c.id}">End</button>`;
      else if (c.status === 'scheduled') action = `<button class="pillbtn" data-go="${c.id}">Go live</button>`;
      else action = `<button class="cont" disabled>Ended</button>`;
    } else {
      if (c.status === 'live') action = `<button class="pillbtn live" data-join="${c.id}">Join</button>`;
      else if (c.status === 'scheduled') action = `<button class="cont" disabled>Not live yet</button>`;
      else action = `<button class="cont" disabled>Ended</button>`;
    }
    return `<div class="list-row">
      <div class="grow"><b>${esc(c.title)}</b><small>${esc(c.subject || 'General')} &middot; ${fmtWhen(c.scheduledAt)} &middot; ${c.durationMinutes} min</small></div>
      <span class="badge ${c.status}">${c.status}</span>
      <div>${action}</div></div>`;
  }

  function wireClassButtons(container) {
    container.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goLive(b.dataset.go)));
    container.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => joinClass(b.dataset.join)));
    container.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', () => endClass(b.dataset.end)));
  }

  async function loadClasses() {
    const { classes } = await apiFetch('/api/classes');
    const listEl = el('classList');
    listEl.innerHTML = classes.length ? classes.map(classRow).join('') : '<div class="empty">No classes yet.</div>';
    wireClassButtons(listEl);

    const upcoming = classes.filter((c) => c.status !== 'ended');
    const dashEl = el('dashClasses');
    dashEl.innerHTML = upcoming.length ? upcoming.map(classRow).join('') : '<div class="empty">Nothing scheduled. Create a class from the Classes page.</div>';
    wireClassButtons(dashEl);
  }

  async function loadLibrary() {
    const { items } = await apiFetch('/api/library');
    el('libList').innerHTML = items.length
      ? items.map((i) => `<div class="list-row"><div class="grow"><b>${esc(i.title)}</b><small>${esc(i.kind)} &middot; ${fmtDate(i.createdAt)}${i.note ? ' &middot; ' + esc(i.note) : ''}</small></div></div>`).join('')
      : '<div class="empty">Nothing published yet.</div>';
  }

  async function loadAssessments() {
    const { assessments } = await apiFetch('/api/assessments');
    const listEl = el('testList');
    listEl.innerHTML = assessments.length
      ? assessments.map((a) => `<div class="list-row">
          <div class="grow"><b>${esc(a.title)}</b><small>${a.questionCount} questions &middot; ${a.durationMinutes} min</small></div>
          <span class="badge ${a.status}">${a.status}</span>
          <div>${me.role === 'tutor' && a.status === 'open' ? `<button class="cont" data-close="${a.id}">Close</button>` : ''}</div></div>`).join('')
      : '<div class="empty">No tests yet.</div>';
    listEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
      try { await apiFetch(`/api/assessments/${b.dataset.close}/close`, { method: 'POST' }); toast('Test closed.'); loadAssessments(); }
      catch (e) { toast(e.message); }
    }));
  }

  async function loadChat() {
    const { messages } = await apiFetch('/api/chat');
    const box = el('chatBox');
    box.innerHTML = messages.length
      ? messages.map((m) => `<div class="msg ${m.mine ? 'mine' : ''}">
          ${m.mine ? '' : `<div class="who" style="color:${m.authorRole === 'tutor' ? '#B07E0A' : 'var(--blue)'}">${esc(m.author)}</div>`}
          <div class="bubble">${esc(m.body)}</div></div>`).join('')
      : '<div class="empty">No messages yet. Say hello!</div>';
    box.scrollTop = box.scrollHeight;
  }

  async function loadLearners() {
    const { students, tutors } = await apiFetch('/api/learners');
    el('rosterTitle').textContent = `Learners (${students.length})`;
    el('learnerList').innerHTML = students.length
      ? students.map((s) => `<div class="list-row"><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.email)} &middot; joined ${fmtDate(s.joinedAt)}</small></div></div>`).join('')
      : '<div class="empty">No learners yet. Share your invite code to get started.</div>';
    el('tutorList').innerHTML = tutors.map((t) => `<div class="list-row"><div class="grow"><b>${esc(t.name)}</b><small>${esc(t.email)}</small></div></div>`).join('');
  }

  function loadPage(p) {
    const jobs = {
      dash: async () => { await loadStats('dashStats'); await loadClasses(); },
      analytics: () => loadStats('analyticsStats'),
      classes: () => loadClasses(),
      library: () => loadLibrary(),
      assess: () => loadAssessments(),
      chats: () => loadChat(),
      learners: () => loadLearners(),
    };
    const job = jobs[p];
    if (job) Promise.resolve().then(job).catch((e) => toast(e.message));
  }

  // ---- actions ----
  async function goLive(id) {
    try {
      const { roomUrl, token } = await apiFetch(`/api/classes/${id}/go-live`, { method: 'POST' });
      window.location.href = `/live.html?roomUrl=${encodeURIComponent(roomUrl)}&token=${encodeURIComponent(token)}`;
    } catch (e) { toast(e.message); }
  }
  async function joinClass(id) {
    try {
      const { roomUrl, token } = await apiFetch(`/api/classes/${id}/join`, { method: 'POST' });
      window.location.href = `/live.html?roomUrl=${encodeURIComponent(roomUrl)}&token=${encodeURIComponent(token)}`;
    } catch (e) { toast(e.message); }
  }
  async function endClass(id) {
    try { await apiFetch(`/api/classes/${id}/end`, { method: 'POST' }); toast('Class ended.'); loadClasses(); }
    catch (e) { toast(e.message); }
  }

  // ---- forms ----
  el('newClassForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el('ncTitle').value.trim();
    if (!title) return toast('Give the class a title.');
    const when = el('ncWhen').value;
    try {
      await apiFetch('/api/classes', { method: 'POST', body: JSON.stringify({
        title, subject: el('ncSubject').value.trim(),
        scheduledAt: when ? new Date(when).toISOString() : null,
        durationMinutes: Number(el('ncDuration').value) || 30,
      }) });
      e.target.reset(); toast('Class scheduled.'); loadClasses();
    } catch (err) { toast(err.message); }
  });

  el('newLibForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el('lbTitle').value.trim();
    if (!title) return toast('Give it a title.');
    try {
      await apiFetch('/api/library', { method: 'POST', body: JSON.stringify({
        title, kind: el('lbKind').value, note: el('lbNote').value.trim(),
      }) });
      e.target.reset(); toast('Published to learners.'); loadLibrary();
    } catch (err) { toast(err.message); }
  });

  el('newTestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = el('tbName').value.trim();
    if (!title) return toast('Name the test.');
    try {
      await apiFetch('/api/assessments', { method: 'POST', body: JSON.stringify({
        title, questionCount: Number(el('tbQ').value) || 0, durationMinutes: Number(el('tbMin').value) || 30,
      }) });
      e.target.reset(); toast('Test published.'); loadAssessments();
    } catch (err) { toast(err.message); }
  });

  async function sendChat() {
    const input = el('chatIn');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try { await apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ body }) }); loadChat(); }
    catch (e) { toast(e.message); }
  }
  el('chatSend')?.addEventListener('click', sendChat);
  el('chatIn')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  el('signOutBtn').addEventListener('click', async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
  el('copyInvite')?.addEventListener('click', () => {
    const code = me.academy?.inviteCode || '';
    navigator.clipboard?.writeText(code).then(() => toast('Invite code copied.')).catch(() => toast(code));
  });

  // ---- init ----
  (async function init() {
    me = await requireSession();
    if (!me) return;
    el('academyName').textContent = me.academy ? me.academy.name : '';
    el('avatarInitial').textContent = (me.name || '?').charAt(0).toUpperCase();
    const tutor = me.role === 'tutor';
    el('newClassCard').style.display = tutor ? 'block' : 'none';
    el('newLibCard').style.display = tutor ? 'block' : 'none';
    el('newTestCard').style.display = tutor ? 'block' : 'none';
    if (tutor && me.academy) {
      el('inviteBox').style.display = 'block';
      el('inviteCode').textContent = me.academy.inviteCode;
    }
    showPage('dash');
    // light polling so live class status + chat feel current
    setInterval(() => {
      const active = document.querySelector('.page.on')?.id?.replace('page-', '');
      if (active === 'chats') loadChat().catch(() => {});
      else if (active === 'dash' || active === 'classes') loadClasses().catch(() => {});
    }, 12000);
  })();
})();
