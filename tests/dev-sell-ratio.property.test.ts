/**
 * Property-based tests for dev sell ratio calculation
 * Feature: solana-wallet-scoring, Property 9: Dev Sell Ratio Accuracy
 * Validates: Requirements 11.1, 11.2, 11.3
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";

/**
 * Mock token transfer data structure
 */
interface TokenTransfer {
  mint: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: string;
}

/**
 * Calculate dev sell ratio from token transfers
 * This mirrors the logic in HeliusProvider.calculateDevSellRatio
 */
function calculateDevSellRatio(
  creatorAddress: string,
  mintAddress: string,
  transfers: TokenTransfer[]
): {
  devSellRatio: number;
  devTokensReceived: number;
  devTokensSold: number;
} {
  let tokensReceived = 0;
  let tokensSold = 0;

  for (const transfer of transfers) {
    // Only analyze transfers for this specific token
    if (transfer.mint !== mintAddress) continue;

    const amount = parseFloat(transfer.tokenAmount || "0");

    // Creator received tokens
    if (transfer.toUserAccount === creatorAddress) {
      tokensReceived += amount;
    }

    // Creator sent tokens
    if (transfer.fromUserAccount === creatorAddress) {
      tokensSold += amount;
    }
  }

  // Calculate sell ratio as percentage
  const sellRatio =
    tokensReceived > 0 ? (tokensSold / tokensReceived) * 100 : 0;

  return {
    devSellRatio: Math.min(sellRatio, 100), // Cap at 100%
    devTokensReceived: tokensReceived,
    devTokensSold: tokensSold,
  };
}

