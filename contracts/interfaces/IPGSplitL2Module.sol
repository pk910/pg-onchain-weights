// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/SplitV2.sol";

/**
 * @title IPGSplitL2Module
 * @notice Interface for L2 modules that handle cross-chain communication for split updates
 * @dev Each L2 module implements L2-specific logic (Optimism, Arbitrum, Base, etc.)
 * @dev Function signatures match SplitsV2 1:1 for consistency
 */
interface IPGSplitL2Module {
    /**
     * @notice Updates the split configuration on L2
     * @param _split The new split struct
     * @dev Callable by L1 controller or owner
     * @dev Module pays fees from its internal balance
     */
    function updateSplit(SplitV2Lib.Split calldata _split) external;

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
    ) external payable;

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
    ) external payable;

    /**
     * @notice Executes arbitrary calls through the L2 split wallet
     * @param _calls Array of calls to execute
     * @dev Only callable by owner
     */
    function execCalls(
        bytes calldata _calls
    ) external payable;

    /**
     * @notice Sets the paused status of the L2 splits wallet
     * @param _paused Whether to pause or unpause the wallet
     * @dev Only callable by owner
     */
    function setPaused(bool _paused) external;

    /**
     * @notice Transfers ownership of the L2 splits wallet
     * @param _owner The new owner address
     * @dev Only callable by owner
     */
    function transferSplitOwnership(address _owner) external;

    /**
     * @notice Returns the chain ID this module handles
     * @return The chain ID for the L2 network
     */
    function chainId() external view returns (uint256);

    /**
     * @notice Returns a human-readable name for this L2 module
     * @return The name of the L2 network (e.g., "Optimism", "Arbitrum", "Base")
     */
    function name() external view returns (string memory);
}
