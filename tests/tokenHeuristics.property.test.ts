// Feature: wallet-trust-scoring, Property 3: Token outcome classification completeness
// Property-based tests for token outcome classification

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { determineOutcome } from "@/lib/tokenHeuristics";
import type { TokenSummary } from "@/types";

// Generators for token data
const tokenAddressGen = () => {
  const hexChar = fc.constantFrom(
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
  );
  return fc
    .array(hexChar, { minLength: 40, maxLength: 40 })
    .map((arr) => `0x${arr.join("")}`);
};

const dateGen = () =>
  fc
    .integer({ min: 1577836800000, max: Date.now() })
    .map((timestamp) => new Date(timestamp).toISOString());

const tokenSummaryGen = fc.record({
  token: tokenAddressGen(),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
  creator: fc.option(tokenAddressGen()),
  launchAt: fc.option(dateGen()),
  initialLiquidity: fc.option(fc.nat({ max: 1000000 })),
  holdersAfter7Days: fc.option(fc.nat({ max: 10000 })),
  liquidityLocked: fc.option(fc.boolean()),
  devSellRatio: fc.option(fc.double({ min: 0, max: 1, noNaN: true })),
});

describe("Token Outcome Classification Properties", () => {
  describe("Property 3: Token outcome classification completeness", () => {
    it("should always return exactly one of three outcomes", () => {
      fc.assert(
        fc.property(tokenSummaryGen, (token) => {
          const result = determineOutcome(token);
          const validOutcomes = ["success", "rug", "unknown"];
          expect(validOutcomes).toContain(result.outcome);
        }),
        { numRuns: 100 }
      );
    });

    it("should always provide a non-empty reason string", () => {
      fc.assert(
        fc.property(tokenSummaryGen, (token) => {
          const result = determineOutcome(token);
          expect(typeof result.reason).toBe("string");
          expect(result.reason.length).toBeGreaterThan(0);
          expect(result.reason.trim()).toBe(result.reason); // No leading/trailing whitespace
        }),
        { numRuns: 100 }
      );
    });

    it("should classify as success when liquidity is locked AND holders >= 200", () => {
      const successTokenGen = fc.record({
        token: tokenAddressGen(),
        liquidityLocked: fc.constant(true),
        holdersAfter7Days: fc.integer({ min: 200, max: 10000 }),
        // Other fields can be anything
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
        creator: fc.option(tokenAddressGen()),
        launchAt: fc.option(dateGen()),
        initialLiquidity: fc.option(fc.nat()),
        devSellRatio: fc.option(fc.double({ min: 0, max: 1, noNaN: true })),
      });

      fc.assert(
        fc.property(successTokenGen, (token) => {
          const result = determineOutcome(token);
          expect(result.outcome).toBe("success");
          expect(result.reason).toContain("Liquidity locked");
        }),
        { numRuns: 100 }
      );
    });

    it("should classify as rug when dev sell ratio >= 0.5", () => {
      const rugTokenGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.double({ min: 0.5, max: 1, noNaN: true }),
        // Other fields can be anything except success conditions
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
        creator: fc.option(tokenAddressGen()),
        launchAt: fc.option(dateGen()),
        initialLiquidity: fc.option(fc.nat()),
        liquidityLocked: fc.option(fc.boolean()),
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })), // Ensure not success
      });

      fc.assert(
        fc.property(rugTokenGen, (token) => {
          const result = determineOutcome(token);
          expect(result.outcome).toBe("rug");
          expect(result.reason).toContain("developer sell");
        }),
        { numRuns: 100 }
      );
    });

    it("should classify as rug when initial liquidity is exactly 0", () => {
      const zeroLiquidityGen = fc.record({
        token: tokenAddressGen(),
        initialLiquidity: fc.constant(0),
        // Other fields can be anything except success conditions
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
        creator: fc.option(tokenAddressGen()),
        launchAt: fc.option(dateGen()),
        liquidityLocked: fc.option(fc.boolean()),
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })), // Ensure not success
        devSellRatio: fc.option(fc.double({ min: 0, max: 0.49, noNaN: true })), // Ensure not rug by dev sell
      });

      fc.assert(
        fc.property(zeroLiquidityGen, (token) => {
          const result = determineOutcome(token);
          expect(result.outcome).toBe("rug");
          expect(result.reason).toContain("Zero initial liquidity");
        }),
        { numRuns: 100 }
      );
    });

    it("should classify as unknown when insufficient data for success or rug", () => {
      const unknownTokenGen = fc.record({
        token: tokenAddressGen(),
        // Ensure no success conditions
        liquidityLocked: fc.oneof(
          fc.constant(false),
          fc.constant(null),
          fc.constant(undefined)
        ),
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })),
        // Ensure no rug conditions
        devSellRatio: fc.option(fc.double({ min: 0, max: 0.49, noNaN: true })),
        initialLiquidity: fc.option(fc.integer({ min: 1, max: 1000000 })),
        // Other fields
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
        creator: fc.option(tokenAddressGen()),
        launchAt: fc.option(dateGen()),
      });

      fc.assert(
        fc.property(unknownTokenGen, (token) => {
          const result = determineOutcome(token);
          expect(result.outcome).toBe("unknown");
          expect(result.reason).toContain("Insufficient data");
        }),
        { numRuns: 100 }
      );
    });

    it("should be deterministic - same input produces same output", () => {
      fc.assert(
        fc.property(tokenSummaryGen, (token) => {
          const result1 = determineOutcome(token);
          const result2 = determineOutcome(token);
          expect(result1.outcome).toBe(result2.outcome);
          expect(result1.reason).toBe(result2.reason);
        }),
        { numRuns: 100 }
      );
    });

    it("should handle edge cases gracefully", () => {
      // Test with minimal token data
      const minimalToken: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
      };
      const result = determineOutcome(minimalToken);
      expect(["success", "rug", "unknown"]).toContain(result.outcome);
      expect(result.reason).toBeTruthy();

      // Test with null/undefined values
      const nullToken: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        liquidityLocked: null,
        holdersAfter7Days: null,
        devSellRatio: null,
        initialLiquidity: null,
      };
      const nullResult = determineOutcome(nullToken);
      expect(["success", "rug", "unknown"]).toContain(nullResult.outcome);
      expect(nullResult.reason).toBeTruthy();
    });

    it("should prioritize success over rug when both conditions could apply", () => {
      // Token with both success indicators and potential rug indicators
      const conflictingToken: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        liquidityLocked: true,
        holdersAfter7Days: 250, // Success condition
        devSellRatio: 0.6, // Rug condition
      };

      const result = determineOutcome(conflictingToken);
      expect(result.outcome).toBe("success");
    });
  });
});
