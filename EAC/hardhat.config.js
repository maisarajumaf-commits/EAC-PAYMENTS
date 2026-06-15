require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    polygon: {
      url: process.env.RPC_URL || "https://polygon-rpc.com",
      chainId: 137,
      accounts: process.env.RELAYER_PRIVATE_KEY
        ? [process.env.RELAYER_PRIVATE_KEY]
        : [],
    },
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      chainId: 80001,
      accounts: process.env.RELAYER_PRIVATE_KEY
        ? [process.env.RELAYER_PRIVATE_KEY]
        : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
