# EACPay Backend

Production-grade Node.js/Express API and Solidity smart contracts for the **EACPay** blockchain cross-border payment rail — connecting 8 East African nations.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    EACPay Frontend                  │
│          (eac-payment-website.html)                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / REST
┌──────────────────────▼──────────────────────────────┐
│              Express API  (src/)                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  /auth  │ │   /fx    │ │/transfers│ │/wallets│  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └───┬────┘  │
│       │           │            │            │       │
│  ┌────▼───────────▼────────────▼────────────▼────┐  │
│  │  Services: authService · fxService · ...       │  │
│  └────┬────────────────────────┬──────────────────┘  │
│       │                        │                    │
│  ┌────▼──────┐         ┌───────▼──────────────────┐ │
│  │ PostgreSQL│         │  Ethers.js  → RPC Node   │ │
│  │  + Redis  │         │  (Polygon / private EVM) │ │
│  └───────────┘         └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                               │
          ┌────────────────────▼──────────────────────┐
          │           Smart Contracts                 │
          │  EACPaySettlement.sol · EACPayFXOracle.sol│
          └───────────────────────────────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 LTS |
| Framework | Express 4 + express-async-errors |
| Database | PostgreSQL 15 via Knex.js |
| Cache / Rate-limit | Redis 7 via ioredis |
| Blockchain | ethers.js v6 · EVM-compatible chain |
| Smart Contracts | Solidity 0.8.20 · Hardhat · OpenZeppelin |
| Auth | JWT (HS256) + rotating refresh tokens |
| Validation | AJV with formats |
| Security | Helmet.js · CORS allowlist · EIP-712 signatures |
| Logging | Winston (structured JSON) + append-only audit log |
| Testing | Jest + Supertest |

---

## Quick Start

### 1. Prerequisites

```bash
node -v   # ≥ 18
psql --version
redis-server --version
```

### 2. Install

```bash
cd eacpay-backend
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env – at minimum set DATABASE_URL, JWT_SECRET, REDIS_URL
```

### 4. Database

```bash
# Create the DB
createdb eacpay_db

# Run migrations
npm run migrate

# Seed reference data (banks, initial FX rates)
npm run seed
```

### 5. Run

```bash
npm run dev   # development (nodemon)
npm start     # production
```

### 6. Test

```bash
npm test
```

---

## API Reference

Base URL: `http://localhost:4000/api/v1`

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Returns access + refresh tokens |
| POST | `/auth/refresh` | — | Rotate refresh token |
| POST | `/auth/logout` | Bearer | Revoke refresh token |
| GET  | `/auth/me` | Bearer | Current user |

### FX Rates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fx/rates` | All cached EAC pairs (powers ticker) |
| GET | `/fx/rate?from=KES&to=TZS` | Single rate |
| POST | `/fx/quote` | Full quote with fee & receive amount |

**Quote request:**
```json
{ "from_currency": "KES", "to_currency": "TZS", "amount": 5000 }
```

### Wallets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/wallets` | Bearer | Register client-generated wallet |
| GET  | `/wallets` | Bearer | List user wallets |
| GET  | `/wallets/:address/balance` | Bearer | On-chain balance |

> Private keys are encrypted **in the browser** (PBKDF2 + AES-256-GCM). Only the ciphertext + IV + auth_tag + salt are stored server-side. The server never sees the plaintext key.

### Transfers

| Method | Path | Auth | KYC | Description |
|--------|------|------|-----|-------------|
| POST | `/transfers` | Bearer | ✅ | Initiate cross-border transfer |
| GET  | `/transfers` | Bearer | — | Paginated history |
| GET  | `/transfers/:id` | Bearer | — | Single transfer |

**Transfer request:**
```json
{
  "recipient_address": "0xabc...123",
  "from_currency": "KES",
  "to_currency": "TZS",
  "send_amount": 5000,
  "eip712_signature": "0x...",
  "memo": "School fees"
}
```

### Banks & Countries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/banks` | Partner bank list |
| GET | `/banks/countries` | EAC countries + currencies |

### Health

```
GET /api/v1/health
```
Returns DB, Redis, and blockchain connectivity status.

---

## Smart Contracts

### EACPaySettlement.sol

- **EIP-712** structured-data signatures — impersonation impossible
- **CEI pattern** — checks → effects → interactions (reentrancy safe)
- **ReentrancyGuard** from OpenZeppelin
- Only **authorised relayers** can submit transactions
- Per-transfer **deadline** (5 min window)
- **Unique transferId** consumption (replay protection)
- Configurable fee (default 0.20%, max 2%)
- Emergency **pause** by owner

### EACPayFXOracle.sol

- On-chain FX rate registry, updated every 30 s by backend cron
- **Staleness check** (2 min threshold) — contracts can't use stale prices
- Only authorised updaters may write rates

### Compile & Deploy

```bash
# Compile
npx hardhat compile

# Local test network
npx hardhat node

# Deploy to testnet (Mumbai)
npx hardhat run scripts/deploy.js --network mumbai
```

---

## Security

| Concern | Mitigation |
|---|---|
| SQL injection | Knex parameterised queries |
| XSS / clickjacking | Helmet.js headers (CSP, HSTS, X-Frame) |
| Brute force | Redis-backed rate limiting (20 req/min on auth) |
| CORS | Strict allowlist — only configured origins |
| Body overflow | 64 KB JSON limit |
| Input validation | AJV schemas on every write endpoint |
| Private key exposure | Client-side PBKDF2 + AES-256-GCM; server stores only ciphertext |
| Relayer key | AWS KMS / HashiCorp Vault — injected at runtime |
| Signature replay | Unique `transferId` consumed once on-chain |
| Impersonation | EIP-712 typed signing — verifier checks `signer == from` |
| Audit trail | Append-only `audit_logs` table for all writes |

---

## Environment Variables

See `.env.example` for the full list. Critical ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | ≥ 64 random chars |
| `RELAYER_PRIVATE_KEY` | Injected from AWS KMS/Vault at runtime |
| `SETTLEMENT_CONTRACT` | Deployed EACPaySettlement address |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |

---

## Project Structure

```
eacpay-backend/
├── contracts/               # Solidity smart contracts
│   ├── EACPaySettlement.sol
│   └── EACPayFXOracle.sol
├── scripts/
│   ├── migrate.js
│   └── seed.js
├── src/
│   ├── app.js               # Express app (no listen)
│   ├── server.js            # Boot + graceful shutdown
│   ├── config/
│   │   ├── database.js      # Knex + PG
│   │   ├── redis.js         # ioredis
│   │   ├── blockchain.js    # ethers.js provider/contracts
│   │   └── logger.js        # Winston
│   ├── middleware/
│   │   ├── auth.js          # JWT verify
│   │   ├── rateLimit.js     # express-rate-limit
│   │   ├── validate.js      # AJV schemas
│   │   └── errorHandler.js  # Global error + request context
│   ├── migrations/
│   │   └── 001_initial.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── fx.js
│   │   ├── wallets.js
│   │   ├── transfers.js
│   │   ├── banks.js
│   │   └── health.js
│   └── services/
│       ├── authService.js
│       ├── fxService.js
│       ├── walletService.js
│       └── transferService.js
├── tests/
│   └── api.test.js
├── .env.example
├── hardhat.config.js
├── jest.config.js
└── package.json
```
