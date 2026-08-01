'use strict';

/**
 * Todo CRUD API. Every route is behind requireAuth, and every store call is
 * scoped to req.user.sub, so a user can only ever reach their own rows.
 */

const express = require('express');

const todos = require('../todos');
const logger = require('../logger');
const { requireAuth } = require('./auth');
const { todoOperationsTotal } = require('../metrics');

const router = express.Router();

// Applies to every route defined below.
router.use('/api/todos', requireAuth);

// --- Read -----------------------------------------------------------------
router.get('/api/todos', (req, res) => {
  const user = req.user.sub;
  res.json({ todos: todos.list(user), stats: todos.stats(user) });
});

// --- Create ---------------------------------------------------------------
router.post('/api/todos', (req, res) => {
  const user = req.user.sub;
  const { title } = req.body || {};

  const { todo, error } = todos.create(user, title);
  if (error) {
    todoOperationsTotal.inc({ operation: 'create', result: 'rejected' });
    return res.status(400).json({ error });
  }

  todoOperationsTotal.inc({ operation: 'create', result: 'ok' });
  logger.info(`${user} created todo ${todo.id}`);
  res.status(201).json({ todo, stats: todos.stats(user) });
});

// --- Update (title and/or completed) --------------------------------------
router.patch('/api/todos/:id', (req, res) => {
  const user = req.user.sub;
  const { title, completed } = req.body || {};

  if (title === undefined && completed === undefined) {
    return res.status(400).json({ error: 'provide title, completed, or both' });
  }

  const { todo, error } = todos.update(user, req.params.id, { title, completed });

  if (error === 'not_found') {
    todoOperationsTotal.inc({ operation: 'update', result: 'not_found' });
    return res.status(404).json({ error: 'Todo not found' });
  }
  if (error) {
    todoOperationsTotal.inc({ operation: 'update', result: 'rejected' });
    return res.status(400).json({ error });
  }

  todoOperationsTotal.inc({ operation: 'update', result: 'ok' });
  res.json({ todo, stats: todos.stats(user) });
});

// --- Delete ---------------------------------------------------------------
router.delete('/api/todos/:id', (req, res) => {
  const user = req.user.sub;
  const { error } = todos.remove(user, req.params.id);

  if (error === 'not_found') {
    todoOperationsTotal.inc({ operation: 'delete', result: 'not_found' });
    return res.status(404).json({ error: 'Todo not found' });
  }

  todoOperationsTotal.inc({ operation: 'delete', result: 'ok' });
  logger.info(`${user} deleted todo ${req.params.id}`);
  res.json({ deleted: req.params.id, stats: todos.stats(user) });
});

module.exports = router;
