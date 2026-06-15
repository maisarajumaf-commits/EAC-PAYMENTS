// src/services/fxService.js
const axios = require('axios');
const cron = require('node-cron');
const { db } = require('../config/database');
const { redis } = require('../config/redis');
const { getFxOracleContract, getRelayerWallet } = require('../config/blockchain');
const { logger } = require('../config/logger');

const EAC_CURRENCIES = ['KES', 'TZS', 'UGX', 'RWF', 'BIF', 'SSP', 'CDF', 'SOS', 'USD'];
const SPREAD_PCT = 0.008; // 0.8 % as shown on the site
const CACHE_TTL_SECONDS = 35;

/**
 * Get a quote: source amount → destination amount after spread + fee.
 */
async function getQuote({ from_currency, to_currency, amount }) {
  const rate = await getRate(from_currency, to_currency);
  const fee = amount * 0.002; // 0.2% transfer fee
  const receive_amount = (amount - fee) * rate;

  return {
    from_currency,
    to_currency,
    send_amount: amount,
    receive_amount: parseFloat(receive_amount.toFixed(4)),
    fx_rate: rate,
    fee_amount: parseFloat(fee.toFixed(4)),
    spread_pct: SPREAD_PCT * 100,
    rate_expires_at: new Date(Date.now() + 30_000).toISOString(),
  };
}

/**
 * Get mid-market rate with spread applied, from Redis → DB → provider.
 */
async function getRate(from, to) {
  if (from === to) return 1;

  const cacheKey = `fx:${from}:${to}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return parseFloat(cached);
  } catch (_) { /* redis miss is non-fatal */ }

  const row = await db('fx_rates')
    .where({ from_currency: from, to_currency: to })
    .where('fetched_at', '>', new Date(Date.now() - 60_000))
    .first();

  if (row) {
    await _cacheRate(cacheKey, row.rate);
    return parseFloat(row.rate);
  }

  // Fallback: fetch live
  return await fetchAndStore(from, to);
}

async function fetchAndStore(from, to) {
  try {
    const { data } = await axios.get(`${process.env.FX_PROVIDER_URL}/live`, {
      params: {
        access_key: process.env.FX_PROVIDER_KEY,
        source: from,
        currencies: to,
      },
      timeout: 5000,
    });

    const mid = data.quotes?.[`${from}${to}`];
    if (!mid) throw new Error(`No quote for ${from}/${to}`);

    const rate = mid * (1 - SPREAD_PCT / 2); // apply half-spread on buy side

    await db('fx_rates')
      .insert({ from_currency: from, to_currency: to, rate, fetched_at: new Date() })
      .onConflict(['from_currency', 'to_currency'])
      .merge(['rate', 'fetched_at']);

    await _cacheRate(`fx:${from}:${to}`, rate);
    return rate;
  } catch (err) {
    logger.warn('FX fetch failed, using last known rate', { from, to, error: err.message });
    const fallback = await db('fx_rates').where({ from_currency: from, to_currency: to }).first();
    if (fallback) return parseFloat(fallback.rate);
    throw new Error(`No FX rate available for ${from}/${to}`);
  }
}

/** Return all current rates for the UI ticker / rate table */
async function getAllRates() {
  return db('fx_rates')
    .orderBy('fetched_at', 'desc')
    .select('from_currency', 'to_currency', 'rate', 'fetched_at');
}

async function _cacheRate(key, rate) {
  try {
    await redis.set(key, rate.toString(), 'EX', CACHE_TTL_SECONDS);
  } catch (_) {}
}

/** Cron: refresh all EAC pairs every 30 s and push to on-chain oracle */
function startFxCron() {
  const intervalSec = parseInt(process.env.FX_UPDATE_INTERVAL_SECONDS || '30');
  const cronExpr = `*/${Math.max(1, intervalSec)} * * * * *`;

  cron.schedule(cronExpr, async () => {
    const pairs = [];
    for (const from of EAC_CURRENCIES) {
      for (const to of EAC_CURRENCIES) {
        if (from !== to) pairs.push([from, to]);
      }
    }

    for (const [from, to] of pairs) {
      try {
        const rate = await fetchAndStore(from, to);
        // Optionally push to on-chain oracle (gas cost: evaluate per production use)
        // await pushRateOnChain(from, to, rate);
      } catch (err) {
        logger.debug('FX cron error', { from, to, error: err.message });
      }
    }
  });

  logger.info('FX rate cron started', { intervalSec });
}

module.exports = { getQuote, getRate, getAllRates, fetchAndStore, startFxCron };
