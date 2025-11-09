// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IPGSplitL2Module.sol";
import "../libraries/SplitV2.sol";

/**
 * @title MockL2Module
 * @notice Mock implementation of IPGSplitL2Module for testing
 */
contract MockL2Module is IPGSplitL2Module {
    uint256 public immutable CHAIN_ID;
    string public L2_NAME;

    bool public updateSplitCalled;
    bool public distributeCalled;
    bool public execCallsCalled;
    bool public setPausedCalled;
    bool public transferSplitOwnershipCalled;

    constructor(uint256 _chainId, string memory _name) {
        CHAIN_ID = _chainId;
        L2_NAME = _name;
    }

    function updateSplit(SplitV2Lib.Split calldata /* _split */) external override {
        updateSplitCalled = true;
    }

    function distribute(
        SplitV2Lib.Split calldata /* _split */,
        address /* _token */,
        address /* _distributor */
    ) external payable override {
        distributeCalled = true;
    }

    function distribute(
        SplitV2Lib.Split calldata /* _split */,
        address /* _token */,
        uint256 /* _distributeAmount */,
        bool /* _performWarehouseTransfer */,
        address /* _distributor */
    ) external payable override {
        distributeCalled = true;
    }

    function execCalls(bytes calldata /* _calls */) external payable override {
        execCallsCalled = true;
    }

    function setPaused(bool /* _paused */) external override {
        setPausedCalled = true;
    }

    function transferSplitOwnership(address /* _owner */) external override {
        transferSplitOwnershipCalled = true;
    }

    function chainId() external view override returns (uint256) {
        return CHAIN_ID;
    }

    function name() external view override returns (string memory) {
        return L2_NAME;
    }
}
