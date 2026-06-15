// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


 @title  CustomerWallet
  @notice Non-custodial smart wallet deployed for every EACPay customer.

 Design
 
 Wallet Events
  Every on-chain movement emits WalletEvent → indexed by Alchemy → webhook
  → inserts row in wallet_events DB table.
 /

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CustomerWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State 
    address public owner;          // customer's EOA
    address public guardian;       // recovery address (optional, set by owner)
    address public settlement;     // EACSettlement contract — trusted caller
    bool    private _initialised;

    // Nonce for meta-transactions / replay protection (future use)
    uint256 public nonce;

    // Events
    event Deposited(address indexed token, uint256 amount, address indexed from);
    event Withdrawn(address indexed token, uint256 amount, address indexed to);
    event NativeDeposited(uint256 amount, address indexed from);
    event NativeWithdrawn(uint256 amount, address indexed to);
    event OwnershipTransferred(address indexed prev, address indexed next);
    event GuardianSet(address indexed guardian);

    //Modifiers 
    modifier onlyOwner() {
        require(msg.sender == owner, "Wallet: not owner");
        _;
    }

    modifier onlyOwnerOrGuardian() {
        require(
            msg.sender == owner || msg.sender == guardian,
            "Wallet: not owner or guardian"
        );
        _;
    }

    //  Initialiser (called once by factory)
    /
      @dev Replaces a constructor in the cloned context.
           Must be called exactly once immediately after clone deployment.
     /
    function initialize(address _owner, address _settlement) external {
        require(!_initialised,       "Wallet: already initialised");
        require(_owner      != address(0), "Wallet: zero owner");
        require(_settlement != address(0), "Wallet: zero settlement");

        _initialised = true;
        owner        = _owner;
        settlement   = _settlement;
    }

    // Receive MATIC
    receive() external payable {
        emit NativeDeposited(msg.value, msg.sender);
    }

    //  ERC-20 deposit (explicit)
    /
     @notice Deposit ERC-20 tokens into this wallet.
     @param token   ERC-20 token contract address (e.g., EACToken / USDC)
      @param amount  Token amount (in token's native decimals)
     /
    function depositToken(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Wallet: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount, msg.sender);
    }

    // ERC-20 withdraw
    /
      @notice Withdraw ERC-20 tokens from this wallet.
      @dev    Only callable by the owner or the EACSettlement contract
              (for automated fee sweeps).
     /
    function withdrawToken(address token, uint256 amount, address to)
        external
        nonReentrant
    {
        require(
            msg.sender == owner || msg.sender == settlement,
            "Wallet: not authorised"
        );
        require(amount > 0,        "Wallet: zero amount");
        require(to != address(0),  "Wallet: zero recipient");

        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, amount, to);
    }

    // ─── Native MATIC withdraw
    function withdrawNative(uint256 amount, address payable to)
        external
        onlyOwner
        nonReentrant
    {
        require(amount > 0,               "Wallet: zero amount");
        require(to != address(0),         "Wallet: zero recipient");
        require(address(this).balance >= amount, "Wallet: insufficient balance");

        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Wallet: transfer failed");
        emit NativeWithdrawn(amount, to);
    }

    // ─── Balance helpers
    function nativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    // ─── Guardian / recovery
    /
     @notice Owner sets a guardian address that can transfer ownership if the
            private key is lost. The guardian cannot withdraw funds, only transfer
            ownership.
     /
    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianSet(_guardian);
    }

    /
     @notice Transfer ownership to a new address.
             In normal use, only the owner calls this.
            A guardian can call it for social recovery.
     /
    function transferOwnership(address newOwner)
        external
        onlyOwnerOrGuardian
    {
        require(newOwner != address(0), "Wallet: zero owner");
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    // Settlement authorisation helper
    
     @notice Returns true if this wallet is the expected signer for a settlement call.
     @dev    Used by EACSettlement.initiatePayment() before accepting a signature.
     /
    function isOwner(address addr) external view returns (bool) {
        return addr == owner;
    }
}
