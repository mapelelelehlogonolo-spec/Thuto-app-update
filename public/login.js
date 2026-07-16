(function () {
  let mode = 'signin'; // 'signin' | 'signup'
  let role = 'tutor';  // only relevant when mode === 'signup'

  const el = (id) => document.getElementById(id);
  const tabIn = el('tabIn'), tabUp = el('tabUp');
  const roleRow = el('roleRow'), roleTutor = el('roleTutor'), roleStudent = el('roleStudent');
  const fldName = el('fldName'), fldAcademy = el('fldAcademy'), fldInvite = el('fldInvite');
  const formTitle = el('formTitle'), formSub = el('formSub'), submitBtn = el('submitBtn');
  const errorMsg = el('errorMsg'), switchHint = el('switchHint'), toSignup = el('toSignup');
  const form = el('authForm');

  function render() {
    tabIn.classList.toggle('on', mode === 'signin');
    tabUp.classList.toggle('on', mode === 'signup');
    roleRow.style.display = mode === 'signup' ? 'flex' : 'none';
    fldName.style.display = mode === 'signup' ? 'block' : 'none';
    fldAcademy.style.display = mode === 'signup' && role === 'tutor' ? 'block' : 'none';
    fldInvite.style.display = mode === 'signup' && role === 'student' ? 'block' : 'none';
    roleTutor.classList.toggle('on', role === 'tutor');
    roleStudent.classList.toggle('on', role === 'student');

    if (mode === 'signin') {
      formTitle.textContent = 'Welcome back';
      formSub.textContent = 'Sign in to your tutor or learner account.';
      submitBtn.textContent = 'Sign in to Thuto';
      switchHint.innerHTML = 'New here? <b id="toSignup">Create an account</b>';
    } else {
      formTitle.textContent = 'Create your account';
      formSub.textContent = role === 'tutor'
        ? 'Set up your academy in a minute.'
        : 'Join your academy with the invite code your tutor gave you.';
      submitBtn.textContent = role === 'tutor' ? 'Create my academy' : 'Join academy';
      switchHint.innerHTML = 'Already have an account? <b id="toSignup">Sign in</b>';
    }
    el('toSignup').addEventListener('click', () => { mode = mode === 'signin' ? 'signup' : 'signin'; render(); });
    errorMsg.classList.remove('show');
  }

  tabIn.addEventListener('click', () => { mode = 'signin'; render(); });
  tabUp.addEventListener('click', () => { mode = 'signup'; render(); });
  roleTutor.addEventListener('click', () => { role = 'tutor'; render(); });
  roleStudent.addEventListener('click', () => { role = 'student'; render(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.remove('show');
    submitBtn.disabled = true;
    const prevLabel = submitBtn.textContent;
    submitBtn.textContent = 'Please wait…';

    try {
      const email = el('inEmail').value.trim();
      const password = el('inPassword').value;

      if (mode === 'signin') {
        await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      } else {
        const name = el('inName').value.trim();
        if (role === 'tutor') {
          const academyName = el('inAcademy').value.trim();
          await apiFetch('/api/auth/signup/tutor', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, academyName }),
          });
        } else {
          const inviteCode = el('inInvite').value.trim();
          await apiFetch('/api/auth/signup/student', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, inviteCode }),
          });
        }
      }
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
    }
  });

  render();

  // If already signed in, skip straight to the dashboard.
  apiFetch('/api/auth/me').then(() => { window.location.href = '/dashboard.html'; }).catch(() => {});
})();
