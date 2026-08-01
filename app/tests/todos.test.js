'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

// Must be set before requiring the app: src/todos.js reads DATA_DIR at load.
const TEST_DATA_DIR = path.join(os.tmpdir(), 'devlogin-test-todos');
fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'AdminPass123!';
process.env.DEV_USER = 'developer';
process.env.DEV_PASSWORD = 'DevPass123!';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');
const todos = require('../src/todos');

/** Logged-in agent for the given demo account. */
async function login(username, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ username, password });
  expect(res.statusCode).toBe(200);
  return agent;
}

let admin;
let dev;

beforeEach(async () => {
  todos._reset();
  admin = await login('admin', 'AdminPass123!');
  dev = await login('developer', 'DevPass123!');
});

afterAll(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe('authorization', () => {
  test.each([
    ['get', '/api/todos'],
    ['post', '/api/todos'],
    ['patch', '/api/todos/some-id'],
    ['delete', '/api/todos/some-id'],
  ])('%s %s requires authentication', async (method, url) => {
    const res = await request(app)[method](url).send({ title: 'x' });
    expect(res.statusCode).toBe(401);
  });
});

describe('create', () => {
  test('creates a todo and returns it with stats', async () => {
    const res = await admin.post('/api/todos').send({ title: 'Install Jenkins' });

    expect(res.statusCode).toBe(201);
    expect(res.body.todo).toMatchObject({ title: 'Install Jenkins', completed: false });
    expect(res.body.todo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.stats).toEqual({ total: 1, active: 1, completed: 0 });
  });

  test('trims surrounding whitespace', async () => {
    const res = await admin.post('/api/todos').send({ title: '   Configure NGINX   ' });
    expect(res.body.todo.title).toBe('Configure NGINX');
  });

  test.each([
    ['an empty title', ''],
    ['a whitespace-only title', '     '],
    ['a non-string title', 12345],
    ['a missing title', undefined],
  ])('rejects %s', async (_label, title) => {
    const res = await admin.post('/api/todos').send({ title });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('rejects a title longer than 200 characters', async () => {
    const res = await admin.post('/api/todos').send({ title: 'a'.repeat(201) });
    expect(res.statusCode).toBe(400);
  });

  test('accepts a title of exactly 200 characters', async () => {
    const res = await admin.post('/api/todos').send({ title: 'a'.repeat(200) });
    expect(res.statusCode).toBe(201);
  });

  test('stores HTML in a title literally rather than interpreting it', async () => {
    const payload = '<img src=x onerror="alert(1)">';
    const res = await admin.post('/api/todos').send({ title: payload });
    expect(res.statusCode).toBe(201);
    // Escaping is the renderer's job (dashboard.js uses textContent); the
    // stored value must survive the round trip unchanged.
    expect(res.body.todo.title).toBe(payload);
  });
});

describe('read', () => {
  test('returns an empty list for a new user', async () => {
    const res = await admin.get('/api/todos');
    expect(res.statusCode).toBe(200);
    expect(res.body.todos).toEqual([]);
    expect(res.body.stats).toEqual({ total: 0, active: 0, completed: 0 });
  });

  test('returns todos newest first', async () => {
    await admin.post('/api/todos').send({ title: 'first' });
    await new Promise((r) => setTimeout(r, 5)); // distinct createdAt timestamps
    await admin.post('/api/todos').send({ title: 'second' });

    const res = await admin.get('/api/todos');
    expect(res.body.todos.map((t) => t.title)).toEqual(['second', 'first']);
  });
});

describe('update', () => {
  let id;

  beforeEach(async () => {
    const res = await admin.post('/api/todos').send({ title: 'original' });
    id = res.body.todo.id;
  });

  test('marks a todo completed and updates stats', async () => {
    const res = await admin.patch(`/api/todos/${id}`).send({ completed: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.todo.completed).toBe(true);
    expect(res.body.stats).toEqual({ total: 1, active: 0, completed: 1 });
  });

  test('renames a todo', async () => {
    const res = await admin.patch(`/api/todos/${id}`).send({ title: 'renamed' });
    expect(res.body.todo.title).toBe('renamed');
  });

  test('bumps updatedAt', async () => {
    const before = (await admin.get('/api/todos')).body.todos[0].updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const res = await admin.patch(`/api/todos/${id}`).send({ completed: true });
    expect(res.body.todo.updatedAt > before).toBe(true);
  });

  test('rejects a request with neither title nor completed', async () => {
    const res = await admin.patch(`/api/todos/${id}`).send({});
    expect(res.statusCode).toBe(400);
  });

  test('rejects a non-boolean completed', async () => {
    const res = await admin.patch(`/api/todos/${id}`).send({ completed: 'yes' });
    expect(res.statusCode).toBe(400);
  });

  test('rejects an empty new title', async () => {
    const res = await admin.patch(`/api/todos/${id}`).send({ title: '  ' });
    expect(res.statusCode).toBe(400);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await admin.patch('/api/todos/does-not-exist').send({ completed: true });
    expect(res.statusCode).toBe(404);
  });
});

describe('delete', () => {
  test('removes the todo', async () => {
    const { body } = await admin.post('/api/todos').send({ title: 'temporary' });

    const del = await admin.delete(`/api/todos/${body.todo.id}`);
    expect(del.statusCode).toBe(200);
    expect(del.body.stats.total).toBe(0);

    const list = await admin.get('/api/todos');
    expect(list.body.todos).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await admin.delete('/api/todos/does-not-exist');
    expect(res.statusCode).toBe(404);
  });
});

describe('per-user isolation', () => {
  test("one user cannot see another user's todos", async () => {
    await admin.post('/api/todos').send({ title: 'admin-only task' });

    const devList = await dev.get('/api/todos');
    expect(devList.body.todos).toEqual([]);

    const adminList = await admin.get('/api/todos');
    expect(adminList.body.todos).toHaveLength(1);
  });

  test("one user cannot update another user's todo", async () => {
    const { body } = await admin.post('/api/todos').send({ title: 'admin-only task' });

    const res = await dev.patch(`/api/todos/${body.todo.id}`).send({ title: 'hijacked' });
    expect(res.statusCode).toBe(404); // not 403: do not confirm the id exists

    const check = await admin.get('/api/todos');
    expect(check.body.todos[0].title).toBe('admin-only task');
  });

  test("one user cannot delete another user's todo", async () => {
    const { body } = await admin.post('/api/todos').send({ title: 'admin-only task' });

    const res = await dev.delete(`/api/todos/${body.todo.id}`);
    expect(res.statusCode).toBe(404);

    const check = await admin.get('/api/todos');
    expect(check.body.todos).toHaveLength(1);
  });
});

describe('persistence', () => {
  test('writes todos to the DATA_DIR json file', async () => {
    await admin.post('/api/todos').send({ title: 'survives a restart' });

    expect(fs.existsSync(todos._dataFile)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(todos._dataFile, 'utf8'));
    expect(onDisk.admin.map((t) => t.title)).toContain('survives a restart');
  });

  test('the data file is outside the application directory', () => {
    // Guards the deploy model: state inside a release is lost on the next
    // atomic symlink swap.
    const appDir = path.join(__dirname, '..');
    expect(todos._dataFile.startsWith(appDir)).toBe(false);
  });
});

describe('metrics', () => {
  test('todo operations are counted', async () => {
    await admin.post('/api/todos').send({ title: 'counted' });

    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/devlogin_todo_operations_total\{operation="create",result="ok"/);
  });
});
