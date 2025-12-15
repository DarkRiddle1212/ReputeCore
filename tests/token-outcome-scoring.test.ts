// Unit tests for token outcome scoring scenarios

import { describe, it, expect } from "@jest/globals";
import { computeScore } from "@/lib/scoring";
import type { WalletInfo, TokenSummary } from "@/types";

describe("Token Outcome Scoring Scenarios", () => {
  // Helper to create a basic wallet info
  const createWalletInfo = (
    txCount: number = 100,
    ageDays: number = 100
  ): WalletInfo => ({
    createdAt: new Date(
      Date.now() - ageDays * 24 * 60 * 60 * 1000
    ).toISOString(),
    firstTxHash:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txCount,
    age: `${ageDays} days`,
  });

  // Helper to create a token summary
  const createTokenSummary = (
    overrides: Partial<TokenSummary> = {}
  ): TokenSummary => ({
    token: "0x1234567890abcdef1234567890abcdef12345678",
    name: "Test Token",
    symbol: "TEST",
    creator: "0xabcdef1234567890abcdef1234567890abcdef12",
    launchAt: new Date().toISOString(),
    initialLiquidity: 1000,
    holdersAfter7Days: 100,
    liquidityLocked: false,
    devSellRatio: 0.1,
    ...overrides,
  });

  describe("Empty token array scenarios", () => {
    it("should assign neutral score (75) when no tokens are launched", () => {
      const walletInfo = createWalletInfo();
      const result = computeScore(walletInfo, []);

      expect(result.breakdown.tokenOutcomeScore).toBe(75);
      expect(
        result.notes.some((note) => note.includes("No token launches detected"))
      ).toBe(true);
    });

    it("should use simplified weights when no tokens exist", () => {
      const walletInfo = createWalletInfo(500, 200); // Active, old wallet
      const result = computeScore(walletInfo, []);

      // With no tokens, should heavily weight age and activity
      // Age: 200 days = 80 score, Activity: 500 txs = 80 score
      // Expected: 80 * 0.6 + 80 * 0.4 = 48 + 32 = 80
      expect(result.score).toBe(80);
      expect(
        result.notes.some((note) =>
          note.includes("based on wallet metrics only")
        )
      ).toBe(true);
    });
  });

  describe("All success tokens scenarios", () => {
    it("should score highly when all tokens are successful", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          liquidityLocked: true,
          holdersAfter7Days: 250,
          devSellRatio: 0.05,
          outcome: "success" as any,
        }),
        createTokenSummary({
          liquidityLocked: true,
          holdersAfter7Days: 300,
          devSellRatio: 0.02,
          outcome: "success" as any,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // All success tokens should give high token outcome score
      expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(90);
      expect(
        result.notes.some((note) => note.includes("show positive indicators"))
      ).toBe(true);
    });
  });

  describe("All rug tokens scenarios", () => {
    it("should score very low when all tokens are rugs", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          devSellRatio: 0.8,
          initialLiquidity: 0,
          outcome: "rug" as any,
        }),
        createTokenSummary({
          devSellRatio: 0.9,
          liquidityLocked: false,
          outcome: "rug" as any,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // All rug tokens should give very low token outcome score
      expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(20);
      expect(
        result.notes.some((note) =>
          note.includes("flagged as potential rug pulls")
        )
      ).toBe(true);
    });

    it("should apply severe heuristics penalties for rug tokens", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          devSellRatio: 0.8, // 50 point penalty
          initialLiquidity: 0, // 40 point penalty
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Heuristics score should be heavily penalized
      // 100 - 50 - 40 = 10 (minimum)
      expect(result.breakdown.heuristicsScore).toBe(10);
    });
  });

  describe("Mixed outcomes scenarios", () => {
    it("should balance scores with mixed token outcomes", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          liquidityLocked: true,
          holdersAfter7Days: 250,
          devSellRatio: 0.05,
          outcome: "success" as any,
        }),
        createTokenSummary({
          devSellRatio: 0.8,
          initialLiquidity: 0,
          outcome: "rug" as any,
        }),
        createTokenSummary({
          devSellRatio: 0.1,
          holdersAfter7Days: 50,
          outcome: "unknown" as any,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Should be somewhere in the middle
      expect(result.breakdown.tokenOutcomeScore).toBeGreaterThan(30);
      expect(result.breakdown.tokenOutcomeScore).toBeLessThan(80);

      expect(
        result.notes.some((note) => note.includes("show positive indicators"))
      ).toBe(true);
      expect(
        result.notes.some((note) =>
          note.includes("flagged as potential rug pulls")
        )
      ).toBe(true);
    });

    it("should calculate token outcome score using the correct formula", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({ outcome: "success" as any }),
        createTokenSummary({ outcome: "success" as any }),
        createTokenSummary({ outcome: "rug" as any }),
        createTokenSummary({ outcome: "unknown" as any }),
      ];

      const result = computeScore(walletInfo, tokens);

      // 2 success, 1 rug, 1 unknown out of 4 total
      // success_ratio = 2/4 = 0.5
      // rug_ratio = 1/4 = 0.25
      // Formula: 100 × (0.5 × 0.5 + 0.5 × (1 - 0.25)) = 100 × (0.25 + 0.375) = 62.5
      expect(result.breakdown.tokenOutcomeScore).toBe(63); // Rounded
    });
  });

  describe("Unknown tokens scenarios", () => {
    it("should handle tokens with insufficient data", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          devSellRatio: null,
          initialLiquidity: null,
          liquidityLocked: null,
          holdersAfter7Days: null,
        }),
        createTokenSummary({
          devSellRatio: null,
          initialLiquidity: null,
          liquidityLocked: null,
          holdersAfter7Days: null,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Should assign neutral score for insufficient data
      expect(result.breakdown.tokenOutcomeScore).toBe(50);
      expect(
        result.notes.some((note) =>
          note.includes("insufficient data to assess quality")
        )
      ).toBe(true);
    });

    it("should use reduced weights for insufficient data", () => {
      const walletInfo = createWalletInfo(1000, 400); // Very active, old wallet
      const tokens = [
        createTokenSummary({
          devSellRatio: null,
          initialLiquidity: null,
          liquidityLocked: null,
          holdersAfter7Days: null,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Should note that scoring is based primarily on wallet metrics
      expect(
        result.notes.some((note) =>
          note.includes("based primarily on wallet age and activity")
        )
      ).toBe(true);

      // Score should be influenced more by wallet age and activity
      expect(result.score).toBeGreaterThan(70); // Should be high due to good wallet metrics
    });
  });

  describe("Edge cases", () => {
    it("should handle tokens with partial data", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          devSellRatio: 0.3,
          initialLiquidity: null,
          liquidityLocked: null,
          holdersAfter7Days: 150,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Should still process the available data
      expect(result.breakdown.tokenOutcomeScore).toBeGreaterThan(0);
      expect(result.breakdown.tokenOutcomeScore).toBeLessThan(100);
    });

    it("should handle zero initial liquidity correctly", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          initialLiquidity: 0,
          devSellRatio: 0.1,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Zero liquidity should trigger penalty
      expect(result.breakdown.heuristicsScore).toBeLessThan(70); // Should have penalty applied
    });

    it("should handle locked liquidity bonus", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          liquidityLocked: true,
          devSellRatio: 0.1,
          initialLiquidity: 1000,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Locked liquidity should provide bonus (negative penalty)
      expect(result.breakdown.heuristicsScore).toBeGreaterThan(90); // Should have bonus applied
    });

    it("should enforce minimum score bounds", () => {
      const walletInfo = createWalletInfo();
      const tokens = [
        createTokenSummary({
          devSellRatio: 1.0, // Maximum sell ratio
          initialLiquidity: 0, // Zero liquidity
          liquidityLocked: false,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Even with maximum penalties, scores should not go below minimum bounds
      expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(10);
      expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("should enforce maximum score bounds", () => {
      const walletInfo = createWalletInfo(5000, 1000); // Perfect wallet
      const tokens = [
        createTokenSummary({
          liquidityLocked: true,
          holdersAfter7Days: 1000,
          devSellRatio: 0.0,
          initialLiquidity: 100000,
          outcome: "success" as any,
        }),
      ];

      const result = computeScore(walletInfo, tokens);

      // Token outcome score should be bounded
      expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(100);

      // Heuristics score can exceed 100 due to bonuses, but final score should be bounded
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});
