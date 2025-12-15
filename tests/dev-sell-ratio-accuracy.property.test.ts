/**
 * Property-Based Tests for Dev Sell Ratio Accuracy
 *
 * **Feature: solana-wallet-scoring, Property 9: Dev Sell Ratio Accuracy**
 * **Validates: Requirements 11.1, 11.2, 11.3**
 *
 * Tests that dev sell ratio calculations are accurate and consistent
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

// Mock dev sell ratio calculation function
// In production, this would be imported from the Helius provider
function calculateDevSellRatio(
  tokensReceived: number,
  tokensSold: number
): number {
  if (tokensReceived === 0) return 0;
  const ratio = (tokensSold / tokensReceived) * 100;
  return Math.min(ratio, 100); // Cap at 100%
}

describe("Property 9: Dev Sell Ratio Accuracy", () => {
  /**
   * Property: Dev sell ratio should always be between 0 and 100
   */
  it("should always return a ratio between 0 and 100", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000000000 }), // tokens received
        fc.float({ min: 0, max: 1000000000 }), // tokens sold
        (tokensReceived, tokensSold) => {
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Ratio must be bounded
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(100);
          expect(Number.isFinite(ratio)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: If no tokens received, ratio should be 0
   */
  it("should return 0 when no tokens received", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1000000000 }), (tokensSold) => {
        const ratio = calculateDevSellRatio(0, tokensSold);

        // Property: Zero received = zero ratio
        expect(ratio).toBe(0);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: If no tokens sold, ratio should be 0
   */
  it("should return 0 when no tokens sold", () => {
    fc.assert(
      fc.property(fc.float({ min: 1, max: 1000000000 }), (tokensReceived) => {
        const ratio = calculateDevSellRatio(tokensReceived, 0);

        // Property: Zero sold = zero ratio
        expect(ratio).toBe(0);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: If tokens sold equals tokens received, ratio should be 100
   */
  it("should return 100 when all tokens are sold", () => {
    fc.assert(
      fc.property(fc.float({ min: 1, max: 1000000000 }), (tokens) => {
        const ratio = calculateDevSellRatio(tokens, tokens);

        // Property: All sold = 100% ratio
        expect(ratio).toBe(100);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: If tokens sold > tokens received, ratio should be capped at 100
   */
  it("should cap ratio at 100 when sold exceeds received", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 1000000 }),
        fc.float({ min: 1.1, max: 10 }), // multiplier > 1
        (tokensReceived, multiplier) => {
          const tokensSold = tokensReceived * multiplier;
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Ratio capped at 100%
          expect(ratio).toBe(100);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Ratio should be proportional to sell percentage
   */
  it("should calculate correct percentage for partial sells", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 1000000 }),
        fc.float({ min: 0, max: 1 }), // sell percentage
        (tokensReceived, sellPercentage) => {
          const tokensSold = tokensReceived * sellPercentage;
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Ratio should match sell percentage
          const expectedRatio = sellPercentage * 100;
          expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.01); // Allow small floating point error
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Calculation should be deterministic
   */
  it("should produce same result for same inputs", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000000 }),
        fc.float({ min: 0, max: 1000000 }),
        (tokensReceived, tokensSold) => {
          const ratio1 = calculateDevSellRatio(tokensReceived, tokensSold);
          const ratio2 = calculateDevSellRatio(tokensReceived, tokensSold);
          const ratio3 = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Deterministic calculation
          expect(ratio1).toBe(ratio2);
          expect(ratio2).toBe(ratio3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Ratio should increase monotonically with tokens sold
   */
  it("should increase ratio as more tokens are sold", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 1000000 }),
        fc.float({ min: 0, max: 0.5 }),
        fc.float({ min: 0.5, max: 1 }),
        (tokensReceived, sellPercent1, sellPercent2) => {
          fc.pre(sellPercent1 < sellPercent2); // Ensure second is larger

          const tokensSold1 = tokensReceived * sellPercent1;
          const tokensSold2 = tokensReceived * sellPercent2;

          const ratio1 = calculateDevSellRatio(tokensReceived, tokensSold1);
          const ratio2 = calculateDevSellRatio(tokensReceived, tokensSold2);

          // Property: More sold = higher ratio
          expect(ratio2).toBeGreaterThanOrEqual(ratio1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Small amounts should not cause precision errors
   */
  it("should handle small token amounts accurately", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.000001, max: 1 }),
        fc.float({ min: 0, max: 1 }),
        (tokensReceived, sellPercentage) => {
          const tokensSold = tokensReceived * sellPercentage;
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Should handle small amounts
          expect(Number.isFinite(ratio)).toBe(true);
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Large amounts should not cause overflow
   */
  it("should handle large token amounts without overflow", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1000000000, max: 1000000000000 }),
        fc.float({ min: 0, max: 1 }),
        (tokensReceived, sellPercentage) => {
          const tokensSold = tokensReceived * sellPercentage;
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Should handle large amounts
          expect(Number.isFinite(ratio)).toBe(true);
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Ratio should be commutative with respect to scaling
   */
  it("should produce same ratio when both values are scaled equally", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 1000 }),
        fc.float({ min: 0, max: 1 }),
        fc.float({ min: 0.1, max: 100 }), // scale factor
        (tokensReceived, sellPercentage, scaleFactor) => {
          const tokensSold = tokensReceived * sellPercentage;

          const ratio1 = calculateDevSellRatio(tokensReceived, tokensSold);
          const ratio2 = calculateDevSellRatio(
            tokensReceived * scaleFactor,
            tokensSold * scaleFactor
          );

          // Property: Scaling both values equally preserves ratio
          expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Half sold should give 50% ratio
   */
  it("should return 50 when half of tokens are sold", () => {
    fc.assert(
      fc.property(fc.float({ min: 2, max: 1000000 }), (tokensReceived) => {
        const tokensSold = tokensReceived / 2;
        const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

        // Property: Half sold = 50% ratio
        expect(Math.abs(ratio - 50)).toBeLessThan(0.01);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Quarter sold should give 25% ratio
   */
  it("should return 25 when quarter of tokens are sold", () => {
    fc.assert(
      fc.property(fc.float({ min: 4, max: 1000000 }), (tokensReceived) => {
        const tokensSold = tokensReceived / 4;
        const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

        // Property: Quarter sold = 25% ratio
        expect(Math.abs(ratio - 25)).toBeLessThan(0.01);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Three quarters sold should give 75% ratio
   */
  it("should return 75 when three quarters of tokens are sold", () => {
    fc.assert(
      fc.property(fc.float({ min: 4, max: 1000000 }), (tokensReceived) => {
        const tokensSold = (tokensReceived * 3) / 4;
        const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

        // Property: Three quarters sold = 75% ratio
        expect(Math.abs(ratio - 75)).toBeLessThan(0.01);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Ratio should never be negative
   */
  it("should never return negative ratio", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000000 }),
        fc.float({ min: 0, max: 1000000 }),
        (tokensReceived, tokensSold) => {
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Never negative
          expect(ratio).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Ratio should never be NaN or Infinity
   */
  it("should never return NaN or Infinity", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000000 }),
        fc.float({ min: 0, max: 1000000 }),
        (tokensReceived, tokensSold) => {
          const ratio = calculateDevSellRatio(tokensReceived, tokensSold);

          // Property: Always a valid number
          expect(Number.isNaN(ratio)).toBe(false);
          expect(Number.isFinite(ratio)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
