// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./access/Ownable.sol";
import "./interfaces/IPGMemberRegistry.sol";
import "./interfaces/ISplitWalletV2.sol";
import "./interfaces/IPGSplitL2Module.sol";
import "./libraries/SplitV2.sol";

/**
 * @title PGL1SplitController
 * @notice Controller contract for managing Protocol Guild's SplitsV2 contract on L1
 * @dev Only the owner can call functions to control the splits contract
 */
contract PGL1SplitController is Ownable {
    // Structs
    struct SplitRecipient {
        address recipient;
        uint96 allocation;
    }

    // State variables
    IPGMemberRegistry public memberRegistry;
    ISplitWalletV2 public splitsWallet;

    // L2 Module Registry
    mapping(uint256 => IPGSplitL2Module) public l2Modules;
    uint256[] public registeredChainIds;

    // Events
    event MemberRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event SplitsAddressUpdated(address indexed previousSplits, address indexed newSplits);
    event SplitSharesUpdated(uint16 cutoffYear, uint8 cutoffMonth, uint256 memberCount);
    event DistributionExecuted(address indexed token, address indexed distributor);
    event SplitOwnershipTransferred(address indexed newOwner);
    event SplitPausedStatusChanged(bool paused);
    event ArbitraryCallsExecuted(uint256 callCount);
    event L2ModuleAdded(uint256 indexed chainId, address indexed moduleAddress, string name);
    event L2ModuleRemoved(uint256 indexed chainId, address indexed moduleAddress);

    /**
     * @notice Sets the MemberRegistry address
     * @param _memberRegistry The address of the MemberRegistry contract
     */
    function setMemberRegistry(address _memberRegistry) external onlyOwner {
        require(_memberRegistry != address(0), "Invalid registry address");
        address previousRegistry = address(memberRegistry);
        memberRegistry = IPGMemberRegistry(_memberRegistry);
        emit MemberRegistryUpdated(previousRegistry, _memberRegistry);
    }

    /**
     * @notice Sets the SplitsV2 wallet address
     * @param _splitsAddress The address of the SplitsV2 wallet contract
     */
    function setSplitsAddress(address _splitsAddress) external onlyOwner {
        require(_splitsAddress != address(0), "Invalid splits address");
        address previousSplits = address(splitsWallet);
        splitsWallet = ISplitWalletV2(_splitsAddress);
        emit SplitsAddressUpdated(previousSplits, _splitsAddress);
    }

    /**
     * @notice Adds an L2 module to the registry
     * @param _chainId The chain ID for the L2 network
     * @param _moduleAddress The address of the L2 module contract
     */
    function addL2Module(uint256 _chainId, address _moduleAddress) external onlyOwner {
        require(_moduleAddress != address(0), "Invalid module address");
        require(address(l2Modules[_chainId]) == address(0), "Module already registered");

        IPGSplitL2Module module = IPGSplitL2Module(_moduleAddress);
        require(module.chainId() == _chainId, "Chain ID mismatch");

        l2Modules[_chainId] = module;
        registeredChainIds.push(_chainId);

        emit L2ModuleAdded(_chainId, _moduleAddress, module.name());
    }

    /**
     * @notice Removes an L2 module from the registry
     * @param _chainId The chain ID for the L2 network to remove
     */
    function removeL2Module(uint256 _chainId) external onlyOwner {
        require(address(l2Modules[_chainId]) != address(0), "Module not registered");

        address moduleAddress = address(l2Modules[_chainId]);
        delete l2Modules[_chainId];

        // Remove from registeredChainIds array
        for (uint256 i = 0; i < registeredChainIds.length; i++) {
            if (registeredChainIds[i] == _chainId) {
                registeredChainIds[i] = registeredChainIds[registeredChainIds.length - 1];
                registeredChainIds.pop();
                break;
            }
        }

        emit L2ModuleRemoved(_chainId, moduleAddress);
    }

    /**
     * @notice Updates the split shares based on member weights from the MemberRegistry
     * @param _cutoffYear The cutoff year for calculating member weights
     * @param _cutoffMonth The cutoff month for calculating member weights
     * @param _distributionIncentive The distribution incentive percentage (max 6.5%)
     * @dev L2 modules pay their own fees from internal balance
     */
    function updateSplitShares(
        uint16 _cutoffYear,
        uint8 _cutoffMonth,
        uint16 _distributionIncentive
    ) external onlyOwner {
        require(address(memberRegistry) != address(0), "MemberRegistry not set");
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_cutoffMonth >= 1 && _cutoffMonth <= 12, "Invalid month");

        // Get member weights from the registry
        (IPGMemberRegistry.WeightResult[] memory weights, ) = memberRegistry.getAllWeights(
            _cutoffYear,
            _cutoffMonth
        );

        require(weights.length > 0, "No active members");

        // Convert weights to Split struct format
        address[] memory recipients = new address[](weights.length);
        uint256[] memory allocations = new uint256[](weights.length);
        uint256 totalAllocation = 0;

        for (uint256 i = 0; i < weights.length; i++) {
            recipients[i] = weights[i].memberAddress;
            // Convert percentage (scaled by 1000000) to allocation
            // We use the percentage directly as allocation
            allocations[i] = weights[i].percentage;
            totalAllocation += weights[i].percentage;
        }

        // Create the Split struct
        SplitV2Lib.Split memory split = SplitV2Lib.Split({
            recipients: recipients,
            allocations: allocations,
            totalAllocation: totalAllocation,
            distributionIncentive: _distributionIncentive
        });

        // Update the L1 split
        splitsWallet.updateSplit(split);

        emit SplitSharesUpdated(_cutoffYear, _cutoffMonth, weights.length);

        // Notify all registered L2 modules
        _notifyL2Modules(_cutoffYear, _cutoffMonth, split);
    }

    /**
     * @notice Updates splits from a simplified list of recipient + allocation pairs
     * @param _splits Array of SplitRecipient structs (address + allocation)
     * @param _distributionIncentive The distribution incentive percentage (max 6.5%)
     * @dev Simplified method that doesn't require member registry
     * @dev Allocations are raw weights that will be summed for totalAllocation
     * @dev Better for DAO transaction previews - shows complete allocation per recipient
     */
    function updateSplitFromList(
        SplitRecipient[] calldata _splits,
        uint16 _distributionIncentive
    ) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_splits.length > 0, "No recipients provided");

        // Prepare arrays for SplitV2 format
        address[] memory recipients = new address[](_splits.length);
        uint256[] memory allocations = new uint256[](_splits.length);
        uint256 totalAllocation = 0;

        // Extract and validate data
        for (uint256 i = 0; i < _splits.length; i++) {
            require(_splits[i].recipient != address(0), "Invalid recipient address");
            require(_splits[i].allocation > 0, "Allocation must be greater than 0");

            recipients[i] = _splits[i].recipient;
            allocations[i] = _splits[i].allocation;
            totalAllocation += _splits[i].allocation;
        }

        require(totalAllocation > 0, "Total allocation must be greater than 0");

        // Create the Split struct
        SplitV2Lib.Split memory split = SplitV2Lib.Split({
            recipients: recipients,
            allocations: allocations,
            totalAllocation: totalAllocation,
            distributionIncentive: _distributionIncentive
        });

        // Update the L1 split
        splitsWallet.updateSplit(split);

        emit SplitSharesUpdated(0, 0, _splits.length);

        // Notify all registered L2 modules
        _notifyL2Modules(0, 0, split);
    }

    /**
     * @notice Updates the split shares for a single chain only
     * @param _cutoffYear The cutoff year for calculating member weights
     * @param _cutoffMonth The cutoff month for calculating member weights
     * @param _distributionIncentive The distribution incentive percentage (max 6.5%)
     * @param _chainId The chain ID to update (1 for L1 only, >1 for specific L2)
     * @dev Use this function when updating all chains in one transaction would exceed gas limits
     */
    function updateSplitSharesSingleChain(
        uint16 _cutoffYear,
        uint8 _cutoffMonth,
        uint16 _distributionIncentive,
        uint256 _chainId
    ) external onlyOwner {
        require(address(memberRegistry) != address(0), "MemberRegistry not set");
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_cutoffMonth >= 1 && _cutoffMonth <= 12, "Invalid month");

        // Get member weights from the registry
        (IPGMemberRegistry.WeightResult[] memory weights, ) = memberRegistry.getAllWeights(
            _cutoffYear,
            _cutoffMonth
        );

        require(weights.length > 0, "No active members");

        // Convert weights to Split struct format
        address[] memory recipients = new address[](weights.length);
        uint256[] memory allocations = new uint256[](weights.length);
        uint256 totalAllocation = 0;

        for (uint256 i = 0; i < weights.length; i++) {
            recipients[i] = weights[i].memberAddress;
            allocations[i] = weights[i].percentage;
            totalAllocation += weights[i].percentage;
        }

        // Create the Split struct
        SplitV2Lib.Split memory split = SplitV2Lib.Split({
            recipients: recipients,
            allocations: allocations,
            totalAllocation: totalAllocation,
            distributionIncentive: _distributionIncentive
        });

        emit SplitSharesUpdated(_cutoffYear, _cutoffMonth, weights.length);

        // Update only the specified chain
        if (_chainId == 1) {
            // Update the L1 split
            splitsWallet.updateSplit(split);
        } else {
            // Notify single L2 module
            require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");
            IPGSplitL2Module module = l2Modules[_chainId];
            module.updateSplit(split);
        }
    }

    /**
     * @notice Updates splits from a simplified list for a single chain only
     * @param _splits Array of SplitRecipient structs (address + allocation)
     * @param _distributionIncentive The distribution incentive percentage (max 6.5%)
     * @param _chainId The chain ID to update (1 for L1 only, >1 for specific L2)
     * @dev Use this function when updating all chains in one transaction would exceed gas limits
     */
    function updateSplitFromListSingleChain(
        SplitRecipient[] calldata _splits,
        uint16 _distributionIncentive,
        uint256 _chainId
    ) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_splits.length > 0, "No recipients provided");

        // Prepare arrays for SplitV2 format
        address[] memory recipients = new address[](_splits.length);
        uint256[] memory allocations = new uint256[](_splits.length);
        uint256 totalAllocation = 0;

        // Extract and validate data
        for (uint256 i = 0; i < _splits.length; i++) {
            require(_splits[i].recipient != address(0), "Invalid recipient address");
            require(_splits[i].allocation > 0, "Allocation must be greater than 0");

            recipients[i] = _splits[i].recipient;
            allocations[i] = _splits[i].allocation;
            totalAllocation += _splits[i].allocation;
        }

        require(totalAllocation > 0, "Total allocation must be greater than 0");

        // Create the Split struct
        SplitV2Lib.Split memory split = SplitV2Lib.Split({
            recipients: recipients,
            allocations: allocations,
            totalAllocation: totalAllocation,
            distributionIncentive: _distributionIncentive
        });

        emit SplitSharesUpdated(0, 0, _splits.length);

        // Update only the specified chain
        if (_chainId == 1) {
            // Update the L1 split
            splitsWallet.updateSplit(split);
        } else {
            // Notify single L2 module
            require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");
            IPGSplitL2Module module = l2Modules[_chainId];
            module.updateSplit(split);
        }
    }

    /**
     * @notice Internal function to notify all L2 modules about split updates
     * @param _split The updated split configuration
     * @dev L2 modules pay their own fees from internal balance
     * @dev Cutoff year/month parameters removed - metadata tracking happens on L1
     */
    function _notifyL2Modules(
        uint16 /* _cutoffYear */,
        uint8 /* _cutoffMonth */,
        SplitV2Lib.Split memory _split
    ) internal {
        uint256 chainCount = registeredChainIds.length;
        if (chainCount == 0) return;

        for (uint256 i = 0; i < chainCount; i++) {
            uint256 chainId = registeredChainIds[i];
            IPGSplitL2Module module = l2Modules[chainId];

            // Call updateSplit on L2 modules (metadata tracking happens on L1)
            module.updateSplit(_split);
        }
    }

    /**
     * @notice Distributes funds from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute (address(0) for ETH)
     * @param _distributor The address receiving distribution incentive
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        splitsWallet.distribute(_split, _token, _distributor);
        emit DistributionExecuted(_token, _distributor);
    }

    /**
     * @notice Distributes a specific amount from the split wallet
     * @param _split The split configuration
     * @param _token The token address to distribute (address(0) for ETH)
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     */
    function distribute(
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        splitsWallet.distribute(
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );
        emit DistributionExecuted(_token, _distributor);
    }

    /**
     * @notice Forwards a distribution call to a specific L2 module
     * @param _chainId The chain ID of the L2 network
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributor The address receiving distribution incentive
     * @dev L2 modules pay their own fees from internal balance
     */
    function distributeL2(
        uint256 _chainId,
        SplitV2Lib.Split calldata _split,
        address _token,
        address _distributor
    ) external payable onlyOwner {
        require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");

        IPGSplitL2Module module = l2Modules[_chainId];
        module.distribute{value: msg.value}(_split, _token, _distributor);
    }

    /**
     * @notice Forwards a distribution call with amount to a specific L2 module
     * @param _chainId The chain ID of the L2 network
     * @param _split The split configuration
     * @param _token The token address to distribute
     * @param _distributeAmount The amount to distribute
     * @param _performWarehouseTransfer Whether to transfer from warehouse
     * @param _distributor The address receiving distribution incentive
     * @dev L2 modules pay their own fees from internal balance
     */
    function distributeL2WithAmount(
        uint256 _chainId,
        SplitV2Lib.Split calldata _split,
        address _token,
        uint256 _distributeAmount,
        bool _performWarehouseTransfer,
        address _distributor
    ) external payable onlyOwner {
        require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");

        IPGSplitL2Module module = l2Modules[_chainId];
        module.distribute{value: msg.value}(
            _split,
            _token,
            _distributeAmount,
            _performWarehouseTransfer,
            _distributor
        );
    }

    /**
     * @notice Forwards arbitrary calls to a specific L2 split controller
     * @param _chainId The chain ID of the L2 network
     * @param _calls Encoded call data for the L2 split controller
     * @dev L2 modules pay their own fees from internal balance
     */
    function execCallsL2(
        uint256 _chainId,
        bytes calldata _calls
    ) external payable onlyOwner {
        require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");
        require(_calls.length > 0, "No calls provided");

        IPGSplitL2Module module = l2Modules[_chainId];
        module.execCalls{value: msg.value}(_calls);
    }

    /**
     * @notice Sets the paused status of a specific L2 splits wallet
     * @param _chainId The chain ID of the L2 network
     * @param _paused Whether to pause or unpause the wallet
     */
    function setPausedL2(uint256 _chainId, bool _paused) external onlyOwner {
        require(address(l2Modules[_chainId]) != address(0), "L2 module not registered");

        IPGSplitL2Module module = l2Modules[_chainId];
        module.setPaused(_paused);
    }

    /**
     * @notice Transfers ownership of the splits wallet
     * @param _newOwner The new owner address
     */
    function transferSplitOwnership(address _newOwner) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_newOwner != address(0), "Invalid owner address");
        splitsWallet.transferOwnership(_newOwner);
        emit SplitOwnershipTransferred(_newOwner);
    }

    /**
     * @notice Sets the paused status of the splits wallet
     * @param _paused Whether to pause or unpause the wallet
     */
    function setSplitPaused(bool _paused) external onlyOwner {
        require(address(splitsWallet) != address(0), "Splits address not set");
        splitsWallet.setPaused(_paused);
        emit SplitPausedStatusChanged(_paused);
    }

    /**
     * @notice Executes arbitrary calls through the splits wallet
     * @param _calls Array of calls to execute
     * @return blockNumber The block number when calls were executed
     * @return returnData Array of return data from each call
     */
    function execCalls(
        ISplitWalletV2.Call[] calldata _calls
    ) external payable onlyOwner returns (uint256 blockNumber, bytes[] memory returnData) {
        require(address(splitsWallet) != address(0), "Splits address not set");
        require(_calls.length > 0, "No calls provided");

        (blockNumber, returnData) = splitsWallet.execCalls(_calls);
        emit ArbitraryCallsExecuted(_calls.length);

        return (blockNumber, returnData);
    }

    /**
     * @notice Gets the split balance for a specific token
     * @param _token The token address to check
     * @return splitBalance The token balance in the split wallet
     * @return warehouseBalance The token balance in the warehouse
     */
    function getSplitBalance(address _token) external view returns (uint256 splitBalance, uint256 warehouseBalance) {
        require(address(splitsWallet) != address(0), "Splits address not set");
        return splitsWallet.getSplitBalance(_token);
    }

    /**
     * @notice Gets the current owner of the splits wallet
     * @return The owner address of the splits wallet
     */
    function getSplitOwner() external view returns (address) {
        require(address(splitsWallet) != address(0), "Splits address not set");
        return splitsWallet.owner();
    }

    /**
     * @notice Gets the paused status of the splits wallet
     * @return Whether the splits wallet is paused
     */
    function getSplitPaused() external view returns (bool) {
        require(address(splitsWallet) != address(0), "Splits address not set");
        return splitsWallet.paused();
    }

    /**
     * @notice Gets the current split hash
     * @return The current split hash
     */
    function getSplitHash() external view returns (bytes32) {
        require(address(splitsWallet) != address(0), "Splits address not set");
        return splitsWallet.splitHash();
    }

    /**
     * @notice Gets all registered L2 chain IDs
     * @return Array of registered chain IDs
     */
    function getRegisteredChainIds() external view returns (uint256[] memory) {
        return registeredChainIds;
    }

    /**
     * @notice Gets the number of registered L2 modules
     * @return The count of registered L2 modules
     */
    function getL2ModuleCount() external view returns (uint256) {
        return registeredChainIds.length;
    }

    /**
     * @notice Checks if an L2 module is registered for a given chain ID
     * @param _chainId The chain ID to check
     * @return True if a module is registered for the chain ID
     */
    function isL2ModuleRegistered(uint256 _chainId) external view returns (bool) {
        return address(l2Modules[_chainId]) != address(0);
    }
}
