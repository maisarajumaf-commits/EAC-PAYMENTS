// src/routes/fx.js
const router = require('express').Router();
const fxService = require('../services/fxService');
const { validate, schemas } = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimit');

/** GET /api/v1/fx/rates – all current rates (for ticker + table) */
router.get('/rates', apiLimiter, async (req, res) => {
  const rates = await fxService.getAllRates();
  res.json({ data: rates, count: rates.length });
});

/** GET /api/v1/fx/rate?from=KES&to=TZS */
router.get('/rate', apiLimiter, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });

  const rate = await fxService.getRate(from.toUpperCase(), to.toUpperCase());
  res.json({ from, to, rate });
});

/** POST /api/v1/fx/quote – pre-flight cost estimate */
router.post('/quote', apiLimiter, validate(schemas.fxQuoteSchema), async (req, res) => {
  const { from_currency, to_currency, amount } = req.body;
  const quote = await fxService.getQuote({
    from_currency: from_currency.toUpperCase(),
    to_currency: to_currency.toUpperCase(),
    amount,
  });
  res.json(quote);
});

module.exports = router;
