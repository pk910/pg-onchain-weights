// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IPGMemberRegistry
 * @notice Interface for Protocol Guild member weights tracking contract
 */
interface IPGMemberRegistry {
    struct WeightResult {
        address memberAddress;      // 20 bytes
        uint96 percentage;          // 12 bytes - scaled by 10000 (1000000 = 100.0000%)
    }

    // Events
    event MemberAdded(address indexed memberAddress, uint16 joinYear, uint8 joinMonth, uint8 partTimeFactor);
    event MemberUpdated(address indexed memberAddress, uint8 partTimeFactor, uint16 monthsOnBreak);
    event MemberDeleted(address indexed memberAddress);
    event OrgMemberAdded(address indexed memberAddress, uint96 fixedPercentage);
    event OrgMemberUpdated(address indexed memberAddress, uint96 fixedPercentage);
    event OrgMemberDeleted(address indexed memberAddress);

    // State variable getters
    function members(uint256 index) external view returns (
        address memberAddress,
        uint16 joinYear,
        uint8 joinMonth,
        uint8 partTimeFactor,
        uint16 monthsOnBreak,
        bool active
    );

    function memberIndex(address memberAddress) external view returns (uint256);

    function orgMembers(uint256 index) external view returns (
        address memberAddress,
        uint24 fixedPercentage,
        bool active
    );

    function orgMemberIndex(address memberAddress) external view returns (uint256);
    
    function activeMemberCount() external view returns (uint64);
    function activeOrgMemberCount() external view returns (uint64);

    // Member management functions
    function addMember(
        address _memberAddress,
        uint16 _joinYear,
        uint8 _joinMonth,
        uint8 _partTimeFactor
    ) external;

    function importMembers(bytes calldata _data) external;

    function updateMember(
        address _memberAddress,
        uint8 _partTimeFactor,
        uint16 _monthsOnBreak,
        bool _active
    ) external;

    function delMember(address _memberAddress) external;

    // Organization member management functions
    function addOrgMember(
        address _memberAddress,
        uint24 _fixedPercentage
    ) external;

    function updateOrgMember(
        address _memberAddress,
        uint24 _fixedPercentage,
        bool _active
    ) external;

    function delOrgMember(address _memberAddress) external;

    // View functions
    function getMemberBreakdown(
        address _memberAddress,
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) external view returns (
        uint256 monthsSinceJoin,
        uint256 activeMonths,
        uint256 weightedMonths,
        uint256 sqrtWeight
    );

    function getAllWeights(
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) external view returns (
        WeightResult[] memory results,
        uint256 gasUsed
    );

    function getActiveMemberCount() external view returns (uint256);

    function getMember(address _memberAddress) external view returns (
        address memberAddress,
        uint16 joinYear,
        uint8 joinMonth,
        uint8 partTimeFactor,
        uint16 monthsOnBreak,
        bool active
    );

    function getOrgMember(address _memberAddress) external view returns (
        address memberAddress,
        uint96 fixedPercentage,
        bool active
    );
}
