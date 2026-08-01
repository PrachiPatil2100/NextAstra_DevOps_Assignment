'use strict';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'TestPass123!';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/app');

describe('health endpoints', () => {
  test('GET /healthz returns 200 and ok status', async () => {
    const res = await request(app).get('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime_s).toBe('number');
  });

  test('GET /readyz reports readiness', async () => {
    const res = await request(app).get('/readyz');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /api/info exposes build metadata', async () => {
    const res = await request(app).get('/api/info');
    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('devlogin');
    expect(res.body.node).toBe(process.version);
  });
});

describe('authentication', () => {
  test('rejects a request with no body', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.statusCode).toBe(400);
  });

  test('rejects invalid credentials without revealing the reason', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'wrong-password' });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('rejects an unknown user with the same message as a bad password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'nobody', password: 'whatever' });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('accepts valid credentials and sets an HttpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'TestPass123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({ username: 'admin', role: 'admin' });

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/devlogin_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });
});

describe('protected routes', () => {
  test('GET /api/profile without a token is rejected', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/profile with a valid cookie returns the identity', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'admin', password: 'TestPass123!' });

    const res = await agent.get('/api/profile');
    expect(res.statusCode).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('admin');
  });

  test('a malformed token is rejected', async () => {
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(res.statusCode).toBe(401);
  });
});

describe('observability', () => {
  test('GET /metrics returns Prometheus exposition format', async () => {
    await request(app).get('/healthz'); // generate at least one sample

    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/devlogin_http_requests_total/);
    expect(res.text).toMatch(/devlogin_build_info/);
  });
});

describe('static assets and CSP compatibility', () => {
  test('the login page is served at /', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  test('the page JavaScript is an external file, not inline', async () => {
    // Regression guard: the CSP sets script-src 'self', so an inline <script>
    // would be blocked by the browser and the login form would silently break.
    const res = await request(app).get('/');
    expect(res.text).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    expect(res.text).toMatch(/<script[^>]+src="\/app\.js"/);
  });

  test('/app.js is served', async () => {
    const res = await request(app).get('/app.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  test.each(['/', '/app.js', '/dashboard.js', '/styles.css', '/dashboard'])(
    '%s is served with a revalidating Cache-Control',
    async (url) => {
      // A positive max-age here is a deploy hazard: browsers would keep running
      // the previous release's JavaScript against the new API.
      const res = await request(app).get(url);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toMatch(/no-cache|no-store|max-age=0/);
    }
  );

  test('the dashboard is reachable at /dashboard', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/dashboard\.js/);
  });
});

describe('error handling', () => {
  test('unknown paths return a JSON 404', async () => {
    const res = await request(app).get('/definitely-not-a-route');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('security headers are applied by helmet', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
