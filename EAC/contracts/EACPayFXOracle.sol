// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EACPayFXOracle
 * @notice On-chain FX rate registry, updated by the backend relayer every 30 s.
 *         Rates are stored as 8-decimal fixed-point integers
 *         (e.g. 1 KES = 0.00769 USD → rate = 769000 for 8dp).
 */
contract EACPayFXOracle is Ownable {

    struct Rate {
        uint256 rate;       // 8 decimal places
        uint256 updatedAt;
    }

    // pair hash → rate
    mapping(bytes32 => Rate) private _rates;
    mapping(address => bool) public authorisedUpdaters;

    uint256 public constant STALENESS_THRESHOLD = 120; // 2 minutes

    event RateUpdated(string indexed pair, uint256 rate, uint256 timestamp);
    event UpdaterChanged(address updater, bool authorised);

    constructor() Ownable(msg.sender) {}

    modifier onlyUpdater() {
        require(authorisedUpdaters[msg.sender] || msg.sender == owner(), "Not authorised");
        _;
    }

    function updateRate(string calldata from, string calldata to, uint256 rate)
        external
        onlyUpdater
    {
        require(rate > 0, "Zero rate");
        bytes32 key = _key(from, to);
        _rates[key] = Rate({ rate: rate, updatedAt: block.timestamp });
        emit RateUpdated(string.concat(from, "/", to), rate, block.timestamp);
    }

    function getRate(string calldata from, string calldata to)
        external
        view
        returns (uint256 rate, uint256 updatedAt)
    {
        Rate storage r = _rates[_key(from, to)];
        require(r.rate > 0, "Rate not available");
        require(
            block.timestamp - r.updatedAt <= STALENESS_THRESHOLD,
            "Rate stale"
        );
        return (r.rate, r.updatedAt);
    }

    function setUpdater(address updater, bool authorised) external onlyOwner {
        authorisedUpdaters[updater] = authorised;
        emit UpdaterChanged(updater, authorised);
    }

    function _key(string calldata a, string calldata b) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, "/", b));
    }
}
