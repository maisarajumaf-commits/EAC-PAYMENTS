// src/config/logger.js
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'eacpay-api' },
  transports: [
    new transports.Console({
      format:
        process.env.NODE_ENV === 'development'
          ? format.combine(format.colorize(), format.simple())
          : format.json(),
    }),
    // In production add transports.File or a cloud transport
  ],
});

// Append-only audit log for financial write operations
const auditLogger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'eacpay-audit' },
  transports: [
    new transports.Console({ silent: process.env.NODE_ENV === 'test' }),
    // production: stream to immutable storage (S3, CloudWatch, etc.)
  ],
});

module.exports = { logger, auditLogger };
