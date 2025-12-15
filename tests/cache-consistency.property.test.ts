/**
 * Property-Based Tests for Cache Consistency
 * Feature: solana-wallet-scoring
 *
 * Property 5: Cache Key Uniqueness
 * Validates: Requirements 6.4
 *
 * Property 10: Cache Consistency
 * Validates: Requirements 13.3, 13.4
 */

import fc from "fast-check";
import { cache, CacheKeys } from "@/lib/cache";

describe("Cache Consistency Properties", () => {
  // Clean up cache after each test
  afterEach(async () => {
    // Note: In a real implementation, you'd want to clear test cache entries
  });

  /**
   * Property: For any wallet address and blockchain type, retrieving cached data
   * should return the exact same data that was stored
   */
  it("should return exact same data that was cached", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: fc.string({ minLength: 40, maxLength: 44 }),
          blockchain: fc.constantFrom("ethereum", "solana"),
          score: fc.integer({ min: 0, max: 100 }),
          txCount: fc.integer({ min: 0, max: 10000 }),
          tokensLaunched: fc.integer({ min: 0, max: 100 }),
        }),
        async ({ address, blockchain, score, txCount, tokensLaunched }) => {
          const cacheKey = CacheKeys.analysis(address, blockchain as any);

          const originalData = {
            score,
            blockchain,
            walletInfo: { txCount },
            tokenLaunchSummary: { totalLaunched: tokensLaunched },
          };

          // Store data in cache
          await cache.set(cacheKey, originalData, { ttl: 60 });

          // Retrieve data from cache
          const cachedData = await cache.get(cacheKey);

          // Property: Retrieved data should match original data exactly
          expect(cachedData).toEqual(originalData);
        }
      ),
      { numRuns: 50 } // Reduced runs for async tests
    );
  });

  /**
   * Property 5: Cache Key Uniqueness
   * For any wallet address that exists on both chains, cache keys
   * should be distinct to prevent collisions
   *
   * **Feature: solana-wallet-scoring, Property 5: Cache Key Uniqueness**
   * **Validates: Requirements 6.4**
   */
  it("Property 5: should have distinct cache keys for same address on different chains", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 40, maxLength: 44 }), (address) => {
        const ethereumKey = CacheKeys.analysis(address, "ethereum");
        const solanaKey = CacheKeys.analysis(address, "solana");

        // Property: Keys should be different for different blockchains
        expect(ethereumKey).not.toBe(solanaKey);

        // Property: Both keys should include the address (case-insensitive)
        expect(ethereumKey.toLowerCase()).toContain(address.toLowerCase());
        expect(solanaKey.toLowerCase()).toContain(address.toLowerCase());

        // Property: Keys should indicate the blockchain
        expect(ethereumKey).toContain("ethereum");
        expect(solanaKey).toContain("solana");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any cached data, retrieving it multiple times should return
   * consistent results (idempotent reads)
   */
  it("should return consistent results on multiple cache reads", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: fc.string({ minLength: 40, maxLength: 44 }),
          blockchain: fc.constantFrom("ethereum", "solana"),
          score: fc.integer({ min: 0, max: 100 }),
        }),
        async ({ address, blockchain, score }) => {
          const cacheKey = CacheKeys.analysis(address, blockchain as any);

          const data = { score, blockchain, address };

          // Store data
          await cache.set(cacheKey, data, { ttl: 60 });

          // Read multiple times
          const read1 = await cache.get(cacheKey);
          const read2 = await cache.get(cacheKey);
          const read3 = await cache.get(cacheKey);

          // Property: All reads should return the same data
          expect(read1).toEqual(data);
          expect(read2).toEqual(data);
          expect(read3).toEqual(data);
          expect(read1).toEqual(read2);
          expect(read2).toEqual(read3);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any two different addresses, their cache keys should be distinct
   */
  it("should have distinct cache keys for different addresses", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.string({ minLength: 40, maxLength: 44 }),
            fc.string({ minLength: 40, maxLength: 44 })
          )
          .filter(([addr1, addr2]) => addr1 !== addr2),
        fc.constantFrom("ethereum", "solana"),
        ([address1, address2], blockchain) => {
          const key1 = CacheKeys.analysis(address1, blockchain as any);
          const key2 = CacheKeys.analysis(address2, blockchain as any);

          // Property: Different addresses should have different cache keys
          expect(key1).not.toBe(key2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Cache key generation should be deterministic
   * (same inputs always produce same key)
   */
  it("should generate deterministic cache keys", () => {
    fc.assert(
      fc.property(
        fc.record({
          address: fc.string({ minLength: 40, maxLength: 44 }),
          blockchain: fc.constantFrom("ethereum", "solana"),
        }),
        ({ address, blockchain }) => {
          const key1 = CacheKeys.analysis(address, blockchain as any);
          const key2 = CacheKeys.analysis(address, blockchain as any);
          const key3 = CacheKeys.analysis(address, blockchain as any);

          // Property: Same inputs should always produce same key
          expect(key1).toBe(key2);
          expect(key2).toBe(key3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Cached data should preserve data types
   * (numbers stay numbers, strings stay strings, etc.)
   */
  it("should preserve data types in cached data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: fc.string({ minLength: 40, maxLength: 44 }),
          blockchain: fc.constantFrom("ethereum", "solana"),
          score: fc.integer({ min: 0, max: 100 }),
          cached: fc.boolean(),
          notes: fc.array(fc.string(), { maxLength: 5 }),
        }),
        async ({ address, blockchain, score, cached, notes }) => {
          const cacheKey = CacheKeys.analysis(address, blockchain as any);

          const originalData = {
            score,
            blockchain,
            cached,
            notes,
          };

          await cache.set(cacheKey, originalData, { ttl: 60 });
          const retrievedData = await cache.get(cacheKey);

          // Property: Data types should be preserved
          expect(typeof retrievedData.score).toBe("number");
          expect(typeof retrievedData.blockchain).toBe("string");
          expect(typeof retrievedData.cached).toBe("boolean");
          expect(Array.isArray(retrievedData.notes)).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any address, caching then retrieving should not modify the original data
   * (cache operations should not have side effects on input data)
   */
  it("should not modify original data during cache operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: fc.string({ minLength: 40, maxLength: 44 }),
          blockchain: fc.constantFrom("ethereum", "solana"),
          score: fc.integer({ min: 0, max: 100 }),
          metadata: fc.record({
            timestamp: fc.string(),
            provider: fc.string(),
          }),
        }),
        async ({ address, blockchain, score, metadata }) => {
          const cacheKey = CacheKeys.analysis(address, blockchain as any);

          const originalData = {
            score,
            blockchain,
            metadata,
          };

          // Create a deep copy to compare later
          const originalCopy = JSON.parse(JSON.stringify(originalData));

          // Cache and retrieve
          await cache.set(cacheKey, originalData, { ttl: 60 });
          await cache.get(cacheKey);

          // Property: Original data should remain unchanged
          expect(originalData).toEqual(originalCopy);
        }
      ),
      { numRuns: 30 }
    );
  });
});
