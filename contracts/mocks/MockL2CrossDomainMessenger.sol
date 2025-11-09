// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockL2CrossDomainMessenger
 * @notice Mock implementation of OP Stack's L2CrossDomainMessenger for testing
 */
contract MockL2CrossDomainMessenger {
    address public xDomainMessageSender;

    function setXDomainMessageSender(address _sender) external {
        xDomainMessageSender = _sender;
    }

    function reset() external {
        xDomainMessageSender = address(0);
    }

    receive() external payable {}
}
