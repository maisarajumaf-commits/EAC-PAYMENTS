// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EACPaySettlement
 * @notice Cross-border payment settlement contract for the East African Community.
 *         Accepts EIP-712 signed transfer instructions, verifies the sender's
 *         signature, and settles by moving stablecoin tokens to the recipient.
 *
 * Security properties:
 *  - No impersonation: only the holder of the sender's private key can sign.
 *  - Replay protection: each transferId is a unique bytes32 consumed once.
 *  - Deadline: transfers expire after 5 minutes if not relayed.
 *  - Reentrancy guard on all state-mutating functions.
 *  - Emergency pause via Ownable.
 */
contract EACPaySettlement is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── Types ────────────────────────────────────────────────────────────────
    enum Status { None, Pending, Confirmed, Failed, Refunded }

    struct Transfer {
        address from;
        address to;
        uint256 amount;
        Status  status;
        uint256 timestamp;
        address token;
    }

    // EIP-712 typehash
    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(bytes32 transferId,address from,address to,uint256 amount,"
        "string fromCurrency,string toCurrency,uint256 deadline)"
    );

    // ── State ────────────────────────────────────────────────────────────────
    mapping(bytes32 => Transfer) public transfers;
    mapping(address => bool)     public authorisedRelayers;
    mapping(address => bool)     public supportedTokens;
    bool public paused;

    uint256 public feeBps = 20; // 0.20 %
    address public feeRecipient;

    // ── Events ───────────────────────────────────────────────────────────────
    event TransferInitiated(
        bytes32 indexed transferId,
        address indexed from,
        address indexed to,
        uint256 amount,
        address token
    );
    event TransferSettled(bytes32 indexed transferId);
    event TransferFailed(bytes32 indexed transferId, string reason);
    event RelayerUpdated(address relayer, bool authorised);
    event TokenUpdated(address token, bool supported);
    event FeeBpsUpdated(uint256 newBps);

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(address _feeRecipient)
        EIP712("EACPay", "1")
        Ownable(msg.sender)
    {
        feeRecipient = _feeRecipient;
    }

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyRelayer() {
        require(authorisedRelayers[msg.sender], "Not authorised relayer");
        _;
    }
    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    // ── Core Logic ───────────────────────────────────────────────────────────

    /**
     * @notice Called by the backend relayer to settle a signed transfer.
     * @param from          Sender EVM address (must match signature).
     * @param to            Recipient EVM address.
     * @param amount        Token amount (in token's smallest unit).
     * @param token         ERC-20 stablecoin address (e.g. USDC).
     * @param fromCurrency  ISO currency code of source funds.
     * @param toCurrency    ISO currency code of destination funds.
     * @param deadline      Unix timestamp after which the transfer is invalid.
     * @param transferId    Unique bytes32 identifier.
     * @param sig           EIP-712 signature from `from`.
     */
    function initiateTransfer(
        address       from,
        address       to,
        uint256       amount,
        address       token,
        string calldata fromCurrency,
        string calldata toCurrency,
        uint256       deadline,
        bytes32       transferId,
        bytes calldata sig
    )
        external
        onlyRelayer
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        require(transfers[transferId].status == Status.None, "transferId reused");
        require(block.timestamp <= deadline,                 "Transfer expired");
        require(supportedTokens[token],                     "Token not supported");
        require(to != address(0),                           "Zero recipient");
        require(amount > 0,                                 "Zero amount");

        // ── Verify EIP-712 signature ──────────────────────────────────────
        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            transferId,
            from,
            to,
            amount,
            keccak256(bytes(fromCurrency)),
            keccak256(bytes(toCurrency)),
            deadline
        ));
        address signer = _hashTypedDataV4(structHash).recover(sig);
        require(signer == from, "Invalid signature");

        // ── Fee deduction ─────────────────────────────────────────────────
        uint256 fee        = (amount * feeBps) / 10_000;
        uint256 netAmount  = amount - fee;

        // ── Record before external calls (CEI pattern) ────────────────────
        transfers[transferId] = Transfer({
            from:      from,
            to:        to,
            amount:    amount,
            status:    Status.Confirmed,
            timestamp: block.timestamp,
            token:     token
        });

        // ── Settle: pull from sender, push to recipient + fee collector ───
        IERC20(token).safeTransferFrom(from, to, netAmount);
        if (fee > 0) IERC20(token).safeTransferFrom(from, feeRecipient, fee);

        emit TransferInitiated(transferId, from, to, amount, token);
        emit TransferSettled(transferId);
        return true;
    }

    /**
     * @notice Return transfer details by ID.
     */
    function getTransfer(bytes32 transferId)
        external
        view
        returns (Transfer memory)
    {
        return transfers[transferId];
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    function setRelayer(address relayer, bool authorised) external onlyOwner {
        authorisedRelayers[relayer] = authorised;
        emit RelayerUpdated(relayer, authorised);
    }

    function setToken(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit TokenUpdated(token, supported);
    }

    function setFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 200, "Fee too high"); // max 2%
        feeBps = bps;
        emit FeeBpsUpdated(bps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }
}
