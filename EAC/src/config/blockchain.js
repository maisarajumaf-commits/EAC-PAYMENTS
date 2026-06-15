// src/config/blockchain.js
const { ethers } = require('ethers');
const { logger } = require('./logger');

let provider;
let relayerWallet;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL, {
      chainId: parseInt(process.env.CHAIN_ID || '137'),
      name: 'eac-chain',
    });
  }
  return provider;
}

/**
 * In production the relayer private key lives in AWS KMS / HashiCorp Vault.
 * Here we accept it from the environment (injected by Secrets Manager at
 * runtime – never committed to source control).
 */
function getRelayerWallet() {
  if (!relayerWallet) {
    if (!process.env.RELAYER_PRIVATE_KEY) {
      throw new Error('RELAYER_PRIVATE_KEY not set');
    }
    relayerWallet = new ethers.Wallet(
      process.env.RELAYER_PRIVATE_KEY,
      getProvider()
    );
  }
  return relayerWallet;
}

// Minimal ABI slices – full ABIs live in contracts/abi/
const SETTLEMENT_ABI = [
  'function initiateTransfer(address from, address to, uint256 amount, bytes32 transferId, bytes calldata sig) external returns (bool)',
  'function getTransfer(bytes32 transferId) external view returns (tuple(address from, address to, uint256 amount, uint8 status, uint256 timestamp))',
  'event TransferInitiated(bytes32 indexed transferId, address indexed from, address indexed to, uint256 amount)',
  'event TransferSettled(bytes32 indexed transferId)',
  'event TransferFailed(bytes32 indexed transferId, string reason)',
];

const FX_ORACLE_ABI = [
  'function getRate(string calldata fromCurrency, string calldata toCurrency) external view returns (uint256 rate, uint256 updatedAt)',
  'function updateRate(string calldata fromCurrency, string calldata toCurrency, uint256 rate) external',
  'event RateUpdated(string indexed pair, uint256 rate, uint256 timestamp)',
];

const WALLET_FACTORY_ABI = [
  'function createWallet(address owner, bytes32 salt) external returns (address wallet)',
  'function getWallet(address owner) external view returns (address)',
  'event WalletCreated(address indexed owner, address wallet)',
];

function getSettlementContract(signerOrProvider) {
  return new ethers.Contract(
    process.env.SETTLEMENT_CONTRACT,
    SETTLEMENT_ABI,
    signerOrProvider || getProvider()
  );
}

function getFxOracleContract(signerOrProvider) {
  return new ethers.Contract(
    process.env.FX_ORACLE_CONTRACT,
    FX_ORACLE_ABI,
    signerOrProvider || getProvider()
  );
}

function getWalletFactoryContract(signerOrProvider) {
  return new ethers.Contract(
    process.env.WALLET_FACTORY_CONTRACT,
    WALLET_FACTORY_ABI,
    signerOrProvider || getProvider()
  );
}

async function checkConnection() {
  try {
    const network = await getProvider().getNetwork();
    logger.info('Blockchain connected', {
      chainId: network.chainId.toString(),
      name: network.name,
    });
  } catch (err) {
    logger.warn('Blockchain RPC unavailable', { error: err.message });
  }
}

module.exports = {
  getProvider,
  getRelayerWallet,
  getSettlementContract,
  getFxOracleContract,
  getWalletFactoryContract,
  checkConnection,
};
