// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  EACToken  (EAC-USD)
 * @notice Optional regional USD-pegged stablecoin used as the on-chain settlement
 *         intermediary for EACPay cross-border payments.
 *
 * Token Properties
 * ────────────────
 * • Symbol:   EAC-USD
 * • Decimals: 6  (matches USDC for easy liquidity pairing)
 * • Supply:   Mintable only by Treasury multisig; no hard cap (managed off-chain)
 * • Pausing:  Controlled by DEFAULT_ADMIN_ROLE for emergency governance
 *
 * Access Control
 * ──────────────
 * • DEFAULT_ADMIN_ROLE  → can grant/revoke all roles, pause/unpause
 * • MINTER_ROLE         → can mint new tokens (Treasury multisig)
 * • BURNER_ROLE         → can burn tokens (Settlement contract during fee sweeps)
 * • PAUSER_ROLE         → can emergency-pause transfers
 *
 * Integration
 * ───────────
 * Banks can fund the settlement pool by minting against fiat reserves.
 * CustomerWallet.sol holds EAC-USD balances; EACSettlement debits/credits them.
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract EACToken is ERC20, ERC20Burnable, ERC20Pausable, AccessControl {

    // ─── Roles ──────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ─── Compliance: blocked addresses (regulatory freeze) ───────────────────
    mapping(address => bool) public isBlocked;

    // ─── Events ──────────────────────────────────────────────────────────────
    event AddressBlocked(address indexed account, address indexed by);
    event AddressUnblocked(address indexed account, address indexed by);

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address admin)
        ERC20("EAC USD", "EAC-USD")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ─── Decimals override ────────────────────────────────────────────────────
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────
    /**
     * @notice Mint new EAC-USD tokens to an address.
     * @dev    Called by the Treasury multisig when fiat reserves increase.
     *
     * @param to     Recipient address (usually a bank's settlement pool wallet)
     * @param amount Amount in micro-dollars (6 decimals); 1 USD = 1_000_000
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(!isBlocked[to], "EACToken: recipient blocked");
        _mint(to, amount);
    }

    // ─── Burn (accessible by BURNER_ROLE without holding tokens) ─────────────
    /**
     * @notice Burn tokens from a specified address.
     * @dev    The Settlement contract may burn fee amounts after sweeping.
     */
    function burnFrom(address account, uint256 amount)
        public
        override(ERC20Burnable)
    {
        if (hasRole(BURNER_ROLE, msg.sender)) {
            // BURNER_ROLE bypasses allowance check (for automated settlement sweeps)
            _burn(account, amount);
        } else {
            super.burnFrom(account, amount);
        }
    }

    // ─── Pause ────────────────────────────────────────────────────────────────
    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ─── Compliance: block/unblock ────────────────────────────────────────────
    /**
     * @notice Block an address from sending or receiving EAC-USD.
     *         Implements regulatory freeze requirements for the EAC banking network.
     */
    function blockAddress(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isBlocked[account] = true;
        emit AddressBlocked(account, msg.sender);
    }

    function unblockAddress(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isBlocked[account] = false;
        emit AddressUnblocked(account, msg.sender);
    }

    // ─── Transfer hooks (compliance + pause) ─────────────────────────────────
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        // Compliance checks (skip for minting — from == address(0))
        if (from != address(0)) {
            require(!isBlocked[from], "EACToken: sender blocked");
        }
        if (to != address(0)) {
            require(!isBlocked[to], "EACToken: recipient blocked");
        }

        super._update(from, to, value);
    }

    // ─── IERC165 override (required by AccessControl + ERC20) ────────────────
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
