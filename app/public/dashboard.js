'use strict';

/**
 * Todo dashboard.
 *
 * External file, not an inline <script>, because the app sends a strict
 * Content-Security-Policy (script-src 'self').
 *
 * All todo titles are rendered with textContent — never innerHTML — so a title
 * containing HTML is displayed literally instead of being executed.
 */

const el = {
  avatar: document.getElementById('avatar'),
  whoName: document.getElementById('who-name'),
  whoRole: document.getElementById('who-role'),
  metaUser: document.getElementById('meta-user'),
  logout: document.getElementById('logout'),
  addForm: document.getElementById('add-form'),
  newTitle: document.getElementById('new-title'),
  addBtn: document.getElementById('add-btn'),
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  banner: document.getElementById('banner'),
  total: document.getElementById('stat-total'),
  active: document.getElementById('stat-active'),
  done: document.getElementById('stat-done'),
  build: document.getElementById('build'),
  commit: document.getElementById('commit'),
};

let editingId = null;

// --- helpers ---------------------------------------------------------------

function flash(message, kind = 'err') {
  el.banner.textContent = message;
  el.banner.className = `banner ${kind}`;
  if (message) {
    setTimeout(() => {
      if (el.banner.textContent === message) el.banner.textContent = '';
    }, 4000);
  }
}

/**
 * Wrapper around fetch that redirects to the login page on 401 — the session
 * has expired or the cookie was cleared.
 */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.replace('/');
    throw new Error('unauthenticated');
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
  return body;
}

function relativeTime(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function renderStats(stats) {
  el.total.textContent = stats.total;
  el.active.textContent = stats.active;
  el.done.textContent = stats.completed;
}

// --- rendering -------------------------------------------------------------

function buildRow(todo) {
  const li = document.createElement('li');
  li.className = `todo${todo.completed ? ' done' : ''}`;
  li.dataset.id = todo.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.completed;
  checkbox.title = todo.completed ? 'Mark as active' : 'Mark as completed';
  checkbox.addEventListener('change', () => toggle(todo, checkbox));
  li.appendChild(checkbox);

  if (editingId === todo.id) {
    // --- edit mode ---
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit';
    input.value = todo.title;
    input.maxLength = 200;
    li.appendChild(input);

    const save = document.createElement('button');
    save.textContent = 'Save';
    save.addEventListener('click', () => rename(todo, input.value));

    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      editingId = null;
      refresh();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') rename(todo, input.value);
      if (e.key === 'Escape') { editingId = null; refresh(); }
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(save, cancel);
    li.appendChild(actions);

    // Focus after the row is attached to the document.
    setTimeout(() => { input.focus(); input.select(); }, 0);
  } else {
    // --- display mode ---
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = todo.title;   // never innerHTML
    li.appendChild(title);

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = relativeTime(todo.createdAt);
    when.title = new Date(todo.createdAt).toLocaleString();
    li.appendChild(when);

    const edit = document.createElement('button');
    edit.className = 'ghost';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      editingId = todo.id;
      refresh();
    });

    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => remove(todo));

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(edit, del);
    li.appendChild(actions);
  }

  return li;
}

function render(todos, stats) {
  el.list.textContent = '';
  todos.forEach((t) => el.list.appendChild(buildRow(t)));
  el.empty.hidden = todos.length > 0;
  renderStats(stats);
}

// --- CRUD ------------------------------------------------------------------

async function refresh() {
  try {
    const { todos, stats } = await api('/api/todos');
    render(todos, stats);
  } catch (err) {
    if (err.message !== 'unauthenticated') flash(`Could not load todos: ${err.message}`);
  }
}

async function add(title) {
  el.addBtn.disabled = true;
  try {
    await api('/api/todos', { method: 'POST', body: JSON.stringify({ title }) });
    el.newTitle.value = '';
    flash('Task added', 'ok');
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthenticated') flash(err.message);
  } finally {
    el.addBtn.disabled = false;
    el.newTitle.focus();
  }
}

async function toggle(todo, checkbox) {
  checkbox.disabled = true;
  try {
    await api(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !todo.completed }),
    });
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthenticated') {
      flash(err.message);
      checkbox.checked = todo.completed; // roll the UI back
    }
  } finally {
    checkbox.disabled = false;
  }
}

async function rename(todo, title) {
  if (title.trim() === todo.title) {
    editingId = null;
    return refresh();
  }
  try {
    await api(`/api/todos/${todo.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    editingId = null;
    flash('Task updated', 'ok');
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthenticated') flash(err.message);
  }
}

async function remove(todo) {
  if (!window.confirm(`Delete "${todo.title}"?`)) return;
  try {
    await api(`/api/todos/${todo.id}`, { method: 'DELETE' });
    flash('Task deleted', 'ok');
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthenticated') flash(err.message);
  }
}

// --- session + boot --------------------------------------------------------

async function loadProfile() {
  // Also the auth gate: api() sends us to / on a 401.
  const me = await api('/api/profile');
  el.whoName.textContent = me.username;
  el.whoRole.textContent = me.role;
  el.metaUser.textContent = me.username;
  el.avatar.textContent = me.username.charAt(0).toUpperCase();
  document.title = `CRUD App — ${me.username}`;
}

el.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = el.newTitle.value.trim();
  if (title) add(title);
});

el.logout.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.replace('/');
  }
});

(async function boot() {
  try {
    await loadProfile();
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthenticated') flash(`Startup failed: ${err.message}`);
    return;
  }

  fetch('/api/info')
    .then((r) => r.json())
    .then((i) => {
      el.build.textContent = i.build;
      el.commit.textContent = String(i.commit).slice(0, 7);
    })
    .catch(() => {});
})();
