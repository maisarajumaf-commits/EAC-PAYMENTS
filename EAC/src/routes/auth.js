// src/routes/auth.js
const router = require('express').Router();
const authService = require('../services/authService');
const { validate, schemas } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');

/** POST /api/v1/auth/register */
router.post(
  '/register',
  authLimiter,
  validate(schemas.registerSchema),
  async (req, res) => {
    const user = await authService.register(req.body);
    res.status(201).json({ message: 'Registration successful', user });
  }
);

/** POST /api/v1/auth/login */
router.post(
  '/login',
  authLimiter,
  validate(schemas.loginSchema),
  async (req, res) => {
    const result = await authService.login({ ...req.body, ip: req.clientIp });
    res.json(result);
  }
);

/** POST /api/v1/auth/refresh */
router.post('/refresh', authLimiter, async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  const result = await authService.refresh({ refreshToken: refresh_token, ip: req.clientIp });
  res.json(result);
});

/** POST /api/v1/auth/logout */
router.post('/logout', authenticate, async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) await authService.logout({ refreshToken: refresh_token });
  res.json({ message: 'Logged out' });
});

/** GET /api/v1/auth/me */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
