/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../interfaces/tokenomics/IEaseToken.sol";

contract TokenSwap {
    IEaseToken private immutable easeToken;
    IERC20 private immutable armorToken;

    constructor(address _easeToken, address _armorToken) {
        easeToken = IEaseToken(_easeToken);
        armorToken = IERC20(_armorToken);
    }

    function swap(uint256 amount) external {
        easeToken.mint(msg.sender, amount);
        armorToken.transferFrom(msg.sender, address(0xdEaD), amount);
    }
}
