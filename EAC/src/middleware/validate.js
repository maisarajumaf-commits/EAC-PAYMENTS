// src/middleware/validate.js
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, coerceTypes: false, strict: true });
addFormats(ajv);

/**
 * Returns an Express middleware that validates req.body against the given
 * JSON Schema. Responds 400 with all validation errors if invalid.
 */
function validate(schema) {
  const validateFn = ajv.compile(schema);
  return (req, res, next) => {
    const valid = validateFn(req.body);
    if (!valid) {
      const errors = validateFn.errors.map((e) => ({
        field: e.instancePath.replace(/^\//, '') || e.params?.missingProperty,
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = {
  type: 'object',
  required: ['email', 'password', 'first_name', 'last_name', 'country'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 255 },
    password: { type: 'string', minLength: 8, maxLength: 128 },
    first_name: { type: 'string', minLength: 1, maxLength: 100 },
    last_name: { type: 'string', minLength: 1, maxLength: 100 },
    phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
    country: { type: 'string', enum: ['KE', 'TZ', 'UG', 'RW', 'BI', 'SS', 'CD', 'SO'] },
  },
};

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
};

const transferSchema = {
  type: 'object',
  required: ['recipient_address', 'from_currency', 'to_currency', 'send_amount', 'eip712_signature'],
  additionalProperties: false,
  properties: {
    recipient_address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    recipient_phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
    from_currency: { type: 'string', minLength: 3, maxLength: 10 },
    to_currency: { type: 'string', minLength: 3, maxLength: 10 },
    send_amount: { type: 'number', minimum: 0.01, maximum: 1_000_000 },
    eip712_signature: { type: 'string', pattern: '^0x[0-9a-fA-F]{130}$' },
    memo: { type: 'string', maxLength: 280 },
  },
};

const fxQuoteSchema = {
  type: 'object',
  required: ['from_currency', 'to_currency', 'amount'],
  additionalProperties: false,
  properties: {
    from_currency: { type: 'string', minLength: 3, maxLength: 10 },
    to_currency: { type: 'string', minLength: 3, maxLength: 10 },
    amount: { type: 'number', minimum: 0.01 },
  },
};

const walletCreateSchema = {
  type: 'object',
  required: ['encrypted_key_store', 'iv', 'auth_tag', 'salt', 'address'],
  additionalProperties: false,
  properties: {
    address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    encrypted_key_store: { type: 'string', minLength: 1, maxLength: 4096 },
    iv: { type: 'string', minLength: 24, maxLength: 64 },
    auth_tag: { type: 'string', minLength: 24, maxLength: 64 },
    salt: { type: 'string', minLength: 32, maxLength: 128 },
  },
};

module.exports = {
  validate,
  schemas: { registerSchema, loginSchema, transferSchema, fxQuoteSchema, walletCreateSchema },
};
