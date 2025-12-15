// Provider manager singleton instance

import { ProviderManager } from "./ProviderManager";
import { EtherscanProvider } from "./etherscan";
import { HeliusProvider } from "./helius";
import { config } from "@/lib/config";

// Create singleton instance
export const providerManager = new ProviderManager({
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 60000, // 1 minute
  fallbackTimeout: 300000, // 5 minutes - increased for Solana token detection which scans many transactions
});

// Initialize providers
function initializeProviders() {
  try {
    // Register Etherscan provider if API key is available
    const etherscanApiKey = config.blockchain.etherscanApiKey;
    const alchemyApiKey = process.env.ALCHEMY_API_KEY;

    if (etherscanApiKey && etherscanApiKey.trim().length > 0) {
      const etherscanProvider = new EtherscanProvider(
        etherscanApiKey,
        alchemyApiKey
      );
      providerManager.registerProvider(etherscanProvider, "ethereum");
      console.log("✅ Registered Etherscan provider for Ethereum");

      // Note: Alchemy free tier doesn't support getOwnersForToken (requires Growth plan)
      // Using Etherscan Transfer events for holder counts instead
      console.log(
        "   Using Etherscan for holder counts (Transfer event reconstruction)"
      );
    } else {
      console.warn(
        "⚠️ Etherscan API key not found or empty, provider not registered"
      );
    }

    // Register Helius provider for Solana if API key is available
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (heliusApiKey && heliusApiKey.trim().length > 0) {
      const heliusProvider = new HeliusProvider(heliusApiKey);
      providerManager.registerProvider(heliusProvider, "solana");
      console.log("✅ Registered Helius provider for Solana");
    } else {
      console.warn("⚠️ Helius API key not found, Solana support disabled");
    }

    // TODO: Add other providers when available
    // const alchemyApiKey = config.blockchain.alchemyApiKey;
    // if (alchemyApiKey) {
    //   const alchemyProvider = new AlchemyProvider(alchemyApiKey);
    //   providerManager.registerProvider(alchemyProvider, 'ethereum');
    // }

    // Start health checks
    providerManager.startHealthChecks();
    console.log("✅ Provider manager initialized");
  } catch (error) {
    console.error(
      "❌ Failed to initialize providers:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

// Initialize providers on module load
initializeProviders();

// Export the configured instance
export { providerManager as default };

// Graceful shutdown handler
process.on("SIGTERM", () => {
  console.log("🛑 Shutting down provider manager...");
  providerManager.shutdown();
});

process.on("SIGINT", () => {
  console.log("🛑 Shutting down provider manager...");
  providerManager.shutdown();
});
