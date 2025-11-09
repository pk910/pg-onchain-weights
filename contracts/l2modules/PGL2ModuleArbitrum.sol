// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../access/Ownable.sol";
import "../interfaces/IPGSplitL2Module.sol";
import "../libraries/SplitV2.sol";

/**
 * @title IInbox
 * @notice Interface for Arbitrum's Inbox contract
 */
interface IInbox {
    function createRetryableTicket(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256);

    function createRetryableTicketNoRefundAliasRewrite(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256);
}

/**
 * @title PGL2ModuleArbitrum
 * @notice L1 module for forwarding split updates to Arbitrum L2 via retryable tickets
 */
contract PGL2ModuleArbitrum is IPGSplitL2Module, Ownable {
    // Chain ID for the Arbitrum L2 network (42161 for Arbitrum One, 421614 for Arbitrum Sepolia)
    uint256 public immutable CHAIN_ID;

    // Human-readable name
    string public L2_NAME;

    // Arbitrum Inbox address (mainnet: 0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f)
    IInbox public immutable inbox;

    // L1 split controller address (only this address can call forwarding functions)
    address public l1Controller;

    // L2 controller address (set after L2 deployment)
    address public l2Controller;

    // Default gas parameters for L2 execution
    uint256 public constant DEFAULT_GAS_LIMIT = 1_000_000;
    uint256 public constant DEFAULT_MAX_FEE_PER_GAS = 10 gwei;
    uint256 public constant DEFAULT_MAX_SUBMISSION_COST = 0.001 ether;

    // Configurable gas parameters (initialized to defaults)
    uint256 public gasLimit;
    uint256 public maxFeePerGas;
    uint256 public maxSubmissionCost;

    // Events
    event L1ControllerUpdated(address indexed previousController, address indexed newController);
    event L2ControllerUpdated(address indexed previousController, address indexed newController);
    event GasParametersUpdated(uint256 gasLimit, uint256 maxFeePerGas, uint256 maxSubmissionCost);

    /**
     * @notice Modifier to restrict functions to L1 controller only
     */
    modifier onlyL1Controller() {
        require(msg.sender == l1Controller, "Not authorized L1 controller");
        _;
    }

    /**
     * @notice Modifier to restrict functions to L1 controller or owner
     */
    modifier onlyL1ControllerOrOwner() {
        require(msg.sender == l1Controller || msg.sender == owner, "Not authorized");
        _;
    }

    /**
     * @notice Constructor
     * @param _inbox Address of the Arbitrum Inbox contract
     * @param _chainId Chain ID for the Arbitrum L2 network (42161 for mainnet, 421614 for Sepolia)
     * @param _name Human-readable name for the L2 network (e.g., "Arbitrum One", "Arbitrum Sepolia")
     */
    constructor(address _inbox, uint256 _chainId, string memory _name) {
        require(_inbox != address(0), "Invalid inbox address");
        require(_chainId != 0, "Invalid chain ID");
        inbox = IInbox(_inbox);
        CHAIN_ID = _chainId;
        L2_NAME = _name;

        // Initialize gas parameters to defaults
        gasLimit = DEFAULT_GAS_LIMIT;
        maxFeePerGas = DEFAULT_MAX_FEE_PER_GAS;
        maxSubmissionCost = DEFAULT_MAX_SUBMISSION_COST;
    }

    /**
     * @notice Sets the L1 controller address
     * @param _l1Controller Address of the PGL1SplitController on L1
     * @dev Only callable by owner
     */
    function setL1Controller(address _l1Controller) external onlyOwner {
        require(_l1Controller != address(0), "Invalid L1 controller address");
        address previousController = l1Controller;
        l1Controller = _l1Controller;
        emit L1ControllerUpdated(previousController, _l1Controller);
    }

    /**
     * @notice Sets the L2 controller address
     * @param _l2Controller Address of the PGL2ControllerArbitrum on L2
     * @dev Only callable by owner, typically called after L2 controller deployment
     */
    function setL2Controller(address _l2Controller) external onlyOwner {
        require(_l2Controller != address(0), "Invalid L2 controller address");
        address previousController = l2Controller;
        l2Controller = _l2Controller;
        emit L2ControllerUpdated(previousController, _l2Controller);
    }

    /**
     * @notice Sets custom gas parameters for L2 retryable tickets
     * @param _gasLimit Gas limit for L2 execution
     * @param _maxFeePerGas Maximum fee per gas on L2
     * @param _maxSubmissionCost Maximum submission cost for retryable ticket
     * @dev Only callable by owner. Use when default gas limits are insufficient.
     */
    function setGasParameters(
        uint256 _gasLimit,
        uint256 _maxFeePerGas,
        uint256 _maxSubmissionCost
    ) external onlyOwner {
        require(_gasLimit > 0, "Gas limit must be greater than 0");
        require(_maxFeePerGas > 0, "Max fee per gas must be greater than 0");
        require(_maxSubmissionCost > 0, "Max submission cost must be greater than 0");

        gasLimit = _gasLimit;
        maxFeePerGas = _maxFeePerGas;
        maxSubmissionCost = _maxSubmissionCost;

        emit GasParametersUpdated(_gasLimit, _maxFeePerGas, _maxSubmissionCost);
    }

    /**
     * @notice Resets gas parameters to default values
     * @dev Only callable by owner
     */
    function resetGasParameters() external onlyOwner {
        gasLimit = DEFAULT_GAS_LIMIT;
        maxFeePerGas = DEFAULT_MAX_FEE_PER_GAS;
        maxSubmissionCost = DEFAULT_MAX_SUBMISSION_COST;

        emit GasParametersUpdated(gasLimit, maxFeePerGas, maxSubmissionCost);
    }

    // ========================================
    // 1:1 SplitsV2 Forwarding Functions
    // ========================================

    /**
     * @notice Updates the split configuration on L2
     * @param _split The new split struct
     * @dev Callable by L1 controller or owner
     * @dev Uses module's internal balance to pay Arbitrum retryable ticket fees
     * @dev Refunds go to L2 controller, which forwards them to splits wallet when threshold exceeded
     */
    function updateSplit(SplitV2Lib.Split calldata _split) external override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "updateSplit((address[],uint256[],uint256,uint16))",
            _split
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Distributes funds from the L2 split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributor The address receiving distribution incentive
     * @dev Callable by L1 controller or owner
     * @dev Refunds go to L2 controller, which forwards them to splits wallet when threshold exceeded
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external payable override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "distribute((address[],uint256[],uint256,uint16),address,address)",
            _split,
            _token,
            _distributor
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Distributes a specific amount from the L2 split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     * @dev Callable by L1 controller or owner
     * @dev Refunds go to L2 controller, which forwards them to splits wallet when threshold exceeded
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external payable override onlyL1ControllerOrOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "distribute((address[],uint256[],uint256,uint16),address,uint256,bool,address)",
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Executes arbitrary calls through the L2 split wallet
     * @param _calls Encoded call data for the L2 split controller
     * @dev Only callable by owner
     * @dev Refunds go to L2 controller, which accumulates them
     */
    function execCalls(
        bytes calldata _calls
    ) external payable override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "execCalls(bytes)",
            _calls
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Sets the paused status of the L2 splits wallet
     * @param _paused Whether to pause or unpause the wallet
     * @dev Only callable by owner
     * @dev Refunds go to L2 controller, which accumulates them
     */
    function setPaused(bool _paused) external override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "setPaused(bool)",
            _paused
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Transfers ownership of the L2 splits wallet
     * @param _owner The new owner address
     * @dev Only callable by owner
     * @dev Refunds go to L2 controller, which accumulates them
     */
    function transferSplitOwnership(address _owner) external override onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature(
            "transferOwnership(address)",
            _owner
        );

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Manually triggers forwarding of accumulated refunds from L2 controller to splits wallet
     * @dev Only callable by owner
     * @dev Useful for forcing refund forwarding before the automatic threshold is reached
     */
    function forwardRefunds() external onlyOwner {
        require(l2Controller != address(0), "L2 controller not set");

        bytes memory data = abi.encodeWithSignature("forwardRefunds()");

        // Calculate required fee for retryable ticket
        uint256 maxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
        require(address(this).balance >= maxFee, "Insufficient balance for L2 fees");

        inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
            l2Controller,
            0, // l2CallValue
            maxSubmissionCost,
            l2Controller, // excessFeeRefundAddress - refunds go to L2 controller
            l2Controller, // callValueRefundAddress - refunds go to L2 controller
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    /**
     * @notice Returns the chain ID this module handles
     * @return The chain ID for the Arbitrum L2 network
     */
    function chainId() external view override returns (uint256) {
        return CHAIN_ID;
    }

    /**
     * @notice Returns a human-readable name for this L2 module
     * @return The name of the Arbitrum network
     */
    function name() external view override returns (string memory) {
        return L2_NAME;
    }

    /**
     * @notice Receive ETH to fund Arbitrum retryable ticket fees
     * @dev Required for paying L2 gas and submission costs
     */
    receive() external payable {}

    /**
     * @notice Withdraw ETH from the module
     * @param _amount Amount of ETH to withdraw
     * @dev Only callable by owner
     */
    function redeem(uint256 _amount) external onlyOwner {
        require(_amount <= address(this).balance, "Insufficient balance");
        payable(msg.sender).transfer(_amount);
    }

    /**
     * @notice Get the current ETH balance of the module
     * @return The ETH balance available for fees
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
