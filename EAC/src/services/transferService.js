// src/services/transferService.js
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { getSettlementContract, getRelayerWallet, getProvider } = require('../config/blockchain');
const { getQuote } = require('./fxService');
const { auditLogger, logger } = require('../config/logger');

/**
 * EIP-712 domain for structured data signing.
 * Must match exactly what the frontend sends to MetaMask / WalletConnect.
 */
const EIP712_DOMAIN = {
  name: 'EACPay',
  version: '1',
  chainId: parseInt(process.env.CHAIN_ID || '137'),
  verifyingContract: process.env.SETTLEMENT_CONTRACT,
};

const TRANSFER_TYPE = {
  Transfer: [
    { name: 'transferId', type: 'bytes32' },
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fromCurrency', type: 'string' },
    { name: 'toCurrency', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Initiate a cross-border transfer.
 * 1. Validate EIP-712 signature (sender can't be impersonated).
 * 2. Fetch FX quote.
 * 3. Insert transfer record (status=created).
 * 4. Broadcast via relayer to on-chain settlement contract.
 */
async function initiateTransfer(senderId, {
  recipient_address,
  recipient_phone,
  from_currency,
  to_currency,
  send_amount,
  eip712_signature,
  memo,
}, clientIp) {
  // ── 1. Look up sender's wallet ────────────────────────────────────────────
  const senderWallet = await db('wallets')
    .where({ user_id: senderId, is_primary: true })
    .first();

  if (!senderWallet) {
    const err = new Error('No wallet found for sender. Create a wallet first.');
    err.status = 400;
    throw err;
  }

  // ── 2. Get FX quote ───────────────────────────────────────────────────────
  const quote = await getQuote({ from_currency, to_currency, amount: send_amount });

  // ── 3. Generate on-chain transfer ID (bytes32) ────────────────────────────
  const transferId = ethers.id(uuidv4()); // deterministic bytes32 from UUID

  // ── 4. Verify EIP-712 signature ───────────────────────────────────────────
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min window
  const amountWei = ethers.parseUnits(send_amount.toString(), 6); // USDC 6 decimals

  const recovered = ethers.verifyTypedData(
    EIP712_DOMAIN,
    TRANSFER_TYPE,
    {
      transferId,
      from: senderWallet.address,
      to: recipient_address,
      amount: amountWei,
      fromCurrency: from_currency,
      toCurrency: to_currency,
      deadline,
    },
    eip712_signature
  );

  if (recovered.toLowerCase() !== senderWallet.address.toLowerCase()) {
    const err = new Error('EIP-712 signature verification failed');
    err.status = 400;
    throw err;
  }

  // ── 5. Persist transfer ───────────────────────────────────────────────────
  const [transfer] = await db('transfers')
    .insert({
      transfer_id: transferId,
      sender_id: senderId,
      recipient_address,
      recipient_phone,
      from_currency,
      to_currency,
      send_amount,
      receive_amount: quote.receive_amount,
      fee_amount: quote.fee_amount,
      fx_rate: quote.fx_rate,
      status: 'signing',
      metadata: JSON.stringify({ memo, ip: clientIp }),
    })
    .returning('*');

  auditLogger.info('transfer.initiated', {
    transferId,
    senderId,
    from_currency,
    to_currency,
    send_amount,
    ip: clientIp,
  });

  // ── 6. Broadcast on-chain (async – non-blocking) ──────────────────────────
  _broadcastTransfer(transfer, amountWei, eip712_signature).catch((err) =>
    logger.error('Broadcast error', { transferId, error: err.message })
  );

  return {
    id: transfer.id,
    transfer_id: transferId,
    status: 'broadcasting',
    quote,
  };
}

async function _broadcastTransfer(transfer, amountWei, sig) {
  const relayer = getRelayerWallet();
  const contract = getSettlementContract(relayer);

  await db('transfers').where({ id: transfer.id }).update({ status: 'broadcasting' });

  try {
    const tx = await contract.initiateTransfer(
      transfer.sender_wallet_address || transfer.recipient_address, // from
      transfer.recipient_address,
      amountWei,
      transfer.transfer_id,
      sig
    );

    await db('transfers').where({ id: transfer.id }).update({
      status: 'pending_chain',
      tx_hash: tx.hash,
    });

    logger.info('Transfer broadcast', { transferId: transfer.transfer_id, txHash: tx.hash });

    // Wait for confirmation
    const receipt = await tx.wait(1);
    await db('transfers').where({ id: transfer.id }).update({
      status: 'confirmed',
      block_number: receipt.blockNumber,
      confirmations: 1,
    });

    auditLogger.info('transfer.confirmed', {
      transferId: transfer.transfer_id,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err) {
    await db('transfers').where({ id: transfer.id }).update({
      status: 'failed',
      failure_reason: err.message.slice(0, 499),
    });
    throw err;
  }
}

async function getTransferById(transferId, userId) {
  const row = await db('transfers')
    .where({ id: transferId, sender_id: userId })
    .first();

  if (!row) {
    const err = new Error('Transfer not found');
    err.status = 404;
    throw err;
  }
  return row;
}

async function getTransferHistory(userId, { page = 1, limit = 20, status } = {}) {
  const query = db('transfers')
    .where({ sender_id: userId })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  if (status) query.where({ status });

  const [transfers, [{ count }]] = await Promise.all([
    query,
    db('transfers').where({ sender_id: userId }).count('id'),
  ]);

  return {
    data: transfers,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(count / limit),
    },
  };
}

module.exports = { initiateTransfer, getTransferById, getTransferHistory };
