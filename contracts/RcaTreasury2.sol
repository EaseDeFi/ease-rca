pragma solidity 0.8.10;

contract RcaTreasury is RcaOwnable {

    // Amount of claims available for individual addresses (in Ether).
    // ID of hack => amount claimable.
    mapping(uint256 => bytes32) public claimsRoots;
    // address => id of hack => claimed.
    mapping( address => mapping(uint256 => bool) ) public claimed;

    event Claim(address indexed user, uint256 indexed hackId, uint256 indexed etherAmount);

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// fallback //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @dev Just here to accept Ether.
     */
    fallback() payable {}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// external //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Users claim directly from here for loss in any vault.
     * @param _user Address of the user to claim for.
     * @param _loss The amount of loss (in Ether) that the protocol is paying.
     * @param _hackId ID given to the hack that resulted in this loss.
     * @param _claimsProof Merkle proof to verify this user's claim.
     */
    function claimFor(
        address   _user,
        uint256   _loss,
        uint256   _hackId,
        bytes32[] _claimsProof 
    )
      external
    {
        require(!claimed[_user][_hackId], "Loss has already been claimed.");
        MerkleProof.verifyClaim(_user, _hackId, _loss, _claimsProof);
        claimed[_user][_hackId] = true;
        _user.transfer(_loss);
        emit Claim(_user, _hackId, _loss);
    }

    // capacity available function
    function verifyClaim(
        address   _user,
        uint256   _hackId,
        uint256   _amount
        bytes32[] _claimProof
    )
      public
      view
    returns(
        bool
    )
    {
        bytes32 leaf = bytes32(abi.encodePacked(_user, _hackId, _amount));
        require(MerkleProof.verify(claimsRoots[_hackId], _proof, leaf), "Incorrect capacity proof.");
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////// onlyGov //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Governance may withdraw any amount to any address.
     * @param _to Address to send funds to.
     * @param _amount Amount of funds (in Ether) to send.
     */
    function withdraw(
        address _to,
        uint256 _amount
    )
      external
      onlyGov
    {
        _to.transfer(_amount);
    }

}