// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title PGWeights
 * @notice Protocol Guild member weights tracking contract
 * @dev Calculates member weights based on tenure and part-time factor
 */
contract PGWeights {
    struct Member {
        address memberAddress;
        uint16 joinYear;            // year when member joined (e.g., 2024)
        uint8 joinMonth;            // month when member joined (1-12)
        uint8 partTimeFactor;       // 0-100 (100 = 100%, 50 = 50%)
        uint16 monthsOnBreak;       // total months on leave
        bool active;
    }

    struct WeightResult {
        address memberAddress;      // 20 bytes
        uint96 percentage;          // 12 bytes - scaled by 10000 (1000000 = 100.0000%)
    }

    struct OrgMember {
        address memberAddress;
        uint96 fixedPercentage;     // scaled by 10000 (1000000 = 100.0000%)
        bool active;
    }

    // Member storage
    mapping(address => Member) public members;
    address[] public memberList;

    // Org member storage
    mapping(address => OrgMember) public orgMembers;
    address[] public orgMemberList;

    // Access control
    address public owner;
    mapping(address => bool) public managers;

    // Events
    event MemberAdded(address indexed memberAddress, uint16 joinYear, uint8 joinMonth, uint8 partTimeFactor);
    event MemberUpdated(address indexed memberAddress, uint8 partTimeFactor, uint16 monthsOnBreak);
    event MemberDeleted(address indexed memberAddress);
    event OrgMemberAdded(address indexed memberAddress, uint96 fixedPercentage);
    event OrgMemberUpdated(address indexed memberAddress, uint96 fixedPercentage);
    event OrgMemberDeleted(address indexed memberAddress);
    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyManagerOrOwner() {
        require(msg.sender == owner || managers[msg.sender], "Only manager or owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Add a manager who can perform CRUD operations
     */
    function addManager(address _manager) external onlyOwner {
        managers[_manager] = true;
        emit ManagerAdded(_manager);
    }

    /**
     * @notice Remove a manager
     */
    function removeManager(address _manager) external onlyOwner {
        managers[_manager] = false;
        emit ManagerRemoved(_manager);
    }

    /**
     * @notice Add a new member to the protocol guild
     * @param _memberAddress The member's address
     * @param _joinYear Year when member joined (e.g., 2024)
     * @param _joinMonth Month when member joined (1-12)
     * @param _partTimeFactor Part-time factor 0-100 (100 = 100%, 50 = 50%)
     */
    function addMember(
        address _memberAddress,
        uint16 _joinYear,
        uint8 _joinMonth,
        uint8 _partTimeFactor
    ) external onlyManagerOrOwner {
        require(_memberAddress != address(0), "Invalid address");
        require(members[_memberAddress].memberAddress == address(0), "Member already exists");
        require(_partTimeFactor > 0 && _partTimeFactor <= 100, "Invalid part-time factor");
        require(_joinMonth >= 1 && _joinMonth <= 12, "Invalid month");
        require(_joinYear >= 1970 && _joinYear <= 2100, "Invalid year");

        members[_memberAddress] = Member({
            memberAddress: _memberAddress,
            joinYear: _joinYear,
            joinMonth: _joinMonth,
            partTimeFactor: _partTimeFactor,
            monthsOnBreak: 0,
            active: true
        });

        memberList.push(_memberAddress);
        emit MemberAdded(_memberAddress, _joinYear, _joinMonth, _partTimeFactor);
    }

    /**
     * @notice Mass import members from a byte stream
     * @dev Each member entry is 27 bytes: address(20) + joinYear(2) + joinMonth(1) + partTimeFactor(1) + monthsOnBreak(2) + active(1)
     * @param _data Byte stream containing packed member data
     */
    function importMembers(bytes calldata _data) external onlyManagerOrOwner {
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
                // Load address (20 bytes)
                memberAddress := shr(96, calldataload(add(_data.offset, offset)))

                // Load joinYear (2 bytes at offset 20)
                joinYear := shr(240, calldataload(add(add(_data.offset, offset), 20)))

                // Load joinMonth (1 byte at offset 22)
                joinMonth := shr(248, calldataload(add(add(_data.offset, offset), 22)))

                // Load partTimeFactor (1 byte at offset 23)
                partTimeFactor := shr(248, calldataload(add(add(_data.offset, offset), 23)))

                // Load monthsOnBreak (2 bytes at offset 24)
                monthsOnBreak := shr(240, calldataload(add(add(_data.offset, offset), 24)))

                // Load active (1 byte at offset 26)
                active := shr(248, calldataload(add(add(_data.offset, offset), 26)))
            }

            // Validate member data
            require(memberAddress != address(0), "Invalid address");
            require(members[memberAddress].memberAddress == address(0), "Member already exists");
            require(partTimeFactor > 0 && partTimeFactor <= 100, "Invalid part-time factor");
            require(joinMonth >= 1 && joinMonth <= 12, "Invalid month");
            require(joinYear >= 1970 && joinYear <= 2100, "Invalid year");

            // Add member
            members[memberAddress] = Member({
                memberAddress: memberAddress,
                joinYear: joinYear,
                joinMonth: joinMonth,
                partTimeFactor: partTimeFactor,
                monthsOnBreak: monthsOnBreak,
                active: active
            });

            memberList.push(memberAddress);
            emit MemberAdded(memberAddress, joinYear, joinMonth, partTimeFactor);

            offset += 27;
        }
    }

    /**
     * @notice Update an existing member's details
     * @param _memberAddress The member's address
     * @param _partTimeFactor New part-time factor 0-100
     * @param _monthsOnBreak New months on break count
     * @param _active Whether the member is currently active (false for temporary leave)
     */
    function updateMember(
        address _memberAddress,
        uint8 _partTimeFactor,
        uint16 _monthsOnBreak,
        bool _active
    ) external onlyManagerOrOwner {
        require(members[_memberAddress].memberAddress != address(0), "Member not found");
        require(_partTimeFactor > 0 && _partTimeFactor <= 100, "Invalid part-time factor");

        members[_memberAddress].partTimeFactor = _partTimeFactor;
        members[_memberAddress].monthsOnBreak = _monthsOnBreak;
        members[_memberAddress].active = _active;

        emit MemberUpdated(_memberAddress, _partTimeFactor, _monthsOnBreak);
    }

    /**
     * @notice Add an organization member with fixed percentage
     * @param _memberAddress The member's address
     * @param _fixedPercentage Fixed percentage scaled by 10000 (50000 = 5.0000%)
     */
    function addOrgMember(
        address _memberAddress,
        uint96 _fixedPercentage
    ) external onlyManagerOrOwner {
        require(_memberAddress != address(0), "Invalid address");
        require(orgMembers[_memberAddress].memberAddress == address(0), "Org member already exists");
        require(_fixedPercentage > 0 && _fixedPercentage <= 1000000, "Invalid percentage");

        orgMembers[_memberAddress] = OrgMember({
            memberAddress: _memberAddress,
            fixedPercentage: _fixedPercentage,
            active: true
        });

        orgMemberList.push(_memberAddress);
        emit OrgMemberAdded(_memberAddress, _fixedPercentage);
    }

    /**
     * @notice Update an organization member's fixed percentage
     * @param _memberAddress The member's address
     * @param _fixedPercentage New fixed percentage scaled by 10000
     * @param _active Whether the org member is active
     */
    function updateOrgMember(
        address _memberAddress,
        uint96 _fixedPercentage,
        bool _active
    ) external onlyManagerOrOwner {
        require(orgMembers[_memberAddress].memberAddress != address(0), "Org member not found");
        require(_fixedPercentage > 0 && _fixedPercentage <= 1000000, "Invalid percentage");

        orgMembers[_memberAddress].fixedPercentage = _fixedPercentage;
        orgMembers[_memberAddress].active = _active;

        emit OrgMemberUpdated(_memberAddress, _fixedPercentage);
    }

    /**
     * @notice Delete an organization member
     * @param _memberAddress The member's address
     */
    function delOrgMember(address _memberAddress) external onlyManagerOrOwner {
        require(orgMembers[_memberAddress].memberAddress != address(0), "Org member not found");

        orgMembers[_memberAddress].memberAddress = address(0);
        orgMembers[_memberAddress].active = false;

        // Remove from orgMemberList
        for (uint256 i = 0; i < orgMemberList.length; i++) {
            if (orgMemberList[i] == _memberAddress) {
                orgMemberList[i] = orgMemberList[orgMemberList.length - 1];
                orgMemberList.pop();
                break;
            }
        }

        emit OrgMemberDeleted(_memberAddress);
    }

    /**
     * @notice Delete a member from the protocol guild
     * @param _memberAddress The member's address
     */
    function delMember(address _memberAddress) external onlyManagerOrOwner {
        require(members[_memberAddress].memberAddress != address(0), "Member not found");

        members[_memberAddress].memberAddress = address(0);
        members[_memberAddress].active = false;

        // Remove from memberList
        for (uint256 i = 0; i < memberList.length; i++) {
            if (memberList[i] == _memberAddress) {
                memberList[i] = memberList[memberList.length - 1];
                memberList.pop();
                break;
            }
        }

        emit MemberDeleted(_memberAddress);
    }

    /**
     * @notice Calculate the raw weight for a member at a specific cutoff date
     * @dev Weight = sqrt((monthsJoined - monthsOnBreak) * partTimeFactor)
     * @param _memberAddress The member's address
     * @param _cutoffYear Cutoff year (e.g., 2025)
     * @param _cutoffMonth Cutoff month (1-12)
     * @return sqrtWeight Raw weight value scaled by 1e6 (6 decimal places)
     * @return activeMonths Effective months (total - break)
     */
    function calculateMemberWeight(
        address _memberAddress,
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) public view returns (uint256 sqrtWeight, uint256 activeMonths) {
        Member memory member = members[_memberAddress];
        require(member.memberAddress != address(0), "Member not found");
        return _calculateWeightFromMember(member, _cutoffYear, _cutoffMonth);
    }

    /**
     * @notice Get detailed breakdown for a member's weight calculation
     * @param _memberAddress The member's address
     * @param _cutoffYear Cutoff year (e.g., 2025)
     * @param _cutoffMonth Cutoff month (1-12)
     * @return monthsSinceJoin Raw months from join date to cutoff (inclusive)
     * @return activeMonths Effective months (monthsSinceJoin - monthsOnBreak)
     * @return weightedMonths Active months adjusted by part-time factor
     * @return sqrtWeight Square root weight scaled by 1e6
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
        Member memory member = members[_memberAddress];
        require(member.memberAddress != address(0), "Member not found");

        monthsSinceJoin = getMonthsDifference(
            member.joinYear,
            member.joinMonth,
            _cutoffYear,
            _cutoffMonth
        );

        activeMonths = monthsSinceJoin > member.monthsOnBreak
            ? monthsSinceJoin - member.monthsOnBreak
            : 0;

        weightedMonths = (activeMonths * member.partTimeFactor) / 100;

        sqrtWeight = sqrt(weightedMonths * 1e12);

        return (monthsSinceJoin, activeMonths, weightedMonths, sqrtWeight);
    }

    /**
     * @notice Calculate weight from a Member struct already in memory
     * @dev Internal helper to avoid duplicate storage reads
     */
    function _calculateWeightFromMember(
        Member memory member,
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) internal pure returns (uint256 sqrtWeight, uint256 activeMonths) {
        // Calculate months since joining (inclusive on both ends)
        uint256 monthsSinceJoin = getMonthsDifference(
            member.joinYear,
            member.joinMonth,
            _cutoffYear,
            _cutoffMonth
        );

        // Ensure we don't go negative
        activeMonths = monthsSinceJoin > member.monthsOnBreak
            ? monthsSinceJoin - member.monthsOnBreak
            : 0;

        // Calculate: effectiveMonths * partTimeFactor (0-100)
        uint256 weightedMonths = (activeMonths * member.partTimeFactor) / 100;

        // Return square root with 6 decimal places and active months
        // Scale by 1e12 before sqrt to get 1e6 precision (6 decimals)
        sqrtWeight = sqrt(weightedMonths * 1e12);
        return (sqrtWeight, activeMonths);
    }

    /**
     * @notice Calculate number of months between two year/month dates (inclusive)
     * @param fromYear Starting year
     * @param fromMonth Starting month (1-12)
     * @param toYear Ending year
     * @param toMonth Ending month (1-12)
     * @return Number of months (inclusive on both ends)
     */
    function getMonthsDifference(
        uint16 fromYear,
        uint8 fromMonth,
        uint16 toYear,
        uint8 toMonth
    ) internal pure returns (uint256) {
        // If cutoff is before join date, return 0
        if (toYear < fromYear || (toYear == fromYear && toMonth < fromMonth)) {
            return 0;
        }

        // Calculate total months difference
        int256 totalMonths = int256(uint256(toYear - fromYear)) * 12 + int256(uint256(toMonth)) - int256(uint256(fromMonth));

        // Add 1 to make both ends inclusive
        return totalMonths >= 0 ? uint256(totalMonths) : 0;
    }

    /**
     * @notice Get all active members and their weights as percentages at a specific cutoff date
     * @param _cutoffYear Cutoff year (e.g., 2025)
     * @param _cutoffMonth Cutoff month (1-12)
     * @return results Array of WeightResult structs (address + percentage)
     * @return gasUsed Total gas consumed by the function
     */
    function getAllWeights(
        uint16 _cutoffYear,
        uint8 _cutoffMonth
    ) external view returns (
        WeightResult[] memory results,
        uint256 gasUsed
    ) {
        uint256 gasStart = gasleft();

        // Count active members
        (uint256 activeMemberCount, uint256 activeOrgCount) = _countActiveMembers();

        results = new WeightResult[](activeMemberCount + activeOrgCount);

        // Process org members and get remaining percentage
        uint96 remainingPercentage = _processOrgMembers(results);

        // Process regular members
        _processRegularMembers(results, activeOrgCount, activeMemberCount, remainingPercentage, _cutoffYear, _cutoffMonth);

        gasUsed = gasStart - gasleft();
        return (results, gasUsed);
    }

    /**
     * @notice Count active members and org members
     */
    function _countActiveMembers() internal view returns (uint256 activeMemberCount, uint256 activeOrgCount) {
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].active) {
                activeMemberCount++;
            }
        }
        for (uint256 i = 0; i < orgMemberList.length; i++) {
            if (orgMembers[orgMemberList[i]].active) {
                activeOrgCount++;
            }
        }
    }

    /**
     * @notice Process org members and add to results
     * @return remainingPercentage The percentage remaining after org allocations
     */
    function _processOrgMembers(WeightResult[] memory results) internal view returns (uint96 remainingPercentage) {
        uint96 totalOrgPercentage = 0;
        uint256 index = 0;

        // Calculate total and add org members
        for (uint256 i = 0; i < orgMemberList.length; i++) {
            if (orgMembers[orgMemberList[i]].active) {
                totalOrgPercentage += orgMembers[orgMemberList[i]].fixedPercentage;
                results[index].memberAddress = orgMemberList[i];
                results[index].percentage = orgMembers[orgMemberList[i]].fixedPercentage;
                index++;
            }
        }

        require(totalOrgPercentage <= 1000000, "Org percentages exceed 100%");
        remainingPercentage = 1000000 - totalOrgPercentage;
    }

    /**
     * @notice Process regular members and calculate their weights
     */
    function _processRegularMembers(
        WeightResult[] memory results,
        uint256 startIndex,
        uint256 memberCount,
        uint96 remainingPercentage,
        uint16 cutoffYear,
        uint8 cutoffMonth
    ) internal view {
        if (memberCount == 0 || remainingPercentage == 0) return;

        uint256[] memory rawWeights = new uint256[](memberCount);
        uint256[] memory sqrtCache = new uint256[](101); // Sqrt cache for weighted months 0-100
        uint256 totalWeight = 0;

        // Calculate raw weights with lazy sqrt caching
        totalWeight = _calculateRawWeights(
            rawWeights,
            sqrtCache,
            results,
            startIndex,
            cutoffYear,
            cutoffMonth
        );

        // Convert raw weights to percentages
        if (totalWeight > 0) {
            for (uint256 i = 0; i < memberCount; i++) {
                results[startIndex + i].percentage = uint96((rawWeights[i] * remainingPercentage) / totalWeight);
            }
        }
    }

    /**
     * @notice Calculate raw weights for all active members
     * @return totalWeight Sum of all raw weights
     */
    function _calculateRawWeights(
        uint256[] memory rawWeights,
        uint256[] memory sqrtCache,
        WeightResult[] memory results,
        uint256 startIndex,
        uint16 cutoffYear,
        uint8 cutoffMonth
    ) internal view returns (uint256 totalWeight) {
        uint256 memberIndex = 0;

        for (uint256 i = 0; i < memberList.length; i++) {
            Member memory member = members[memberList[i]];

            if (member.active) {
                // Calculate weighted months
                uint256 monthsSinceJoin = getMonthsDifference(
                    member.joinYear,
                    member.joinMonth,
                    cutoffYear,
                    cutoffMonth
                );

                uint256 activeMonths = monthsSinceJoin > member.monthsOnBreak
                    ? monthsSinceJoin - member.monthsOnBreak
                    : 0;

                uint256 weightedMonths = (activeMonths * member.partTimeFactor) / 100;

                // Get sqrt weight (cached if possible)
                uint256 sqrtWeight = _getSqrtWeight(sqrtCache, weightedMonths);

                rawWeights[memberIndex] = sqrtWeight;
                totalWeight += sqrtWeight;
                results[startIndex + memberIndex].memberAddress = memberList[i];
                memberIndex++;
            }
        }
    }

    /**
     * @notice Get sqrt weight with lazy caching
     */
    function _getSqrtWeight(
        uint256[] memory sqrtCache,
        uint256 weightedMonths
    ) internal pure returns (uint256) {
        if (weightedMonths <= 100) {
            uint256 cached = sqrtCache[weightedMonths];
            if (cached == 0 && weightedMonths > 0) {
                cached = sqrt(weightedMonths * 1e12);
                sqrtCache[weightedMonths] = cached;
            }
            return cached;
        }
        return sqrt(weightedMonths * 1e12);
    }

    /**
     * @notice Get the total number of active members
     */
    function getActiveMemberCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].active) {
                count++;
            }
        }
        return count;
    }

    /**
     * @notice Get member details
     */
    function getMember(address _memberAddress) external view returns (
        address memberAddress,
        uint16 joinYear,
        uint8 joinMonth,
        uint8 partTimeFactor,
        uint16 monthsOnBreak,
        bool active
    ) {
        Member memory member = members[_memberAddress];
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
     * @notice Get org member details
     */
    function getOrgMember(address _memberAddress) external view returns (
        address memberAddress,
        uint96 fixedPercentage,
        bool active
    ) {
        OrgMember memory orgMember = orgMembers[_memberAddress];
        return (
            orgMember.memberAddress,
            orgMember.fixedPercentage,
            orgMember.active
        );
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

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
