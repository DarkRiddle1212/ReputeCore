// Property-based tests for caching system

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import fc from "fast-check";
import { CacheManager } from "../lib/cache";

// Mock Redis
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn(() => ({
      del: jest.fn(),
      exec: jest.fn(),
    })),
    quit: jest.fn(),
    on: jest.fn(),
  }));
});

// Mock config to force memory-only mode for tests
jest.mock("../lib/config", () => ({
  config: {
    cache: {
      redisUrl: undefined, // Force memory-only mode for tests
      defaultTtl: 300,
      maxMemoryEntries: 100,
    },
    features: {
      enableCaching: true,
    },
  },
}));

describe("Cache Property-Based Tests", () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  describe("Property 10: Cache round-trip consistency", () => {
    /**
     * **Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency**
     * **Validates: Requirements 9.1**
     *
     * For any key-value pair, setting a value in cache and immediately getting it
     * should return the same value.
     */
    it("should maintain round-trip consistency for all data types", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // Cache key
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.record({
              id: fc.string(),
              value: fc.integer(),
              nested: fc.record({
                data: fc.string(),
                flag: fc.boolean(),
              }),
            }),
            fc.constantFrom(null)
          ), // Various data types
          async (key, value) => {
            // Set the value in cache
            await cacheManager.set(key, value);

            // Get the value back
            const retrieved = await cacheManager.get(key);

            // Should be exactly the same
            expect(retrieved).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle cache keys with prefixes consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // Base key
          fc.string({ minLength: 1, maxLength: 10 }), // Prefix
          fc.oneof(
            fc.string(),
            fc.record({
              data: fc.string(),
              timestamp: fc.integer(),
            })
          ), // Value
          async (key, prefix, value) => {
            // Set with prefix
            await cacheManager.set(key, value, { prefix });

            // Get with same prefix
            const retrieved = await cacheManager.get(key, { prefix });

            // Should match exactly
            expect(retrieved).toEqual(value);

            // Get without prefix should return null
            const withoutPrefix = await cacheManager.get(key);
            expect(withoutPrefix).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should handle TTL settings consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // Key
          fc.string(), // Value
          fc.integer({ min: 1, max: 10 }), // TTL in seconds
          async (key, value, ttl) => {
            // Set with TTL
            await cacheManager.set(key, value, { ttl });

            // Should be retrievable immediately
            const retrieved = await cacheManager.get(key);
            expect(retrieved).toEqual(value);
          }
        ),
        { numRuns: 30 }
      );
    });

    it("should maintain consistency across multiple operations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            // Set all values
            for (const op of operations) {
              await cacheManager.set(op.key, op.value);
            }

            // Verify all values can be retrieved correctly
            for (const op of operations) {
              const retrieved = await cacheManager.get(op.key);
              expect(retrieved).toEqual(op.value);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should handle delete operations consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // Key
          fc.string(), // Value
          async (key, value) => {
            // Set value
            await cacheManager.set(key, value);

            // Verify it exists
            const beforeDelete = await cacheManager.get(key);
            expect(beforeDelete).toEqual(value);

            // Delete it
            await cacheManager.delete(key);

            // Should return null after deletion
            const afterDelete = await cacheManager.get(key);
            expect(afterDelete).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should handle clear operations with prefixes consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 10 }), // Prefix to clear
          fc.string({ minLength: 1, maxLength: 10 }), // Other prefix
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
            minLength: 1,
            maxLength: 5,
          }), // Keys
          fc.string(), // Value
          async (clearPrefix, otherPrefix, keys, value) => {
            // Assume prefixes are different
            fc.pre(clearPrefix !== otherPrefix);

            // Set values with both prefixes
            for (const key of keys) {
              await cacheManager.set(key, value, { prefix: clearPrefix });
              await cacheManager.set(key, `${value}-other`, {
                prefix: otherPrefix,
              });
            }

            // Clear only one prefix
            await cacheManager.clear(clearPrefix);

            // Values with cleared prefix should be gone
            for (const key of keys) {
              const cleared = await cacheManager.get(key, {
                prefix: clearPrefix,
              });
              expect(cleared).toBeNull();

              // Values with other prefix should remain
              const remaining = await cacheManager.get(key, {
                prefix: otherPrefix,
              });
              expect(remaining).toEqual(`${value}-other`);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should maintain statistics consistency", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.string(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (operations) => {
            const initialStats = cacheManager.getStats();

            // Perform cache operations
            for (const op of operations) {
              await cacheManager.set(op.key, op.value);
              await cacheManager.get(op.key); // This should be a hit
            }

            const finalStats = cacheManager.getStats();

            // Memory hits should have increased
            expect(finalStats.memoryHits).toBeGreaterThanOrEqual(
              initialStats.memoryHits
            );

            // Memory size should reflect the operations
            expect(finalStats.memorySize).toBeGreaterThanOrEqual(
              initialStats.memorySize
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
