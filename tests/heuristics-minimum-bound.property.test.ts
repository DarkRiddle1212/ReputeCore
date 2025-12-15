// tests/heuristics-minimum-bound.property.test.ts
import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { calculateHeuristicsScore } from "@/lib/scoring";
import type { TokenSummary } from "@/types";

describe("Heuristics Minimum Bound Properties", () => {
  // **Feature: wallet-trust-scoring, Property 7: Heuristics score minimum bound**
  // **Validates: Requirements 7.5**

  describe("Property 7: Heuristics score minimum bound", () => {
    it("should never allow heuristics score to go below 10", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              token: fc.string().map(() => `0x${"a".repeat(40)}`),
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
              launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
              initialLiquidity: fc.option(
                fc.oneof(
                  fc.constant(0), // Zero liquidity (40 point penalty)
                  fc.nat({ min: 1, max: 1000000 })
                )
              ),
              holdersAfter7Days: fc.option(fc.nat(10000)),
              liquidityLocked: fc.option(fc.boolean()),
              devSellRatio: fc.option(
                fc.double({ min: 0, max: 1.0, noNaN: true })
              ),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (tokens: TokenSummary[]) => {
            const result = calculateHeuristicsScore(tokens);

            // Score should never be below 10, regardless of penalties
            expect(result.score).toBeGreaterThanOrEqual(10);
            expect(result.score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain minimum bound even with extreme penalty combinations", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              token: fc.string().map(() => `0x${"a".repeat(40)}`),
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
              launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
              initialLiquidity: fc.constant(0), // Always zero liquidity (40 point penalty)
              holdersAfter7Days: fc.option(fc.nat(10000)),
              liquidityLocked: fc.constant(false), // Never locked (no bonus)
              devSellRatio: fc.double({ min: 0.5, max: 1.0, noNaN: true }), // Always high dev sell (50 point penalty)
            }),
            { minLength: 1, maxLength: 5 } // Multiple tokens with max penalties
          ),
          (tokens: TokenSummary[]) => {
            const result = calculateHeuristicsScore(tokens);

            // Even with maximum penalties (50 + 40 = 90 points per token),
            // score should still be at least 10
            expect(result.score).toBe(10);

            // Should mention penalties in notes
            const hasPenaltyNote = result.notes.some((note) =>
              note.includes("Total penalties applied")
            );
            expect(hasPenaltyNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should allow scores above minimum when penalties are moderate", () => {
      // Test with a simple case: no penalties, should get high score
      const tokens: TokenSummary[] = [
        {
          token: "0x" + "a".repeat(40),
          name: "TestToken",
          symbol: "TEST",
          creator: "0x" + "b".repeat(40),
          launchAt: "2023-01-01T00:00:00.000Z",
          initialLiquidity: 1000, // Non-zero liquidity (no penalty)
          holdersAfter7Days: 100,
          liquidityLocked: false, // No bonus
          devSellRatio: 0.1, // Low dev sell (no penalty)
        },
      ];

      const result = calculateHeuristicsScore(tokens);

      // With no penalties, score should be 100
      expect(result.score).toBe(100);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("should handle edge case of exactly 90 points penalty (resulting in score 10)", () => {
      fc.assert(
        fc.property(
          fc.record({
            token: fc.string().map(() => `0x${"a".repeat(40)}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.constant(0), // 40 point penalty
            holdersAfter7Days: fc.option(fc.nat(10000)),
            liquidityLocked: fc.constant(false), // No bonus
            devSellRatio: fc.constant(0.5), // Exactly 50 point penalty
          }),
          (token: TokenSummary) => {
            const result = calculateHeuristicsScore([token]);

            // 100 - (40 + 50) = 10, should be exactly 10
            expect(result.score).toBe(10);

            // Should mention both penalties
            const hasZeroLiquidityNote = result.notes.some((note) =>
              note.includes("Zero initial liquidity")
            );
            const hasHighDevSellNote = result.notes.some((note) =>
              note.includes("High dev sell ratio")
            );
            expect(hasZeroLiquidityNote).toBe(true);
            expect(hasHighDevSellNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle empty token array correctly", () => {
      const result = calculateHeuristicsScore([]);

      // No tokens should result in perfect score (100)
      expect(result.score).toBe(100);
      expect(result.notes).toContain("No tokens to analyze for heuristics");
    });

    it("should maintain bounds with mixed penalties and bonuses", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              token: fc.string().map(() => `0x${"a".repeat(40)}`),
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
              launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
              initialLiquidity: fc.option(
                fc.oneof(
                  fc.constant(0), // Penalty
                  fc.nat({ min: 1, max: 1000000 }) // No penalty
                )
              ),
              holdersAfter7Days: fc.option(fc.nat(10000)),
              liquidityLocked: fc.boolean(), // Can be bonus or no bonus
              devSellRatio: fc.option(
                fc.double({ min: 0, max: 1.0, noNaN: true })
              ),
            }),
            { minLength: 1, maxLength: 8 }
          ),
          (tokens: TokenSummary[]) => {
            const result = calculateHeuristicsScore(tokens);

            // Score should always be within valid bounds
            expect(result.score).toBeGreaterThanOrEqual(10);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(Number.isInteger(result.score)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
