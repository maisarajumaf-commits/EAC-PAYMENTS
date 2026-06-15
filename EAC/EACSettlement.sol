// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  EACSettlement
 * @notice Core on-chain payment settlement contract for the East African Community
 *         cross-border payment network (EACPay).
 *
 * Architecture
 * ────────────
 * • Banks are granted the BANK_ROLE and call initiatePayment() on behalf of customers.
 * • The sender customer signs an EIP-712 typed payload off-chain; the relayer submits
 *   it along with the bank's call.
 * • A second bank (receiver side) calls confirmPayment() or rejectPayment().
 * • All state changes emit events that Alchemy / The Graph index for webhooks.
 *
 * Security
 * ────────
 * • AccessControl: DEFAULT_ADMIN_ROLE, BANK_ROLE, RELAYER_ROLE
 * • EIP-712 typed data signing prevents replay attacks (chainId + contract address bound)
 * • Pausable for emergency governance
 * • ReentrancyGuard on all state-mutating external calls
 *
 * @dev Deployed on Polygon PoS (amoy testnet → polygon mainnet)
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EACSettlement is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // ─── Roles ──────────────────────────────────────────────────────────────
    bytes32 public constant BANK_ROLE    = keccak256("BANK_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // ─── EIP-712 type hash ──────────────────────────────────────────────────
    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(bytes32 txId,address senderWallet,address receiverWallet,"
        "uint256 sourceAmount,string sourceCurrency,uint256 destAmount,"
        "string destCurrency,uint256 fxRateScaled,uint256 feeAmount,"
        "uint256 deadline)"
    );

    // ─── Payment status (mirrors DB enum tx_status) ──────────────────────────
    enum PaymentStatus { PENDING, INITIATED, CONFIRMED, REJECTED, EXPIRED }

    // ─── Core payment struct ─────────────────────────────────────────────────
    struct Payment {
        bytes32   txId;               // keccak256 of DB UUID reference
        address   senderWallet;       // customer smart wallet (CustomerWallet.sol)
        address   receiverWallet;     // recipient's smart wallet
        address   senderBank;         // bank that initiated (must have BANK_ROLE)
        address   receiverBank;       // bank that will confirm
        uint256   sourceAmount;       // in source currency minor units × 10^4
        string    sourceCurrency;     // "KES" | "TZS" | "UGX" | …
        uint256   destAmount;         // in dest currency minor units × 10^4
        string    destCurrency;
        uint256   fxRateScaled;       // mid-rate × 10^8
        uint256   feeAmount;          // fee in source currency × 10^4
        uint256   deadline;           // UNIX timestamp; tx must be confirmed before
        uint256   initiatedAt;        // block.timestamp of initiation
        uint256   confirmedAt;
        uint256   rejectedAt;
        PaymentStatus status;
        string    rejectionReason;
        bytes     senderSignature;    // EIP-712 signature from sender wallet key
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    mapping(bytes32 => Payment) public payments;        // txId → Payment
    mapping(bytes32 => bool)    private _usedSignatures; // replay guard

    uint256 public totalConfirmed;
    uint256 public totalRejected;
    uint256 public totalVolume;   // sum of destAmount of confirmed payments (scaled)

    // ─── Events ──────────────────────────────────────────────────────────────
    event PaymentInitiated(
        bytes32 indexed txId,
        address indexed senderWallet,
        address indexed receiverWallet,
        string  sourceCurrency,
        uint256 sourceAmount,
        string  destCurrency,
        uint256 destAmount,
        uint256 fxRateScaled,
        uint256 feeAmount,
        uint256 deadline,
        address senderBank
    );

    event PaymentConfirmed(
        bytes32 indexed txId,
        address indexed receiverBank,
        uint256 confirmedAt
    );

    event PaymentRejected(
        bytes32 indexed txId,
        address indexed rejectedBy,
        string  reason,
        uint256 rejectedAt
    );

    event PaymentExpired(
        bytes32 indexed txId,
        uint256 expiredAt
    );

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address admin)
        EIP712("EACSettlement", "1")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    // ─── Admin: manage roles ──────────────────────────────────────────────────
    function addBank(address bank) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(BANK_ROLE, bank);
    }

    function removeBank(address bank) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(BANK_ROLE, bank);
    }

    function addRelayer(address relayer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(RELAYER_ROLE, relayer);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ─── Core: initiate payment ───────────────────────────────────────────────
    /**
     * @notice Called by a bank relayer to record a new cross-border payment.
     * @dev    Verifies the EIP-712 signature from the sender's wallet key.
     *
     * @param txId            Unique identifier (keccak256 of the DB reference string)
     * @param senderWallet    On-chain smart wallet address of the sender
     * @param receiverWallet  On-chain smart wallet address of the receiver
     * @param receiverBank    Expected confirming bank (must have BANK_ROLE)
     * @param sourceAmount    Amount in source currency (× 10^4 for 4 decimal places)
     * @param sourceCurrency  ISO currency string, e.g. "KES"
     * @param destAmount      Amount in destination currency (× 10^4)
     * @param destCurrency    ISO currency string, e.g. "TZS"
     * @param fxRateScaled    FX mid-rate multiplied by 10^8
     * @param feeAmount       Fee in source currency (× 10^4)
     * @param deadline        UNIX timestamp; payment auto-expires after this
     * @param senderSig       EIP-712 signature produced by the sender's wallet key
     */
    function initiatePayment(
        bytes32 txId,
        address senderWallet,
        address receiverWallet,
        address receiverBank,
        uint256 sourceAmount,
        string  calldata sourceCurrency,
        uint256 destAmount,
        string  calldata destCurrency,
        uint256 fxRateScaled,
        uint256 feeAmount,
        uint256 deadline,
        bytes   calldata senderSig
    )
        external
        onlyRole(BANK_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(payments[txId].initiatedAt == 0, "EAC: txId already used");
        require(senderWallet  != address(0),     "EAC: zero sender");
        require(receiverWallet != address(0),    "EAC: zero receiver");
        require(receiverBank  != address(0),     "EAC: zero receiver bank");
        require(sourceAmount  > 0,               "EAC: zero amount");
        require(destAmount    > 0,               "EAC: zero dest amount");
        require(deadline > block.timestamp,      "EAC: expired deadline");

        // ── Verify EIP-712 sender signature ───────────────────────────────
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            txId,
            senderWallet,
            receiverWallet,
            sourceAmount,
            keccak256(bytes(sourceCurrency)),
            destAmount,
            keccak256(bytes(destCurrency)),
            fxRateScaled,
            feeAmount,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(!_usedSignatures[digest],         "EAC: signature replayed");
        address signer = digest.recover(senderSig);
        require(signer == senderWallet,           "EAC: invalid sender signature");
        _usedSignatures[digest] = true;

        // ── Record payment ─────────────────────────────────────────────────
        payments[txId] = Payment({
            txId:             txId,
            senderWallet:     senderWallet,
            receiverWallet:   receiverWallet,
            senderBank:       msg.sender,
            receiverBank:     receiverBank,
            sourceAmount:     sourceAmount,
            sourceCurrency:   sourceCurrency,
            destAmount:       destAmount,
            destCurrency:     destCurrency,
            fxRateScaled:     fxRateScaled,
            feeAmount:        feeAmount,
            deadline:         deadline,
            initiatedAt:      block.timestamp,
            confirmedAt:      0,
            rejectedAt:       0,
            status:           PaymentStatus.INITIATED,
            rejectionReason:  "",
            senderSignature:  senderSig
        });

        emit PaymentInitiated(
            txId, senderWallet, receiverWallet,
            sourceCurrency, sourceAmount,
            destCurrency,   destAmount,
            fxRateScaled,   feeAmount,
            deadline,       msg.sender
        );
    }

    // ─── Core: confirm payment ────────────────────────────────────────────────
    /**
     * @notice Called by the receiving bank to confirm settlement.
     * @param txId The payment identifier.
     */
    function confirmPayment(bytes32 txId)
        external
        onlyRole(BANK_ROLE)
        whenNotPaused
        nonReentrant
    {
        Payment storage p = payments[txId];
        require(p.initiatedAt != 0,                        "EAC: unknown txId");
        require(p.status == PaymentStatus.INITIATED,       "EAC: not in INITIATED state");
        require(msg.sender == p.receiverBank,              "EAC: not the receiver bank");

        if (block.timestamp > p.deadline) {
            p.status    = PaymentStatus.EXPIRED;
            p.rejectedAt = block.timestamp;
            emit PaymentExpired(txId, block.timestamp);
            return;
        }

        p.status      = PaymentStatus.CONFIRMED;
        p.confirmedAt = block.timestamp;

        unchecked {
            totalConfirmed++;
            totalVolume += p.destAmount;
        }

        emit PaymentConfirmed(txId, msg.sender, block.timestamp);
    }

    // ─── Core: reject payment ─────────────────────────────────────────────────
    /**
     * @notice Called by the receiving bank to reject a payment.
     * @param txId   The payment identifier.
     * @param reason Human-readable rejection reason (stored for auditing).
     */
    function rejectPayment(bytes32 txId, string calldata reason)
        external
        onlyRole(BANK_ROLE)
        whenNotPaused
        nonReentrant
    {
        Payment storage p = payments[txId];
        require(p.initiatedAt != 0,                    "EAC: unknown txId");
        require(p.status == PaymentStatus.INITIATED,   "EAC: not in INITIATED state");
        require(
            msg.sender == p.receiverBank || msg.sender == p.senderBank,
            "EAC: not authorised bank"
        );

        p.status           = PaymentStatus.REJECTED;
        p.rejectedAt       = block.timestamp;
        p.rejectionReason  = reason;

        unchecked { totalRejected++; }

        emit PaymentRejected(txId, msg.sender, reason, block.timestamp);
    }

    // ─── Core: expire stale payment (anyone can call after deadline) ──────────
    function expirePayment(bytes32 txId) external nonReentrant {
        Payment storage p = payments[txId];
        require(p.initiatedAt != 0,                  "EAC: unknown txId");
        require(p.status == PaymentStatus.INITIATED, "EAC: already finalised");
        require(block.timestamp > p.deadline,        "EAC: deadline not reached");

        p.status     = PaymentStatus.EXPIRED;
        p.rejectedAt = block.timestamp;

        emit PaymentExpired(txId, block.timestamp);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    function getPayment(bytes32 txId) external view returns (Payment memory) {
        return payments[txId];
    }

    function getPaymentStatus(bytes32 txId) external view returns (PaymentStatus) {
        return payments[txId].status;
    }

    /// @notice Returns the EIP-712 domain separator (useful for off-chain signing)
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns the digest that the sender must sign for a given payment
    function paymentDigest(
        bytes32 txId,
        address senderWallet,
        address receiverWallet,
        uint256 sourceAmount,
        string calldata sourceCurrency,
        uint256 destAmount,
        string calldata destCurrency,
        uint256 fxRateScaled,
        uint256 feeAmount,
        uint256 deadline
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            txId,
            senderWallet,
            receiverWallet,
            sourceAmount,
            keccak256(bytes(sourceCurrency)),
            destAmount,
            keccak256(bytes(destCurrency)),
            fxRateScaled,
            feeAmount,
            deadline
        ));
        return _hashTypedDataV4(structHash);
    }
}
