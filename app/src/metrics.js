'use strict';

/**
 * Prometheus instrumentation. Exposes default Node.js process metrics (heap,
 * event loop lag, GC, open handles) plus application-specific counters that the
 * Grafana dashboard and alert rules depend on.
 */

const client = require('prom-client');

const register = new client.Registry();

register.setDefaultLabels({
  app: 'devlogin',
  instance: process.env.INSTANCE_NAME || require('os').hostname(),
});

// process_cpu_*, nodejs_heap_*, nodejs_eventloop_lag_*, etc.
client.collectDefaultMetrics({ register, prefix: 'devlogin_' });

const httpRequestDuration = new client.Histogram({
  name: 'devlogin_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Tuned for a small web app: sub-millisecond through 5s.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'devlogin_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const loginAttemptsTotal = new client.Counter({
  name: 'devlogin_login_attempts_total',
  help: 'Login attempts partitioned by result',
  labelNames: ['result'], // success | failure
  registers: [register],
});

const todoOperationsTotal = new client.Counter({
  name: 'devlogin_todo_operations_total',
  help: 'Todo CRUD operations partitioned by type and result',
  labelNames: ['operation', 'result'], // create|update|delete x ok|rejected|not_found
  registers: [register],
});

const appInfo = new client.Gauge({
  name: 'devlogin_build_info',
  help: 'Build metadata, always 1. Version carried in labels.',
  labelNames: ['version', 'commit', 'node_version'],
  registers: [register],
});

appInfo.set(
  {
    version: process.env.APP_VERSION || require('../package.json').version,
    commit: process.env.GIT_COMMIT || 'unknown',
    node_version: process.version,
  },
  1
);

/**
 * Express middleware that records duration + count for every request.
 * Uses the matched route path (not the raw URL) to keep label cardinality low.
 */
function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
}

module.exports = {
  register,
  metricsMiddleware,
  loginAttemptsTotal,
  todoOperationsTotal,
};
