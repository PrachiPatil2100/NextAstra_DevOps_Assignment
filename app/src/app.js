'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const logger = require('./logger');
const { register, metricsMiddleware } = require('./metrics');
const healthRoutes = require('./routes/health');
const { router: authRoutes } = require('./routes/auth');
const todoRoutes = require('./routes/todos');

const app = express();

// The app always runs behind NGINX, so trust exactly one proxy hop. This makes
// req.ip the real client address for rate limiting and logs.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));
}

app.use(metricsMiddleware);

app.use(healthRoutes);
app.use(authRoutes);
app.use(todoRoutes);

/**
 * Pretty URL for the dashboard. The page itself is public HTML — the data it
 * renders is not: dashboard.js calls /api/profile first and bounces anyone
 * without a valid token back to the login page.
 */
app.get('/dashboard', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

/**
 * Prometheus scrape target. NGINX restricts this path to the monitoring
 * network, so it is not exposed publicly even though it is unauthenticated here.
 */
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

/**
 * Static assets.
 *
 * "no-cache" does NOT mean "do not store" — the browser still caches the file,
 * it just revalidates with an If-None-Match first and gets a cheap 304 when
 * nothing has changed. A positive max-age here would be a deployment hazard:
 * after a release that ships new app.js, browsers would keep executing the
 * previous version against the new API until the cache expired.
 */
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Central error handler. Never leak stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(`unhandled error on ${req.method} ${req.path}: ${err.stack || err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
