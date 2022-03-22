/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";

contract RcaShield is RcaShieldBase {
    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        uint256 _uTokenDecimals,
        address _governor,
        address _controller
    ) RcaShieldBase(_name, _symbol, _uToken, _uTokenDecimals, _governor, _controller) {}

    function _uBalance() internal view override returns (uint256) {
        return (uToken.balanceOf(address(this)) * BUFFER) / BUFFER_UTOKEN;
    }

    function _afterMint(uint256) internal override {
        // no-op
    }

    function _afterRedeem(uint256) internal override {
        // no-op
    }
}
