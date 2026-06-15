// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

/**
 * Verifies the Authorization: Bearer <token> header.
 * Attaches req.user = { id, email, country, kyc_status }.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [user] = await db('users')
      .where({ id: payload.sub, is_active: true })
      .select('id', 'email', 'country', 'kyc_status', 'is_email_verified');

    if (!user) return res.status(401).json({ error: 'User not found or deactivated' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/** Require KYC to be approved before performing transfers */
function requireKyc(req, res, next) {
  if (req.user.kyc_status !== 'approved') {
    return res.status(403).json({
      error: 'KYC approval required',
      kyc_status: req.user.kyc_status,
    });
  }
  next();
}

module.exports = { authenticate, requireKyc };
