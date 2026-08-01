'use strict';

/**
 * Process entrypoint. Kept separate from src/app.js so that the test suite can
 * import the Express app without binding to a TCP port.
 */

const app = require('./src/app');
const logger = require('./src/logger');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  logger.info(`devlogin listening on http://${HOST}:${PORT} (env=${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown so that systemd restarts and Jenkins deploys do not drop
// in-flight requests.
const shutdown = (signal) => {
  logger.info(`${signal} received, closing server`);
  server.close((err) => {
    if (err) {
      logger.error(`error during shutdown: ${err.message}`);
      process.exit(1);
    }
    logger.info('server closed cleanly');
    process.exit(0);
  });

  // Hard limit: if connections do not drain in 10s, exit anyway.
  setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`unhandled rejection: ${reason}`);
});

module.exports = server;
