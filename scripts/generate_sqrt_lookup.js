const fs = require('fs');
const path = require('path');

/**
 * Configurable lookup table size
 *
 * Change this constant to adjust the sqrt lookup table size.
 * Larger values = more pre-computed values = larger contract size but faster for high values
 * Smaller values = smaller contract size but may compute sqrt on-the-fly more often
 *
 * Recommended: 100 (max ~7 comparisons, covers typical member tenures)
 * Max practical: ~200 (max ~8 comparisons)
 */
const SQRT_TABLE_SIZE = 100;

// Generate sqrt values for 1-SQRT_TABLE_SIZE
function generateSqrtValues(tableSize) {
  const values = [];
  for (let i = 1; i <= tableSize; i++) {
    const sqrtValue = Math.floor(Math.sqrt(i * 1e12));
    values.push({ index: i, value: sqrtValue });
  }
  return values;
}

// Generate binary search tree code
function generateBinarySearchTree(values, indent = '        ') {
  if (values.length === 0) return '';
  if (values.length === 1) {
    return `${indent}return ${values[0].value};`;
  }

  const mid = Math.floor(values.length / 2);
  const midValue = values[mid];
  const left = values.slice(0, mid);
  const right = values.slice(mid + 1);

  let code = '';

  if (left.length > 0) {
    if (left.length === 1) {
      code += `${indent}if (wm == ${left[0].index}) return ${left[0].value};\n`;
    } else {
      const leftMid = left[Math.floor(left.length / 2)];
      code += `${indent}if (wm <= ${leftMid.index}) {\n`;
      code += generateBinarySearchTree(left, indent + '    ');
      code += `\n${indent}}\n`;
    }
  }

  if (right.length > 0) {
    if (right.length === 1) {
      code += `${indent}if (wm == ${right[0].index}) return ${right[0].value};\n`;
    } else if (right.length === 2) {
      code += `${indent}if (wm == ${right[0].index}) return ${right[0].value};\n`;
      code += `${indent}if (wm == ${right[1].index}) return ${right[1].value};\n`;
    } else {
      const rightMid = right[Math.floor(right.length / 2)];
      code += `${indent}if (wm <= ${rightMid.index}) {\n`;
      code += generateBinarySearchTree(right, indent + '    ');
      code += `\n${indent}}\n`;
    }
  }

  code += `${indent}return ${midValue.value}; // ${midValue.index}`;

  return code;
}

// Generate compact binary search (single-line style)
function generateCompactBinarySearch(values, depth = 0) {
  if (values.length === 0) return '';
  if (values.length === 1) {
    return `return ${values[0].value}`;
  }
  if (values.length === 2) {
    return `if (wm == ${values[0].index}) return ${values[0].value}; return ${values[1].value}`;
  }
  if (values.length === 3) {
    return `if (wm == ${values[0].index}) return ${values[0].value}; if (wm == ${values[1].index}) return ${values[1].value}; return ${values[2].value}`;
  }

  const mid = Math.floor(values.length / 2);
  const splitPoint = values[mid].index;
  const left = values.slice(0, mid);
  const right = values.slice(mid);

  const indent = '        ' + '    '.repeat(depth);
  const innerIndent = '        ' + '    '.repeat(depth + 1);

  let code = `if (wm <= ${splitPoint}) {\n`;

  // Left subtree
  if (left.length <= 3) {
    code += `${innerIndent}${generateCompactBinarySearch(left, depth + 1)};\n`;
  } else {
    code += `${innerIndent}${generateCompactBinarySearch(left, depth + 1)}\n`;
  }

  code += `${indent}}`;

  // Right subtree (else)
  if (right.length > 0) {
    code += `\n${indent}`;
    if (right.length <= 3) {
      code += `${generateCompactBinarySearch(right, depth + 1)}; `;
    } else {
      code += `${generateCompactBinarySearch(right, depth + 1)}`;
    }
  }

  return code;
}

// Generate formatted binary search tree with proper indentation
function generateOptimizedTree(values, indent = '        ') {
  if (values.length === 0) return '';

  if (values.length === 1) {
    // Single value - add comment since no explicit if check
    return `${indent}/* wm == ${values[0].index} */ return ${values[0].value};`;
  }

  if (values.length === 2) {
    // First has explicit if, second doesn't
    return `${indent}if (wm == ${values[0].index}) return ${values[0].value};\n${indent}/* wm == ${values[1].index} */ return ${values[1].value};`;
  }

  if (values.length === 3) {
    // First two have explicit ifs, third doesn't
    return `${indent}if (wm == ${values[0].index}) return ${values[0].value};\n${indent}if (wm == ${values[1].index}) return ${values[1].value};\n${indent}/* wm == ${values[2].index} */ return ${values[2].value};`;
  }

  const mid = Math.floor(values.length / 2);
  const splitPoint = values[mid - 1].index; // Split just before mid
  const left = values.slice(0, mid);
  const right = values.slice(mid);

  let code = `${indent}if (wm <= ${splitPoint}) {\n`;
  code += generateOptimizedTree(left, indent + '    ');
  code += `\n${indent}}`;

  // Right subtree
  if (right.length > 0) {
    code += '\n';
    code += generateOptimizedTree(right, indent);
  }

  return code;
}

function main() {
  console.log('Generating sqrt lookup table...\n');
  console.log(`Table size: ${SQRT_TABLE_SIZE}\n`);

  const values = generateSqrtValues(SQRT_TABLE_SIZE);
  console.log(`Generated ${values.length} sqrt values\n`);

  const maxDepth = Math.ceil(Math.log2(SQRT_TABLE_SIZE));

  // Generate the Solidity contract
  const contractCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SqrtLookup
 * @notice Pre-computed sqrt lookup table for weighted months 1-${SQRT_TABLE_SIZE}
 * @dev Auto-generated by scripts/generate_sqrt_lookup.js
 *      Binary search tree with max ${maxDepth} comparisons for O(log n) lookup
 */
library SqrtLookup {
    /// @notice Maximum value supported by lookup table
    uint256 internal constant MAX_LOOKUP = ${SQRT_TABLE_SIZE};

    /**
     * @notice Get sqrt weight for weighted months 1-${SQRT_TABLE_SIZE}
     * @dev Uses balanced binary search tree for O(log n) lookup
     * @param wm Weighted months (1-${SQRT_TABLE_SIZE})
     * @return Sqrt value scaled by 1e6 (6 decimals)
     */
    function getSqrt(uint256 wm) internal pure returns (uint256) {
        require(wm > 0 && wm <= MAX_LOOKUP, "Value out of range");

        // Binary search tree: max ${maxDepth} comparisons
${generateOptimizedTree(values)}
    }
}
`;

  // Write to file
  const outputPath = path.join(__dirname, '../contracts/SqrtLookup.sol');
  fs.writeFileSync(outputPath, contractCode);

  console.log('✓ Generated contracts/SqrtLookup.sol');
  console.log(`  Table size: ${SQRT_TABLE_SIZE}`);
  console.log(`  Max comparisons: ${maxDepth}`);
  console.log('\nUsage in contract:');
  console.log('  import "./SqrtLookup.sol";');
  console.log('  if (wm <= SqrtLookup.MAX_LOOKUP) {');
  console.log('      return SqrtLookup.getSqrt(wm);');
  console.log('  }');
}

main();
