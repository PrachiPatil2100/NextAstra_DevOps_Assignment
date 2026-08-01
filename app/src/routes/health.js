'use strict';

/**
 * Health and readiness endpoints.
 *
 * /healthz  — liveness. Cheap, never touches dependencies. Used by systemd
 *             watchdog checks, the Jenkins smoke test and NGINX upstream checks.
 * /readyz   — readiness. Reports whether the process is prepared to serve.
 */

const express = require('express');
const os = require('os');

const router = express.Router();
const startedAt = Date.now();

router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime_s: Math.floor((Date.now() - startedAt) / 1000) });
});

router.get('/readyz', (req, res) => {
  const mem = process.memoryUsage();
  const heapUsedRatio = mem.heapUsed / mem.heapTotal;

  // Refuse traffic if the heap is nearly exhausted; the load balancer should
  // route elsewhere until GC recovers or systemd restarts us.
  const ready = heapUsedRatio < 0.95;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    heap_used_ratio: Number(heapUsedRatio.toFixed(3)),
  });
});

router.get('/api/info', (req, res) => {
  res.json({
    service: 'devlogin',
    version: process.env.APP_VERSION || require('../../package.json').version,
    commit: process.env.GIT_COMMIT || 'unknown',
    build: process.env.BUILD_NUMBER || 'local',
    node: process.version,
    hostname: os.hostname(),
    uptime_s: Math.floor((Date.now() - startedAt) / 1000),
    load_average: os.loadavg().map((n) => Number(n.toFixed(2))),
    free_mem_mb: Math.round(os.freemem() / 1024 / 1024),
    total_mem_mb: Math.round(os.totalmem() / 1024 / 1024),
  });
});

module.exports = router;
