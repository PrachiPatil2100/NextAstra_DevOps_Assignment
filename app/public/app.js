'use strict';

/**
 * Login page behaviour.
 *
 * Kept in its own file rather than an inline <script> because the app sends a
 * strict Content-Security-Policy (script-src 'self'), which blocks inline
 * script execution.
 */

const form = document.getElementById('form');
const msg = document.getElementById('msg');
const submit = document.getElementById('submit');

const DASHBOARD = '/dashboard';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submit.disabled = true;
  msg.textContent = '';
  msg.className = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      msg.className = 'ok';
      msg.textContent = `Welcome, ${data.user.username} — opening your dashboard…`;
      // replace() rather than assign() so Back does not return to the form.
      window.location.replace(DASHBOARD);
      return;
    }

    msg.className = 'err';
    msg.textContent = data.error || 'Login failed';
  } catch (err) {
    msg.className = 'err';
    msg.textContent = 'Network error — is the service reachable?';
  } finally {
    submit.disabled = false;
  }
});

// Already holding a valid session cookie? Skip the form entirely.
fetch('/api/profile')
  .then((r) => {
    if (r.ok) window.location.replace(DASHBOARD);
  })
  .catch(() => {});

fetch('/api/info')
  .then((r) => r.json())
  .then((i) => {
    document.getElementById('build').textContent = i.build;
    document.getElementById('commit').textContent = String(i.commit).slice(0, 7);
  })
  .catch(() => {});
