// src/app.js
require('express-async-errors');
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { requestContext, errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./config/logger');

// Routes
const authRoutes = require('./routes/auth');
const fxRoutes = require('./routes/fx');
const walletRoutes = require('./routes/wallets');
const transferRoutes = require('./routes/transfers');
const bankRoutes = require('./routes/banks');
const healthRoutes = require('./routes/health');

const app = express();

// ── Security headers (OWASP) ──────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// ── CORS (allowlist only) ─────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ── Request context (IP extraction) ──────────────────────────────────────────
app.use(requestContext);

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info('request', { method: req.method, path: req.path, ip: req.clientIp });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/health`, healthRoutes);
app.use(`${v1}/auth`, authRoutes);
app.use(`${v1}/fx`, fxRoutes);
app.use(`${v1}/wallets`, walletRoutes);
app.use(`${v1}/transfers`, transferRoutes);
app.use(`${v1}/banks`, bankRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
