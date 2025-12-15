/**
 * Property-based tests for Dynamic Weight Adjustment and Confidence Level
 *
 * **Feature: enhanced-etherscan-analytics, Property 10: Dynamic weight adjustment**
 * **Validates: Requirements 6.3**
 *
 * **Feature: enhanced-etherscan-analytics, Property 11: Confidence indicator inclusion**
 * **Validates: Requirements 6.4**
 */

import * as fc from "fast-check";
import {
  determineWeights,
  calculateConfidence,
  calculateDataCompleteness,
} from "@/lib/scoring";
import { TokenSummary } from "@/types";

// Helper to create token summaries with specific data completeness
function createFullDataToken(): TokenSummary {
  return {
    token: "0x" + "0".repeat(40),
    devSellRatio: Math.random(),
    initialLiquidity: Math.floor(Math.random() * 100000),
    liquidityLocked: Math.random() > 0.5,
    holdersAfter7Days: Math.floor(Math.random() * 1000),
  };
}

function createNoDataToken(): TokenSummary {
  return {
    token: "0x" + "0".repeat(40),
    devSellRatio: null,
    initialLiquidity: null,
    liquidityLocked: null,
    holdersAfter7Days: null,
  };
}

function createPartialDataToken(): TokenSummary {
  return {
    token: "0x" + "0".repeat(40),
    devSellRatio: Math.random() > 0.5 ? Math.random() : null,
    initialLiquidity:
      Math.random() > 0.5 ? Math.floor(Math.random() * 100000) : null,
    liquidityLocked: null,
    holdersAfter7Days: null,
  };
}

describe("Dynamic Weight Adjustment - Property Tests", () => {
  describe("Property 10: Dynamic weight adjustment", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 10: Dynamic weight adjustment**
     * **Validates: Requirements 6.3**
     */

    test("weights should always sum to 1.0", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createFullDataToken()
          );
          const weights = determineWeights(tokens);
          const sum =
            weights.walletAge +
            weights.activity +
            weights.tokenOutcome +
            weights.heuristics;

          // Allow small floating point tolerance
          expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
        }),
        { numRuns: 50 }
      );
    });

    test("all weights should be non-negative", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createPartialDataToken()
          );
          const weights = determineWeights(tokens);

          expect(weights.walletAge).toBeGreaterThanOrEqual(0);
          expect(weights.activity).toBeGreaterThanOrEqual(0);
          expect(weights.tokenOutcome).toBeGreaterThanOrEqual(0);
          expect(weights.heuristics).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 50 }
      );
    });

    test("should give more weight to wallet metrics when no tokens", () => {
      const weights = determineWeights([]);

      // Wallet metrics should dominate
      expect(weights.walletAge + weights.activity).toBe(1.0);
      expect(weights.tokenOutcome).toBe(0);
      expect(weights.heuristics).toBe(0);
    });

    test("should give more weight to token metrics when data is complete", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createFullDataToken()
          );
          const weights = determineWeights(tokens);

          // Token metrics should have significant weight
          expect(
            weights.tokenOutcome + weights.heuristics
          ).toBeGreaterThanOrEqual(0.5);
        }),
        { numRuns: 30 }
      );
    });

    test("should reduce token metric weights when data is incomplete", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createNoDataToken()
          );
          const weights = determineWeights(tokens);

          // Wallet metrics should have more weight when token data is missing
          expect(weights.walletAge + weights.activity).toBeGreaterThanOrEqual(
            0.6
          );
        }),
        { numRuns: 30 }
      );
    });

    test("weights should adjust based on data completeness level", () => {
      const fullTokens = [createFullDataToken()];
      const noDataTokens = [createNoDataToken()];

      const fullWeights = determineWeights(fullTokens);
      const noDataWeights = determineWeights(noDataTokens);

      // Full data should have higher token metric weights
      expect(fullWeights.tokenOutcome + fullWeights.heuristics).toBeGreaterThan(
        noDataWeights.tokenOutcome + noDataWeights.heuristics
      );
    });
  });

  describe("Data completeness calculation", () => {
    test("should return 0 for empty token array", () => {
      expect(calculateDataCompleteness([])).toBe(0);
    });

    test("should return 1 for fully complete data", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createFullDataToken()
          );
          const completeness = calculateDataCompleteness(tokens);
          expect(completeness).toBe(1);
        }),
        { numRuns: 30 }
      );
    });

    test("should return 0 for completely missing data", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createNoDataToken()
          );
          const completeness = calculateDataCompleteness(tokens);
          expect(completeness).toBe(0);
        }),
        { numRuns: 30 }
      );
    });

    test("should return value between 0 and 1 for partial data", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createPartialDataToken()
          );
          const completeness = calculateDataCompleteness(tokens);
          expect(completeness).toBeGreaterThanOrEqual(0);
          expect(completeness).toBeLessThanOrEqual(1);
        }),
        { numRuns: 30 }
      );
    });
  });
});

