// scripts/migrate.js
require('dotenv').config();
const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: { directory: './src/migrations' },
});

knex.migrate.latest()
  .then(([batch, files]) => {
    console.log(`Migrations run (batch ${batch}):`, files.length ? files : 'none');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
