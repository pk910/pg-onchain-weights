// Network configuration for deployment
module.exports = {
  // Sepolia (Ethereum Testnet)
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    // Add your addresses here after deployment
    memberRegistry: process.env.SEPOLIA_MEMBER_REGISTRY || "",
    splitsWallet: process.env.SEPOLIA_SPLITS_WALLET || "",
    // 0xSplits V2 Factory (update with actual deployed address)
    splitFactoryV2: process.env.SEPOLIA_SPLIT_FACTORY || "0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1",
  },

  // OP Sepolia (Optimism Testnet)
  opSepolia: {
    chainId: 11155420,
    name: "OP Sepolia",
    l1CrossDomainMessenger: "0x58Cc85b8D04EA49cC6DBd3CbFFd00B4B8D6cb3ef",
    l2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
    splitsWallet: process.env.OP_SEPOLIA_SPLITS_WALLET || "",
    splitFactoryV2: process.env.OP_SEPOLIA_SPLIT_FACTORY || "0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1",
  },

  // Base Sepolia (Base Testnet)
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    l1CrossDomainMessenger: "0xC34855F4De64F1840e5686e64278da901e261f20",
    l2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
    splitsWallet: process.env.BASE_SEPOLIA_SPLITS_WALLET || "",
    splitFactoryV2: process.env.BASE_SEPOLIA_SPLIT_FACTORY || "0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1",
  },

  // Arbitrum Sepolia (Arbitrum Testnet)
  arbSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    inbox: "0xaAe29B0366299461418F5324a79Afc425BE5ae21",
    splitsWallet: process.env.ARB_SEPOLIA_SPLITS_WALLET || "",
    splitFactoryV2: process.env.ARB_SEPOLIA_SPLIT_FACTORY || "0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1",
  },

  // Mainnet configuration (for reference)
  mainnet: {
    chainId: 1,
    name: "Ethereum",
  },

  optimism: {
    chainId: 10,
    name: "Optimism",
    l1CrossDomainMessenger: "0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1",
    l2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
  },

  base: {
    chainId: 8453,
    name: "Base",
    l1CrossDomainMessenger: "0x866E82a600A1414e583f7F13623F1aC5d58b0Afa",
    l2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
  },

  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    inbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  },
};