describe("Confidence Level - Property Tests", () => {
  describe("Property 11: Confidence indicator inclusion", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 11: Confidence indicator inclusion**
     * **Validates: Requirements 6.4**
     */

    test("should return valid confidence level for any input", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createPartialDataToken()
          );
          const confidence = calculateConfidence(tokens);
          const validLevels = ["HIGH", "MEDIUM", "MEDIUM-LOW", "LOW"];

          expect(validLevels).toContain(confidence.level);
          expect(typeof confidence.reason).toBe("string");
          expect(confidence.reason.length).toBeGreaterThan(0);
        }),
        { numRuns: 50 }
      );
    });

    test("should return HIGH confidence for complete data", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createFullDataToken()
          );
          const confidence = calculateConfidence(tokens);
          expect(confidence.level).toBe("HIGH");
          expect(confidence.dataCompleteness).toBe(1);
        }),
        { numRuns: 30 }
      );
    });

    test("should return MEDIUM confidence for no tokens", () => {
      const confidence = calculateConfidence([]);
      expect(confidence.level).toBe("MEDIUM");
      expect(confidence.dataCompleteness).toBe(0);
    });

    test("should return LOW confidence for minimal data", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createNoDataToken()
          );
          const confidence = calculateConfidence(tokens);
          expect(confidence.level).toBe("LOW");
          expect(confidence.dataCompleteness).toBe(0);
        }),
        { numRuns: 30 }
      );
    });

    test("confidence level should correlate with data completeness", () => {
      const levelOrder: Record<string, number> = {
        LOW: 0,
        "MEDIUM-LOW": 1,
        MEDIUM: 2,
        HIGH: 3,
      };

      const fullTokens = [createFullDataToken()];
      const noDataTokens = [createNoDataToken()];

      const fullConfidence = calculateConfidence(fullTokens);
      const noDataConfidence = calculateConfidence(noDataTokens);

      // Higher data completeness should result in higher confidence
      expect(levelOrder[fullConfidence.level]).toBeGreaterThan(
        levelOrder[noDataConfidence.level]
      );
    });

    test("confidence result should include data completeness percentage", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), (tokenCount) => {
          const tokens = Array.from({ length: tokenCount }, () =>
            createPartialDataToken()
          );
          const confidence = calculateConfidence(tokens);

          expect(typeof confidence.dataCompleteness).toBe("number");
          expect(confidence.dataCompleteness).toBeGreaterThanOrEqual(0);
          expect(confidence.dataCompleteness).toBeLessThanOrEqual(1);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe("Edge cases", () => {
    test("should handle NaN values in devSellRatio", () => {
      const tokenWithNaN: TokenSummary = {
        token: "0x" + "0".repeat(40),
        devSellRatio: NaN,
        initialLiquidity: 1000,
        liquidityLocked: true,
        holdersAfter7Days: 50,
      };

      const completeness = calculateDataCompleteness([tokenWithNaN]);
      // NaN should not count as available data
      expect(completeness).toBe(0.75); // 3 out of 4 metrics available
    });

    test("should handle undefined values", () => {
      const tokenWithUndefined: TokenSummary = {
        token: "0x" + "0".repeat(40),
        devSellRatio: undefined as any,
        initialLiquidity: undefined as any,
        liquidityLocked: undefined as any,
        holdersAfter7Days: undefined as any,
      };

      const completeness = calculateDataCompleteness([tokenWithUndefined]);
      expect(completeness).toBe(0);
    });
  });
});
