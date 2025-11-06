#!/usr/bin/env python3
"""
Convert tab-delimited member data to batched hex payloads for importMembers function
Format: address<TAB>YYYY-MM-DD<TAB>weight<TAB>months-on-leave
Output: One hex payload per line (max 250 members per batch)
"""

import sys
import re

BATCH_SIZE = 250

def convert_to_hex_batch(members):
    """Convert a batch of members to a single hex string"""
    hex_parts = []

    for member in members:
        address, join_date, weight, months_on_leave = member

        # Remove 0x prefix if present
        address = address.replace('0x', '').strip().lower()

        # Validate address length
        if len(address) != 40:
            raise ValueError(f"Invalid address length: {address} (expected 40 hex chars)")

        # Parse join date (YYYY-MM-DD)
        parts = join_date.split('-')
        if len(parts) != 3:
            raise ValueError(f"Invalid date format: {join_date}")

        join_year = int(parts[0])
        join_month = int(parts[1])

        # Validate year and month
        if not (1970 <= join_year <= 2100):
            raise ValueError(f"Invalid year: {join_year} (must be 1970-2100)")
        if not (1 <= join_month <= 12):
            raise ValueError(f"Invalid month: {join_month} (must be 1-12)")

        # Parse weight (part-time factor)
        weight = int(weight)
        if not (0 <= weight <= 100):
            raise ValueError(f"Invalid weight: {weight} (must be 0-100)")

        # Parse months on leave
        months_on_leave = int(months_on_leave)
        if not (0 <= months_on_leave <= 65535):
            raise ValueError(f"Invalid months on leave: {months_on_leave} (must be 0-65535)")

        # Convert to hex (padded)
        # Address: 20 bytes (already hex)
        addr_hex = address

        # Join year: 2 bytes (uint16, big-endian)
        year_hex = f"{join_year:04x}"

        # Join month: 1 byte (uint8)
        month_hex = f"{join_month:02x}"

        # Part-time factor: 1 byte (uint8)
        part_time_hex = f"{weight:02x}"

        # Months on break: 2 bytes (uint16, big-endian)
        months_break_hex = f"{months_on_leave:04x}"

        # Active: 1 byte (bool, default true = 1)
        active_hex = "01"

        # Concatenate all fields (27 bytes total)
        member_hex = f"{addr_hex}{year_hex}{month_hex}{part_time_hex}{months_break_hex}{active_hex}"
        hex_parts.append(member_hex)

    return "0x" + "".join(hex_parts)

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 pgdata_to_import.py <data_file>", file=sys.stderr)
        print("Format: address<TAB>YYYY-MM-DD<TAB>weight<TAB>months-on-leave", file=sys.stderr)
        sys.exit(1)

    data_file = sys.argv[1]

    # Read and parse all members
    members = []

    try:
        with open(data_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()

                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue

                # Parse tab-delimited fields
                parts = line.split('\t')
                if len(parts) != 4:
                    print(f"Warning: Skipping line {line_num} (expected 4 fields, got {len(parts)})", file=sys.stderr)
                    continue

                address, join_date, weight, months_on_leave = parts

                # Skip entries with dashes (org members or invalid)
                if join_date == '-':
                    print(f"Skipping org member: {address}", file=sys.stderr)
                    continue

                members.append((address, join_date, weight, months_on_leave))

    except FileNotFoundError:
        print(f"Error: File {data_file} not found", file=sys.stderr)
        sys.exit(1)

    if not members:
        print("Error: No valid members found in input file", file=sys.stderr)
        sys.exit(1)

    # Batch members and output one hex string per line
    total_batches = (len(members) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"# Processing {len(members)} members in {total_batches} batch(es) of up to {BATCH_SIZE} members each", file=sys.stderr)

    for i in range(0, len(members), BATCH_SIZE):
        batch = members[i:i+BATCH_SIZE]
        hex_payload = convert_to_hex_batch(batch)
        print(hex_payload)
        print(f"# Batch {i//BATCH_SIZE + 1}: {len(batch)} members, {len(hex_payload)} characters", file=sys.stderr)

if __name__ == "__main__":
    main()
