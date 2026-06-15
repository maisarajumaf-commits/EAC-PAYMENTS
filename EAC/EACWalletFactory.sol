// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  EACWalletFactory
 * @notice Deploys a lightweight ERC-1167 minimal-proxy (clone) smart wallet
 *         for every EACPay customer that completes KYC.
 *
 * Flow
 * ────
 * 1. Admin deploys CustomerWallet implementation once.
 * 2. Admin sets this contract as the factory.
 * 3. When a customer's KYC is approved in the backend, the relayer calls
 *    createWallet(customerAddress) → a clone is deployed and initialised.
 * 4. The new wallet address is saved to the customers.wallet_address DB column
 *    and emitted in WalletCreated for webhook ingestion.
 *
 * @dev Uses OpenZeppelin Clones (ERC-1167) for gas-efficient deployment.
 *      Each clone's storage is independent; the implementation is stateless.
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface ICustomerWallet {
    function initialize(address owner, address settlement) external;
}

contract EACWalletFactory is AccessControl, Pausable {
    using Clones for address;

    // ─── Roles ──────────────────────────────────────────────────────────────
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // ─── State ───────────────────────────────────────────────────────────────
    address public immutable walletImplementation;   // CustomerWallet logic contract
    address public           settlementContract;     // EACSettlement address

    mapping(address => address)  public walletOf;    // customerEOA → cloneAddress
    mapping(address => address)  public ownerOf;     // cloneAddress → customerEOA
    address[]                    public allWallets;

    // ─── Events ──────────────────────────────────────────────────────────────
    event WalletCreated(
        address indexed customer,
        address indexed wallet,
        uint256 deployedAt
    );

    event SettlementUpdated(address indexed newSettlement);

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address admin, address _walletImpl, address _settlement) {
        require(_walletImpl  != address(0), "Factory: zero impl");
        require(_settlement  != address(0), "Factory: zero settlement");

        walletImplementation = _walletImpl;
        settlementContract   = _settlement;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function setSettlement(address _settlement)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_settlement != address(0), "Factory: zero settlement");
        settlementContract = _settlement;
        emit SettlementUpdated(_settlement);
    }

    function addRelayer(address r) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(RELAYER_ROLE, r);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ─── Core: deploy wallet ──────────────────────────────────────────────────
    /**
     * @notice Deploys and initialises a new CustomerWallet clone for `customer`.
     * @dev    Callable only by a RELAYER_ROLE address (bank relayer backend).
     *
     * @param customer  The customer's EOA address (derived from their mnemonic seed).
     * @return wallet   The address of the newly deployed clone.
     */
    function createWallet(address customer)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        returns (address wallet)
    {
        require(customer != address(0),       "Factory: zero customer");
        require(walletOf[customer] == address(0), "Factory: wallet exists");

        // Deploy ERC-1167 clone
        wallet = walletImplementation.clone();

        // Initialise the clone with its owner and the settlement contract
        ICustomerWallet(wallet).initialize(customer, settlementContract);

        // Update registry
        walletOf[customer] = wallet;
        ownerOf[wallet]    = customer;
        allWallets.push(wallet);

        emit WalletCreated(customer, wallet, block.timestamp);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }

    function walletExists(address customer) external view returns (bool) {
        return walletOf[customer] != address(0);
    }
}
