// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PGL2SplitController.sol";
import "../libraries/SplitV2.sol";

/**
 * @title PGL2ControllerArbitrum
 * @notice L2 controller for managing Protocol Guild's SplitsV2 contract on Arbitrum
 * @dev Controlled by L1 module via Arbitrum's retryable ticket system, with owner for recovery
 * @dev Handles refunds from retryable tickets and forwards them to splits wallet
 */
contract PGL2ControllerArbitrum is PGL2SplitController {
    // Aliased L1 module address (L1 address + offset)
    // When L1 contracts send messages via Inbox, they appear aliased on L2
    address public immutable aliasedL1Module;

    // Arbitrum address aliasing offset
    uint160 internal constant OFFSET = uint160(0x1111000000000000000000000000000000001111);

    // Threshold for automatic refund forwarding (0.5 ETH)
    uint256 public constant REFUND_FORWARD_THRESHOLD = 0.5 ether;

    // Events
    event RefundsReceived(uint256 amount);
    event RefundsForwarded(uint256 amount, bool automatic);

    /**
     * @notice Constructor
     * @param _l1Module Address of the PGL2ModuleArbitrum on L1
     * @param _splitsWallet Address of the SplitsV2 wallet on L2
     */
    constructor(
        address _l1Module,
        address _splitsWallet
    ) PGL2SplitController(_l1Module, _splitsWallet) {
        // Calculate the aliased address of the L1 module
        aliasedL1Module = _applyAlias(_l1Module);
    }

    /**
     * @notice Validates that the caller is the L1 module via Arbitrum retryable ticket
     * @dev Checks msg.sender is the aliased L1 module address
     * @return True if the caller is authorized
     */
    function _isL1Module() internal view override returns (bool) {
        return msg.sender == aliasedL1Module;
    }

    /**
     * @notice Applies Arbitrum's address aliasing
     * @param _l1Address The L1 address to alias
     * @return The aliased address that will be msg.sender on L2
     */
    function _applyAlias(address _l1Address) internal pure returns (address) {
        return address(uint160(_l1Address) + OFFSET);
    }

    /**
     * @notice View function to get the expected aliased L1 module address
     * @return The aliased L1 module address
     */
    function getAliasedL1Module() external view returns (address) {
        return aliasedL1Module;
    }

    // ========================================
    // Arbitrum-Specific Refund Handling
    // ========================================

    /**
     * @notice Receive ETH refunds from retryable tickets
     */
    receive() external payable {
        emit RefundsReceived(msg.value);
    }

    /**
     * @notice Internal function to check balance and forward refunds if threshold exceeded
     */
    function _checkAndForwardRefunds() internal {
        uint256 balance = address(this).balance;
        if (balance >= REFUND_FORWARD_THRESHOLD) {
            _forwardRefunds(balance, true);
        }
    }

    /**
     * @notice Internal function to forward refunds to splits wallet
     * @param amount Amount to forward
     * @param automatic Whether this is an automatic forward (true) or manual (false)
     */
    function _forwardRefunds(uint256 amount, bool automatic) internal {
        (bool success, ) = address(splitsWallet).call{value: amount}("");
        require(success, "Refund transfer failed");
        emit RefundsForwarded(amount, automatic);
    }

    /**
     * @notice Manually forward accumulated refunds to splits wallet
     * @dev Only callable by L1 module via cross-chain message
     */
    function forwardRefunds() external onlyL1Module {
        uint256 balance = address(this).balance;
        require(balance > 0, "No refunds to forward");
        _forwardRefunds(balance, false);
    }

    /**
     * @notice Get the current accumulated refund balance
     * @return The ETH balance available for forwarding
     */
    function getRefundBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ========================================
    // Override Functions with Refund Checks
    // ========================================

    /**
     * @notice Updates the split configuration
     * @param _split The new split struct
     * @dev Only callable by L1 module via cross-chain message
     * @dev Checks and forwards refunds after update
     */
    function updateSplit(SplitV2Lib.Split calldata _split) external override onlyL1Module {
        splitsWallet.updateSplit(_split);
        _checkAndForwardRefunds();
    }

    /**
     * @notice Distributes funds from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributor The address receiving distribution incentive
     * @dev Only callable by L1 module via cross-chain message
     * @dev Checks and forwards refunds after distribution
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external override onlyL1Module {
        splitsWallet.distribute(_split, _token, _distributor);
        _checkAndForwardRefunds();
    }

    /**
     * @notice Distributes a specific amount from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     * @dev Only callable by L1 module via cross-chain message
     * @dev Checks and forwards refunds after distribution
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external override onlyL1Module {
        splitsWallet.distribute(
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );
        _checkAndForwardRefunds();
    }
}
