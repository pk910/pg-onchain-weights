// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.23;

import { SplitV2Lib } from "../libraries/SplitV2.sol";

/**
 * @title ISplitFactoryV2
 * @notice Interface for 0xSplits V2 Factory
 * @dev Factory for deploying new split wallets
 */
interface ISplitFactoryV2 {
    /**
     * @notice Creates a new split wallet (nonce-based)
     * @param _splitParams The split configuration
     * @param _owner The owner of the split
     * @param _creator The creator of the split (for tracking)
     * @return split The address of the newly created split
     */
    function createSplit(
        SplitV2Lib.Split calldata _splitParams,
        address _owner,
        address _creator
    ) external returns (address split);

    /**
     * @notice Creates a new split wallet deterministically (salt-based)
     * @param _splitParams The split configuration
     * @param _owner The owner of the split
     * @param _creator The creator of the split (for tracking)
     * @param _salt Salt for CREATE2 deployment
     * @return split The address of the newly created split
     */
    function createSplitDeterministic(
        SplitV2Lib.Split calldata _splitParams,
        address _owner,
        address _creator,
        bytes32 _salt
    ) external returns (address split);
}
