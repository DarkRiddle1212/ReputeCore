/**
 * Property-Based Tests for Provider Failover Consistency
 * Feature: solana-wallet-scoring, Property 4: Provider Failover Consistency
 * Validates: Requirements 3.2, 3.5
 */

import fc from "fast-check";
import { ProviderManager } from "@/lib/providers/ProviderManager";
import { BlockchainProvider, WalletInfo, TokenSummary } from "@/types";
import { BlockchainType } from "@/lib/validation";

// Mock provider implementation for testing
class MockProvider implements BlockchainProvider {
  name: string;
  priority: number;
  private shouldFail: boolean;
  private walletInfo: WalletInfo;
  private tokens: TokenSummary[];

  constructor(
    name: string,
    priority: number,
    shouldFail: boolean = false,
    walletInfo?: WalletInfo,
    tokens?: TokenSummary[]
  ) {
    this.name = name;
    this.priority = priority;
    this.shouldFail = shouldFail;
    this.walletInfo = walletInfo || {
      createdAt: new Date().toISOString(),
      txCount: 100,
      age: 365,
    };
    this.tokens = tokens || [];
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  async getWalletInfo(address: string): Promise<WalletInfo> {
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    return this.walletInfo;
  }

  async getTokensCreated(address: string): Promise<TokenSummary[]> {
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    return this.tokens;
  }

  getRateLimit(): { remaining: number; resetTime: number } {
    return { remaining: 100, resetTime: Date.now() + 60000 };
  }
}

describe("Property 4: Provider Failover Consistency", () => {
  let manager: ProviderManager;

  beforeEach(() => {
    manager = new ProviderManager();
  });

  afterEach(() => {
    manager.shutdown();
  });

  /**
   * Property: For any blockchain type, when the primary provider fails,
   * the system should automatically failover to the next available provider
   */
  it("should failover to next provider when primary fails", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "ethereum" as BlockchainType,
          "solana" as BlockchainType
        ),
        fc.string({ minLength: 40, maxLength: 44 }),
        fc.integer({ min: 0, max: 1000 }),
        async (blockchain, address, txCount) => {
          // Create providers: first fails, second succeeds
          const failingProvider = new MockProvider("failing-provider", 1, true);
          const workingProvider = new MockProvider(
            "working-provider",
            2,
            false,
            { createdAt: new Date().toISOString(), txCount, age: 100 }
          );

          manager.registerProvider(failingProvider, blockchain);
          manager.registerProvider(workingProvider, blockchain);

          // Property: Should get data from working provider despite first provider failing
          const result = await manager.getWalletInfo(address, blockchain);

          expect(result).toBeDefined();
          expect(result.txCount).toBe(txCount);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any blockchain, when all providers fail,
   * the system should return default values consistently
   */
  it("should return default values when all providers fail", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "ethereum" as BlockchainType,
          "solana" as BlockchainType
        ),
        fc.string({ minLength: 40, maxLength: 44 }),
        async (blockchain, address) => {
          // Create only failing providers
          const provider1 = new MockProvider("failing-1", 1, true);
          const provider2 = new MockProvider("failing-2", 2, true);

          manager.registerProvider(provider1, blockchain);
          manager.registerProvider(provider2, blockchain);

          // Property: Should return default values when all fail
          const result = await manager.getWalletInfo(address, blockchain);

          expect(result).toBeDefined();
          expect(result.txCount).toBe(0);
          expect(result.createdAt).toBeNull();
          expect(result.age).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any blockchain, providers should be tried in priority order
   */
  it("should try providers in priority order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "ethereum" as BlockchainType,
          "solana" as BlockchainType
        ),
        fc.string({ minLength: 40, maxLength: 44 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        async (blockchain, address, txCount1, txCount2) => {
          // Create providers with different priorities and data
          const lowPriorityProvider = new MockProvider(
            "low-priority",
            10,
            false,
            { createdAt: new Date().toISOString(), txCount: txCount2, age: 200 }
          );
          const highPriorityProvider = new MockProvider(
            "high-priority",
            1,
            false,
            { createdAt: new Date().toISOString(), txCount: txCount1, age: 100 }
          );

          // Register in reverse order to test sorting
          manager.registerProvider(lowPriorityProvider, blockchain);
          manager.registerProvider(highPriorityProvider, blockchain);

          // Property: Should use high priority provider (lower number = higher priority)
          const result = await manager.getWalletInfo(address, blockchain);

          expect(result.txCount).toBe(txCount1); // From high priority provider
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any blockchain, failover should work for token retrieval
   */
  it("should failover for token retrieval", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "ethereum" as BlockchainType,
          "solana" as BlockchainType
        ),
        fc.string({ minLength: 40, maxLength: 44 }),
        fc.array(
          fc.record({
            address: fc.string({ minLength: 40, maxLength: 44 }),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            symbol: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (blockchain, address, tokenData) => {
          const tokens: TokenSummary[] = tokenData.map((t) => ({
            ...t,
            initialLiquidity: 1000,
            currentLiquidity: 800,
            holdersAfter7Days: 50,
            devSellRatio: 0.2,
            devTokensReceived: 1000,
            devTokensSold: 200,
            isRugged: false,
            createdAt: new Date(),
            blockchain: blockchain,
            creatorWallet: address,
          }));

          const failingProvider = new MockProvider("failing", 1, true);
          const workingProvider = new MockProvider(
            "working",
            2,
            false,
            undefined,
            tokens
          );

          manager.registerProvider(failingProvider, blockchain);
          manager.registerProvider(workingProvider, blockchain);

          // Property: Should get tokens from working provider
          const result = await manager.getTokensCreated(address, blockchain);

          expect(result).toHaveLength(tokens.length);
          if (tokens.length > 0) {
            expect(result[0].name).toBe(tokens[0].name);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any blockchain, provider isolation should be maintained
   * (Ethereum providers don't affect Solana and vice versa)
   */
  it("should maintain provider isolation between blockchains", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 40, maxLength: 44 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        async (address, ethTxCount, solTxCount) => {
          // Create separate providers for each blockchain
          const ethProvider = new MockProvider("eth-provider", 1, false, {
            createdAt: new Date().toISOString(),
            txCount: ethTxCount,
            age: 100,
          });
          const solProvider = new MockProvider("sol-provider", 1, false, {
            createdAt: new Date().toISOString(),
            txCount: solTxCount,
            age: 200,
          });

          manager.registerProvider(ethProvider, "ethereum");
          manager.registerProvider(solProvider, "solana");

          // Property: Each blockchain should use its own provider
          const ethResult = await manager.getWalletInfo(address, "ethereum");
          const solResult = await manager.getWalletInfo(address, "solana");

          expect(ethResult.txCount).toBe(ethTxCount);
          expect(solResult.txCount).toBe(solTxCount);

          // Results should be independent
          if (ethTxCount !== solTxCount) {
            expect(ethResult.txCount).not.toBe(solResult.txCount);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any blockchain, failover should be consistent across multiple calls
   */
  it("should provide consistent failover behavior across multiple calls", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "ethereum" as BlockchainType,
          "solana" as BlockchainType
        ),
        fc.string({ minLength: 40, maxLength: 44 }),
        fc.integer({ min: 0, max: 1000 }),
        async (blockchain, address, txCount) => {
          const failingProvider = new MockProvider("failing", 1, true);
          const workingProvider = new MockProvider("working", 2, false, {
            createdAt: new Date().toISOString(),
            txCount,
            age: 100,
          });

          manager.registerProvider(failingProvider, blockchain);
          manager.registerProvider(workingProvider, blockchain);

          // Property: Multiple calls should return consistent results
          const result1 = await manager.getWalletInfo(address, blockchain);
          const result2 = await manager.getWalletInfo(address, blockchain);
          const result3 = await manager.getWalletInfo(address, blockchain);

          expect(result1.txCount).toBe(txCount);
          expect(result2.txCount).toBe(txCount);
          expect(result3.txCount).toBe(txCount);
          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }
      ),
      { numRuns: 20 }
    );
  });
});
