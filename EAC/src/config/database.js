// src/config/database.js
const knex = require('knex');
const { logger } = require('./logger');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    afterCreate(conn, done) {
      conn.query('SET timezone="UTC";', (err) => done(err, conn));
    },
  },
  migrations: { directory: './src/migrations' },
  acquireConnectionTimeout: 10000,
});

async function checkConnection() {
  try {
    await db.raw('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: err.message });
    process.exit(1);
  }
}

module.exports = { db, checkConnection };
