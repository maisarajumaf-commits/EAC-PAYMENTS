
Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   fuzzy search on names

Enum Types
CREATE TYPE user_role          AS ENUM ('CUSTOMER', 'BANK', 'ADMIN');
CREATE TYPE tx_status          AS ENUM ('PENDING', 'INITIATED', 'CONFIRMED', 'REJECTED', 'EXPIRED');
CREATE TYPE smart_contract_status AS ENUM ('UNSUBMITTED', 'SUBMITTED', 'ON_CHAIN', 'FAILED');
(added below for determinism: fix later issues around smart contract status defaults)

CREATE TYPE job_status         AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE wallet_event_type  AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE');
CREATE TYPE eac_currency       AS ENUM ('KES','TZS','UGX','RWF','BIF','SSP','CDF','SOS','USD');
CREATE TYPE audit_action       AS ENUM (
  'REGISTER', 'LOGIN', 'LOGOUT', 'TOKEN_REFRESH',
  'BANK_CREATE', 'BANK_UPDATE', 'BANK_LINK_INTERMEDIARY',
  'CUSTOMER_UPDATE', 'CUSTOMER_BANK_CONNECT',
  'TX_INITIATE', 'TX_CONFIRM', 'TX_REJECT',
  'WALLET_CREATE', 'WALLET_DEPOSIT', 'WALLET_WITHDRAW',
  'FX_RATE_UPDATE', 'FEEDBACK_SUBMIT', 'ADMIN_ACTION'
);