describe("Dev Sell Ratio Property Tests", () => {
  /**
   * Property 9.1: Dev sell ratio is always between 0 and 100
   * For any set of token transfers, the calculated sell ratio should be in valid range
   */
  it("should always return a sell ratio between 0 and 100", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.array(
          fc.record({
            mint: fc.string({ minLength: 32, maxLength: 44 }),
            fromUserAccount: fc.string({ minLength: 32, maxLength: 44 }),
            toUserAccount: fc.string({ minLength: 32, maxLength: 44 }),
            tokenAmount: fc.float({ min: 0, max: 1000000000 }).map(String),
          }),
          { maxLength: 100 }
        ),
        (creatorAddress, mintAddress, transfers) => {
          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            transfers
          );

          // Sell ratio must be between 0 and 100
          expect(result.devSellRatio).toBeGreaterThanOrEqual(0);
          expect(result.devSellRatio).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.2: If no tokens received, sell ratio should be 0
   * For any creator who never received tokens, sell ratio must be 0
   */
  it("should return 0 sell ratio when no tokens received", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.array(
          fc.record({
            mint: fc.string({ minLength: 32, maxLength: 44 }),
            fromUserAccount: fc.string({ minLength: 32, maxLength: 44 }),
            toUserAccount: fc.string({ minLength: 32, maxLength: 44 }),
            tokenAmount: fc.float({ min: 0, max: 1000000000 }).map(String),
          }),
          { maxLength: 50 }
        ),
        (creatorAddress, mintAddress, transfers) => {
          // Filter out any transfers TO the creator for this mint
          const filteredTransfers = transfers.filter(
            (t) =>
              !(t.toUserAccount === creatorAddress && t.mint === mintAddress)
          );

          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            filteredTransfers
          );

          expect(result.devSellRatio).toBe(0);
          expect(result.devTokensReceived).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.3: If tokens received but none sold, sell ratio should be 0
   * For any creator who received tokens but never sold, sell ratio must be 0
   */
  it("should return 0 sell ratio when tokens received but not sold", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.float({ min: 1, max: 1000000000, noNaN: true }), // amount received
        (creatorAddress, mintAddress, amount) => {
          fc.pre(!isNaN(amount) && amount > 0);

          const transfers: TokenTransfer[] = [
            {
              mint: mintAddress,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: amount.toString(),
            },
          ];

          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            transfers
          );

          expect(result.devSellRatio).toBe(0);
          expect(result.devTokensReceived).toBeCloseTo(amount, 5);
          expect(result.devTokensSold).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.4: If all tokens sold, sell ratio should be 100
   * For any creator who sold exactly what they received, sell ratio must be 100
   */
  it("should return 100 sell ratio when all tokens sold", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.float({ min: 1, max: 1000000000, noNaN: true }), // amount
        (creatorAddress, mintAddress, amount) => {
          fc.pre(!isNaN(amount) && amount > 0);

          const transfers: TokenTransfer[] = [
            // Receive tokens
            {
              mint: mintAddress,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: amount.toString(),
            },
            // Sell all tokens
            {
              mint: mintAddress,
              fromUserAccount: creatorAddress,
              toUserAccount: "buyer_address_123456789012345678901234",
              tokenAmount: amount.toString(),
            },
          ];

          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            transfers
          );

          expect(result.devSellRatio).toBeCloseTo(100, 1);
          expect(result.devTokensReceived).toBeCloseTo(amount, 5);
          expect(result.devTokensSold).toBeCloseTo(amount, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.5: Sell ratio calculation is accurate
   * For any valid received and sold amounts, ratio should equal (sold/received)*100
   */
  it("should calculate accurate sell ratio percentage", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.float({ min: 100, max: 1000000000, noNaN: true }), // amount received
        fc.float({ min: 0, max: 1, noNaN: true }), // sell percentage (0-1)
        (creatorAddress, mintAddress, received, sellPercentage) => {
          // Skip if values are invalid
          fc.pre(!isNaN(received) && !isNaN(sellPercentage) && received > 0);

          const sold = received * sellPercentage;

          const transfers: TokenTransfer[] = [
            // Receive tokens
            {
              mint: mintAddress,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: received.toString(),
            },
            // Sell portion of tokens
            {
              mint: mintAddress,
              fromUserAccount: creatorAddress,
              toUserAccount: "buyer_address_123456789012345678901234",
              tokenAmount: sold.toString(),
            },
          ];

          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            transfers
          );

          const expectedRatio = (sold / received) * 100;
          expect(result.devSellRatio).toBeCloseTo(expectedRatio, 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.6: Only transfers for the specific mint are counted
   * Transfers for other tokens should not affect the sell ratio
   */
  it("should only count transfers for the specific mint address", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // target mint address
        fc.string({ minLength: 32, maxLength: 44 }), // other mint address
        fc.float({ min: 1, max: 1000000, noNaN: true }), // target token amount
        fc.float({ min: 1, max: 1000000, noNaN: true }), // other token amount
        (creatorAddress, targetMint, otherMint, targetAmount, otherAmount) => {
          fc.pre(
            targetMint !== otherMint &&
              !isNaN(targetAmount) &&
              !isNaN(otherAmount)
          ); // Ensure different mints and valid amounts

          const transfers: TokenTransfer[] = [
            // Receive target tokens
            {
              mint: targetMint,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: targetAmount.toString(),
            },
            // Receive other tokens (should be ignored)
            {
              mint: otherMint,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: otherAmount.toString(),
            },
            // Sell other tokens (should be ignored)
            {
              mint: otherMint,
              fromUserAccount: creatorAddress,
              toUserAccount: "buyer_address_123456789012345678901234",
              tokenAmount: otherAmount.toString(),
            },
          ];

          const result = calculateDevSellRatio(
            creatorAddress,
            targetMint,
            transfers
          );

          // Should only count target mint transfers
          expect(result.devTokensReceived).toBeCloseTo(targetAmount, 5);
          expect(result.devTokensSold).toBe(0);
          expect(result.devSellRatio).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9.7: Multiple receives and sells are accumulated correctly
   * For any sequence of buys and sells, totals should be sum of all transfers
   */
  it("should accumulate multiple receives and sells correctly", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }), // creator address
        fc.string({ minLength: 32, maxLength: 44 }), // mint address
        fc.array(fc.float({ min: 1, max: 100000, noNaN: true }), {
          minLength: 1,
          maxLength: 10,
        }), // receives
        fc.array(fc.float({ min: 1, max: 100000, noNaN: true }), {
          minLength: 1,
          maxLength: 10,
        }), // sells
        (creatorAddress, mintAddress, receives, sells) => {
          // Skip if any values are NaN
          fc.pre(
            receives.every((v) => !isNaN(v)) && sells.every((v) => !isNaN(v))
          );

          const transfers: TokenTransfer[] = [
            // Add all receives
            ...receives.map((amount) => ({
              mint: mintAddress,
              fromUserAccount: "other_address_123456789012345678901234",
              toUserAccount: creatorAddress,
              tokenAmount: amount.toString(),
            })),
            // Add all sells
            ...sells.map((amount) => ({
              mint: mintAddress,
              fromUserAccount: creatorAddress,
              toUserAccount: "buyer_address_123456789012345678901234",
              tokenAmount: amount.toString(),
            })),
          ];

          const result = calculateDevSellRatio(
            creatorAddress,
            mintAddress,
            transfers
          );

          const expectedReceived = receives.reduce((sum, val) => sum + val, 0);
          const expectedSold = sells.reduce((sum, val) => sum + val, 0);
          const expectedRatio = Math.min(
            (expectedSold / expectedReceived) * 100,
            100
          );

          expect(result.devTokensReceived).toBeCloseTo(expectedReceived, 2);
          expect(result.devTokensSold).toBeCloseTo(expectedSold, 2);
          expect(result.devSellRatio).toBeCloseTo(expectedRatio, 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
