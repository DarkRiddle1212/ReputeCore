// tests/heuristics-penalty.property.test.ts
import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { calculateHeuristicsScore } from "@/lib/scoring";
import type { TokenSummary } from "@/types";

describe("Heuristics Penalty Application Properties", () => {
  // **Feature: wallet-trust-scoring, Property 6: Heuristics penalty application**
  // **Validates: Requirements 7.1, 7.2, 7.3**

  describe("Property 6: Heuristics penalty application", () => {
    it("should apply 50-point penalty for dev sell ratio >= 50%", () => {
      fc.assert(
        fc.property(
          fc.record({
            token: fc.string().map(() => `0x${"a".repeat(40)}`), // Simple fixed address for testing
            name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
            launchAt: fc.option(fc.date().map((d) => d.toISOString())),
            initialLiquidity: fc.option(fc.nat(1000000)),
            holdersAfter7Days: fc.option(fc.nat(10000)),
            liquidityLocked: fc.constant(false), // No bonus to isolate penalty
            devSellRatio: fc.double({ min: 0.5, max: 1.0, noNaN: true }), // >= 50%
          }),
          (token: TokenSummary) => {
            const result = calculateHeuristicsScore([token]);

            // Should apply at least 50 point penalty
            expect(result.score).toBeLessThanOrEqual(50);

            // Should mention the penalty in notes
            const hasHighDevSellNote = result.notes.some(
              (note) =>
                note.includes("High dev sell ratio") &&
                note.includes("50 point penalty")
            );
            expect(hasHighDevSellNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply 20-point penalty for dev sell ratio between 25-50%", () => {
      fc.assert(
        fc.property(
          fc.record({
            token: fc.string().map(() => `0x${"a".repeat(40)}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
            launchAt: fc.option(fc.date().map((d) => d.toISOString())),
            initialLiquidity: fc.option(fc.nat(1000000)),
            holdersAfter7Days: fc.option(fc.nat(10000)),
            liquidityLocked: fc.constant(false), // No bonus to isolate penalty
            devSellRatio: fc.double({ min: 0.25, max: 0.49, noNaN: true }), // 25-50%
          }),
          (token: TokenSummary) => {
            const result = calculateHeuristicsScore([token]);

            // Should apply at least 20 point penalty (score <= 80)
            expect(result.score).toBeLessThanOrEqual(80);

            // Should mention the penalty in notes
            const hasModerateDevSellNote = result.notes.some(
              (note) =>
                note.includes("Moderate dev sell ratio") &&
                note.includes("20 point penalty")
            );
            expect(hasModerateDevSellNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply 40-point penalty for zero initial liquidity", () => {
      fc.assert(
        fc.property(
          fc.record({
            token: fc.string().map(() => `0x${"a".repeat(40)}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
            launchAt: fc.option(fc.date().map((d) => d.toISOString())),
            initialLiquidity: fc.constant(0), // Zero liquidity
            holdersAfter7Days: fc.option(fc.nat(10000)),
            liquidityLocked: fc.constant(false), // No bonus to isolate penalty
            devSellRatio: fc.option(
              fc.double({ min: 0, max: 0.24, noNaN: true })
            ), // Keep dev sell low to isolate penalty
          }),
          (token: TokenSummary) => {
            const result = calculateHeuristicsScore([token]);

            // Should apply at least 40 point penalty (score <= 60)
            expect(result.score).toBeLessThanOrEqual(60);

            // Should mention the penalty in notes
            const hasZeroLiquidityNote = result.notes.some(
              (note) =>
                note.includes("Zero initial liquidity") &&
                note.includes("40 point penalty")
            );
            expect(hasZeroLiquidityNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply 20-point bonus for locked liquidity", () => {
      fc.assert(
        fc.property(
          fc.record({
            token: fc.string().map(() => `0x${"a".repeat(40)}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
            launchAt: fc.option(fc.date().map((d) => d.toISOString())),
            initialLiquidity: fc.option(fc.nat({ min: 1, max: 1000000 })), // Non-zero liquidity
            holdersAfter7Days: fc.option(fc.nat(10000)),
            liquidityLocked: fc.constant(true), // Locked liquidity
            devSellRatio: fc.option(
              fc.double({ min: 0, max: 0.24, noNaN: true })
            ), // Keep dev sell low to isolate bonus
          }),
          (token: TokenSummary) => {
            const result = calculateHeuristicsScore([token]);

            // Should mention the bonus in notes
            const hasLockedLiquidityNote = result.notes.some(
              (note) =>
                note.includes("Liquidity locked") &&
                note.includes("20 point bonus")
            );
            expect(hasLockedLiquidityNote).toBe(true);

            // Compare with same token but unlocked liquidity
            const unlockedToken = { ...token, liquidityLocked: false };
            const unlockedResult = calculateHeuristicsScore([unlockedToken]);

            // Locked version should have higher score (20 point bonus)
            expect(result.score).toBeGreaterThanOrEqual(unlockedResult.score);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should combine multiple penalties and bonuses correctly", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              token: fc.string().map(() => `0x${"a".repeat(40)}`),
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
              symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              creator: fc.option(fc.string().map(() => `0x${"b".repeat(40)}`)),
              launchAt: fc.option(fc.date().map((d) => d.toISOString())),
              initialLiquidity: fc.option(
                fc.oneof(
                  fc.constant(0), // Zero liquidity (40 point penalty)
                  fc.nat({ min: 1, max: 1000000 }) // Non-zero liquidity
                )
              ),
              holdersAfter7Days: fc.option(fc.nat(10000)),
              liquidityLocked: fc.option(fc.boolean()),
              devSellRatio: fc.option(
                fc.oneof(
                  fc.double({ min: 0.5, max: 1.0, noNaN: true }), // High dev sell (50 point penalty)
                  fc.double({ min: 0.25, max: 0.49, noNaN: true }), // Moderate dev sell (20 point penalty)
                  fc.double({ min: 0, max: 0.24, noNaN: true }) // Low dev sell (no penalty)
                )
              ),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (tokens: TokenSummary[]) => {
            const result = calculateHeuristicsScore(tokens);

            // Calculate expected penalty manually
            let expectedPenalty = 0;
            for (const token of tokens) {
              if (
                token.devSellRatio !== null &&
                token.devSellRatio !== undefined
              ) {
                if (token.devSellRatio >= 0.5) expectedPenalty += 50;
                else if (token.devSellRatio >= 0.25) expectedPenalty += 20;
              }
              if (token.initialLiquidity === 0) expectedPenalty += 40;
              if (token.liquidityLocked === true) expectedPenalty -= 20; // Bonus
            }

            const expectedScore = Math.max(
              10,
              Math.min(100, 100 - expectedPenalty)
            );
            expect(result.score).toBe(expectedScore);

            // Should mention total penalties if any were applied
            if (expectedPenalty > 0) {
              const hasPenaltyNote = result.notes.some(
                (note) =>
                  note.includes("Total penalties applied") ||
                  note.includes("Net bonus applied")
              );
              expect(hasPenaltyNote).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
