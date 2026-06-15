// src/config/redis.js
const Redis = require('ioredis');
const { logger } = require('./logger');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

async function checkConnection() {
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    logger.warn('Redis unavailable – rate limiting will use memory store', {
      error: err.message,
    });
  }
}

module.exports = { redis, checkConnection };
