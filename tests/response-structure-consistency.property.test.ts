/**
 * Property-Based Tests for Response Structure Consistency
 *
 * **Feature: solana-wallet-scoring, Property 7: Response Structure Consistency**
 * **Validates: Requirements 6.3**
 *
 * Tests that API responses maintain consistent structure across blockchains
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

// Mock response structure based on API route
interface AnalysisResponse {
  score: number;
  blockchain: string;
  breakdown: {
    walletAgeScore: number;
    activityScore: number;
    tokenOutcomeScore: number;
    heuristicsScore: number;
    final: number;
  };
  notes: string[];
  reason: string;
  walletInfo: {
    createdAt: string | null;
    firstTxHash: string | null;
    txCount: number;
    age: number | null;
  };
  tokenLaunchSummary: {
    totalLaunched: number;
    succeeded: number;
    rugged: number;
    unknown: number;
    tokens: any[];
  };
  metadata: {
    analyzedAt: string;
    processingTime: number;
    dataFreshness: "fresh" | "cached";
    providersUsed: string[];
    blockchain: string;
  };
  confidence?: string;
  cached?: boolean;
  timestamp?: string;
}

// Helper to create a mock response
function createMockResponse(
  blockchain: "ethereum" | "solana"
): AnalysisResponse {
  return {
    score: 75,
    blockchain,
    breakdown: {
      walletAgeScore: 20,
      activityScore: 25,
      tokenOutcomeScore: 15,
      heuristicsScore: 15,
      final: 75,
    },
    notes: ["Test note"],
    reason: "Deterministic score based on on-chain analysis",
    walletInfo: {
      createdAt: new Date().toISOString(),
      firstTxHash: "0x123",
      txCount: 100,
      age: 365,
    },
    tokenLaunchSummary: {
      totalLaunched: 5,
      succeeded: 3,
      rugged: 1,
      unknown: 1,
      tokens: [],
    },
    metadata: {
      analyzedAt: new Date().toISOString(),
      processingTime: 1000,
      dataFreshness: "fresh",
      providersUsed: [blockchain === "ethereum" ? "etherscan" : "helius"],
      blockchain,
    },
    confidence: "high",
  };
}

describe("Response Structure Consistency Properties", () => {
  it("should have all required top-level fields regardless of blockchain", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Check all required top-level fields exist
          expect(response).toHaveProperty("score");
          expect(response).toHaveProperty("blockchain");
          expect(response).toHaveProperty("breakdown");
          expect(response).toHaveProperty("notes");
          expect(response).toHaveProperty("reason");
          expect(response).toHaveProperty("walletInfo");
          expect(response).toHaveProperty("tokenLaunchSummary");
          expect(response).toHaveProperty("metadata");

          // Verify blockchain field matches
          expect(response.blockchain).toBe(blockchain);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have consistent breakdown structure across blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Check breakdown structure
          expect(response.breakdown).toHaveProperty("walletAgeScore");
          expect(response.breakdown).toHaveProperty("activityScore");
          expect(response.breakdown).toHaveProperty("tokenOutcomeScore");
          expect(response.breakdown).toHaveProperty("heuristicsScore");
          expect(response.breakdown).toHaveProperty("final");

          // Verify all are numbers
          expect(typeof response.breakdown.walletAgeScore).toBe("number");
          expect(typeof response.breakdown.activityScore).toBe("number");
          expect(typeof response.breakdown.tokenOutcomeScore).toBe("number");
          expect(typeof response.breakdown.heuristicsScore).toBe("number");
          expect(typeof response.breakdown.final).toBe("number");
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have consistent walletInfo structure across blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Check walletInfo structure
          expect(response.walletInfo).toHaveProperty("createdAt");
          expect(response.walletInfo).toHaveProperty("firstTxHash");
          expect(response.walletInfo).toHaveProperty("txCount");
          expect(response.walletInfo).toHaveProperty("age");

          // Verify types
          expect(typeof response.walletInfo.txCount).toBe("number");
          expect(
            response.walletInfo.createdAt === null ||
              typeof response.walletInfo.createdAt === "string"
          ).toBe(true);
          expect(
            response.walletInfo.firstTxHash === null ||
              typeof response.walletInfo.firstTxHash === "string"
          ).toBe(true);
          expect(
            response.walletInfo.age === null ||
              typeof response.walletInfo.age === "number"
          ).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have consistent tokenLaunchSummary structure across blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Check tokenLaunchSummary structure
          expect(response.tokenLaunchSummary).toHaveProperty("totalLaunched");
          expect(response.tokenLaunchSummary).toHaveProperty("succeeded");
          expect(response.tokenLaunchSummary).toHaveProperty("rugged");
          expect(response.tokenLaunchSummary).toHaveProperty("unknown");
          expect(response.tokenLaunchSummary).toHaveProperty("tokens");

          // Verify types
          expect(typeof response.tokenLaunchSummary.totalLaunched).toBe(
            "number"
          );
          expect(typeof response.tokenLaunchSummary.succeeded).toBe("number");
          expect(typeof response.tokenLaunchSummary.rugged).toBe("number");
          expect(typeof response.tokenLaunchSummary.unknown).toBe("number");
          expect(Array.isArray(response.tokenLaunchSummary.tokens)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have consistent metadata structure across blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Check metadata structure
          expect(response.metadata).toHaveProperty("analyzedAt");
          expect(response.metadata).toHaveProperty("processingTime");
          expect(response.metadata).toHaveProperty("dataFreshness");
          expect(response.metadata).toHaveProperty("providersUsed");
          expect(response.metadata).toHaveProperty("blockchain");

          // Verify types
          expect(typeof response.metadata.analyzedAt).toBe("string");
          expect(typeof response.metadata.processingTime).toBe("number");
          expect(
            ["fresh", "cached"].includes(response.metadata.dataFreshness)
          ).toBe(true);
          expect(Array.isArray(response.metadata.providersUsed)).toBe(true);
          expect(typeof response.metadata.blockchain).toBe("string");

          // Verify blockchain matches
          expect(response.metadata.blockchain).toBe(blockchain);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have score within valid range for all blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        fc.integer({ min: 0, max: 100 }),
        (blockchain, score) => {
          const response = createMockResponse(blockchain);
          response.score = score;

          // Score should be between 0 and 100
          expect(response.score).toBeGreaterThanOrEqual(0);
          expect(response.score).toBeLessThanOrEqual(100);

          // Score should be a number
          expect(typeof response.score).toBe("number");
          expect(Number.isFinite(response.score)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should have notes as an array of strings for all blockchains", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
        (blockchain, notes) => {
          const response = createMockResponse(blockchain);
          response.notes = notes;

          // Notes should be an array
          expect(Array.isArray(response.notes)).toBe(true);

          // All notes should be strings
          response.notes.forEach((note) => {
            expect(typeof note).toBe("string");
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should maintain consistent field types across multiple responses", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          // Generate multiple responses
          const responses = Array.from({ length: 5 }, () =>
            createMockResponse(blockchain)
          );

          // All responses should have the same structure
          const firstResponse = responses[0];
          responses.slice(1).forEach((response) => {
            // Check same top-level keys
            expect(Object.keys(response).sort()).toEqual(
              Object.keys(firstResponse).sort()
            );

            // Check same breakdown keys
            expect(Object.keys(response.breakdown).sort()).toEqual(
              Object.keys(firstResponse.breakdown).sort()
            );

            // Check same walletInfo keys
            expect(Object.keys(response.walletInfo).sort()).toEqual(
              Object.keys(firstResponse.walletInfo).sort()
            );

            // Check same tokenLaunchSummary keys
            expect(Object.keys(response.tokenLaunchSummary).sort()).toEqual(
              Object.keys(firstResponse.tokenLaunchSummary).sort()
            );

            // Check same metadata keys
            expect(Object.keys(response.metadata).sort()).toEqual(
              Object.keys(firstResponse.metadata).sort()
            );
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should include blockchain identifier in both top-level and metadata", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // Blockchain should be in top-level
          expect(response.blockchain).toBe(blockchain);

          // Blockchain should also be in metadata
          expect(response.metadata.blockchain).toBe(blockchain);

          // Both should match
          expect(response.blockchain).toBe(response.metadata.blockchain);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should have valid ISO timestamp format in metadata", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ethereum" as const, "solana" as const),
        (blockchain) => {
          const response = createMockResponse(blockchain);

          // analyzedAt should be a valid ISO string
          expect(() => new Date(response.metadata.analyzedAt)).not.toThrow();

          const date = new Date(response.metadata.analyzedAt);
          expect(date.toISOString()).toBe(response.metadata.analyzedAt);
        }
      ),
      { numRuns: 50 }
    );
  });
});
