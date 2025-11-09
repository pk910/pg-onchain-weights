// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ISplitWalletV2.sol";
import "../libraries/SplitV2.sol";

/**
 * @title MockSplitWalletV2
 * @notice Mock implementation of ISplitWalletV2 for testing
 */
contract MockSplitWalletV2 is ISplitWalletV2 {
    address public owner;
    bool public isPaused;
    bytes32 public currentSplitHash;

    bool public updateSplitCalled;
    bool public distributeCalled;
    bool public execCallsCalled;

    constructor() {
        owner = msg.sender;
        isPaused = false;
        currentSplitHash = keccak256("initial");
    }

    function splitHash() external view override returns (bytes32) {
        return currentSplitHash;
    }

    function distribute(
        SplitV2Lib.Split calldata _split,
        address /* _token */,
        address /* _distributor */
    ) external override {
        distributeCalled = true;
        currentSplitHash = _hashSplit(_split);
    }

    function distribute(
        SplitV2Lib.Split calldata _split,
        address /* _token */,
        uint256 /* _distributeAmount */,
        bool /* _performWarehouseTransfer */,
        address /* _distributor */
    ) external override {
        distributeCalled = true;
        currentSplitHash = _hashSplit(_split);
    }

    function getSplitBalance(address /* _token */) external pure override returns (uint256 splitBalance, uint256 warehouseBalance) {
        return (0, 0);
    }

    function updateSplit(SplitV2Lib.Split calldata _split) external override {
        updateSplitCalled = true;
        currentSplitHash = _hashSplit(_split);
    }

    function execCalls(
        Call[] calldata /* _calls */
    ) external payable override returns (uint256 blockNumber, bytes[] memory returnData) {
        execCallsCalled = true;
        return (block.number, new bytes[](0));
    }

    function setPaused(bool _paused) external override {
        isPaused = _paused;
    }

    function paused() external view override returns (bool) {
        return isPaused;
    }

    function transferOwnership(address _owner) external override {
        owner = _owner;
    }

    function _hashSplit(SplitV2Lib.Split calldata _split) internal pure returns (bytes32) {
        return keccak256(abi.encode(_split.recipients, _split.allocations, _split.totalAllocation, _split.distributionIncentive));
    }

    receive() external payable {}
}
