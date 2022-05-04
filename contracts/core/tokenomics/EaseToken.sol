/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "../../external/SolmateERC20.sol";

contract EaseToken is SolmateERC20 {
    address public immutable minter;

    constructor(address _minter) SolmateERC20("Ease Token", "EASE", 18) {
        minter = _minter;
    }

    function mint(address _user, uint256 _amount) external {
        require(msg.sender == minter, "only minter");
        _mint(_user, _amount);
    }
}
