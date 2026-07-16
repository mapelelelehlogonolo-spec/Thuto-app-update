(function () {
  const params = new URLSearchParams(window.location.search);
  const roomUrl = params.get('roomUrl');
  const token = params.get('token');
  const stateEl = document.getElementById('livestate');
  const frameEl = document.getElementById('callFrame');

  function show(msg) { stateEl.style.display = 'flex'; stateEl.innerHTML = msg; frameEl.style.display = 'none'; }
  const back = '<br><br><a href="/dashboard.html" style="color:#4D82FF">Back to dashboard</a>';

  if (!roomUrl || !token) { show('No active call. Go back and click "Go live" or "Join".' + back); return; }
  if (typeof DailyIframe === 'undefined') { show('The video library could not load. Reload the page.' + back); return; }

  const callFrame = DailyIframe.createFrame(frameEl, {
    showLeaveButton: true,
    iframeStyle: { width: '100%', height: '100%', border: '0' },
  });
  stateEl.style.display = 'none';
  frameEl.style.display = 'block';

  // DIAGNOSTIC BUILD: report every stage on screen, never auto-redirect,
  // so we can see exactly where the call stops.
  callFrame.on('joining-meeting', () => console.log('[thuto] joining-meeting'));
  callFrame.on('joined-meeting', (e) => console.log('[thuto] joined-meeting', e));

  callFrame.on('error', (e) => {
    console.log('[thuto] error', e);
    show('Call error: ' + (e?.errorMsg || JSON.stringify(e)) + back);
  });
  callFrame.on('nonfatal-error', (e) => console.log('[thuto] nonfatal-error', e));
  callFrame.on('camera-error', (e) => {
    console.log('[thuto] camera-error', e);
    const d = e?.error?.msg || e?.errorMsg || 'camera/mic blocked or not available on this device';
    show('Camera/microphone problem: ' + d +
      '<br><br>Allow camera access via the icon in your browser address bar, or use a device with a camera (like your phone).' + back);
  });

  // Instead of redirecting, tell us the call ended and why (if known).
  callFrame.on('left-meeting', (e) => {
    console.log('[thuto] left-meeting', e);
    show('The call ended (left the meeting). If you did not click Leave, the camera/mic likely could not start on this device.' + back);
  });

  callFrame
    .join({ url: roomUrl, token })
    .then((p) => console.log('[thuto] join() resolved', p))
    .catch((err) => {
      console.log('[thuto] join() failed', err);
      show('Could not join: ' + (err?.errorMsg || err?.message || String(err)) +
        '<br><br>If this device has no camera or mic, try from your phone instead.' + back);
    });
})();
