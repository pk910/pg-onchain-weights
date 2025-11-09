// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockCrossDomainMessenger
 * @notice Mock implementation of OP Stack's L1CrossDomainMessenger for testing
 */
contract MockCrossDomainMessenger {
    struct Message {
        address target;
        bytes message;
        uint32 minGasLimit;
    }

    Message[] public sentMessages;
    bool public sendMessageCalled;

    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external payable {
        sendMessageCalled = true;
        sentMessages.push(Message({
            target: _target,
            message: _message,
            minGasLimit: _minGasLimit
        }));
    }

    function getSentMessagesCount() external view returns (uint256) {
        return sentMessages.length;
    }

    function getLastMessage() external view returns (address target, bytes memory message, uint32 minGasLimit) {
        require(sentMessages.length > 0, "No messages sent");
        Message memory lastMsg = sentMessages[sentMessages.length - 1];
        return (lastMsg.target, lastMsg.message, lastMsg.minGasLimit);
    }

    function reset() external {
        delete sentMessages;
        sendMessageCalled = false;
    }
}
