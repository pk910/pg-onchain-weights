#!/bin/bash

echo "=========================================="
echo "PGWeights Contract - Quick Setup"
echo "=========================================="

# Parse arguments
MEMBER_COUNT=185
USE_REAL_DATA=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--count)
            MEMBER_COUNT="$2"
            shift 2
            ;;
        --real-data)
            USE_REAL_DATA=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./setup.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -n, --count N      Generate N test members (default: 185)"
            echo "  --real-data        Use real pgdata.txt if available"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./setup.sh              # Generate 185 test members"
            echo "  ./setup.sh -n 500       # Generate 500 test members"
            echo "  ./setup.sh --real-data  # Use real data"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run './setup.sh --help' for usage"
            exit 1
            ;;
    esac
done

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Check for Python3
if ! command -v python3 &> /dev/null; then
    echo "✗ Python3 not found. Please install Python3 first."
    exit 1
fi

echo "✓ Python3 found: $(python3 --version)"

# Create test_data directory
mkdir -p test_data

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Compile contract
echo ""
echo "Compiling contract..."
npm run compile

# Generate or use test data
echo ""
if [ "$USE_REAL_DATA" = true ] && [ -f "pgdata.txt" ]; then
    echo "Using real pgdata.txt..."
    cp pgdata.txt test_data/pgdata.txt
    echo "✓ Copied pgdata.txt to test_data/"
else
    echo "Generating test data ($MEMBER_COUNT members)..."
    python3 test_data/generate_test_data.py $MEMBER_COUNT test_data/pgdata.txt
    echo "✓ Test data generated"
fi

# Generate import data
echo ""
echo "Generating batched import hex data..."
if [ -f "test_data/pgdata.txt" ]; then
    python3 test_data/pgdata_to_import.py test_data/pgdata.txt 2>/dev/null > test_data/import_data.hex

    if [ $? -eq 0 ]; then
        # Count batches (hex lines only)
        BATCH_COUNT=$(wc -l < test_data/import_data.hex)
        echo "✓ import_data.hex generated"
        echo "  → Batches: $BATCH_COUNT (max 250 members per batch)"

        # Calculate total members from all batches
        TOTAL_CHARS=0
        while IFS= read -r line; do
            LINE_LEN=${#line}
            TOTAL_CHARS=$((TOTAL_CHARS + LINE_LEN - 2))  # -2 for "0x" prefix
        done < test_data/import_data.hex
        MEMBER_COUNT_CALC=$(( $TOTAL_CHARS / 54 ))
        echo "  → Total members encoded: $MEMBER_COUNT_CALC"
    else
        echo "✗ Failed to generate import_data.hex"
        exit 1
    fi
else
    echo "✗ test_data/pgdata.txt not found"
    exit 1
fi

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Test data location:"
echo "  test_data/pgdata.txt       - Member data"
echo "  test_data/import_data.hex  - Import hex data"
echo ""
echo "Quick commands:"
echo "  npm run demo              - Deploy, import & calculate (2025-11)"
echo "  CUTOFF=2024-06 npm run demo - Custom cutoff date"
echo "  npm run deploy            - Deploy contract only"
echo "  npm run compile           - Recompile contract"
echo "  npm test                  - Run test suite"
echo ""
echo "Generate new test data:"
echo "  ./setup.sh -n 500          - Generate 500 members"
echo "  python3 test_data/generate_test_data.py 100"
echo ""
echo "Ready to go! Run: npm run demo"
echo "=========================================="
