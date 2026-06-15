// src/routes/banks.js
const router = require('express').Router();
const { db } = require('../config/database');
const { apiLimiter } = require('../middleware/rateLimit');

// Static reference data matching the partner banks shown on the website
const PARTNER_BANKS = [
  { name: 'KCB Bank', swift: 'KCBLKENX', country: 'KE', flag: '🇰🇪' },
  { name: 'Equity Bank', swift: 'EQBLKENA', country: 'KE', flag: '🇰🇪' },
  { name: 'Co-operative Bank', swift: 'COOPKENA', country: 'KE', flag: '🇰🇪' },
  { name: 'I&M Bank', swift: 'IMBLKENX', country: 'KE', flag: '🇰🇪' },
  { name: 'Diamond Trust Bank', swift: 'DTKEKENX', country: 'KE', flag: '🇰🇪' },
  { name: 'CRDB Bank', swift: 'CORUTZTZ', country: 'TZ', flag: '🇹🇿' },
  { name: 'NMB Bank', swift: 'NMIBTZTZ', country: 'TZ', flag: '🇹🇿' },
  { name: 'Stanbic Uganda', swift: 'SBICUGKA', country: 'UG', flag: '🇺🇬' },
  { name: 'Centenary Bank', swift: 'CDOUUGKA', country: 'UG', flag: '🇺🇬' },
  { name: 'Bank of Kigali', swift: 'BKIGRWRW', country: 'RW', flag: '🇷🇼' },
];

const EAC_COUNTRIES = [
  { code: 'KE', name: 'Kenya', currency: 'KES', flag: '🇰🇪' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', flag: '🇹🇿' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', flag: '🇺🇬' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', flag: '🇷🇼' },
  { code: 'BI', name: 'Burundi', currency: 'BIF', flag: '🇧🇮' },
  { code: 'SS', name: 'South Sudan', currency: 'SSP', flag: '🇸🇸' },
  { code: 'CD', name: 'DR Congo', currency: 'CDF', flag: '🇨🇩' },
  { code: 'SO', name: 'Somalia', currency: 'SOS', flag: '🇸🇴' },
];

/** GET /api/v1/banks */
router.get('/', apiLimiter, async (req, res) => {
  try {
    // Try DB first, fall back to static list
    const rows = await db('banks').where({ is_active: true }).orderBy('country');
    res.json({ data: rows.length ? rows : PARTNER_BANKS });
  } catch (_) {
    res.json({ data: PARTNER_BANKS });
  }
});

/** GET /api/v1/banks/countries */
router.get('/countries', apiLimiter, (req, res) => {
  res.json({ data: EAC_COUNTRIES });
});

module.exports = router;
