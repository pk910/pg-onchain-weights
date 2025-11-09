// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./libraries/SqrtLookup.sol";
import "./interfaces/IPGMemberRegistry.sol";
import "./access/Ownable.sol";

/**
 * @title PGWeights
 * @notice Protocol Guild member weights tracking contract
 * @dev Calculates member weights based on tenure and part-time factor
 *      Optimized storage layout: array-based with mapping index lookup
 */
contract PGMemberRegistry is IPGMemberRegistry, Ownable {
    struct Member {
        address memberAddress;      // 20 bytes
        uint16 joinYear;            //  2 bytes - year when member joined (e.g., 2024)
        uint8 joinMonth;            //  1 byte  - month when member joined (1-12)
        uint8 partTimeFactor;       //  1 bytes - 0-100 (100 = 100%, 50 = 50%)
        uint16 monthsOnBreak;       //  2 bytes - total months on leave
        bool active;                //  1 byte  - true if member is active
                                    //  5 bytes - reserve for future use
    }

    struct OrgMember {
        address memberAddress;
        uint24 fixedPercentage;     // scaled by 10000 (1000000 = 100.0000%)
        bool active;
    }

    // Member Registry Storage
    Member[] public members;                    // Primary member storage
    mapping(address => uint256) public memberIndex;  // address -> array index + 1 (0 = not found)

    OrgMember[] public orgMembers;              // Primary org member storage
    mapping(address => uint256) public orgMemberIndex;  // address -> array index + 1

    uint64 public activeMemberCount;            // Track active member count
    uint64 public activeOrgMemberCount;         // Track active org member count

    /**
     * @notice Add a new member to the protocol guild
     */
    function addMember(
        address _memberAddress,
        uint16 _joinYear,
        uint8 _joinMonth,
        uint8 _partTimeFactor
    ) external onlyOwner {
        require(_memberAddress != address(0), "Invalid address");
        require(memberIndex[_memberAddress] == 0, "Member already exists");
        require(_partTimeFactor > 0 && _partTimeFactor <= 100, "Invalid part-time factor");
        require(_joinMonth >= 1 && _joinMonth <= 12, "Invalid month");
        require(_joinYear >= 1970 && _joinYear <= 2100, "Invalid year");

        members.push(Member({
            memberAddress: _memberAddress,
            joinYear: _joinYear,
            joinMonth: _joinMonth,
            partTimeFactor: _partTimeFactor,
            monthsOnBreak: 0,
            active: true
        }));

        memberIndex[_memberAddress] = members.length; // Store index + 1
        activeMemberCount++;

        emit MemberAdded(_memberAddress, _joinYear, _joinMonth, _partTimeFactor);
    }

    /**
     * @notice Mass import members from a byte stream
     * @dev Each member entry is 27 bytes: address(20) + joinYear(2) + joinMonth(1) + partTimeFactor(1) + monthsOnBreak(2) + active(1)
     */
    function importMembers(bytes calldata _data) external onlyOwner {
        require(_data.length % 27 == 0, "Invalid data length");

        uint256 memberCount = _data.length / 27;
        uint256 offset = 0;

        for (uint256 i = 0; i < memberCount; i++) {
            address memberAddress;
            uint16 joinYear;
            uint8 joinMonth;
            uint8 partTimeFactor;
            uint16 monthsOnBreak;
            bool active;

            // Decode member data from bytes
            assembly {
                memberAddress := shr(96, calldataload(add(_data.offset, offset)))
                joinYear := shr(240, calldataload(add(add(_data.offset, offset), 20)))
                joinMonth := shr(248, calldataload(add(add(_data.offset, offset), 22)))
                partTimeFactor := shr(248, calldataload(add(add(_data.offset, offset), 23)))
                monthsOnBreak := shr(240, calldataload(add(add(_data.offset, offset), 24)))
                active := shr(248, calldataload(add(add(_data.offset, offset), 26)))
            }

            // Validate member data
            require(memberAddress != address(0), "Invalid address");
            require(memberIndex[memberAddress] == 0, "Member already exists");
            require(partTimeFactor > 0 && partTimeFactor <= 100, "Invalid part-time factor");
            require(joinMonth >= 1 && joinMonth <= 12, "Invalid month");
            require(joinYear >= 1970 && joinYear <= 2100, "Invalid year");

            members.push(Member({
                memberAddress: memberAddress,
                joinYear: joinYear,
                joinMonth: joinMonth,
                partTimeFactor: partTimeFactor,
                monthsOnBreak: monthsOnBreak,
                active: active
            }));

            memberIndex[memberAddress] = members.length; // Store index + 1
            if (active) {
                activeMemberCount++;
            }

            emit MemberAdded(memberAddress, joinYear, joinMonth, partTimeFactor);

            offset += 27;
        }
    }

    /**
     * @notice Update an existing member's details
     */
    function updateMember(
        address _memberAddress,
        uint8 _partTimeFactor,
        uint16 _monthsOnBreak,
        bool _active
    ) external onlyOwner {
        uint256 idx = memberIndex[_memberAddress];
        require(idx > 0, "Member not found");
        idx--; // Convert to 0-based index

        require(_partTimeFactor > 0 && _partTimeFactor <= 100, "Invalid part-time factor");

        Member storage member = members[idx];
        bool wasActive = member.active;

        member.partTimeFactor = _partTimeFactor;
        member.monthsOnBreak = _monthsOnBreak;
        member.active = _active;

        // Update active count
        if (wasActive && !_active) {
            activeMemberCount--;
        } else if (!wasActive && _active) {
            activeMemberCount++;
        }

        emit MemberUpdated(_memberAddress, _partTimeFactor, _monthsOnBreak);
    }

    /**
     * @notice Add an organization member with fixed percentage
     */
    function addOrgMember(
        address _memberAddress,
        uint24 _fixedPercentage
    ) external onlyOwner {
        require(_memberAddress != address(0), "Invalid address");
        require(orgMemberIndex[_memberAddress] == 0, "Org member already exists");
        require(_fixedPercentage > 0 && _fixedPercentage <= 1000000, "Invalid percentage");

        orgMembers.push(OrgMember({
            memberAddress: _memberAddress,
            fixedPercentage: _fixedPercentage,
            active: true
        }));

        orgMemberIndex[_memberAddress] = orgMembers.length; // Store index + 1
        activeOrgMemberCount++;

        emit OrgMemberAdded(_memberAddress, _fixedPercentage);
    }

    /**
     * @notice Update an organization member's fixed percentage
     */
    function updateOrgMember(
        address _memberAddress,
        uint24 _fixedPercentage,
        bool _active
    ) external onlyOwner {
        uint256 idx = orgMemberIndex[_memberAddress];
        require(idx > 0, "Org member not found");
        idx--; // Convert to 0-based index

        require(_fixedPercentage > 0 && _fixedPercentage <= 1000000, "Invalid percentage");

        OrgMember storage orgMember = orgMembers[idx];
        bool wasActive = orgMember.active;

        orgMember.fixedPercentage = _fixedPercentage;
        orgMember.active = _active;

        // Update active count
        if (wasActive && !_active) {
            activeOrgMemberCount--;
        } else if (!wasActive && _active) {
            activeOrgMemberCount++;
        }

        emit OrgMemberUpdated(_memberAddress, _fixedPercentage);
    }

    /**
     * @notice Delete an organization member
     */
    function delOrgMember(address _memberAddress) external onlyOwner {
        uint256 idx = orgMemberIndex[_memberAddress];
        require(idx > 0, "Org member not found");
        idx--; // Convert to 0-based index

        if (orgMembers[idx].active) {
            activeOrgMemberCount--;
        }

        // Swap with last element and pop
        uint256 lastIdx = orgMembers.length - 1;
        if (idx != lastIdx) {
            OrgMember memory lastMember = orgMembers[lastIdx];
            orgMembers[idx] = lastMember;
            orgMemberIndex[lastMember.memberAddress] = idx + 1; // Update moved element's index
        }

        orgMembers.pop();
        delete orgMemberIndex[_memberAddress];

        emit OrgMemberDeleted(_memberAddress);
    }

    /**
     * @notice Delete a member from the protocol guild
     */
    function delMember(address _memberAddress) external onlyOwner {
        uint256 idx = memberIndex[_memberAddress];
        require(idx > 0, "Member not found");
        idx--; // Convert to 0-based index

        if (members[idx].active) {
            activeMemberCount--;
        }

        // Swap with last element and pop
        uint256 lastIdx = members.length - 1;
        if (idx != lastIdx) {
            Member memory lastMember = members[lastIdx];
            members[idx] = lastMember;
            memberIndex[lastMember.memberAddress] = idx + 1; // Update moved element's index
        }

        members.pop();
        delete memberIndex[_memberAddress];

        emit MemberDeleted(_memberAddress);
    }

    /**
     * @notice Get detailed breakdown for a member's weight calculation
     */
    function getMemberBreakdown(
        address _memberAddress,
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) external view returns (
        uint256 monthsSinceJoin,
        uint256 activeMonths,
        uint256 weightedMonths,
        uint256 sqrtWeight
    ) {
        uint256 idx = memberIndex[_memberAddress];
        require(idx > 0, "Member not found");

        Member memory member = members[idx - 1];

        // Inline month calculation with unchecked math
        unchecked {
            if (_cutoffYear >= member.joinYear) {
                if (_cutoffYear == member.joinYear && _cutoffMonth < member.joinMonth) {
                    monthsSinceJoin = 0;
                } else {
                    monthsSinceJoin = (uint256(_cutoffYear - member.joinYear)) * 12
                                    + uint256(_cutoffMonth)
                                    - uint256(member.joinMonth);
                }
            }
            // else monthsSinceJoin = 0

            activeMonths = monthsSinceJoin > member.monthsOnBreak
                ? monthsSinceJoin - member.monthsOnBreak
                : 0;

            weightedMonths = (activeMonths * member.partTimeFactor) / 100;
        }

        sqrtWeight = _getSqrtWeight(weightedMonths);

        return (monthsSinceJoin, activeMonths, weightedMonths, sqrtWeight);
    }

    /**
     * @notice Get all active members and their weights as percentages at a specific cutoff date
     */
    function getAllWeights(
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) external view returns (
        WeightResult[] memory results,
        uint256 gasUsed
    ) {
        uint256 gasStart = gasleft();

        uint256 totalMembers = uint256(activeMemberCount) + uint256(activeOrgMemberCount);
        results = new WeightResult[](totalMembers);

        // Process org members and get remaining percentage
        uint96 remainingPercentage = _processOrgMembers(results);

        // Process regular members
        _processRegularMembers(results, activeOrgMemberCount, activeMemberCount, remainingPercentage, _cutoffYear, _cutoffMonth);

        gasUsed = gasStart - gasleft();
        return (results, gasUsed);
    }

    /**
     * @notice Process org members and add to results
     * @return remainingPercentage The percentage remaining after org allocations
     */
    function _processOrgMembers(WeightResult[] memory results) internal view returns (uint96 remainingPercentage) {
        uint96 totalOrgPercentage = 0;
        uint256 resultIndex = 0;

        uint256 orgMemberCount = orgMembers.length;
        for (uint256 i = 0; i < orgMemberCount; i++) {
            OrgMember memory orgMember = orgMembers[i];
            if (orgMember.active) {
                unchecked {
                    totalOrgPercentage += orgMember.fixedPercentage;
                }
                results[resultIndex].memberAddress = orgMember.memberAddress;
                results[resultIndex].percentage = orgMember.fixedPercentage;
                resultIndex++;
            }
        }

        require(totalOrgPercentage <= 1000000, "Org percentages exceed 100%");
        unchecked {
            remainingPercentage = 1000000 - totalOrgPercentage;
        }
    }

    /**
     * @notice Process regular members and calculate their weights
     */
    function _processRegularMembers(
        WeightResult[] memory results,
        uint256 startIndex,
        uint256 activeMembers,
        uint96 remainingPercentage,
        uint16 cutoffYear,
        uint8 cutoffMonth
    ) internal view {
        if (activeMembers == 0 || remainingPercentage == 0) return;

        uint256[] memory rawWeights = new uint256[](activeMembers);
        uint256 totalWeight = 0;
        uint256 activeIdx = 0;

        // Calculate raw weights - optimized single SLOAD per member
        for (uint256 i = 0; i < members.length; i++) {
            Member memory m = members[i];

            if (m.active) {
                uint256 wm; // weighted months

                // Inline month calculation with unchecked math
                unchecked {
                    uint256 ms = 0; // months since join
                    if (cutoffYear >= m.joinYear) {
                        if (cutoffYear == m.joinYear && cutoffMonth >= m.joinMonth) {
                            ms = uint256(cutoffMonth) - uint256(m.joinMonth);
                        } else if (cutoffYear > m.joinYear) {
                            ms = (uint256(cutoffYear - m.joinYear)) * 12 + uint256(cutoffMonth) - uint256(m.joinMonth);
                        }
                    }

                    uint256 am = ms > m.monthsOnBreak ? ms - m.monthsOnBreak : 0; // active months
                    wm = (am * m.partTimeFactor) / 100;
                }

                uint256 sw = _getSqrtWeight(wm);
                rawWeights[activeIdx] = sw;
                unchecked { totalWeight += sw; }
                results[startIndex + activeIdx].memberAddress = m.memberAddress;
                unchecked { activeIdx++; }
            }
        }

        // Convert raw weights to percentages
        if (totalWeight > 0) {
            unchecked {
                for (uint256 i = 0; i < activeMembers; i++) {
                    results[startIndex + i].percentage = uint96((rawWeights[i] * remainingPercentage) / totalWeight);
                }
            }
        }
    }

    /**
     * @notice Get the total number of active members
     */
    function getActiveMemberCount() external view returns (uint256) {
        return activeMemberCount;
    }

    /**
     * @notice Get the total number of active org members
     */
    function getActiveOrgMemberCount() external view returns (uint256) {
        return activeOrgMemberCount;
    }

    /**
     * @notice Get member details by address
     */
    function getMember(address _memberAddress) external view returns (
        address memberAddress,
        uint16 joinYear,
        uint8 joinMonth,
        uint8 partTimeFactor,
        uint16 monthsOnBreak,
        bool active
    ) {
        uint256 idx = memberIndex[_memberAddress];
        require(idx > 0, "Member not found");

        Member memory member = members[idx - 1];
        return (
            member.memberAddress,
            member.joinYear,
            member.joinMonth,
            member.partTimeFactor,
            member.monthsOnBreak,
            member.active
        );
    }

    /**
     * @notice Get org member details by address
     */
    function getOrgMember(address _memberAddress) external view returns (
        address memberAddress,
        uint96 fixedPercentage,
        bool active
    ) {
        uint256 idx = orgMemberIndex[_memberAddress];
        require(idx > 0, "Org member not found");

        OrgMember memory orgMember = orgMembers[idx - 1];
        return (
            orgMember.memberAddress,
            orgMember.fixedPercentage,
            orgMember.active
        );
    }

    /**
     * @notice Get sqrt weight using lookup table or on-demand calculation
     * @dev Uses SqrtLookup library for values 1-100, computes for values > 100
     */
    function _getSqrtWeight(uint256 wm) internal pure returns (uint256) {
        if (wm == 0) return 0;
        if (wm <= SqrtLookup.MAX_LOOKUP) return SqrtLookup.getSqrt(wm); // this is ultra hacky, but way more gas efficient than calculating sqrt on the fly
        return sqrt(wm * 1e12);
    }

    /**
     * @notice Babylonian method for square root calculation
     * @dev Gas-efficient square root for uint256
     */
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        uint256 y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }

        return y;
    }
}
