// Comprehensive deployment plan configuration
// This file defines what to deploy (new) vs what to reuse (existing addresses)

module.exports = {
  // ========================================
  // SEPOLIA TESTNET DEPLOYMENT
  // ========================================
  sepolia: {
    // L1 Components (deployed on Sepolia)
    l1: {
      // Member Registry: set to 'deploy' for new, 'skip' to deploy later, or provide existing address '0x...'
      registry: 'deploy', // or 'deploy' or 'skip'

      // L1 Controller: set to 'deploy' for new, or provide existing address
      controller: 'deploy', // or '0x...'

      // L1 Splits wallet address (must be provided)
      splitsWallet: process.env.SEPOLIA_SPLITS_WALLET || '',
    },

    // L2 Modules & Controllers
    l2: {
      // Base Sepolia
      base: {
        enabled: true,
        // L2 Module (deployed on L1/Sepolia)
        module: 'deploy', // or '0x...'
        // L2 Controller (deployed on L2/Base Sepolia)
        controller: 'deploy', // or '0x...'
        // Splits wallet on Base Sepolia
        splitsWallet: process.env.BASE_SEPOLIA_SPLITS_WALLET || '',
      },

      // OP Sepolia
      optimism: {
        enabled: true,
        module: 'deploy', // or '0x...'
        controller: 'deploy', // or '0x...'
        splitsWallet: process.env.OP_SEPOLIA_SPLITS_WALLET || '',
      },

      // Arbitrum Sepolia
      arbitrum: {
        enabled: true,
        module: 'deploy', // or '0x...'
        controller: 'deploy', // or '0x...'
        splitsWallet: process.env.ARB_SEPOLIA_SPLITS_WALLET || '',
      },
    },
  },

  // ========================================
  // MAINNET DEPLOYMENT
  // ========================================
  mainnet: {
    l1: {
      registry: 'deploy', // or '0x...' or 'skip'
      controller: 'deploy', // or '0x...'
      splitsWallet: process.env.MAINNET_SPLITS_WALLET || '',
    },

    l2: {
      base: {
        enabled: true,
        module: 'deploy', // or '0x...'
        controller: 'deploy', // or '0x...'
        splitsWallet: process.env.BASE_SPLITS_WALLET || '',
      },

      optimism: {
        enabled: true,
        module: 'deploy', // or '0x...'
        controller: 'deploy', // or '0x...'
        splitsWallet: process.env.OPTIMISM_SPLITS_WALLET || '',
      },

      arbitrum: {
        enabled: true,
        module: 'deploy', // or '0x...'
        controller: 'deploy', // or '0x...'
        splitsWallet: process.env.ARBITRUM_SPLITS_WALLET || '',
      },
    },
  },
};