CORE TABLES
1. COUNTRIES
CREATE TABLE countries (
  code          CHAR(2)          PRIMARY KEY,          ISO 3166-1 alpha-2
  name          VARCHAR(80)      NOT NULL,
  currency_code eac_currency     NOT NULL,
  currency_name VARCHAR(60)      NOT NULL,
  currency_symbol VARCHAR(10)    NOT NULL,
  flag_emoji    VARCHAR(10),
  is_active     BOOLEAN          NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

2. BANKS
CREATE TABLE banks (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR(120) NOT NULL,
  swift_code            VARCHAR(11)  NOT NULL UNIQUE,
  country_code          CHAR(2)      NOT NULL REFERENCES countries(code),
  address               TEXT,
  website               VARCHAR(255),
  Blockchain / relayer
  relayer_address       VARCHAR(42),                   EVM wallet 0x…
  smart_contract_role   BYTEA,                         AccessControl role hash
  Auth
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         TEXT         NOT NULL,          Argon2id
  role                  user_role    NOT NULL DEFAULT 'BANK',
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  is_verified           BOOLEAN      NOT NULL DEFAULT false,
  -- Meta
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

3. BANK_INTERMEDIARY_LINKS 
Models correspondent banking relationships (Bank A <-> Bank B)
CREATE TABLE bank_intermediary_links (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_id         UUID        NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  correspondent_id UUID       NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  currency_from   eac_currency NOT NULL,
  currency_to     eac_currency NOT NULL,
  fee_bps         SMALLINT    NOT NULL DEFAULT 80,      basis points (0.80%)
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank_id, correspondent_id, currency_from, currency_to)
);

4. CUSTOMERS
CREATE TABLE customers (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  Identity
  first_name            VARCHAR(80)  NOT NULL,
  last_name             VARCHAR(80)  NOT NULL,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  phone                 VARCHAR(20),
  country_code          CHAR(2)      NOT NULL REFERENCES countries(code),
  Auth
  password_hash         TEXT         NOT NULL,         Argon2id
  role                  user_role    NOT NULL DEFAULT 'CUSTOMER',
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  email_verified        BOOLEAN      NOT NULL DEFAULT false,
  Blockchain / Wallet
  wallet_address        VARCHAR(42)  UNIQUE,            on-chain smart wallet (0x…)
  encrypted_key_blob    TEXT,                           AES-256-GCM ciphertext (client stores plaintext)
  mnemonic_confirmed    BOOLEAN      NOT NULL DEFAULT false,
  KYC
  kyc_status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
  CHECK (kyc_status IN ('PENDING','SUBMITTED','APPROVED','REJECTED')),
  kyc_submitted_at      TIMESTAMPTZ,
  Meta
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

5. CUSTOMER_BANK_ACCOUNTS
A customer can hold accounts at multiple EAC banks
CREATE TABLE customer_bank_accounts (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bank_id         UUID         NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  account_number  VARCHAR(40)  NOT NULL,
  account_name    VARCHAR(120) NOT NULL,
  currency        eac_currency NOT NULL,
  is_primary      BOOLEAN      NOT NULL DEFAULT false,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (bank_id, account_number)
);

6. FX_RATES
CREATE TABLE fx_rates (
  id              BIGSERIAL    PRIMARY KEY,
  base_currency   eac_currency NOT NULL,
  quote_currency  eac_currency NOT NULL,
  mid_rate        NUMERIC(18,8) NOT NULL,
  spread          NUMERIC(5,4)  NOT NULL DEFAULT 0.0080,  -- 0.80%
  bid_rate        NUMERIC(18,8) GENERATED ALWAYS AS (mid_rate * (1 - spread)) STORED,
  ask_rate        NUMERIC(18,8) GENERATED ALWAYS AS (mid_rate * (1 + spread)) STORED,
  source          VARCHAR(60)   NOT NULL DEFAULT 'EAC_MARKET',
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (base_currency, quote_currency)
);

7. FX_RATE_HISTORY
Append-only log; never updated, only inserted by the refresh job
CREATE TABLE fx_rate_history (
  id              BIGSERIAL    PRIMARY KEY,
  base_currency   eac_currency NOT NULL,
  quote_currency  eac_currency NOT NULL,
  mid_rate        NUMERIC(18,8) NOT NULL,
  spread          NUMERIC(5,4)  NOT NULL,
  recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

8. TRANSACTIONS
CREATE TABLE transactions (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  Parties
  sender_customer_id    UUID          REFERENCES customers(id) ON DELETE SET NULL,
  sender_bank_id        UUID          NOT NULL REFERENCES banks(id),
  receiver_customer_id  UUID          REFERENCES customers(id) ON DELETE SET NULL,
  receiver_bank_id      UUID          NOT NULL REFERENCES banks(id),
  intermediary_bank_id  UUID          REFERENCES banks(id),         auto-routed
  Amounts
  source_currency       eac_currency  NOT NULL,
  dest_currency         eac_currency  NOT NULL,
  source_amount         NUMERIC(20,4) NOT NULL,
  dest_amount           NUMERIC(20,4) NOT NULL,
  fx_rate               NUMERIC(18,8) NOT NULL,
  fee_amount            NUMERIC(20,4) NOT NULL,
  fee_currency          eac_currency  NOT NULL,
  spread_applied        NUMERIC(5,4)  NOT NULL DEFAULT 0.0080,
  Status
  status                tx_status     NOT NULL DEFAULT 'PENDING',
  Off-chain
  reference             VARCHAR(40)   NOT NULL UNIQUE DEFAULT ('TXN-' || upper(substr(md5(random()::text),1,12))),
  narration             TEXT,
  initiated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
   On-chain / Blockchain
  on_chain_tx_hash      VARCHAR(66)   UNIQUE,           0x + 64 hex chars
  block_number          BIGINT,
  chain_confirmed_at    TIMESTAMPTZ,
  smart_contract_status smart_contract_status NOT NULL DEFAULT 'UNSUBMITTED',
  eip712_signature      TEXT,                           signed payload from frontend
  -- Meta
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

9. BLOCKCHAIN_BLOCKS
Internal tamper-evident ledger (mirrors on-chain, stored locally)
CREATE TABLE blockchain_blocks (
  id              BIGSERIAL    PRIMARY KEY,
  block_index     BIGINT       NOT NULL UNIQUE,
  previous_hash   VARCHAR(64)  NOT NULL,
  hash            VARCHAR(64)  NOT NULL UNIQUE,
  payload         JSONB        NOT NULL,                full transaction snapshot
  nonce           BIGINT       NOT NULL DEFAULT 0,
  is_tampered     BOOLEAN      NOT NULL DEFAULT false,
  tamper_detected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

10. WALLET_EVENTS
All on-chain movements for customer smart wallets
CREATE TABLE wallet_events (
  id              BIGSERIAL         PRIMARY KEY,
  wallet_address  VARCHAR(42)       NOT NULL,           FK-style; wallet may exist before customer row
  customer_id     UUID              REFERENCES customers(id) ON DELETE SET NULL,
  event_type      wallet_event_type NOT NULL,
  amount          NUMERIC(30,6)     NOT NULL,
  token           VARCHAR(20)       NOT NULL DEFAULT 'MATIC',  MATIC | USDC | USDT | EAC-USD
  tx_hash         VARCHAR(66),
  block_number    BIGINT,
  counterparty    VARCHAR(42),                          other wallet address
  metadata        JSONB,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);

 11. RELAYER_JOBS
 BullMQ-style persistent queue for chain broadcasts
CREATE TABLE relayer_jobs (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type        VARCHAR(60)  NOT NULL,                 fx-refresh | chain-verify | relayer-broadcast | webhook-retry
  transaction_id  UUID         REFERENCES transactions(id) ON DELETE SET NULL,
  payload         JSONB        NOT NULL DEFAULT '{}',
  status          job_status   NOT NULL DEFAULT 'QUEUED',
  priority        SMALLINT     NOT NULL DEFAULT 5,       1 = highest
  attempts        SMALLINT     NOT NULL DEFAULT 0,
  max_attempts    SMALLINT     NOT NULL DEFAULT 5,
  last_error      TEXT,
  next_run_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

12. REFRESH_TOKENS
CREATE TABLE refresh_tokens (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL,               customer or bank id
  user_role       user_role    NOT NULL,
  token_hash      TEXT         NOT NULL UNIQUE,         SHA-256 of the raw token
  expires_at      TIMESTAMPTZ  NOT NULL,
  revoked_at      TIMESTAMPTZ,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

13. FEEDBACK
CREATE TABLE feedback (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bank_id         UUID         NOT NULL REFERENCES banks(id)  ON DELETE CASCADE,
  transaction_id  UUID         REFERENCES transactions(id) ON DELETE SET NULL,
  rating          SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  is_public       BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

14. WEBHOOK_DELIVERIES
Tracks inbound on-chain event webhooks (Alchemy / Graph Node)
CREATE TABLE webhook_deliveries (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  source          VARCHAR(60)  NOT NULL DEFAULT 'ALCHEMY',
  event_type      VARCHAR(80)  NOT NULL,                PaymentConfirmed | PaymentRejected | WalletCreated
  payload         JSONB        NOT NULL,
  hmac_valid      BOOLEAN      NOT NULL DEFAULT false,
  processed       BOOLEAN      NOT NULL DEFAULT false,
  error           TEXT,
  attempts        SMALLINT     NOT NULL DEFAULT 0,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

15. AUDIT_LOGS
Append-only; never UPDATE or DELETE rows in this table
CREATE TABLE audit_logs (
  id              BIGSERIAL    PRIMARY KEY,
  actor_id        UUID,                                 customer or bank id
  actor_role      user_role,
  action          audit_action NOT NULL,
  resource_type   VARCHAR(60),                          'TRANSACTION' | 'CUSTOMER' | …
  resource_id     UUID,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

16. SMART_CONTRACT_DEPLOYMENTS
CREATE TABLE smart_contract_deployments (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_name   VARCHAR(80)  NOT NULL,                EACSettlement | EACWalletFactory | CustomerWallet | EACToken
  network         VARCHAR(40)  NOT NULL,                amoy | polygon
  address         VARCHAR(42)  NOT NULL,
  deployer        VARCHAR(42)  NOT NULL,
  deploy_tx_hash  VARCHAR(66),
  abi             JSONB,
  version         VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  is_current      BOOLEAN      NOT NULL DEFAULT true,
  deployed_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (contract_name, network, version)
);

17. RATE_LIMIT_COUNTERS 
 Lightweight table backing Redis-first rate limiting (fallback store)
CREATE TABLE rate_limit_counters (
  key             VARCHAR(200) PRIMARY KEY,             ip:endpoint or userId:endpoint
  count           INT          NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ  NOT NULL
);

INDEXES

Transactions
CREATE INDEX idx_tx_sender_customer     ON transactions(sender_customer_id);
CREATE INDEX idx_tx_receiver_customer   ON transactions(receiver_customer_id);
CREATE INDEX idx_tx_sender_bank         ON transactions(sender_bank_id);
CREATE INDEX idx_tx_receiver_bank       ON transactions(receiver_bank_id);
CREATE INDEX idx_tx_status              ON transactions(status);
CREATE INDEX idx_tx_initiated_at        ON transactions(initiated_at DESC);
CREATE INDEX idx_tx_on_chain_hash       ON transactions(on_chain_tx_hash) WHERE on_chain_tx_hash IS NOT NULL;
CREATE INDEX idx_tx_reference           ON transactions(reference);

Customers
CREATE INDEX idx_customers_email        ON customers USING btree(email);
CREATE INDEX idx_customers_wallet       ON customers(wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX idx_customers_country      ON customers(country_code);
CREATE INDEX idx_customers_name_trgm    ON customers USING gin((first_name || ' ' || last_name) gin_trgm_ops);

Banks
CREATE INDEX idx_banks_country          ON banks(country_code);
CREATE INDEX idx_banks_swift            ON banks(swift_code);

FX Rates
CREATE INDEX idx_fx_pair                ON fx_rates(base_currency, quote_currency);
CREATE INDEX idx_fx_history_pair_time   ON fx_rate_history(base_currency, quote_currency, recorded_at DESC);

Blockchain
CREATE INDEX idx_blocks_index           ON blockchain_blocks(block_index DESC);
CREATE INDEX idx_blocks_hash            ON blockchain_blocks(hash);
CREATE INDEX idx_blocks_tampered        ON blockchain_blocks(is_tampered) WHERE is_tampered = true;

Wallet Events
CREATE INDEX idx_wallet_events_address  ON wallet_events(wallet_address);
CREATE INDEX idx_wallet_events_customer ON wallet_events(customer_id);
CREATE INDEX idx_wallet_events_created  ON wallet_events(created_at DESC);

Relayer Jobs
CREATE INDEX idx_relayer_jobs_status    ON relayer_jobs(status, next_run_at) WHERE status IN ('QUEUED','FAILED');
CREATE INDEX idx_relayer_jobs_type      ON relayer_jobs(job_type);

Audit
CREATE INDEX idx_audit_actor            ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource         ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action           ON audit_logs(action, created_at DESC);

Refresh tokens
CREATE INDEX idx_refresh_user           ON refresh_tokens(user_id, user_role);
CREATE INDEX idx_refresh_expires        ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

Feedback
CREATE INDEX idx_feedback_bank          ON feedback(bank_id);
CREATE INDEX idx_feedback_customer      ON feedback(customer_id);

Customer Bank Accounts
CREATE INDEX idx_cba_customer           ON customer_bank_accounts(customer_id);
CREATE INDEX idx_cba_bank               ON customer_bank_accounts(bank_id);

TRIGGERS  (auto-updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_banks_updated_at
  BEFORE UPDATE ON banks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

Auto-snapshot FX rate to history on every update
CREATE OR REPLACE FUNCTION fx_rate_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO fx_rate_history(base_currency, quote_currency, mid_rate, spread)
  VALUES (NEW.base_currency, NEW.quote_currency, NEW.mid_rate, NEW.spread);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fx_rate_snapshot
  AFTER INSERT OR UPDATE ON fx_rates FOR EACH ROW EXECUTE FUNCTION fx_rate_snapshot();

VIEWS
Full transaction detail with all party names
CREATE OR REPLACE VIEW vw_transaction_details AS
SELECT
  t.id,
  t.reference,
  t.status,
  t.smart_contract_status,
  sender
  c_s.first_name || ' ' || c_s.last_name        AS sender_name,
  c_s.email                                      AS sender_email,
  b_s.name                                       AS sender_bank,
  b_s.swift_code                                 AS sender_swift,
  receiver
  c_r.first_name || ' ' || c_r.last_name        AS receiver_name,
  c_r.email                                      AS receiver_email,
  b_r.name                                       AS receiver_bank,
  b_r.swift_code                                 AS receiver_swift,
  intermediary
  b_i.name                                       AS intermediary_bank,
  amounts
  t.source_currency,
  t.source_amount,
  t.dest_currency,
  t.dest_amount,
  t.fx_rate,
  t.fee_amount,
  t.fee_currency,
  t.spread_applied,
  chain
  t.on_chain_tx_hash,
  t.block_number,
  t.chain_confirmed_at,
  timing
  t.initiated_at,
  t.confirmed_at,
  t.rejected_at,
  t.narration
FROM transactions t
LEFT JOIN customers c_s ON c_s.id = t.sender_customer_id
LEFT JOIN customers c_r ON c_r.id = t.receiver_customer_id
LEFT JOIN banks     b_s ON b_s.id = t.sender_bank_id
LEFT JOIN banks     b_r ON b_r.id = t.receiver_bank_id
LEFT JOIN banks     b_i ON b_i.id = t.intermediary_bank_id;

FX rate grid (all active pairs)
CREATE OR REPLACE VIEW vw_fx_grid AS
SELECT
  f.base_currency,
  f.quote_currency,
  f.mid_rate,
  f.bid_rate,
  f.ask_rate,
  f.spread,
  f.updated_at,
  EXTRACT(EPOCH FROM (now() - f.updated_at)) / 60 AS minutes_since_refresh
FROM fx_rates f
ORDER BY f.base_currency, f.quote_currency;

Bank performance summary
CREATE OR REPLACE VIEW vw_bank_summary AS
SELECT
  b.id,
  b.name,
  b.swift_code,
  b.country_code,
  COUNT(t.id) FILTER (WHERE t.status = 'CONFIRMED')     AS confirmed_tx_count,
  COUNT(t.id) FILTER (WHERE t.status = 'PENDING')       AS pending_tx_count,
  COUNT(t.id) FILTER (WHERE t.status = 'REJECTED')      AS rejected_tx_count,
  COALESCE(SUM(t.source_amount) FILTER (WHERE t.status = 'CONFIRMED'), 0) AS total_volume,
  COALESCE(AVG(f.rating), 0)                            AS avg_feedback_rating,
  COUNT(DISTINCT cba.customer_id)                       AS connected_customers
FROM banks b
LEFT JOIN transactions t ON t.sender_bank_id = b.id OR t.receiver_bank_id = b.id
LEFT JOIN feedback f      ON f.bank_id = b.id
LEFT JOIN customer_bank_accounts cba ON cba.bank_id = b.id AND cba.is_active = true
GROUP BY b.id;

Customer wallet overview
CREATE OR REPLACE VIEW vw_customer_wallet AS
SELECT
  c.id,
  c.first_name || ' ' || c.last_name   AS full_name,
  c.email,
  c.country_code,
  c.wallet_address,
  c.mnemonic_confirmed,
  c.kyc_status,
  COUNT(DISTINCT cba.id)               AS linked_accounts,
  COUNT(t_s.id)                        AS sent_tx_count,
  COUNT(t_r.id)                        AS received_tx_count,
  COALESCE(SUM(t_s.source_amount) FILTER (WHERE t_s.status = 'CONFIRMED'), 0) AS total_sent
FROM customers c
LEFT JOIN customer_bank_accounts cba ON cba.customer_id = c.id AND cba.is_active = true
LEFT JOIN transactions t_s ON t_s.sender_customer_id = c.id
LEFT JOIN transactions t_r ON t_r.receiver_customer_id = c.id
GROUP BY c.id;

Chain integrity monitor
CREATE OR REPLACE VIEW vw_chain_health AS
SELECT
  COUNT(*)                                   AS total_blocks,
  COUNT(*) FILTER (WHERE is_tampered = true) AS tampered_blocks,
  MAX(block_index)                           AS latest_block,
  MAX(created_at)                            AS latest_block_time,
  CASE WHEN COUNT(*) FILTER (WHERE is_tampered = true) = 0 THEN 'HEALTHY' ELSE 'COMPROMISED' END AS chain_status
FROM blockchain_blocks;

HELPER FUNCTIONS
Convert an amount between two EAC currencies using latest rate
CREATE OR REPLACE FUNCTION fx_convert(
  p_amount        NUMERIC,
  p_from          eac_currency,
  p_to            eac_currency,
  p_apply_spread  BOOLEAN DEFAULT true
)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rate  NUMERIC;
  v_spread NUMERIC;
BEGIN
  IF p_from = p_to THEN RETURN p_amount; END IF;

  SELECT mid_rate, spread INTO v_rate, v_spread
  FROM fx_rates
  WHERE base_currency = p_from AND quote_currency = p_to;

  IF NOT FOUND THEN
    -- Try inverse
    SELECT 1 / mid_rate, spread INTO v_rate, v_spread
    FROM fx_rates
    WHERE base_currency = p_to AND quote_currency = p_from;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No FX rate found for % / %', p_from, p_to;
  END IF;

  IF p_apply_spread THEN
  customer gets bid rate (mid_rate minus spread)
    v_rate := v_rate * (1 - v_spread);
  END IF;

  RETURN round(p_amount * v_rate, 4);
END;
$$;

Generate a transaction reference
CREATE OR REPLACE FUNCTION generate_tx_reference()
RETURNS VARCHAR LANGUAGE sql AS $$
  SELECT 'EAC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
$$;

Verify block chain integrity (call periodically from background job)
CREATE OR REPLACE FUNCTION verify_chain_integrity()
RETURNS TABLE(block_index BIGINT, expected_hash TEXT, stored_hash TEXT, ok BOOLEAN)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.block_index,
    encode(
      digest(
        b.block_index::text || b.previous_hash || b.payload::text || b.nonce::text,
        'sha256'
      ), 'hex'
    )                AS expected_hash,
    b.hash           AS stored_hash,
    encode(
      digest(
        b.block_index::text || b.previous_hash || b.payload::text || b.nonce::text,
        'sha256'
      ), 'hex'
    ) = b.hash       AS ok
  FROM blockchain_blocks b
  ORDER BY b.block_index;
END;
$$;

ROW-LEVEL SECURITY  (enable after app roles are created)

ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback              ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_events         ENABLE ROW LEVEL SECURITY;

Customers can only see their own rows (app sets app.current_user_id)
CREATE POLICY customer_self_select ON customers
  FOR SELECT USING (id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY customer_tx_select ON transactions
  FOR SELECT USING (
    sender_customer_id   = current_setting('app.current_user_id', true)::uuid OR
    receiver_customer_id = current_setting('app.current_user_id', true)::uuid
  );

SEED DATA
Countries
INSERT INTO countries (code, name, currency_code, currency_name, currency_symbol, flag_emoji) VALUES
  ('KE', 'Kenya',       'KES', 'Kenyan Shilling',          'KSh',  '🇰🇪'),
  ('TZ', 'Tanzania',    'TZS', 'Tanzanian Shilling',        'TSh',  '🇹🇿'),
  ('UG', 'Uganda',      'UGX', 'Ugandan Shilling',          'USh',  '🇺🇬'),
  ('RW', 'Rwanda',      'RWF', 'Rwandan Franc',             'RF',   '🇷🇼'),
  ('BI', 'Burundi',     'BIF', 'Burundian Franc',           'FBu',  '🇧🇮'),
  ('SS', 'South Sudan', 'SSP', 'South Sudanese Pound',      'SSP',  '🇸🇸'),
  ('CD', 'DR Congo',    'CDF', 'Congolese Franc',           'FC',   '🇨🇩'),
  ('SO', 'Somalia',     'SOS', 'Somali Shilling',           'SOS',  '🇸🇴');

Seed Banks
INSERT INTO banks (name, swift_code, country_code, email, password_hash, website, is_verified) VALUES
  ('Equity Bank Kenya',      'EQBLKENA', 'KE', 'ops@equitybank.co.ke',      '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_01', 'https://equitybank.co.ke',     true),
  ('KCB Group',              'KCBLKENX', 'KE', 'ops@kcbgroup.com',           '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_02', 'https://kcbgroup.com',          true),
  ('Co-operative Bank Kenya','COOPKENA', 'KE', 'ops@co-opbank.co.ke',        '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_03', 'https://co-opbank.co.ke',       true),
  ('CRDB Bank Tanzania',     'CORUTZTZ', 'TZ', 'ops@crdbbank.com',           '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_04', 'https://crdbbank.com',          true),
  ('NMB Bank Tanzania',      'NMIBTZTZ', 'TZ', 'ops@nmbbank.co.tz',          '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_05', 'https://nmbbank.co.tz',         true),
  ('Stanbic Uganda',         'SBICUGKA', 'UG', 'ops@stanbic.co.ug',          '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_06', 'https://stanbic.co.ug',         true),
  ('Centenary Bank Uganda',  'CDOUUGKA', 'UG', 'ops@centenarybank.co.ug',    '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_07', 'https://centenarybank.co.ug',   true),
  ('Bank of Kigali',         'BKIGRWRW', 'RW', 'ops@bk.rw',                 '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_08', 'https://bk.rw',                 true),
  ('I&M Bank Kenya',         'IMBLKENX', 'KE', 'ops@imbank.co.ke',           '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_09', 'https://imbank.co.ke',          true),
  ('Diamond Trust Bank',     'DTKEKENX', 'KE', 'ops@dtbbank.com',            '$argon2id$v=19$m=65536,t=3,p=4$SEED_HASH_10', 'https://dtbbank.com',           true);

FX Rates (KES base + cross pairs)
INSERT INTO fx_rates (base_currency, quote_currency, mid_rate, spread) VALUES
KES base
  ('KES','TZS', 22.8400, 0.0080),
  ('KES','UGX', 28.3100, 0.0080),
  ('KES','RWF',  8.9400, 0.0080),
  ('KES','BIF', 19.7200, 0.0080),
  ('KES','SSP',  0.5620, 0.0120), higher spread for less liquid pair
  ('KES','CDF',184.5000, 0.0100),
  ('KES','SOS',311.8000, 0.0120),
  ('KES','USD',  0.0077, 0.0060),
TZS base
  ('TZS','KES',  0.0438, 0.0080),
  ('TZS','UGX',  1.2400, 0.0080),
  ('TZS','RWF',  0.3914, 0.0080),
  ('TZS','BIF',  0.8634, 0.0080),
  ('TZS','USD',  0.0003, 0.0060),
UGX base
  ('UGX','KES',  0.0353, 0.0080),
  ('UGX','TZS',  0.8065, 0.0080),
  ('UGX','RWF',  0.3160, 0.0080),
  ('UGX','BIF',  0.6970, 0.0080),
  ('UGX','USD',  0.0003, 0.0060),
RWF base
  ('RWF','KES',  0.1119, 0.0080),
  ('RWF','TZS',  2.5560, 0.0080),
  ('RWF','UGX',  3.1646, 0.0080),
  ('RWF','USD',  0.0009, 0.0060),
USD base (settlement stablecoin anchor)
  ('USD','KES',129.8700, 0.0060),
  ('USD','TZS',2583.000, 0.0060),
  ('USD','UGX',3735.000, 0.0060),
  ('USD','RWF',1143.000, 0.0060),
  ('USD','BIF',2872.000, 0.0100),
  ('USD','CDF',2742.000, 0.0100),
  ('USD','SOS',40600.00, 0.0120),
  ('USD','SSP', 1334.000, 0.0120);

Bank Intermediary Links
WITH b AS (SELECT id, swift_code FROM banks)
INSERT INTO bank_intermediary_links (bank_id, correspondent_id, currency_from, currency_to)
SELECT b1.id, b2.id, 'KES', 'TZS' FROM b b1, b b2 WHERE b1.swift_code='EQBLKENA' AND b2.swift_code='CRDB Bank Tanzania'
UNION ALL
SELECT b1.id, b2.id, 'KES', 'UGX' FROM b b1, b b2 WHERE b1.swift_code='KCBLKENX' AND b2.swift_code='SBICUGKA'
UNION ALL
SELECT b1.id, b2.id, 'KES', 'RWF' FROM b b1, b b2 WHERE b1.swift_code='EQBLKENA' AND b2.swift_code='BKIGRWRW';

Smart Contract Deployments (Amoy testnet)
INSERT INTO smart_contract_deployments
  (contract_name, network, address, deployer, version, is_current) VALUES
  ('EACSettlement',    'amoy',   '0xABC1000000000000000000000000000000000001', '0xDEPLOYER0000000000000000000000000000000', '1.0.0', true),
  ('EACWalletFactory', 'amoy',   '0xABC1000000000000000000000000000000000002', '0xDEPLOYER0000000000000000000000000000000', '1.0.0', true),
  ('CustomerWallet',   'amoy',   '0xABC1000000000000000000000000000000000003', '0xDEPLOYER0000000000000000000000000000000', '1.0.0', true),
  ('EACToken',         'amoy',   '0xABC1000000000000000000000000000000000004', '0xDEPLOYER0000000000000000000000000000000', '1.0.0', true);

Genesis Block
INSERT INTO blockchain_blocks (block_index, previous_hash, hash, payload, nonce) VALUES
  (0,
   '0000000000000000000000000000000000000000000000000000000000000000',
   encode(digest('0' || '0000000000000000000000000000000000000000000000000000000000000000' || '{"genesis":true,"network":"EACPay","version":"1.0.0"}' || '0', 'sha256'), 'hex'),
   '{"genesis":true,"network":"EACPay","version":"1.0.0","created":"2026-01-01T00:00:00Z"}',
   0);

Sample Customers (dev / testing)
INSERT INTO customers
  (first_name, last_name, email, phone, country_code, password_hash, email_verified, mnemonic_confirmed, kyc_status)
VALUES
  ('Amara',   'Osei',     'amara.osei@example.com',   '+254711000001', 'KE', '$argon2id$v=19$m=65536$CUST01', true,  true,  'APPROVED'),
  ('Fatuma',  'Hassan',   'fatuma.hassan@example.com', '+255712000002', 'TZ', '$argon2id$v=19$m=65536$CUST02', true,  true,  'APPROVED'),
  ('Emmanuel','Nkurunziza','e.nkurunziza@example.com', '+257720000003', 'BI', '$argon2id$v=19$m=65536$CUST03', true,  false, 'SUBMITTED'),
  ('Grace',   'Nakato',   'grace.nakato@example.com',  '+256771000004', 'UG', '$argon2id$v=19$m=65536$CUST04', true,  true,  'APPROVED'),
  ('Ibrahim', 'Mugenyi',  'ibrahim.m@example.com',     '+250780000005', 'RW', '$argon2id$v=19$m=65536$CUST05', false, false, 'PENDING');

Sample Transactions
WITH
  cust  AS (SELECT id, email FROM customers),
  bnks  AS (SELECT id, swift_code FROM banks)
INSERT INTO transactions
  (sender_customer_id, sender_bank_id, receiver_customer_id, receiver_bank_id,
   source_currency, dest_currency, source_amount, dest_amount,
   fx_rate, fee_amount, fee_currency, status, smart_contract_status,
   on_chain_tx_hash, block_number, chain_confirmed_at,
   narration, initiated_at, confirmed_at)
SELECT
  c1.id, b1.id, c2.id, b2.id,
  'KES', 'TZS', 50000, 1137150,
  22.743, 400, 'KES', 'CONFIRMED', 'ON_CHAIN',
  '0x3f2a9c1b7d4e8f2a1c3b5d7e9f1a2c4b6d8e0f2a4c6b8d0e2f4a6c8b0d2e4f6a', 104825,
  now() - interval '5 minutes',
  'School fees payment', now() - interval '1 hour', now() - interval '5 minutes'
FROM cust c1, cust c2, bnks b1, bnks b2
WHERE c1.email = 'amara.osei@example.com'
  AND c2.email = 'fatuma.hassan@example.com'
  AND b1.swift_code = 'EQBLKENA'
  AND b2.swift_code = 'CORUTZTZ'
LIMIT 1;

Sample Feedback
WITH c AS (SELECT id FROM customers WHERE email='amara.osei@example.com'),
     b AS (SELECT id FROM banks WHERE swift_code='EQBLKENA')
INSERT INTO feedback (customer_id, bank_id, rating, comment, is_public)
SELECT c.id, b.id, 5, 'Fast and transparent — could see the transaction on the blockchain explorer instantly!', true
FROM c, b;

Relayer Jobs (initial recurring jobs)
INSERT INTO relayer_jobs (job_type, payload, status, priority, next_run_at) VALUES
  ('fx-refresh',    '{"description":"Refresh all EAC FX pairs"}',   'QUEUED', 3, now()),
  ('chain-verify',  '{"description":"Verify blockchain integrity"}', 'QUEUED', 2, now() + interval '5 minutes');