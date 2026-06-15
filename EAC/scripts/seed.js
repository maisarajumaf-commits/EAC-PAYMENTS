// scripts/seed.js
require('dotenv').config();
const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

const BANKS = [
  { name: 'KCB Bank',           swift_code: 'KCBLKENX', country: 'KE' },
  { name: 'Equity Bank',        swift_code: 'EQBLKENA', country: 'KE' },
  { name: 'Co-operative Bank',  swift_code: 'COOPKENA', country: 'KE' },
  { name: 'I&M Bank',           swift_code: 'IMBLKENX', country: 'KE' },
  { name: 'Diamond Trust Bank', swift_code: 'DTKEKENX', country: 'KE' },
  { name: 'CRDB Bank',          swift_code: 'CORUTZTZ', country: 'TZ' },
  { name: 'NMB Bank',           swift_code: 'NMIBTZTZ', country: 'TZ' },
  { name: 'Stanbic Uganda',     swift_code: 'SBICUGKA', country: 'UG' },
  { name: 'Centenary Bank',     swift_code: 'CDOUUGKA', country: 'UG' },
  { name: 'Bank of Kigali',     swift_code: 'BKIGRWRW', country: 'RW' },
];

const FX_SEED = [
  { from_currency: 'USD', to_currency: 'KES', rate: 129.50 },
  { from_currency: 'USD', to_currency: 'TZS', rate: 2490.00 },
  { from_currency: 'USD', to_currency: 'UGX', rate: 3750.00 },
  { from_currency: 'USD', to_currency: 'RWF', rate: 1160.00 },
  { from_currency: 'KES', to_currency: 'TZS', rate: 19.24 },
  { from_currency: 'KES', to_currency: 'UGX', rate: 28.96 },
  { from_currency: 'KES', to_currency: 'RWF', rate: 8.96 },
  { from_currency: 'TZS', to_currency: 'KES', rate: 0.052 },
];

async function seed() {
  await knex('banks')
    .insert(BANKS)
    .onConflict('swift_code')
    .ignore();

  await knex('fx_rates')
    .insert(FX_SEED.map(r => ({ ...r, fetched_at: new Date() })))
    .onConflict(['from_currency', 'to_currency'])
    .merge(['rate', 'fetched_at']);

  console.log('Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
