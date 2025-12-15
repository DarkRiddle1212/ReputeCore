/**
 * Property-based tests for Partial Data Handling
 *
 * **Feature: enhanced-etherscan-analytics, Property 9: Partial data handling**
 * **Validates: Requirements 6.1, 6.2**
 */

import * as fc from "fast-check";
import { computeScore } from "@/lib/scoring";
import { TokenSummary, WalletInfo } from "@/types";

// Helper to create wallet info
function createWalletInfo(ageDays: number, txCount: number): WalletInfo {
  const createdAt = new Date(
    Date.now() - ageDays * 24 * 60 * 60 * 1000
  ).toISOString();
  return {
    createdAt,
    txCount,
    firstTxHash: "0x" + "0".repeat(64),
    age: `${ageDays} days`,
  };
}

// Helper to create token summaries with varying data completeness
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
    liquidityLocked: Math.random() > 0.5 ? Math.random() > 0.5 : null,
    holdersAfter7Days:
      Math.random() > 0.5 ? Math.floor(Math.random() * 1000) : null,
  };
}

describe("Partial Data Handling - Property Tests", () => {
  describe("Property 9: Partial data handling", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 9: Partial data handling**
     * **Validates: Requirements 6.1, 6.2**
     */

    test("should always return a valid score between 0 and 100", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 5 }),
          fc.constantFrom("full", "partial", "none"),
          (ageDays, txCount, tokenCount, dataType) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            let tokens: TokenSummary[];

            switch (dataType) {
              case "full":
                tokens = Array.from({ length: tokenCount }, () =>
                  createFullDataToken()
                );
                break;
              case "partial":
                tokens = Array.from({ length: tokenCount }, () =>
                  createPartialDataToken()
                );
                break;
              case "none":
              default:
                tokens = Array.from({ length: tokenCount }, () =>
                  createNoDataToken()
                );
                break;
            }

            const result = computeScore(walletInfo, tokens);

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("should include confidence indicator in result", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 5 }),
          (ageDays, txCount, tokenCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            const tokens = Array.from({ length: tokenCount }, () =>
              createPartialDataToken()
            );

            const result = computeScore(walletInfo, tokens);

            // Should have confidence in result
            expect(result.confidence).toBeDefined();
            if (result.confidence) {
              expect(["HIGH", "MEDIUM", "MEDIUM-LOW", "LOW"]).toContain(
                result.confidence.level
              );
              expect(typeof result.confidence.reason).toBe("string");
              expect(result.confidence.dataCompleteness).toBeGreaterThanOrEqual(
                0
              );
              expect(result.confidence.dataCompleteness).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should include confidence note in notes array", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 5 }),
          (ageDays, txCount, tokenCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            const tokens = Array.from({ length: tokenCount }, () =>
              createPartialDataToken()
            );

            const result = computeScore(walletInfo, tokens);

            // Should have confidence note
            const hasConfidenceNote = result.notes.some((note) =>
              note.includes("Confidence:")
            );
            expect(hasConfidenceNote).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should handle empty token array gracefully", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          (ageDays, txCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);

            const result = computeScore(walletInfo, []);

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(result.breakdown.walletAgeScore).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.activityScore).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should produce consistent results for same input", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          (ageDays, txCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            const tokens = [createFullDataToken()];

            const result1 = computeScore(walletInfo, tokens);
            const result2 = computeScore(walletInfo, tokens);

            // Same input should produce same score
            expect(result1.score).toBe(result2.score);
            expect(result1.breakdown).toEqual(result2.breakdown);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should have all breakdown components within valid range", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 5 }),
          (ageDays, txCount, tokenCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            const tokens = Array.from({ length: tokenCount }, () =>
              createPartialDataToken()
            );

            const result = computeScore(walletInfo, tokens);

            expect(result.breakdown.walletAgeScore).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.walletAgeScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.activityScore).toBeGreaterThanOrEqual(0);
            expect(result.breakdown.activityScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(
              0
            );
            expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
            expect(result.breakdown.heuristicsScore).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should adjust weights based on data availability", () => {
      const walletInfo = createWalletInfo(365, 500); // Established wallet

      // Full data tokens
      const fullDataTokens = [createFullDataToken()];
      const fullResult = computeScore(walletInfo, fullDataTokens);

      // No data tokens
      const noDataTokens = [createNoDataToken()];
      const noDataResult = computeScore(walletInfo, noDataTokens);

      // Full data should have higher confidence
      expect(fullResult.confidence?.level).toBe("HIGH");
      expect(["LOW", "MEDIUM-LOW"]).toContain(noDataResult.confidence?.level);
    });

    test("should include data completeness in notes when tokens present", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 5 }),
          (ageDays, txCount, tokenCount) => {
            const walletInfo = createWalletInfo(ageDays, txCount);
            const tokens = Array.from({ length: tokenCount }, () =>
              createPartialDataToken()
            );

            const result = computeScore(walletInfo, tokens);

            // Should have data completeness note
            const hasCompletenessNote = result.notes.some(
              (note) =>
                note.includes("Data completeness:") ||
                note.includes("data completeness")
            );
            expect(hasCompletenessNote).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("Edge cases", () => {
    test("should handle null wallet createdAt", () => {
      const walletInfo: WalletInfo = {
        createdAt: null,
        txCount: 100,
        firstTxHash: null,
        age: null,
      };

      const result = computeScore(walletInfo, []);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.notes.some((n) => n.includes("unknown"))).toBe(true);
    });

    test("should handle zero transaction count", () => {
      const walletInfo = createWalletInfo(365, 0);

      const result = computeScore(walletInfo, []);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.activityScore).toBeLessThanOrEqual(50);
    });

    test("should handle very new wallet", () => {
      const walletInfo = createWalletInfo(1, 5);

      const result = computeScore(walletInfo, []);

      expect(result.breakdown.walletAgeScore).toBeLessThanOrEqual(20);
      expect(
        result.notes.some((n) => n.includes("new") || n.includes("HIGH RISK"))
      ).toBe(true);
    });

    test("should handle mixed data completeness tokens", () => {
      const walletInfo = createWalletInfo(180, 200);
      const tokens = [
        createFullDataToken(),
        createNoDataToken(),
        createPartialDataToken(),
      ];

      const result = computeScore(walletInfo, tokens);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeDefined();
    });
  });
});
