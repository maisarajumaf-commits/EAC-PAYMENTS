// tests/api.test.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-here!!';
process.env.REFRESH_TOKEN_SECRET = 'refresh-test-secret-32-chars-here!';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://eacpay:secret@localhost:5432/eacpay_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.RPC_URL = 'http://localhost:8545';
process.env.CHAIN_ID = '31337';
process.env.SETTLEMENT_CONTRACT = '0x0000000000000000000000000000000000000001';
process.env.FX_ORACLE_CONTRACT   = '0x0000000000000000000000000000000000000002';
process.env.WALLET_FACTORY_CONTRACT = '0x0000000000000000000000000000000000000003';

const request = require('supertest');
const app = require('../src/app');

// ── /health ───────────────────────────────────────────────────────────────────
describe('GET /api/v1/health', () => {
  it('returns 200 or 503 with status field', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
  });
});

// ── /auth/register ────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects invalid country', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
        first_name: 'Jane',
        last_name: 'Doe',
        country: 'XX',
      });
    expect(res.status).toBe(400);
  });
});

// ── /auth/login ───────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  it('rejects missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@eacpay.io' });
    expect(res.status).toBe(400);
  });
});

// ── /fx/quote ────────────────────────────────────────────────────────────────
describe('POST /api/v1/fx/quote', () => {
  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .send({ from_currency: 'KES' });
    expect(res.status).toBe(400);
  });

  it('rejects zero amount', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .send({ from_currency: 'KES', to_currency: 'TZS', amount: 0 });
    expect(res.status).toBe(400);
  });
});

// ── /wallets – unauthenticated ────────────────────────────────────────────────
describe('GET /api/v1/wallets', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/wallets');
    expect(res.status).toBe(401);
  });
});

// ── /transfers – unauthenticated ─────────────────────────────────────────────
describe('POST /api/v1/transfers', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/transfers').send({});
    expect(res.status).toBe(401);
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
