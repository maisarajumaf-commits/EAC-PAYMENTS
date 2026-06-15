// src/migrations/001_initial.js
exports.up = async (knex) => {
  // ── Users ─────────────────────────────────────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('phone', 30);
    t.enu('country', [
      'KE', 'TZ', 'UG', 'RW', 'BI', 'SS', 'CD', 'SO',
    ]).notNullable();
    t.enu('kyc_status', ['pending', 'submitted', 'approved', 'rejected'])
      .notNullable()
      .defaultTo('pending');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('is_email_verified').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  // ── Wallets (non-custodial, EVM) ──────────────────────────────────────────
  await knex.schema.createTable('wallets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('address', 42).notNullable().unique();
    t.string('encrypted_key_store', 4096).notNullable(); // AES-256-GCM ciphertext
    t.string('iv', 64).notNullable();
    t.string('auth_tag', 64).notNullable();
    t.string('salt', 128).notNullable(); // for PBKDF2
    t.boolean('is_primary').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index('user_id');
  });

  // ── Banks ─────────────────────────────────────────────────────────────────
  await knex.schema.createTable('banks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 150).notNullable();
    t.string('swift_code', 12).notNullable().unique();
    t.enu('country', ['KE', 'TZ', 'UG', 'RW', 'BI', 'SS', 'CD', 'SO']).notNullable();
    t.string('relayer_address', 42); // on-chain relayer wallet
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ── FX Rates cache ────────────────────────────────────────────────────────
  await knex.schema.createTable('fx_rates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('from_currency', 10).notNullable();
    t.string('to_currency', 10).notNullable();
    t.decimal('rate', 18, 8).notNullable();
    t.decimal('spread_pct', 6, 4).notNullable().defaultTo(0.8);
    t.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['from_currency', 'to_currency']);
    t.index(['from_currency', 'to_currency']);
  });

  // ── Transfers ─────────────────────────────────────────────────────────────
  await knex.schema.createTable('transfers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('transfer_id', 66).unique(); // bytes32 hex, on-chain key
    t.uuid('sender_id').notNullable().references('id').inTable('users');
    t.uuid('recipient_id').references('id').inTable('users'); // null for external
    t.string('recipient_address', 42); // EVM address
    t.string('recipient_phone', 30); // for M-Pesa style off-ramp
    t.string('from_currency', 10).notNullable();
    t.string('to_currency', 10).notNullable();
    t.decimal('send_amount', 20, 8).notNullable();
    t.decimal('receive_amount', 20, 8).notNullable();
    t.decimal('fee_amount', 20, 8).notNullable();
    t.decimal('fx_rate', 18, 8).notNullable();
    t.enu('status', [
      'created',
      'signing',
      'broadcasting',
      'pending_chain',
      'confirmed',
      'settled',
      'failed',
      'refunded',
    ]).notNullable().defaultTo('created');
    t.string('tx_hash', 66); // on-chain transaction hash
    t.integer('block_number');
    t.integer('confirmations').defaultTo(0);
    t.string('failure_reason', 500);
    t.jsonb('metadata').defaultTo('{}');
    t.timestamps(true, true);
    t.index('sender_id');
    t.index('status');
    t.index('tx_hash');
  });

  // ── Audit log (append-only) ───────────────────────────────────────────────
  await knex.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id');
    t.uuid('user_id').references('id').inTable('users');
    t.string('action', 100).notNullable();
    t.string('entity_type', 60);
    t.string('entity_id', 100);
    t.jsonb('before').defaultTo('{}');
    t.jsonb('after').defaultTo('{}');
    t.string('ip_address', 45);
    t.string('user_agent', 500);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index('user_id');
    t.index('action');
    t.index('created_at');
  });

  // ── Refresh tokens ────────────────────────────────────────────────────────
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 128).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.boolean('revoked').notNullable().defaultTo(false);
    t.string('ip_address', 45);
    t.timestamps(true, true);
    t.index('user_id');
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('transfers');
  await knex.schema.dropTableIfExists('fx_rates');
  await knex.schema.dropTableIfExists('banks');
  await knex.schema.dropTableIfExists('wallets');
  await knex.schema.dropTableIfExists('users');
};
