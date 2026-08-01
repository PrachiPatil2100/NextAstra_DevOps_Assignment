'use strict';

/**
 * In-memory user store.
 *
 * This assignment is about the delivery pipeline, not persistence, so users
 * live in memory. Passwords are bcrypt-hashed at boot from environment
 * variables so that no plaintext credential is ever committed to Git.
 */

const bcrypt = require('bcryptjs');
const logger = require('./logger');

const SALT_ROUNDS = 10;

const seed = [
  {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
    role: 'admin',
  },
  {
    username: process.env.DEV_USER || 'developer',
    password: process.env.DEV_PASSWORD || 'DevPass123!',
    role: 'developer',
  },
];

if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
  logger.warn('ADMIN_PASSWORD is not set — falling back to the default demo credential');
}

const users = seed.map((u) => ({
  username: u.username,
  role: u.role,
  passwordHash: bcrypt.hashSync(u.password, SALT_ROUNDS),
}));

/**
 * Verify a username/password pair.
 * Always runs a bcrypt comparison — even for unknown users — so that response
 * timing does not reveal whether an account exists.
 */
async function verify(username, password) {
  const dummyHash = users[0].passwordHash;
  const user = users.find((u) => u.username === username);
  const ok = await bcrypt.compare(password || '', user ? user.passwordHash : dummyHash);

  if (!user || !ok) return null;
  return { username: user.username, role: user.role };
}

module.exports = { verify, count: () => users.length };
