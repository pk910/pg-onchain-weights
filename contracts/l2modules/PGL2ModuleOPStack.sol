// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../access/Ownable.sol";
import "../interfaces/IPGSplitL2Module.sol";
import "../libraries/SplitV2.sol";

/**
 * @title ICrossDomainMessenger
 * @notice Interface for OP Stack's L1CrossDomainMessenger
 */
interface ICrossDomainMessenger {
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external payable;
}

/**
 * @title PGL2ModuleOPStack
 * @notice L1 module for forwarding split updates to OP Stack L2s via cross-chain messaging
 * @dev Supports Optimism, Base, and other OP Stack chains
 */
contract PGL2ModuleOPStack is IPGSplitL2Module, Ownable {
    // Chain ID for the L2 network (e.g., 10 for Optimism, 8453 for Base)
    uint256 public immutable CHAIN_ID;

    // Human-readable name for the L2 network
    string public L2_NAME;

    // OP Stack L1CrossDomainMessenger address
    // Optimism mainnet: 0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1
    // Base mainnet: 0x866E82a600A1414e583f7F13623F1aC5d58b0Afa
    ICrossDomainMessenger public immutable crossDomainMessenger;

    // L1 split controller address (only this address can call forwarding functions)
    address public l1Controller;

    // L2 controller address (set after L2 deployment)
    address public l2Controller;

    // Default gas limit for cross-chain messages
    uint32 public constant DEFAULT_GAS_LIMIT = 1_000_000;

    // Events
    event L1ControllerUpdated(address indexed previousController, address indexed newController);
    event L2ControllerUpdated(address indexed previousController, address indexed newController);

    /**
     * @notice Constructor
     * @param _crossDomainMessenger Address of the L1CrossDomainMessenger
     * @param _chainId Chain ID for the L2 network (10 for Optimism, 8453 for Base)
     * @param _name Human-readable name for the L2 network (e.g., "Optimism", "Base")
     */
    constructor(
        address _crossDomainMessenger,
        uint256 _chainId,
        string memory _name
    ) {
        require(_crossDomainMessenger != address(0), "Invalid messenger address");
        require(_chainId > 0, "Invalid chain ID");
        require(bytes(_name).length > 0, "Invalid name");

        crossDomainMessenger = ICrossDomainMessenger(_crossDomainMessenger);
        CHAIN_ID = _chainId;
        L2_NAME = _name;
    }

    /**
     * @notice Modifier to restrict functions to L1 controller only
     */
    modifier onlyL1Controller() {
        require(msg.sender == l1Controller, "Not authorized L1 controller");
        _;
    }

    /**
     * @notice Modifier to restrict functions to L1 controller or owner
     */
    modifier onlyL1ControllerOrOwner() {
        require(msg.sender == l1Controller || msg.sender == owner, "Not authorized");
        _;
    }

    /**
     * @notice Sets the L1 controller address
     * @param _l1Controller Address of the PGL1SplitController on L1
     * @dev Only callable by owner
     */
    function setL1Controller(address _l1Controller) external onlyOwner {
        require(_l1Controller != address(0), "Invalid L1 controller address");
        address previousController = l1Controller;
        l1Controller = _l1Controller;
        emit L1ControllerUpdated(previousController, _l1Controller);
    }

    /**
     * @notice Sets the L2 controller address
     * @param _l2Controller Address of the PGL2ControllerOPStack on L2
     * @dev Only callable by owner, typically called after L2 controller deployment
     */
    function setL2Controller(address _l2Controller) external onlyOwner {
        require(_l2Controller != address(0), "Invalid L2 controller address");
        address previousController = l2Controller;
        l2Controller = _l2Controller;
        emit L2ControllerUpdated(previousController, _l2Controller);
    }

    // ========================================
    // 1:1 SplitsV2 Forwarding Functions
    // ========================================

    /**
     * @notice Updates the split configuration on L2
     * @param _split The new split struct
     * @dev Callable by L1 controller or owner
     * @dev OP Stack messaging is free (no fees required)
     */
    function updateSplit(SplitV2Lib.Split calldata _split) external override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "updateSplit((address[],uint256[],uint256,uint16))",
            _split
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Distributes funds from the L2 split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributor The address receiving distribution incentive
     * @dev Callable by L1 controller or owner
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external payable override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "distribute((address[],uint256[],uint256,uint16),address,address)",
            _split,
            _token,
            _distributor
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Distributes a specific amount from the L2 split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     * @dev Callable by L1 controller or owner
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external payable override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "distribute((address[],uint256[],uint256,uint16),address,uint256,bool,address)",
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Executes arbitrary calls through the L2 split wallet
     * @param _calls Encoded call data for the L2 split controller
     * @dev Only callable by owner
     */
    function execCalls(
        bytes calldata _calls
    ) external payable override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "execCalls(bytes)",
            _calls
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Sets the paused status of the L2 splits wallet
     * @param _paused Whether to pause or unpause the wallet
     * @dev Only callable by owner
     */
    function setPaused(bool _paused) external override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "setPaused(bool)",
            _paused
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Transfers ownership of the L2 splits wallet
     * @param _owner The new owner address
     * @dev Only callable by owner
     */
    function transferSplitOwnership(address _owner) external override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory message = abi.encodeWithSignature(
            "transferOwnership(address)",
            _owner
        );

        crossDomainMessenger.sendMessage(
            l2Controller,
            message,
            DEFAULT_GAS_LIMIT
        );
    }

    /**
     * @notice Returns the chain ID this module handles
     * @return The chain ID for the L2 network
     */
    function chainId() external view override returns (uint256) {
        return CHAIN_ID;
    }

    /**
     * @notice Returns a human-readable name for this L2 module
     * @return The name of the L2 network
     */
    function name() external view override returns (string memory) {
        return L2_NAME;
    }

    /**
     * @notice Receive ETH to fund cross-chain messaging fees
     * @dev OP Stack messaging is free, but accept deposits for consistency
     */
    receive() external payable {}

    /**
     * @notice Withdraw ETH from the module
     * @param _amount Amount of ETH to withdraw
     * @dev Only callable by owner
     */
    function redeem(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance, "Insufficient balance");
        payable(msg.sender).transfer(_amount);
    }

    /**
     * @notice Get the current ETH balance of the module
     * @return The ETH balance available for fees
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
