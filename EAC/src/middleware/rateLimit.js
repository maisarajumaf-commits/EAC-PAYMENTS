// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const { logger } = require('../config/logger');

function makeRateLimiter({ windowMs = 60_000, max, message, keyPrefix = '' }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      keyPrefix + (req.user?.id || req.ip),
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        user: req.user?.id,
        path: req.path,
      });
      res.status(429).json({ error: message || 'Too many requests, slow down.' });
    },
  });
}

const authLimiter = makeRateLimiter({
  max: parseInt(process.env.RATE_LIMIT_AUTH || '20'),
  message: 'Too many auth attempts. Please wait a minute.',
  keyPrefix: 'auth:',
});

const apiLimiter = makeRateLimiter({
  max: parseInt(process.env.RATE_LIMIT_API || '100'),
  keyPrefix: 'api:',
});

const transferLimiter = makeRateLimiter({
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_TRANSFER || '10'),
  message: 'Transfer rate limit reached. Max 10 per minute.',
  keyPrefix: 'transfer:',
});

module.exports = { authLimiter, apiLimiter, transferLimiter };
