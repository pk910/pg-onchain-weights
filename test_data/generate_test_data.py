#!/usr/bin/env python3
"""
Generate random test data for PGWeights contract

Parameters:
- n: number of members (default: 185)
- 60% in upper 60 months (recent members)
- 90% full-time (100), 10% part-time (50)
- 10% with months on break 1-9, rest 0
"""

import random
import sys
from datetime import datetime, timedelta

def generate_random_address():
    """Generate a random Ethereum address"""
    return "0x" + ''.join(random.choices('0123456789abcdef', k=40))

def generate_test_data(n=185, output_file="test_data/pgdata.txt"):
    """Generate n random member entries"""

    # Current date
    now = datetime.now()

    # Date range: 10 years ago to now
    ten_years_ago = now - timedelta(days=365*10)

    members = []

    for i in range(n):
        # Generate random address
        address = generate_random_address()

        # Determine if member is in upper 60 months (60% chance)
        if random.random() < 0.6:
            # Upper 60 months (recent member)
            # Random date within last 5 years
            days_ago = random.randint(0, 60*30)  # Approximately 60 months
            join_date = now - timedelta(days=days_ago)
        else:
            # Older member (40% chance)
            # Random date between 5-10 years ago
            days_ago = random.randint(60*30, 365*10)
            join_date = now - timedelta(days=days_ago)

        # Format as YYYY-MM-DD
        join_date_str = join_date.strftime("%Y-%m-%d")

        # Weight: 90% full-time (100), 10% part-time (50)
        weight = 100 if random.random() < 0.9 else 50

        # Months on break: 10% have 1-9 months, 90% have 0
        if random.random() < 0.1:
            months_on_break = random.randint(1, 9)
        else:
            months_on_break = 0

        members.append({
            'address': address,
            'join_date': join_date_str,
            'weight': weight,
            'months_on_break': months_on_break,
            'join_timestamp': join_date  # For sorting
        })

    # Sort by join date (oldest first)
    members.sort(key=lambda x: x['join_timestamp'])

    # Write to file
    with open(output_file, 'w') as f:
        for member in members:
            f.write(f"{member['address']}\t{member['join_date']}\t{member['weight']}\t{member['months_on_break']}\n")

    # Print statistics
    print(f"Generated {n} test members:")
    print(f"  Output: {output_file}")

    # Calculate statistics
    full_time = sum(1 for m in members if m['weight'] == 100)
    part_time = sum(1 for m in members if m['weight'] == 50)
    with_breaks = sum(1 for m in members if m['months_on_break'] > 0)

    # Count members in last 60 months
    cutoff_60m = now - timedelta(days=60*30)
    recent = sum(1 for m in members if m['join_timestamp'] >= cutoff_60m)

    print(f"\nStatistics:")
    print(f"  Full-time (100%):     {full_time} ({full_time/n*100:.1f}%)")
    print(f"  Part-time (50%):      {part_time} ({part_time/n*100:.1f}%)")
    print(f"  With breaks (1-9m):   {with_breaks} ({with_breaks/n*100:.1f}%)")
    print(f"  Recent (<60m):        {recent} ({recent/n*100:.1f}%)")
    print(f"  Older (60m+):         {n-recent} ({(n-recent)/n*100:.1f}%)")

    # Date range
    oldest = min(m['join_timestamp'] for m in members)
    newest = max(m['join_timestamp'] for m in members)
    print(f"\nDate range:")
    print(f"  Oldest: {oldest.strftime('%Y-%m-%d')}")
    print(f"  Newest: {newest.strftime('%Y-%m-%d')}")

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 185
    output = sys.argv[2] if len(sys.argv) > 2 else "test_data/pgdata.txt"

    generate_test_data(n, output)
