// src/routes/wallets.js
const router = require('express').Router();
const walletService = require('../services/walletService');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimit');

/** POST /api/v1/wallets – register a client-generated wallet */
router.post(
  '/',
  authenticate,
  apiLimiter,
  validate(schemas.walletCreateSchema),
  async (req, res) => {
    const wallet = await walletService.createWallet(req.user.id, req.body);
    res.status(201).json(wallet);
  }
);

/** GET /api/v1/wallets – list user's wallets */
router.get('/', authenticate, apiLimiter, async (req, res) => {
  const wallets = await walletService.getUserWallets(req.user.id);
  res.json({ data: wallets });
});

/** GET /api/v1/wallets/:address/balance – on-chain balance */
router.get('/:address/balance', authenticate, apiLimiter, async (req, res) => {
  const { address } = req.params;
  const balance = await walletService.getBalance(address);
  res.json(balance);
});

module.exports = router;
