// Property-based tests for cache round-trip consistency

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fc from "fast-check";
import { CacheManager, CacheKeys, CacheTTL } from "../lib/cache";
import {
  AnalyzeResponseData,
  TokenSummary,
  WalletInfo,
  ScoringResult,
} from "../types";

describe("Cache Round-Trip Consistency Properties", () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Create a fresh cache manager for each test
    cacheManager = new CacheManager();
  });

  afterEach(async () => {
    // Clean up after each test
    await cacheManager.clear();
    await cacheManager.shutdown();
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

  // Generator for scoring results
  const scoringResultGen = fc.record({
    score: fc.integer({ min: 0, max: 100 }),
    breakdown: fc.record({
      walletAgeScore: fc.integer({ min: 0, max: 100 }),
      activityScore: fc.integer({ min: 0, max: 100 }),
      tokenOutcomeScore: fc.integer({ min: 0, max: 100 }),
      heuristicsScore: fc.integer({ min: 0, max: 100 }),
      final: fc.integer({ min: 0, max: 100 }),
    }),
    notes: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
      maxLength: 10,
    }),
  });

  // Generator for analysis response data
  const analysisResponseGen = fc.record({
    score: fc.integer({ min: 0, max: 100 }),
    breakdown: fc.record({
      walletAgeScore: fc.integer({ min: 0, max: 100 }),
      activityScore: fc.integer({ min: 0, max: 100 }),
      tokenOutcomeScore: fc.integer({ min: 0, max: 100 }),
      heuristicsScore: fc.integer({ min: 0, max: 100 }),
      final: fc.integer({ min: 0, max: 100 }),
    }),
    notes: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
      maxLength: 10,
    }),
    reason: fc.string({ minLength: 1, maxLength: 500 }),
    walletInfo: walletInfoGen,
    tokenLaunchSummary: fc.record({
      totalLaunched: fc.nat(100),
      succeeded: fc.nat(50),
      rugged: fc.nat(50),
      unknown: fc.nat(50),
      tokens: fc.array(tokenSummaryGen, { maxLength: 20 }),
    }),
    metadata: fc.record({
      analyzedAt: fc
        .integer({ min: new Date("2020-01-01").getTime(), max: Date.now() })
        .map((ts) => new Date(ts).toISOString()),
      processingTime: fc.nat(10000),
      dataFreshness: fc.constantFrom("cached", "fresh"),
      providersUsed: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
        minLength: 1,
        maxLength: 5,
      }),
      cached: fc.option(fc.boolean(), { nil: undefined }),
    }),
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should maintain consistency for wallet info cache round-trips", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        walletInfoGen,
        fc.integer({ min: 1, max: 3600 }), // TTL in seconds
        async (address, walletInfo, ttl) => {
          const key = CacheKeys.walletInfo(address);

          // Store in cache
          await cacheManager.set(key, walletInfo, { ttl });

          // Retrieve from cache
          const retrieved = await cacheManager.get<WalletInfo>(key);

          // Should be equivalent
          expect(retrieved).toEqual(walletInfo);

          // Verify specific fields
          expect(retrieved?.createdAt).toBe(walletInfo.createdAt);
          expect(retrieved?.firstTxHash).toBe(walletInfo.firstTxHash);
          expect(retrieved?.txCount).toBe(walletInfo.txCount);
          expect(retrieved?.age).toBe(walletInfo.age);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should maintain consistency for token summaries cache round-trips", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc.array(tokenSummaryGen, { maxLength: 20 }),
        fc.integer({ min: 1, max: 3600 }),
        async (address, tokenSummaries, ttl) => {
          const key = CacheKeys.tokens(address);

          // Store in cache
          await cacheManager.set(key, tokenSummaries, { ttl });

          // Retrieve from cache
          const retrieved = await cacheManager.get<TokenSummary[]>(key);

          // Should be equivalent
          expect(retrieved).toEqual(tokenSummaries);

          // Verify array length
          expect(retrieved?.length).toBe(tokenSummaries.length);

          // Verify each token summary
          if (retrieved) {
            for (let i = 0; i < tokenSummaries.length; i++) {
              expect(retrieved[i]).toEqual(tokenSummaries[i]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should maintain consistency for scoring results cache round-trips", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        scoringResultGen,
        fc.integer({ min: 1, max: 3600 }),
        async (address, scoringResult, ttl) => {
          const key = CacheKeys.scoring(address);

          // Store in cache
          await cacheManager.set(key, scoringResult, { ttl });

          // Retrieve from cache
          const retrieved = await cacheManager.get<ScoringResult>(key);

          // Should be equivalent
          expect(retrieved).toEqual(scoringResult);

          // Verify score bounds
          expect(retrieved?.score).toBeGreaterThanOrEqual(0);
          expect(retrieved?.score).toBeLessThanOrEqual(100);

          // Verify breakdown
          expect(retrieved?.breakdown).toEqual(scoringResult.breakdown);
          expect(retrieved?.notes).toEqual(scoringResult.notes);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should maintain consistency for complete analysis results cache round-trips", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        analysisResponseGen,
        async (address, analysisData) => {
          const key = CacheKeys.analysis(address);
          const ttl = CacheTTL.ANALYSIS_RESULT;

          // Store in cache
          await cacheManager.set(key, analysisData, { ttl });

          // Retrieve from cache
          const retrieved = await cacheManager.get<AnalyzeResponseData>(key);

          // Should be equivalent
          expect(retrieved).toEqual(analysisData);

          // Verify critical fields
          expect(retrieved?.score).toBe(analysisData.score);
          expect(retrieved?.breakdown).toEqual(analysisData.breakdown);
          expect(retrieved?.walletInfo).toEqual(analysisData.walletInfo);
          expect(retrieved?.tokenLaunchSummary).toEqual(
            analysisData.tokenLaunchSummary
          );
          expect(retrieved?.metadata).toEqual(analysisData.metadata);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should handle primitive values consistently", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.double(),
          fc.boolean(),
          fc.constant(null)
        ),
        fc.integer({ min: 1, max: 3600 }),
        async (key, value, ttl) => {
          // Store in cache
          await cacheManager.set(key, value, { ttl });

          // Retrieve from cache
          const retrieved = await cacheManager.get(key);

          // Should be exactly equal
          expect(retrieved).toBe(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should handle complex nested objects consistently", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.record({
          level1: fc.record({
            level2: fc.record({
              level3: fc.record({
                strings: fc.array(fc.string()),
                numbers: fc.array(fc.integer()),
                booleans: fc.array(fc.boolean()),
                nulls: fc.array(fc.constant(null)),
                mixed: fc.array(
                  fc.oneof(
                    fc.string(),
                    fc.integer(),
                    fc.boolean(),
                    fc.constant(null)
                  )
                ),
              }),
            }),
          }),
          topLevel: fc.record({
            optional: fc.option(fc.string()),
            required: fc.string(),
          }),
        }),
        fc.integer({ min: 1, max: 3600 }),
        async (key, complexObject, ttl) => {
          // Store in cache
          await cacheManager.set(key, complexObject, { ttl });

          // Retrieve from cache
          const retrieved = (await cacheManager.get(key)) as any;

          // Should be deeply equal
          expect(retrieved).toEqual(complexObject);

          // Verify nested structure is preserved
          expect(retrieved?.level1?.level2?.level3).toEqual(
            complexObject.level1.level2.level3
          );
          expect(retrieved?.topLevel).toEqual(complexObject.topLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should handle cache expiration correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        async (key, value) => {
          const shortTtl = 1; // 1 second

          // Store with short TTL
          await cacheManager.set(key, value, { ttl: shortTtl });

          // Should be available immediately
          const immediate = await cacheManager.get(key);
          expect(immediate).toBe(value);

          // Wait for expiration (add buffer for timing)
          await new Promise((resolve) => setTimeout(resolve, 1200));

          // Should be expired
          const expired = await cacheManager.get(key);
          expect(expired).toBeNull();
        }
      ),
      { numRuns: 20 } // Fewer runs due to timing requirements
    );
  }, 30000); // 30 second timeout for this test

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should maintain consistency across different cache key patterns", async () => {
    await fc.assert(
      fc.asyncProperty(
        addressGen,
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 3600 }),
        async (address, value, ttl) => {
          // Test different cache key generators
          const keys = [
            CacheKeys.walletInfo(address),
            CacheKeys.walletAge(address),
            CacheKeys.tokens(address),
            CacheKeys.analysis(address),
            CacheKeys.scoring(address),
          ];

          // Store same value with different keys
          for (const key of keys) {
            await cacheManager.set(key, value, { ttl });
          }

          // Retrieve and verify all keys
          for (const key of keys) {
            const retrieved = await cacheManager.get(key);
            expect(retrieved).toBe(value);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should handle cache operations with prefixes consistently", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.integer({ min: 1, max: 3600 }),
        async (prefix, key, value, ttl) => {
          // Store with prefix
          await cacheManager.set(key, value, { ttl, prefix });

          // Retrieve with same prefix
          const retrieved = await cacheManager.get(key, { prefix });
          expect(retrieved).toBe(value);

          // Should not be available without prefix
          const withoutPrefix = await cacheManager.get(key);
          expect(withoutPrefix).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 10: Cache round-trip consistency
  it("should preserve data types and structure integrity", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.record({
          stringField: fc.string(),
          numberField: fc.integer(),
          floatField: fc.double(),
          booleanField: fc.boolean(),
          nullField: fc.constant(null),
          undefinedField: fc.constant(undefined),
          arrayField: fc.array(
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
          objectField: fc.record({
            nested: fc.string(),
            deepNested: fc.record({
              value: fc.integer(),
            }),
          }),
        }),
        fc.integer({ min: 1, max: 3600 }),
        async (key, complexData, ttl) => {
          // Store complex data
          await cacheManager.set(key, complexData, { ttl });

          // Retrieve and verify types
          const retrieved = (await cacheManager.get(key)) as any;

          expect(typeof retrieved?.stringField).toBe("string");
          expect(typeof retrieved?.numberField).toBe("number");
          expect(typeof retrieved?.floatField).toBe("number");
          expect(typeof retrieved?.booleanField).toBe("boolean");
          expect(retrieved?.nullField).toBeNull();
          expect(retrieved?.undefinedField).toBeUndefined();
          expect(Array.isArray(retrieved?.arrayField)).toBe(true);
          expect(typeof retrieved?.objectField).toBe("object");
          expect(typeof retrieved?.objectField?.nested).toBe("string");
          expect(typeof retrieved?.objectField?.deepNested?.value).toBe(
            "number"
          );

          // Verify exact values
          expect(retrieved).toEqual(complexData);
        }
      ),
      { numRuns: 100 }
    );
  });
});
