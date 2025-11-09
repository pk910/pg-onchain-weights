// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ISplitWalletV2.sol";
import "../libraries/SplitV2.sol";

/**
 * @title PGL2SplitController
 * @notice Abstract base controller for managing Protocol Guild's SplitsV2 contract on L2s
 * @dev Implements all split control logic, requires network-specific L1 validation
 * @dev Immutable controller - all operations must go through L1 module
 */
abstract contract PGL2SplitController {
    // L1 module address that can control this contract
    address public immutable l1Module;

    // Splits wallet on L2
    ISplitWalletV2 public immutable splitsWallet;

    /**
     * @notice Abstract function to validate cross-chain message sender
     * @dev Must be implemented by network-specific controllers
     * @return True if the caller is the authorized L1 module via cross-chain message
     */
    function _isL1Module() internal view virtual returns (bool);

    /**
     * @notice Modifier to restrict functions to L1 module only (via cross-chain message)
     */
    modifier onlyL1Module() {
        require(_isL1Module(), "Not authorized L1 module");
        _;
    }

    /**
     * @notice Constructor
     * @param _l1Module Address of the L1 module
     * @param _splitsWallet Address of the SplitsV2 wallet on L2
     */
    constructor(
        address _l1Module,
        address _splitsWallet
    ) {
        require(_l1Module != address(0), "Invalid L1 module address");
        require(_splitsWallet != address(0), "Invalid splits wallet address");

        l1Module = _l1Module;
        splitsWallet = ISplitWalletV2(_splitsWallet);
    }

    // ========================================
    // 1:1 SplitsV2 Wallet Functions
    // All functions proxy directly to the splits wallet
    // ========================================

    /**
     * @notice Updates the split configuration
     * @param _split The new split struct
     * @dev Only callable by L1 module via cross-chain message
     */
    function updateSplit(SplitV2Lib.Split calldata _split) external virtual onlyL1Module {
        splitsWallet.updateSplit(_split);
    }

    /**
     * @notice Distributes funds from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributor The address receiving distribution incentive
     * @dev Only callable by L1 module via cross-chain message
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external virtual onlyL1Module {
        splitsWallet.distribute(_split, _token, _distributor);
    }

    /**
     * @notice Distributes a specific amount from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     * @dev Only callable by L1 module via cross-chain message
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external virtual onlyL1Module {
        splitsWallet.distribute(
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );
    }

    /**
     * @notice Executes arbitrary calls through the splits wallet
     * @param _calls Array of calls to execute
     * @dev Only callable by L1 module via cross-chain message
     * @return blockNumber The block number when calls were executed
     * @return returnData Array of return data from each call
     */
    function execCalls(
        ISplitWalletV2.Call[] calldata _calls
    ) external payable onlyL1Module returns (uint256 blockNumber, bytes[] memory returnData) {
        return splitsWallet.execCalls(_calls);
    }

    /**
     * @notice Sets the paused status of the splits wallet
     * @param _paused Whether to pause or unpause the wallet
     * @dev Only callable by L1 module via cross-chain message
     */
    function setPaused(bool _paused) external onlyL1Module {
        splitsWallet.setPaused(_paused);
    }

    /**
     * @notice Transfers ownership of the splits wallet
     * @param _owner The new owner address
     * @dev Only callable by L1 module via cross-chain message
     */
    function transferOwnership(address _owner) external onlyL1Module {
        splitsWallet.transferOwnership(_owner);
    }

    // ========================================
    // View Functions
    // ========================================

    /**
     * @notice Gets the split balance for a specific token
     * @param _token The token address to check
     * @return splitBalance The token balance in the split wallet
     * @return warehouseBalance The token balance in the warehouse
     */
    function getSplitBalance(address _token) external view returns (uint256 splitBalance, uint256 warehouseBalance) {
        return splitsWallet.getSplitBalance(_token);
    }

    /**
     * @notice Gets the current owner of the splits wallet
     * @return The owner address
     */
    function owner() external view returns (address) {
        return splitsWallet.owner();
    }

    /**
     * @notice Gets the paused status of the splits wallet
     * @return isPaused Whether the wallet is paused
     */
    function paused() external view returns (bool isPaused) {
        return splitsWallet.paused();
    }

    /**
     * @notice Gets the current split hash
     * @return The split hash
     */
    function splitHash() external view returns (bytes32) {
        return splitsWallet.splitHash();
    }
}
