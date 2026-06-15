// src/services/authService.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../config/database');
const { auditLogger } = require('../config/logger');

const SALT_ROUNDS = 12;

async function register({ email, password, first_name, last_name, phone, country }) {
  const existing = await db('users').where({ email }).first();
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await db('users')
    .insert({ email, password_hash, first_name, last_name, phone, country })
    .returning(['id', 'email', 'first_name', 'last_name', 'country', 'kyc_status', 'created_at']);

  auditLogger.info('user.register', { userId: user.id, email, country });
  return user;
}

async function login({ email, password, ip }) {
  const user = await db('users')
    .where({ email, is_active: true })
    .first();

  if (!user) throw _authError();

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw _authError();

  const accessToken = _issueAccess(user);
  const { refreshToken, hash, expiresAt } = _issueRefresh();

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hash,
    expires_at: expiresAt,
    ip_address: ip,
  });

  auditLogger.info('user.login', { userId: user.id, ip });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 86400,
    user: _safeUser(user),
  };
}

async function refresh({ refreshToken, ip }) {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const stored = await db('refresh_tokens')
    .where({ token_hash: hash, revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  const user = await db('users').where({ id: stored.user_id, is_active: true }).first();
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  // Rotate refresh token
  await db('refresh_tokens').where({ id: stored.id }).update({ revoked: true });
  const { refreshToken: newRefreshToken, hash: newHash, expiresAt } = _issueRefresh();
  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: newHash,
    expires_at: expiresAt,
    ip_address: ip,
  });

  return {
    access_token: _issueAccess(user),
    refresh_token: newRefreshToken,
    expires_in: 86400,
  };
}

async function logout({ refreshToken }) {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db('refresh_tokens').where({ token_hash: hash }).update({ revoked: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _issueAccess(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, country: user.country },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h', algorithm: 'HS256' }
  );
}

function _issueRefresh() {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const days = parseInt((process.env.REFRESH_TOKEN_EXPIRES_IN || '30d').replace('d', ''));
  const expiresAt = new Date(Date.now() + days * 86400 * 1000);
  return { refreshToken, hash, expiresAt };
}

function _authError() {
  const err = new Error('Invalid email or password');
  err.status = 401;
  return err;
}

function _safeUser(u) {
  return {
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    country: u.country,
    kyc_status: u.kyc_status,
  };
}

module.exports = { register, login, refresh, logout };
