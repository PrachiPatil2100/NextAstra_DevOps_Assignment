'use strict';

/**
 * Authentication routes. Issues a short-lived JWT delivered as an HttpOnly
 * cookie, so the token is never reachable from client-side JavaScript.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const users = require('../users');
const logger = require('../logger');
const { loginAttemptsTotal } = require('../metrics');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const TOKEN_TTL = process.env.TOKEN_TTL || '1h';
const COOKIE_NAME = 'devlogin_token';

if (JWT_SECRET === 'dev-only-insecure-secret-change-me' && process.env.NODE_ENV === 'production') {
  logger.warn('JWT_SECRET is not set in production — tokens are forgeable');
}

// Brute-force protection. NGINX also rate-limits this path; defence in depth.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

router.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    loginAttemptsTotal.inc({ result: 'failure' });
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = await users.verify(username, password);

  if (!user) {
    loginAttemptsTotal.inc({ result: 'failure' });
    logger.warn(`failed login for "${username}" from ${req.ip}`);
    // Deliberately vague: do not reveal whether the username exists.
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ sub: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });

  loginAttemptsTotal.inc({ result: 'success' });
  logger.info(`successful login for "${user.username}" (${user.role})`);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    // Set only behind TLS; in local HTTP development the cookie must still work.
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000,
  });

  res.json({ message: 'Login successful', user: { username: user.username, role: user.role } });
});

router.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ message: 'Logged out' });
});

/** Express middleware guarding routes that require a valid token. */
function requireAuth(req, res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.cookies?.[COOKIE_NAME] || bearer;

  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.get('/api/profile', requireAuth, (req, res) => {
  res.json({ username: req.user.sub, role: req.user.role, issued_at: req.user.iat });
});

module.exports = { router, requireAuth };
