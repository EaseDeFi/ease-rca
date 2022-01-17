pragma solidity ^0.8.11;

import "@umb-network/toolbox/dist/contracts/IChain.sol";
import "@umb-network/toolbox/dist/contracts/IRegistry.sol";
import "@umb-network/toolbox/dist/contracts/lib/ValueDecoder.sol";

import { IRCAController } from "./interfaces/IRCAController.sol";
import { MerkleProof } from "./library/MerkleProof.sol";

contract RCAController is IRCAController {
    using ValueDecoder for bytes;

    address public oracle;

    address public governance;

    address public guardian;

    bool public override paused;

    /*-Umbrella network start-*/
    IRegistry public immutable umbrellaRegistry;
    
    bytes32 public ethUmbrellaKey;
    /*-Umbrella network end-*/

    bytes32 public capacityAvailable;

    uint256 public override lastSaleUpdate;

    mapping(uint256 => bytes32) public amountsForSale;

    mapping(uint256 => mapping(address => bool)) public forSaleUpdated;

    uint256 public override premium;

    uint256 public override withdrawalDelay;

    mapping(address => uint256) public ids;

    address[] public vaults;

    modifier onlyGuardian() {
        require(msg.sender == guardian, "!guardian");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "!oracle");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    constructor(IRegistry _registry, bytes32 _ethUmbrellaKey){
        umbrellaRegistry = _registry;
        ethUmbrellaKey = _ethUmbrellaKey;
    }

    function addVault(address _vault) external override onlyGuardian {
        vaults.push(_vault);
        ids[_vault] = vaults.length - 1;
        emit VaultAdded(vaults.length - 1, _vault);
    }

    function pauseVaults() external override onlyGuardian {
        paused = true;
        emit Paused();
    }

    function unpauseVaults() external override onlyGuardian {
        paused = false;
        emit Unpaused();
    }

    function setAvailable(bytes32 _root) external override onlyOracle {
        capacityAvailable = _root;
        emit CapacityUpdated();
    }

    function setPremium(uint256 _premium) external override onlyGovernance {
        premium = _premium;
        emit PremiumUpdated(_premium);
    }

    function setWithdrawDelay(uint256 _withdrawDelay) external override onlyGovernance {
        withdrawalDelay = _withdrawDelay;
        emit DelayUpdated(_withdrawDelay);
    }

    function addForSale(bytes32 _forSale) external override onlyGovernance {
        amountsForSale[block.timestamp] = _forSale;
        lastSaleUpdate = block.timestamp;
        emit AddForSale(block.timestamp);
    }

    function _chain() internal view returns (IChain umbChain) {
        umbChain = IChain(umbrellaRegistry.getAddress("Chain"));
    }

    function getId(address _vault) public view override returns(uint256 id) {
        id = ids[_vault];
        require(vaults[id] == _vault, "!vault");
    }

    function getPrice(
        bytes32 _tokenKey,
        bytes32[] calldata _tokenProof,
        bytes calldata _value
    ) public view override returns(uint256) {
        IChain chain = _chain();
        uint32 lastBlockId = chain.getLatestBlockId();

        bool success = chain.verifyProofForBlock(
            uint256(lastBlockId),
            _tokenProof,
            abi.encodePacked(_tokenKey),
            _value
        );
        require(success, "token value is invalid");
        return _value.toUint();
    }

    function getCapacityAvailable(
        address _vault,
        bytes32[] calldata _capacityProof,
        bytes32 _capacity
    ) public view override returns(uint256) {
        uint256 vaultId = getId(_vault);
        MerkleProof.verify(
            _capacityProof,
            capacityAvailable,
            _capacity,
            vaultId
        );
        return abi.encodePacked(_capacity).toUint();
    }

    function getAmountForSale(
        address _vault,
        bytes32[] calldata _saleProof,
        bytes32 _amount
    ) public view override returns(uint256) {
        uint256 vaultId = getId(_vault);
        MerkleProof.verify(
            _saleProof,
            amountsForSale[lastSaleUpdate],
            _amount,
            vaultId
        );
        return abi.encodePacked(_amount).toUint();
    }

    function pullAmountForSale(
        bytes32[] calldata _saleProof,
        bytes32 _amount
    ) external override returns(uint256) {
        require(!forSaleUpdated[lastSaleUpdate][msg.sender],"updated");
        uint256 vaultId = getId(msg.sender);
        MerkleProof.verify(
            _saleProof,
            amountsForSale[lastSaleUpdate],
            _amount,
            vaultId
        );
        forSaleUpdated[lastSaleUpdate][msg.sender] = true;
        emit ForSalePulled(msg.sender, abi.encodePacked(_amount).toUint());
        return abi.encodePacked(_amount).toUint();
    }
}
