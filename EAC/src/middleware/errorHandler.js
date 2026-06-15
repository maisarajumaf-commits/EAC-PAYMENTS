// src/middleware/errorHandler.js
const { logger } = require('../config/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  logger.error('Unhandled error', {
    status,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
  });

  res.status(status).json({ error: message });
}

// Attach IP + user-agent to every request for audit purposes
function requestContext(req, res, next) {
  req.clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  next();
}

module.exports = { errorHandler, requestContext };
