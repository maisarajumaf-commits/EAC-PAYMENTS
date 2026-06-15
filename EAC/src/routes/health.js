// src/routes/health.js
const router = require('express').Router();
const { db } = require('../config/database');
const { redis } = require('../config/redis');
const { getProvider } = require('../config/blockchain');

router.get('/', async (req, res) => {
  const checks = {};

  // DB
  try {
    await db.raw('SELECT 1');
    checks.database = 'ok';
  } catch (e) {
    checks.database = 'error';
  }

  // Redis
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (e) {
    checks.redis = 'unavailable';
  }

  // Blockchain
  try {
    const block = await getProvider().getBlockNumber();
    checks.blockchain = { status: 'ok', block };
  } catch (e) {
    checks.blockchain = 'unavailable';
  }

  const healthy = checks.database === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;
