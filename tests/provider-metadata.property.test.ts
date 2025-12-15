// Property-based tests for provider metadata inclusion
// **Feature: wallet-trust-scoring, Property 11: Provider metadata inclusion**
// **Validates: Requirements 10.3**

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fc from "fast-check";
import { ProviderManager } from "../lib/providers/ProviderManager";
import { BlockchainProvider, WalletInfo, TokenSummary } from "../types";

// Mock provider implementation for testing
class MockProvider implements BlockchainProvider {
  constructor(
    public name: string,
    public priority: number,
    private shouldSucceed: boolean = true,
    private walletData?: WalletInfo,
    private tokenData?: TokenSummary[]
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.shouldSucceed;
  }

  async getWalletInfo(address: string): Promise<WalletInfo> {
    if (!this.shouldSucceed) {
      throw new Error(`${this.name} failed`);
    }
    return (
      this.walletData || {
        createdAt: new Date().toISOString(),
        firstTxHash: `0x${"a".repeat(64)}`,
        txCount: 100,
        age: "30 days",
      }
    );
  }

  async getTokensCreated(address: string): Promise<TokenSummary[]> {
    if (!this.shouldSucceed) {
      throw new Error(`${this.name} failed`);
    }
    return this.tokenData || [];
  }

  getRateLimit(): { remaining: number; resetTime: number } {
    return { remaining: 100, resetTime: Date.now() + 60000 };
  }
}

