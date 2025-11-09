// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PGL2SplitController.sol";

/**
 * @title IL2CrossDomainMessenger
 * @notice Interface for OP Stack's L2CrossDomainMessenger
 */
interface IL2CrossDomainMessenger {
    function xDomainMessageSender() external view returns (address);
}

/**
 * @title PGL2ControllerOPStack
 * @notice L2 controller for managing Protocol Guild's SplitsV2 contract on OP Stack L2s
 * @dev Controlled by L1 module via OP Stack cross-chain messaging, with owner for recovery
 * @dev Supports Optimism, Base, and other OP Stack chains
 */
contract PGL2ControllerOPStack is PGL2SplitController {
    // OP Stack L2CrossDomainMessenger address (0x4200000000000000000000000000000000000007)
    // This is a predeploy address that is the same across all OP Stack chains
    IL2CrossDomainMessenger public immutable crossDomainMessenger;

    /**
     * @notice Constructor
     * @param _crossDomainMessenger Address of the L2CrossDomainMessenger (0x4200000000000000000000000000000000000007)
     * @param _l1Module Address of the PGL2ModuleOPStack on L1
     * @param _splitsWallet Address of the SplitsV2 wallet on L2
     */
    constructor(
        address _crossDomainMessenger,
        address _l1Module,
        address _splitsWallet
    ) PGL2SplitController(_l1Module, _splitsWallet) {
        require(_crossDomainMessenger != address(0), "Invalid messenger address");
        crossDomainMessenger = IL2CrossDomainMessenger(_crossDomainMessenger);
    }

    /**
     * @notice Validates that the caller is the L1 module via OP Stack cross-chain message
     * @dev Checks msg.sender is the crossDomainMessenger and xDomainMessageSender is l1Module
     * @return True if the caller is authorized
     */
    function _isL1Module() internal view override returns (bool) {
        return msg.sender == address(crossDomainMessenger) &&
               crossDomainMessenger.xDomainMessageSender() == l1Module;
    }
}
