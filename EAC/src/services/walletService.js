// src/services/walletService.js
const { ethers } = require('ethers');
const { db } = require('../config/database');
const { getWalletFactoryContract, getRelayerWallet } = require('../config/blockchain');
const { auditLogger, logger } = require('../config/logger');

/**
 * Save a client-generated, client-encrypted wallet to the DB.
 * The private key is encrypted on the CLIENT (browser) using PBKDF2 + AES-256-GCM
 * before being sent here – we store only the ciphertext + IV + auth_tag + salt.
 * We NEVER receive the plaintext key.
 */
async function createWallet(userId, { address, encrypted_key_store, iv, auth_tag, salt }) {
  const existing = await db('wallets').where({ user_id: userId, is_primary: true }).first();
  if (existing) {
    const err = new Error('User already has a primary wallet');
    err.status = 409;
    throw err;
  }

  // Verify the address is a valid EVM address
  if (!ethers.isAddress(address)) {
    const err = new Error('Invalid EVM address');
    err.status = 400;
    throw err;
  }

  const [wallet] = await db('wallets')
    .insert({ user_id: userId, address, encrypted_key_store, iv, auth_tag, salt, is_primary: true })
    .returning(['id', 'address', 'is_primary', 'created_at']);

  auditLogger.info('wallet.created', { userId, address });
  return wallet;
}

async function getUserWallets(userId) {
  return db('wallets')
    .where({ user_id: userId })
    .select('id', 'address', 'is_primary', 'created_at');
}

/** Return on-chain balance (native token + stablecoins) */
async function getBalance(address) {
  try {
    const { getProvider } = require('../config/blockchain');
    const provider = getProvider();
    const balanceWei = await provider.getBalance(address);
    return {
      address,
      native: ethers.formatEther(balanceWei),
      // TODO: query ERC-20 token balances (USDC, cKES, cTZS …)
    };
  } catch (err) {
    logger.warn('Balance fetch failed', { address, error: err.message });
    return { address, native: '0' };
  }
}

module.exports = { createWallet, getUserWallets, getBalance };
