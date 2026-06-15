// src/routes/transfers.js
const router = require('express').Router();
const transferService = require('../services/transferService');
const { authenticate, requireKyc } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { transferLimiter, apiLimiter } = require('../middleware/rateLimit');

/** POST /api/v1/transfers – initiate a cross-border transfer */
router.post(
  '/',
  authenticate,
  requireKyc,
  transferLimiter,
  validate(schemas.transferSchema),
  async (req, res) => {
    const result = await transferService.initiateTransfer(
      req.user.id,
      req.body,
      req.clientIp
    );
    res.status(202).json(result);
  }
);

/** GET /api/v1/transfers – paginated history */
router.get('/', authenticate, apiLimiter, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const status = req.query.status;

  const result = await transferService.getTransferHistory(req.user.id, { page, limit, status });
  res.json(result);
});

/** GET /api/v1/transfers/:id – single transfer */
router.get('/:id', authenticate, apiLimiter, async (req, res) => {
  const transfer = await transferService.getTransferById(req.params.id, req.user.id);
  res.json(transfer);
});

module.exports = router;