describe("Provider Metadata Inclusion Properties", () => {
  let providerManager: ProviderManager;

  beforeEach(() => {
    providerManager = new ProviderManager();
  });

  afterEach(() => {
    providerManager.shutdown();
  });

  // Generator for Ethereum addresses
  const addressGen = fc
    .array(
      fc.constantFrom(
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "a",
        "b",
        "c",
        "d",
        "e",
        "f"
      ),
      { minLength: 40, maxLength: 40 }
    )
    .map((chars) => `0x${chars.join("")}`);

  // Generator for wallet info
  const walletInfoGen = fc.record({
    createdAt: fc.oneof(
      fc.constant(null),
      fc
        .integer({ min: new Date("2020-01-01").getTime(), max: Date.now() })
        .map((ts) => new Date(ts).toISOString())
    ),
    firstTxHash: fc.oneof(
      fc.constant(null),
      fc
        .array(
          fc.constantFrom(
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "a",
            "b",
            "c",
            "d",
            "e",
            "f"
          ),
          { minLength: 64, maxLength: 64 }
        )
        .map((chars) => `0x${chars.join("")}`)
    ),
    txCount: fc.nat(100000),
    age: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
  });

  // Generator for token summaries
  const tokenSummaryGen = fc.record({
    token: addressGen,
    name: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
    symbol: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string({ minLength: 1, maxLength: 10 })
    ),
    creator: fc.oneof(fc.constant(null), fc.constant(undefined), addressGen),
    launchAt: fc.oneof(
      fc.constant(null),
      fc
        .integer({ min: new Date("2020-01-01").getTime(), max: Date.now() })
        .map((ts) => new Date(ts).toISOString())
    ),
    initialLiquidity: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.nat(1000000)
    ),
    holdersAfter7Days: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.nat(10000)
    ),
    liquidityLocked: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.boolean()
    ),
    devSellRatio: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.double({ min: 0, max: 1 })
    ),
  });

  // Generator for provider names
  const providerNameGen = fc.constantFrom(
    "Etherscan",
    "Alchemy",
    "Infura",
    "QuickNode",
    "Moralis",
    "Ankr"
  );

  it("Property 11: Provider metadata inclusion - successful wallet info retrieval includes provider name", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        providerNameGen,
        fc.integer({ min: 1, max: 10 }),
        walletInfoGen,
        async (address, providerName, priority, walletData) => {
          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register a mock provider
          const provider = new MockProvider(
            providerName,
            priority,
            true,
            walletData
          );
          manager.registerProvider(provider);

          // Get wallet info
          const result = await manager.getWalletInfo(address);

          // Verify the result is valid
          expect(result).toBeDefined();
          expect(result.txCount).toBeGreaterThanOrEqual(0);

          // Get providers used - in a real implementation, this would track which provider was actually used
          const providersUsed = manager.getProvidersUsed();

          // Should include at least one provider name
          expect(providersUsed).toBeDefined();
          expect(Array.isArray(providersUsed)).toBe(true);
          expect(providersUsed.length).toBeGreaterThan(0);

          // Should include the registered provider
          expect(providersUsed).toContain(providerName);

          manager.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 11: Provider metadata inclusion - successful token retrieval includes provider name", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        providerNameGen,
        fc.integer({ min: 1, max: 10 }),
        fc.array(tokenSummaryGen, { maxLength: 20 }),
        async (address, providerName, priority, tokenData) => {
          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register a mock provider
          const provider = new MockProvider(
            providerName,
            priority,
            true,
            undefined,
            tokenData
          );
          manager.registerProvider(provider);

          // Get tokens
          const result = await manager.getTokensCreated(address);

          // Verify the result is valid
          expect(result).toBeDefined();
          expect(Array.isArray(result)).toBe(true);

          // Get providers used
          const providersUsed = manager.getProvidersUsed();

          // Should include at least one provider name
          expect(providersUsed).toBeDefined();
          expect(Array.isArray(providersUsed)).toBe(true);
          expect(providersUsed.length).toBeGreaterThan(0);

          // Should include the registered provider
          expect(providersUsed).toContain(providerName);

          manager.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 11: Provider metadata inclusion - multiple providers registered shows all in metadata", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc
          .array(providerNameGen, { minLength: 2, maxLength: 5 })
          .map((names) => [...new Set(names)]), // Unique names
        walletInfoGen,
        async (address, providerNames, walletData) => {
          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register multiple providers
          providerNames.forEach((name, index) => {
            const provider = new MockProvider(
              name,
              index + 1,
              true,
              walletData
            );
            manager.registerProvider(provider);
          });

          // Get wallet info (will use first available provider)
          const result = await manager.getWalletInfo(address);

          // Verify the result is valid
          expect(result).toBeDefined();

          // Get providers used
          const providersUsed = manager.getProvidersUsed();

          // Should include all registered providers
          expect(providersUsed).toBeDefined();
          expect(Array.isArray(providersUsed)).toBe(true);
          expect(providersUsed.length).toBeGreaterThanOrEqual(
            providerNames.length
          );

          // All registered providers should be in the list
          providerNames.forEach((name) => {
            expect(providersUsed).toContain(name);
          });

          manager.shutdown();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property 11: Provider metadata inclusion - failover scenario still includes provider metadata", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc
          .array(providerNameGen, { minLength: 2, maxLength: 4 })
          .map((names) => [...new Set(names)]),
        walletInfoGen,
        async (address, providerNames, walletData) => {
          if (providerNames.length < 2) return; // Skip if not enough unique names

          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register providers - first one fails, second one succeeds
          providerNames.forEach((name, index) => {
            const shouldSucceed = index > 0; // First provider fails
            const provider = new MockProvider(
              name,
              index + 1,
              shouldSucceed,
              walletData
            );
            manager.registerProvider(provider);
          });

          // Get wallet info (should failover to second provider)
          const result = await manager.getWalletInfo(address);

          // Verify the result is valid
          expect(result).toBeDefined();

          // Get providers used
          const providersUsed = manager.getProvidersUsed();

          // Should still include provider metadata
          expect(providersUsed).toBeDefined();
          expect(Array.isArray(providersUsed)).toBe(true);
          expect(providersUsed.length).toBeGreaterThan(0);

          manager.shutdown();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property 11: Provider metadata inclusion - provider names are non-empty strings", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc
          .array(providerNameGen, { minLength: 1, maxLength: 3 })
          .map((names) => [...new Set(names)]),
        async (address, providerNames) => {
          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register providers
          providerNames.forEach((name, index) => {
            const provider = new MockProvider(name, index + 1, true);
            manager.registerProvider(provider);
          });

          // Get wallet info
          await manager.getWalletInfo(address);

          // Get providers used
          const providersUsed = manager.getProvidersUsed();

          // All provider names should be non-empty strings
          expect(providersUsed.length).toBeGreaterThan(0);
          providersUsed.forEach((name) => {
            expect(typeof name).toBe("string");
            expect(name.length).toBeGreaterThan(0);
            expect(name.trim()).toBe(name); // No leading/trailing whitespace
          });

          manager.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 11: Provider metadata inclusion - provider names are unique in metadata", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc
          .array(providerNameGen, { minLength: 2, maxLength: 5 })
          .map((names) => [...new Set(names)]),
        async (address, providerNames) => {
          if (providerNames.length < 2) return; // Skip if not enough unique names

          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register providers
          providerNames.forEach((name, index) => {
            const provider = new MockProvider(name, index + 1, true);
            manager.registerProvider(provider);
          });

          // Get wallet info
          await manager.getWalletInfo(address);

          // Get providers used
          const providersUsed = manager.getProvidersUsed();

          // Provider names should be unique (no duplicates)
          const uniqueProviders = [...new Set(providersUsed)];
          expect(uniqueProviders.length).toBe(providersUsed.length);

          manager.shutdown();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 11: Provider metadata inclusion - metadata persists across multiple operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(addressGen, { minLength: 2, maxLength: 5 }),
        providerNameGen,
        async (addresses, providerName) => {
          // Create a fresh provider manager for each test
          const manager = new ProviderManager();

          // Register a provider
          const provider = new MockProvider(providerName, 1, true);
          manager.registerProvider(provider);

          // Perform multiple operations
          for (const address of addresses) {
            await manager.getWalletInfo(address);

            // Get providers used after each operation
            const providersUsed = manager.getProvidersUsed();

            // Should always include provider metadata
            expect(providersUsed).toBeDefined();
            expect(Array.isArray(providersUsed)).toBe(true);
            expect(providersUsed.length).toBeGreaterThan(0);
            expect(providersUsed).toContain(providerName);
          }

          manager.shutdown();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property 11: Provider metadata inclusion - empty provider list when no providers registered", async () => {
    await fc.assert(
      fc.asyncProperty(addressGen, async (address) => {
        // Create a fresh provider manager with no providers
        const manager = new ProviderManager();

        // Get wallet info (should return defaults)
        const result = await manager.getWalletInfo(address);

        // Should return default values
        expect(result).toBeDefined();
        expect(result.createdAt).toBeNull();
        expect(result.txCount).toBe(0);

        // Get providers used
        const providersUsed = manager.getProvidersUsed();

        // Should be an empty array when no providers are registered
        expect(providersUsed).toBeDefined();
        expect(Array.isArray(providersUsed)).toBe(true);
        expect(providersUsed.length).toBe(0);

        manager.shutdown();
      }),
      { numRuns: 50 }
    );
  });
});
