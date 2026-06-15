// src/server.js
require('dotenv').config();

const app = require('./app');
const { checkConnection: checkDb } = require('./config/database');
const { checkConnection: checkRedis } = require('./config/redis');
const { checkConnection: checkChain } = require('./config/blockchain');
const { startFxCron } = require('./services/fxService');
const { logger } = require('./config/logger');

const PORT = parseInt(process.env.PORT || '4000');

async function boot() {
  await checkDb();
  await checkRedis();
  await checkChain();

  if (process.env.NODE_ENV !== 'test') {
    startFxCron();
  }

  const server = app.listen(PORT, () => {
    logger.info(`EACPay API running`, {
      port: PORT,
      env: process.env.NODE_ENV,
      version: 'v1',
    });
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received – shutting down`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
}

boot().catch((err) => {
  logger.error('Boot failed', { error: err.message });
  process.exit(1);
});
