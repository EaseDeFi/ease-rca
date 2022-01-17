pragma solidity ^0.8.11;
interface IRCAController {
    event VaultAdded(uint256 indexed id, address indexed vault);
    event Paused();
    event Unpaused();
    event CapacityUpdated();
    event PremiumUpdated(uint256 premium);
    event DelayUpdated(uint256 delay);
    event AddForSale(uint256 timestamp);
    event ForSalePulled(address indexed vault, uint256 amount);

    function paused() external view returns(bool);
    function withdrawalDelay() external view returns(uint256);
    function lastSaleUpdate() external view returns(uint256);
    function premium() external view returns(uint256);
    function addVault(address _vault) external;
    function pauseVaults() external;
    function unpauseVaults() external;
    function setAvailable(bytes32 _root) external;
    function setPremium(uint256 _premium) external;
    function setWithdrawDelay(uint256 _withdrawDelay) external;
    function addForSale(bytes32 _forSale) external;
    function getId(address _vault) external view returns(uint256 id);
    function getPrice(bytes32 _tokenKey, bytes32[] calldata _tokenProof, bytes calldata _value) external view returns(uint256);
    function getCapacityAvailable(address _vault, bytes32[] calldata _capacityProof, bytes32 _capacity) external view returns(uint256);
    function getAmountForSale(address _vault, bytes32[] calldata _capacityProof, bytes32 _capacity) external view returns(uint256);
    function pullAmountForSale(bytes32[] calldata _saleProof, bytes32 _amount) external returns(uint256);
}
