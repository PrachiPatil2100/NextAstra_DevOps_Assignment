'use strict';

/**
 * Per-user todo store, persisted as a single JSON file.
 *
 * The file lives in DATA_DIR, which must point *outside* the release directory.
 * Deploys swap /opt/devlogin/current to a new release, so anything written
 * inside a release is lost on the next deploy.
 *
 *   local dev : ./data/todos.json
 *   server    : /var/lib/devlogin/todos.json
 *
 * Writes are atomic (temp file + rename) so a crash mid-write cannot leave a
 * truncated file that fails to parse on the next boot.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logger = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

const MAX_TITLE_LENGTH = 200;
const MAX_TODOS_PER_USER = 200;

/** @type {Object<string, Array>} username -> todos */
let store = {};

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    logger.error(`cannot create DATA_DIR ${DATA_DIR}: ${err.message}`);
  }

  if (!fs.existsSync(DATA_FILE)) {
    store = {};
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Guard against a hand-edited or corrupted file.
    store = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const count = Object.values(store).reduce((n, list) => n + list.length, 0);
    logger.info(`loaded ${count} todo(s) from ${DATA_FILE}`);
  } catch (err) {
    // Keep the bad file for inspection rather than silently overwriting it.
    const quarantine = `${DATA_FILE}.corrupt.${Date.now()}`;
    try {
      fs.renameSync(DATA_FILE, quarantine);
      logger.error(`${DATA_FILE} is not valid JSON; moved to ${quarantine}`);
    } catch {
      logger.error(`${DATA_FILE} is not valid JSON and could not be moved aside`);
    }
    store = {};
  }
}

function persist() {
  const tmp = `${DATA_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE); // atomic on the same filesystem
  } catch (err) {
    logger.error(`failed to persist todos: ${err.message}`);
    throw err;
  }
}

load();

/** Validation shared by create and update. Returns an error string, or null. */
function validateTitle(title) {
  if (typeof title !== 'string') return 'title must be a string';
  const trimmed = title.trim();
  if (trimmed.length === 0) return 'title cannot be empty';
  if (trimmed.length > MAX_TITLE_LENGTH) return `title cannot exceed ${MAX_TITLE_LENGTH} characters`;
  return null;
}

function list(username) {
  // Newest first — matches what the UI renders.
  return [...(store[username] || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function create(username, title) {
  const err = validateTitle(title);
  if (err) return { error: err };

  const existing = store[username] || [];
  if (existing.length >= MAX_TODOS_PER_USER) {
    return { error: `cannot store more than ${MAX_TODOS_PER_USER} todos` };
  }

  const now = new Date().toISOString();
  const todo = {
    id: crypto.randomUUID(),
    title: title.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  store[username] = [...existing, todo];
  persist();
  return { todo };
}

function update(username, id, changes) {
  const items = store[username] || [];
  const todo = items.find((t) => t.id === id);
  // Scoped by username, so one user can never reach another user's rows.
  if (!todo) return { error: 'not_found' };

  if (changes.title !== undefined) {
    const err = validateTitle(changes.title);
    if (err) return { error: err };
    todo.title = changes.title.trim();
  }

  if (changes.completed !== undefined) {
    if (typeof changes.completed !== 'boolean') return { error: 'completed must be a boolean' };
    todo.completed = changes.completed;
  }

  todo.updatedAt = new Date().toISOString();
  persist();
  return { todo };
}

function remove(username, id) {
  const items = store[username] || [];
  const index = items.findIndex((t) => t.id === id);
  if (index === -1) return { error: 'not_found' };

  const [removed] = items.splice(index, 1);
  persist();
  return { todo: removed };
}

function stats(username) {
  const items = store[username] || [];
  const done = items.filter((t) => t.completed).length;
  return { total: items.length, completed: done, active: items.length - done };
}

module.exports = {
  list,
  create,
  update,
  remove,
  stats,
  // Exposed for tests only.
  _reset: () => {
    store = {};
    persist();
  },
  _dataFile: DATA_FILE,
};
