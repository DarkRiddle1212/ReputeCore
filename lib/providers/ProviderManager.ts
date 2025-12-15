// Provider manager for orchestrating multiple blockchain providers

import {
  BlockchainProvider,
  WalletInfo,
  TokenSummary,
  ProviderStatus,
} from "@/types";
import { BaseProvider } from "./BaseProvider";
import { logError } from "../errors";
import { BlockchainType } from "@/lib/validation";

export interface ProviderManagerConfig {
  maxRetries?: number;
  retryDelay?: number;
  healthCheckInterval?: number;
  fallbackTimeout?: number;
}

export class ProviderManager {
  private ethereumProviders: Map<string, BlockchainProvider> = new Map();
  private solanaProviders: Map<string, BlockchainProvider> = new Map();
  private providerHealth: Map<string, boolean> = new Map();
  private config: Required<ProviderManagerConfig>;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: ProviderManagerConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      healthCheckInterval: config.healthCheckInterval ?? 60000, // 1 minute
      fallbackTimeout: config.fallbackTimeout ?? 300000, // 5 minutes (increased for Solana token detection which scans many transactions)
    };
  }

  /**
   * Register a new provider for a specific blockchain
   */
  registerProvider(
    provider: BlockchainProvider,
    blockchain: BlockchainType = "ethereum"
  ): void {
    const providerMap =
      blockchain === "ethereum" ? this.ethereumProviders : this.solanaProviders;
    providerMap.set(provider.name, provider);
    this.providerHealth.set(provider.name, true); // Assume healthy initially

    console.log(
      `✅ Registered ${blockchain} provider: ${provider.name} (priority: ${provider.priority})`
    );
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerName: string, blockchain?: BlockchainType): void {
    if (blockchain) {
      const providerMap =
        blockchain === "ethereum"
          ? this.ethereumProviders
          : this.solanaProviders;
      providerMap.delete(providerName);
    } else {
      // Remove from both if blockchain not specified
      this.ethereumProviders.delete(providerName);
      this.solanaProviders.delete(providerName);
    }
    this.providerHealth.delete(providerName);

    console.log(`❌ Unregistered provider: ${providerName}`);
  }

  /**
   * Get all registered providers for a blockchain sorted by priority
   */
  getProviders(blockchain: BlockchainType = "ethereum"): BlockchainProvider[] {
    const providerMap =
      blockchain === "ethereum" ? this.ethereumProviders : this.solanaProviders;
    return Array.from(providerMap.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  /**
   * Get all providers across all blockchains
   */
  getAllProviders(): BlockchainProvider[] {
    return [
      ...Array.from(this.ethereumProviders.values()),
      ...Array.from(this.solanaProviders.values()),
    ].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get available providers (healthy and available) for a specific blockchain
   */
  async getAvailableProviders(
    blockchain: BlockchainType = "ethereum"
  ): Promise<BlockchainProvider[]> {
    const providers = this.getProviders(blockchain);
    const availableProviders: BlockchainProvider[] = [];

    for (const provider of providers) {
      try {
        const isHealthy = this.providerHealth.get(provider.name) ?? false;
        const isAvailable = isHealthy && (await provider.isAvailable());

        if (isAvailable) {
          availableProviders.push(provider);
        }
      } catch (error) {
        logError(error as Error, {
          component: "ProviderManager",
          operation: "getAvailableProviders",
          provider: provider.name,
          blockchain,
        });
        this.providerHealth.set(provider.name, false);
      }
    }

    return availableProviders;
  }

  /**
   * Get wallet information with automatic failover
   */
  async getWalletInfo(
    address: string,
    blockchain: BlockchainType = "ethereum"
  ): Promise<WalletInfo> {
    const availableProviders = await this.getAvailableProviders(blockchain);

    if (availableProviders.length === 0) {
      console.warn(
        `⚠️ No available ${blockchain} providers for wallet info retrieval`
      );
      console.warn(
        "Registered providers:",
        this.getProviders(blockchain).map((p) => p.name)
      );
      console.warn(
        "Provider health:",
        Array.from(this.providerHealth.entries())
      );
      return {
        createdAt: null,
        txCount: 0,
        age: null,
      };
    }

    let lastError: Error | null = null;

    for (const provider of availableProviders) {
      try {
        console.log(
          `🔍 [ProviderManager] Attempting to get wallet info from ${provider.name} for address: ${address}`
        );

        const result = await this.executeWithTimeout(
          () => provider.getWalletInfo(address),
          this.config.fallbackTimeout,
          `${provider.name} wallet info timeout`
        );

        console.log(
          `✅ [ProviderManager] Successfully retrieved wallet info from ${provider.name} for ${address}:`,
          {
            txCount: result.txCount,
            createdAt: result.createdAt,
            age: result.age,
          }
        );
        return result;
      } catch (error) {
        lastError = error as Error;
        logError(lastError, {
          component: "ProviderManager",
          operation: "getWalletInfo",
          provider: provider.name,
          address,
        });

        // Mark provider as unhealthy if it fails
        this.providerHealth.set(provider.name, false);

        console.warn(`⚠️ Provider ${provider.name} failed:`, lastError.message);
      }
    }

    // If all providers failed, return default values
    console.warn(
      `⚠️ All ${blockchain} providers failed for wallet info, returning defaults`
    );
    return {
      createdAt: null,
      txCount: 0,
      age: null,
    };
  }

  /**
   * Get tokens created with automatic failover
   * Supports manual token input for Ethereum (ignored for Solana)
   */
  async getTokensCreated(
    address: string,
    blockchain: BlockchainType = "ethereum",
    forceRefresh?: boolean,
    manualTokens?: string[]
  ): Promise<TokenSummary[]> {
    const availableProviders = await this.getAvailableProviders(blockchain);

    if (availableProviders.length === 0) {
      console.warn(
        `No available ${blockchain} providers for token retrieval, returning empty array`
      );
      return [];
    }

    let lastError: Error | null = null;

    for (const provider of availableProviders) {
      try {
        console.log(
          `🔍 [ProviderManager] Attempting to get tokens from ${provider.name} for address: ${address}`
        );

        const result = await this.executeWithTimeout(
          () => provider.getTokensCreated(address, forceRefresh, manualTokens),
          this.config.fallbackTimeout,
          `${provider.name} tokens timeout`
        );

        console.log(
          `✅ [ProviderManager] Successfully retrieved ${result.length} tokens from ${provider.name} for ${address}`
        );
        return result;
      } catch (error) {
        lastError = error as Error;
        logError(lastError, {
          component: "ProviderManager",
          operation: "getTokensCreated",
          provider: provider.name,
          address,
        });

        // Mark provider as unhealthy if it fails
        this.providerHealth.set(provider.name, false);

        console.warn(
          `⚠️ Provider ${provider.name} failed, trying next provider`
        );
      }
    }

    // If all providers failed, return empty array
    console.warn(
      `⚠️ All ${blockchain} providers failed for token retrieval, returning empty array`
    );
    return [];
  }

  /**
   * Get provider status for all registered providers
   */
  async getProviderStatuses(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];

    for (const provider of this.getAllProviders()) {
      try {
        const isHealthy = this.providerHealth.get(provider.name) ?? false;
        const isAvailable = isHealthy && (await provider.isAvailable());
        const rateLimit = provider.getRateLimit();

        statuses.push({
          name: provider.name,
          available: isAvailable,
          rateLimit,
        });
      } catch (error) {
        statuses.push({
          name: provider.name,
          available: false,
          rateLimit: { remaining: 0, resetTime: Date.now() },
          lastError: (error as Error).message,
        });
      }
    }

    return statuses.sort((a, b) => {
      const providerA =
        this.ethereumProviders.get(a.name) || this.solanaProviders.get(a.name);
      const providerB =
        this.ethereumProviders.get(b.name) || this.solanaProviders.get(b.name);
      return (providerA?.priority ?? 999) - (providerB?.priority ?? 999);
    });
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    console.log(
      `🏥 Started provider health checks (interval: ${this.config.healthCheckInterval}ms)`
    );
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      console.log("🛑 Stopped provider health checks");
    }
  }

  /**
   * Perform health check on all providers
   */
  private async performHealthCheck(): Promise<void> {
    console.log("🏥 Performing provider health check...");

    for (const provider of this.getAllProviders()) {
      try {
        const isAvailable = await provider.isAvailable();
        const wasHealthy = this.providerHealth.get(provider.name) ?? false;

        this.providerHealth.set(provider.name, isAvailable);

        if (!wasHealthy && isAvailable) {
          console.log(`✅ Provider ${provider.name} is now healthy`);
        } else if (wasHealthy && !isAvailable) {
          console.warn(`⚠️ Provider ${provider.name} is now unhealthy`);
        }
      } catch (error) {
        this.providerHealth.set(provider.name, false);
        logError(error as Error, {
          component: "ProviderManager",
          operation: "performHealthCheck",
          provider: provider.name,
        });
      }
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get provider by name
   */
  getProvider(
    name: string,
    blockchain?: BlockchainType
  ): BlockchainProvider | undefined {
    if (blockchain) {
      const providerMap =
        blockchain === "ethereum"
          ? this.ethereumProviders
          : this.solanaProviders;
      return providerMap.get(name);
    }
    return this.ethereumProviders.get(name) || this.solanaProviders.get(name);
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(name: string, blockchain?: BlockchainType): boolean {
    if (blockchain) {
      const providerMap =
        blockchain === "ethereum"
          ? this.ethereumProviders
          : this.solanaProviders;
      return providerMap.has(name);
    }
    return this.ethereumProviders.has(name) || this.solanaProviders.has(name);
  }

  /**
   * Get the number of registered providers
   */
  getProviderCount(blockchain?: BlockchainType): number {
    if (blockchain) {
      const providerMap =
        blockchain === "ethereum"
          ? this.ethereumProviders
          : this.solanaProviders;
      return providerMap.size;
    }
    return this.ethereumProviders.size + this.solanaProviders.size;
  }

  /**
   * Get the names of all providers used in the last successful operation
   */
  getProvidersUsed(blockchain?: BlockchainType): string[] {
    if (blockchain) {
      const providerMap =
        blockchain === "ethereum"
          ? this.ethereumProviders
          : this.solanaProviders;
      return Array.from(providerMap.keys());
    }
    return [
      ...Array.from(this.ethereumProviders.keys()),
      ...Array.from(this.solanaProviders.keys()),
    ];
  }

  /**
   * Shutdown the provider manager
   */
  shutdown(): void {
    this.stopHealthChecks();
    this.ethereumProviders.clear();
    this.solanaProviders.clear();
    this.providerHealth.clear();
    console.log("🛑 Provider manager shutdown complete");
  }
}
