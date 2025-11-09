// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockArbitrumInbox
 * @notice Mock implementation of Arbitrum's Inbox contract for testing
 */
contract MockArbitrumInbox {
    struct RetryableTicket {
        address to;
        uint256 l2CallValue;
        uint256 maxSubmissionCost;
        address excessFeeRefundAddress;
        address callValueRefundAddress;
        uint256 gasLimit;
        uint256 maxFeePerGas;
        bytes data;
    }

    RetryableTicket[] public tickets;
    bool public createRetryableTicketCalled;
    uint256 private ticketIdCounter;

    function createRetryableTicket(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256) {
        createRetryableTicketCalled = true;
        tickets.push(RetryableTicket({
            to: to,
            l2CallValue: l2CallValue,
            maxSubmissionCost: maxSubmissionCost,
            excessFeeRefundAddress: excessFeeRefundAddress,
            callValueRefundAddress: callValueRefundAddress,
            gasLimit: gasLimit,
            maxFeePerGas: maxFeePerGas,
            data: data
        }));
        return ++ticketIdCounter;
    }

    function createRetryableTicketNoRefundAliasRewrite(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256) {
        createRetryableTicketCalled = true;
        tickets.push(RetryableTicket({
            to: to,
            l2CallValue: l2CallValue,
            maxSubmissionCost: maxSubmissionCost,
            excessFeeRefundAddress: excessFeeRefundAddress,
            callValueRefundAddress: callValueRefundAddress,
            gasLimit: gasLimit,
            maxFeePerGas: maxFeePerGas,
            data: data
        }));
        return ++ticketIdCounter;
    }

    function getTicketsCount() external view returns (uint256) {
        return tickets.length;
    }

    function getLastTicket() external view returns (
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes memory data
    ) {
        require(tickets.length > 0, "No tickets created");
        RetryableTicket memory ticket = tickets[tickets.length - 1];
        return (
            ticket.to,
            ticket.l2CallValue,
            ticket.maxSubmissionCost,
            ticket.excessFeeRefundAddress,
            ticket.callValueRefundAddress,
            ticket.gasLimit,
            ticket.maxFeePerGas,
            ticket.data
        );
    }

    function reset() external {
        delete tickets;
        createRetryableTicketCalled = false;
    }
}
