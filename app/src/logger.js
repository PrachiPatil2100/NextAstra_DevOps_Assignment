'use strict';

/**
 * Minimal structured logger. Writes single-line JSON to stdout/stderr so that
 * journald (and anything scraping it) can parse the output.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, message) {
  if (LEVELS[level] > currentLevel) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'devlogin',
    message,
  });

  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

module.exports = {
  error: (m) => emit('error', m),
  warn: (m) => emit('warn', m),
  info: (m) => emit('info', m),
  debug: (m) => emit('debug', m),
};
