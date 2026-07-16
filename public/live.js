(function () {
  const params = new URLSearchParams(window.location.search);
  const roomUrl = params.get('roomUrl');
  const token = params.get('token');
  const stateEl = document.getElementById('livestate');
  const frameEl = document.getElementById('callFrame');
  const back = '<br><br><a href="/dashboard.html" style="color:#4D82FF">Back to dashboard</a>';
  function show(msg) { stateEl.style.display = 'flex'; stateEl.innerHTML = msg; frameEl.style.display = 'none'; }

  if (!roomUrl || !token) { show('No active call. Go back and click "Go live" or "Join".' + back); return; }

  // STEP 1: test this device's camera/mic directly, so we can tell the
  // difference between "no camera on this device", "permission blocked",
  // and "camera busy" -- before Daily's UI hides the real reason.
  async function preflight() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, msg: 'This browser will not give camera access. Camera needs an https page (you have that) and a supported browser like Chrome or Safari.' };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true };
    } catch (e) {
      const name = e && e.name ? e.name : 'Error';
      let msg;
      if (name === 'NotAllowedError' || name === 'SecurityError')
        msg = 'You blocked camera/mic access. Tap the lock or camera icon in the address bar, set Camera and Microphone to Allow, then reload.';
      else if (name === 'NotFoundError' || name === 'OverconstrainedError')
        msg = 'No camera or microphone was found on this device. Try a phone or a computer that has a webcam.';
      else if (name === 'NotReadableError')
        msg = 'Your camera is already in use by another app. Close Zoom/Teams/other camera apps and reload.';
      else
        msg = 'Camera/mic error: ' + name + ' - ' + (e.message || '');
      return { ok: false, msg };
    }
  }

  (async function run() {
    show('Checking your camera and microphone...');
    const pre = await preflight();
    if (!pre.ok) { show(pre.msg + back); return; }

    if (typeof DailyIframe === 'undefined') { show('The video library could not load. Reload the page.' + back); return; }

    const callFrame = DailyIframe.createFrame(frameEl, {
      showLeaveButton: true,
      iframeStyle: { width: '100%', height: '100%', border: '0' },
    });
    stateEl.style.display = 'none';
    frameEl.style.display = 'block';

    callFrame.on('error', (e) => { console.log('[thuto] error', e); show('Call error: ' + (e?.errorMsg || JSON.stringify(e)) + back); });
    callFrame.on('camera-error', (e) => { console.log('[thuto] camera-error', e); show('Camera/mic problem: ' + (e?.error?.msg || e?.errorMsg || 'blocked or unavailable') + back); });
    callFrame.on('left-meeting', () => { window.location.href = '/dashboard.html'; });

    callFrame.join({ url: roomUrl, token })
      .then((p) => console.log('[thuto] joined', p))
      .catch((err) => { console.log('[thuto] join failed', err); show('Could not join: ' + (err?.errorMsg || err?.message || String(err)) + back); });
  })();
})();
