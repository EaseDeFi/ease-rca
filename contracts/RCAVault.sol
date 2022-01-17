pragma solidity ^0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IRCAController } from "./interfaces/IRCAController.sol";
import { INXMMaster, IClaimProof } from "./external/NexusMutual.sol";

abstract contract RCAVault is ERC20 {
    using SafeERC20 for IERC20;

    event APRChanged(uint256 apr);

    event ControllerChanged(address indexed controller);

    event TreasuryChanged(address indexed treasury); 

    event SaleUpdated(uint256 indexed updateAt, uint256 amount);

    struct RedeemRequest{
        uint64 released;
        uint192 amount;
    }

    uint256 public constant DENOMINATOR = 1e8;

    uint256 public apr;

    INXMMaster public nxmMaster;

    IRCAController public controller;

    IERC20 public uToken;

    bytes32 public tokenKey;

    uint256[] public protocolsCovered;

    address payable public treasury;

    address public owner;

    uint256 public purchasePremium;

    uint256 public amtForSale;

    uint256 public lastUpdate;

    uint256 public pendingRedeem;

    mapping(address => RedeemRequest) public redeemRequest;

    modifier update() {
        _update(msg.sender);
        // update amtForSale
        amtForSale += (uToken.balanceOf(address(this)) - amtForSale) * apr *(block.timestamp - lastUpdate) / DENOMINATOR;
        // update lastUpdate;
        lastUpdate = block.timestamp;
        _;
    }

    modifier whenNotPaused() {
        require(!controller.paused(), "paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "!owner");
        _;
    }

    constructor(
        INXMMaster _nxmMaster,
        IRCAController _controller,
        IERC20 _uToken,
        bytes32 _tokenKey,
        uint256[] memory _covered,
        address payable _treasury,
        address _owner
    ) {
        apr = DENOMINATOR / 1000; // 0.1% for now
        nxmMaster = _nxmMaster;
        controller = _controller;
        uToken = _uToken;
        tokenKey = _tokenKey;
        protocolsCovered = _covered;
        treasury = _treasury;
        owner = _owner;
        purchasePremium = DENOMINATOR / 100; // 1% for now
    }

    function changeAPR(uint256 _apr) external onlyOwner {
        apr = _apr;
        emit APRChanged(_apr);
    }

    function changeController(IRCAController _controller) external onlyOwner {
        controller = _controller;
        emit ControllerChanged(address(_controller));
    }

    function changeTreasury(address payable _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function changeProtocolsCovered(uint256[] calldata _covered) external onlyOwner {
        protocolsCovered = _covered;
    }

    function sendProofOfLoss(uint256 _coverId, string calldata _ipfsHash) external onlyOwner {
        IClaimProof(nxmMaster.getLatestAddress("CP")).addProof(_coverId, _ipfsHash);
    }

    function updateSale(bytes32[] calldata _proof, bytes32 _amount) external {
        amtForSale = controller.pullAmountForSale(_proof, _amount);
        emit SaleUpdated(controller.lastSaleUpdate(), amtForSale);
    }

    function rcaValue(uint256 _uAmount) public view returns(uint256) {
        return totalSupply() * _uAmount / (_ubalance() - amtForSale - pendingRedeem);
    }

    function uValue(uint256 _rcaAmount) public view returns(uint256) {
        return (_ubalance() - amtForSale - pendingRedeem) * _rcaAmount / totalSupply();
    }

    function getAmountForSale() external view returns(uint256) {
        // TODO
        return amtForSale;
    }

    function mint(uint256 _uAmount, bytes32[] calldata _capacityProof, bytes32 _capacity) external update whenNotPaused {
        uToken.safeTransferFrom(msg.sender, address(this), _uAmount);
        uint256 capacity = controller.getCapacityAvailable(address(this), _capacityProof, _capacity);
        require(_ubalance() - amtForSale - pendingRedeem < capacity, "exceeds capacity");
        _mint(msg.sender, rcaValue(_uAmount));
        _afterMint(_uAmount);
    }

    function redeem(uint256 _rcaAmount) external whenNotPaused {
        RedeemRequest memory request = redeemRequest[msg.sender];
        request.amount += uint192(uValue(_rcaAmount));
        request.released = uint64(block.timestamp + controller.withdrawalDelay());
        _burn(msg.sender, uint256(request.amount));
        pendingRedeem += _rcaAmount;
        redeemRequest[msg.sender] = request;
        _afterRedeem(_rcaAmount);
    }

    function claim() external whenNotPaused{
        RedeemRequest memory request = redeemRequest[msg.sender];
        require(block.timestamp > request.released, "!released");
        pendingRedeem -= request.amount;
        uToken.safeTransfer(msg.sender, request.amount);
        delete redeemRequest[msg.sender];
    }

    function purchase(
        uint256 _uAmount,
        bytes32[] calldata _tokenProof,
        bytes calldata _value
    ) external payable whenNotPaused {
        uint256 price = controller.getPrice(tokenKey, _tokenProof, _value);
        uint256 adjusted = price + price * purchasePremium / DENOMINATOR;
        uint256 payment = _uAmount * adjusted / 1e18;
        require(msg.value >= payment, "low value");
        payable(msg.sender).transfer(msg.value - payment);
        treasury.transfer(payment);
    }

    function getReward(IERC20[] memory _tokens) public virtual;

    function _ubalance() internal virtual view returns(uint256);

    function _update(address _user) internal virtual;

    function _afterMint(uint256 _uAmount) internal virtual;

    function _afterRedeem(uint256 _rcaAmount) internal virtual;
}
