/**
 * Property-based tests for Conditional Penalty Application
 * Tests that penalties are only applied when data is available
 *
 * **Feature: enhanced-etherscan-analytics, Property 7: Conditional penalty application**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

import * as fc from "fast-check";
import { calculateHeuristicsScore } from "@/lib/scoring";
import { TokenSummary } from "@/types";

// Helper to generate valid Ethereum addresses
const tokenAddressGen = () =>
  fc.string({ minLength: 40, maxLength: 40 }).map((str) => {
    const hex = str
      .split("")
      .map((c) => {
        const code = c.charCodeAt(0) % 16;
        return code.toString(16);
      })
      .join("");
    return "0x" + hex;
  });

describe("Conditional Penalty Application - Property Tests", () => {
  describe("Property 7: Conditional penalty application", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 7: Conditional penalty application**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
     */

    test("should only apply dev sell ratio penalty when devSellRatio is available", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.option(fc.double({ min: 0.5, max: 1, noNaN: true }), {
            nil: null,
          }),
          (token, devSellRatio) => {
            const tokenSummary: TokenSummary = {
              token,
              devSellRatio,
              initialLiquidity: null, // No liquidity data
              liquidityLocked: null, // No lock data
              holdersAfter7Days: null, // No holder data
            };

            const result = calculateHeuristicsScore([tokenSummary]);

            if (devSellRatio === null) {
              // No penalty should be applied for dev sell ratio when null
              // Score should be neutral (50) when no data available
              expect(result.score).toBe(50);
              expect(result.dataAvailable).toBe(false);
            } else if (devSellRatio >= 0.5) {
              // High dev sell ratio penalty should be applied
              // Implementation uses "Developer sold X% of tokens" message
              expect(
                result.notes.some((n) => n.includes("sold") && n.includes("%"))
              ).toBe(true);
              expect(result.penaltiesApplied).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should only apply liquidity penalty when initialLiquidity is available", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.option(fc.constant(0), { nil: null }), // Either 0 or null
          (token, initialLiquidity) => {
            const tokenSummary: TokenSummary = {
              token,
              devSellRatio: null, // No dev sell data
              initialLiquidity,
              liquidityLocked: null, // No lock data
              holdersAfter7Days: null, // No holder data
            };

            const result = calculateHeuristicsScore([tokenSummary]);

            if (initialLiquidity === null) {
              // No penalty should be applied for liquidity when null
              // When all data is null, returns early with neutral score
              expect(result.score).toBe(50); // Neutral score
              expect(result.dataAvailable).toBe(false);
              expect(result.penaltiesApplied).toBe(0);
            } else if (initialLiquidity === 0) {
              // Zero liquidity penalty should be applied
              expect(result.penaltiesApplied).toBeGreaterThan(0);
              expect(result.dataAvailable).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should only apply lock bonus when liquidityLocked is available", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.option(fc.boolean(), { nil: null }),
          (token, liquidityLocked) => {
            const tokenSummary: TokenSummary = {
              token,
              devSellRatio: null,
              initialLiquidity: null,
              liquidityLocked,
              holdersAfter7Days: null,
            };

            const result = calculateHeuristicsScore([tokenSummary]);

            if (liquidityLocked === null) {
              // No bonus/penalty should be applied for lock status when null
              // When all data is null, returns early with neutral score
              expect(result.score).toBe(50); // Neutral score
              expect(result.dataAvailable).toBe(false);
              expect(result.penaltiesApplied).toBe(0);
              expect(result.bonusesApplied).toBe(0);
            } else if (liquidityLocked === true) {
              // Lock bonus should be applied
              expect(
                result.notes.some((n) => n.includes("Liquidity is locked"))
              ).toBe(true);
              expect(result.bonusesApplied).toBeGreaterThan(0);
            } else {
              // Unlocked penalty should be applied
              expect(
                result.notes.some((n) => n.includes("Liquidity not locked"))
              ).toBe(true);
              expect(result.penaltiesApplied).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should only apply holder count penalty when holdersAfter7Days is available", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.option(fc.integer({ min: 0, max: 9 }), { nil: null }), // Very few holders or null
          (token, holdersAfter7Days) => {
            const tokenSummary: TokenSummary = {
              token,
              devSellRatio: null,
              initialLiquidity: null,
              liquidityLocked: null,
              holdersAfter7Days,
            };

            const result = calculateHeuristicsScore([tokenSummary]);

            if (holdersAfter7Days === null) {
              // No penalty should be applied for holder count when null
              // When all data is null, returns early with neutral score
              expect(result.score).toBe(50); // Neutral score
              expect(result.dataAvailable).toBe(false);
              expect(result.penaltiesApplied).toBe(0);
            } else if (holdersAfter7Days < 10) {
              // Low holder count penalty should be applied
              expect(
                result.notes.some((n) => n.includes("Very few holders"))
              ).toBe(true);
              expect(result.penaltiesApplied).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test("should return neutral score (50) when no data is available", () => {
      fc.assert(
        fc.property(
          fc.array(tokenAddressGen(), { minLength: 1, maxLength: 5 }),
          (tokens) => {
            const tokenSummaries: TokenSummary[] = tokens.map((token) => ({
              token,
              devSellRatio: null,
              initialLiquidity: null,
              liquidityLocked: null,
              holdersAfter7Days: null,
            }));

            const result = calculateHeuristicsScore(tokenSummaries);

            // Should return neutral score when no data available
            expect(result.score).toBe(50);
            expect(result.dataAvailable).toBe(false);
            expect(result.penaltiesApplied).toBe(0);
            expect(result.bonusesApplied).toBe(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should apply penalties proportionally to available data", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.double({ min: 0.5, max: 1, noNaN: true }), // High dev sell
          fc.constant(0), // Zero liquidity
          fc.constant(false), // Not locked
          fc.integer({ min: 0, max: 9 }), // Very few holders
          (
            token,
            devSellRatio,
            initialLiquidity,
            liquidityLocked,
            holdersAfter7Days
          ) => {
            // Token with all bad metrics
            const fullDataToken: TokenSummary = {
              token,
              devSellRatio,
              initialLiquidity,
              liquidityLocked,
              holdersAfter7Days,
            };

            // Token with only some bad metrics
            const partialDataToken: TokenSummary = {
              token,
              devSellRatio,
              initialLiquidity: null, // Missing
              liquidityLocked: null, // Missing
              holdersAfter7Days: null, // Missing
            };

            const fullResult = calculateHeuristicsScore([fullDataToken]);
            const partialResult = calculateHeuristicsScore([partialDataToken]);

            // Full data should have more penalties applied
            expect(fullResult.penaltiesApplied).toBeGreaterThan(
              partialResult.penaltiesApplied
            );
            // Full data should have lower score (more penalties)
            expect(fullResult.score).toBeLessThan(partialResult.score);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("Property 8: Bonus application for positive indicators", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 8: Bonus application for positive indicators**
     * **Validates: Requirements 5.5**
     */

    test("should apply bonus for locked liquidity", () => {
      fc.assert(
        fc.property(tokenAddressGen(), (token) => {
          const lockedToken: TokenSummary = {
            token,
            devSellRatio: 0.05, // Low sell ratio (bonus)
            initialLiquidity: 50000, // High liquidity (bonus)
            liquidityLocked: true, // Locked (bonus)
            holdersAfter7Days: 100, // Good holders (bonus)
          };

          const result = calculateHeuristicsScore([lockedToken]);

          // Should have bonuses applied
          expect(result.bonusesApplied).toBeGreaterThan(0);
          // Score should be high (100 capped)
          expect(result.score).toBe(100);
        }),
        { numRuns: 30 }
      );
    });

    test("should apply bonus for low dev sell ratio", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.double({ min: 0, max: 0.09, noNaN: true }), // Very low sell ratio
          (token, devSellRatio) => {
            const lowSellToken: TokenSummary = {
              token,
              devSellRatio,
              initialLiquidity: null,
              liquidityLocked: null,
              holdersAfter7Days: null,
            };

            const result = calculateHeuristicsScore([lowSellToken]);

            // Should have bonus for low sell ratio
            // Implementation uses "Developer held X% of tokens" message for low sell ratio
            expect(
              result.notes.some((n) => n.includes("held") && n.includes("%"))
            ).toBe(true);
            expect(result.bonusesApplied).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should apply bonus for strong initial liquidity", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.integer({ min: 50000, max: 1000000 }), // Strong liquidity
          (token, initialLiquidity) => {
            const highLiquidityToken: TokenSummary = {
              token,
              devSellRatio: null,
              initialLiquidity,
              liquidityLocked: null,
              holdersAfter7Days: null,
            };

            const result = calculateHeuristicsScore([highLiquidityToken]);

            // Should have bonus for strong liquidity
            expect(
              result.notes.some((n) => n.includes("Strong initial liquidity"))
            ).toBe(true);
            expect(result.bonusesApplied).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should apply bonus for good holder count", () => {
      fc.assert(
        fc.property(
          tokenAddressGen(),
          fc.integer({ min: 100, max: 10000 }), // Good holder count
          (token, holdersAfter7Days) => {
            const goodHoldersToken: TokenSummary = {
              token,
              devSellRatio: null,
              initialLiquidity: null,
              liquidityLocked: null,
              holdersAfter7Days,
            };

            const result = calculateHeuristicsScore([goodHoldersToken]);

            // Should have bonus for good holder count
            // Implementation uses "Good holder growth (X holders after 7 days)" message
            expect(
              result.notes.some(
                (n) => n.includes("holder") && n.includes("growth")
              )
            ).toBe(true);
            expect(result.bonusesApplied).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("Edge cases", () => {
    test("should handle empty token array", () => {
      const result = calculateHeuristicsScore([]);

      expect(result.score).toBe(50); // Neutral score
      expect(result.dataAvailable).toBe(false);
      expect(result.penaltiesApplied).toBe(0);
      expect(result.bonusesApplied).toBe(0);
    });

    test("should handle NaN values in devSellRatio", () => {
      const tokenWithNaN: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: NaN,
        initialLiquidity: 1000,
        liquidityLocked: true,
        holdersAfter7Days: 50,
      };

      const result = calculateHeuristicsScore([tokenWithNaN]);

      // NaN should be treated as unavailable - no dev sell penalty should be applied
      // The implementation skips NaN values in the devSellRatio check
      // Other metrics should still be processed
      expect(result.dataAvailable).toBe(true);
      // Should not have any dev sell related notes since NaN is skipped
      expect(
        result.notes.some((n) => n.includes("sold") && n.includes("%"))
      ).toBe(false);
    });

    test("should handle undefined values gracefully", () => {
      const tokenWithUndefined: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: undefined as any,
        initialLiquidity: undefined as any,
        liquidityLocked: undefined as any,
        holdersAfter7Days: undefined as any,
      };

      const result = calculateHeuristicsScore([tokenWithUndefined]);

      // Should return neutral score
      expect(result.score).toBe(50);
      expect(result.dataAvailable).toBe(false);
    });
  });
});
