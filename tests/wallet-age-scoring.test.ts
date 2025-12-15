// Unit tests for wallet age scoring edge cases

import { describe, it, expect } from "@jest/globals";
import { computeScore } from "@/lib/scoring";
import { WalletInfo, TokenSummary } from "@/types";

describe("Wallet Age Scoring Edge Cases", () => {
  const createWalletInfo = (
    createdAt: string | null,
    txCount: number = 100
  ): WalletInfo => ({
    createdAt,
    firstTxHash: "0x" + "0".repeat(64),
    txCount,
    age: createdAt ? "1 year" : null,
  });

  const emptyTokens: TokenSummary[] = [];

  describe("Boundary Values", () => {
    it("should score exactly 0 days as very new (score 10)", () => {
      const now = new Date();
      const walletInfo = createWalletInfo(now.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(10);
      expect(result.notes.some((note) => note.includes("very new"))).toBe(true);
      expect(result.notes.some((note) => note.includes("HIGH RISK"))).toBe(
        true
      );
    });

    it("should score exactly 7 days as boundary between very new and limited history", () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(sevenDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(40);
      expect(result.notes.some((note) => note.includes("1-4 weeks"))).toBe(
        true
      );
    });

    it("should score exactly 30 days as boundary between limited and moderate history", () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(thirtyDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(60);
      expect(result.notes.some((note) => note.includes("1-3 months"))).toBe(
        true
      );
    });

    it("should score exactly 90 days as boundary between moderate and established", () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(ninetyDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(80);
      expect(result.notes.some((note) => note.includes("3-12 months"))).toBe(
        true
      );
    });

    it("should score exactly 365 days as fully established", () => {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(oneYearAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("older than 1 year"))
      ).toBe(true);
    });

    it("should score more than 365 days as fully established", () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(twoYearsAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("older than 1 year"))
      ).toBe(true);
    });
  });

  describe("Edge Cases Around Boundaries", () => {
    it("should score 6 days as very new", () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(sixDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(10);
    });

    it("should score 8 days as limited history", () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(eightDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(40);
    });

    it("should score 29 days as limited history", () => {
      const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(twentyNineDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(40);
    });

    it("should score 31 days as moderate history", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(thirtyOneDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(60);
    });

    it("should score 89 days as moderate history", () => {
      const eightyNineDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(eightyNineDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(60);
    });

    it("should score 91 days as established", () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(ninetyOneDaysAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(80);
    });

    it("should score 364 days as established", () => {
      const almostOneYearAgo = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(almostOneYearAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(80);
    });

    it("should score 366 days as fully established", () => {
      const overOneYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(overOneYearAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(100);
    });
  });

  describe("Null and Undefined Age Handling", () => {
    it("should handle null createdAt with default score", () => {
      const walletInfo = createWalletInfo(null);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(50);
      expect(result.notes.some((note) => note.includes("age unknown"))).toBe(
        true
      );
    });

    it("should handle undefined createdAt with default score", () => {
      const walletInfo: WalletInfo = {
        createdAt: undefined as any,
        firstTxHash: "0x" + "0".repeat(64),
        txCount: 100,
        age: null,
      };

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(50);
      expect(result.notes.some((note) => note.includes("age unknown"))).toBe(
        true
      );
    });

    it("should handle empty string createdAt with default score", () => {
      const walletInfo = createWalletInfo("");

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(50);
      expect(result.notes.some((note) => note.includes("age unknown"))).toBe(
        true
      );
    });

    it("should handle invalid date string with default score", () => {
      const walletInfo = createWalletInfo("invalid-date");

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.walletAgeScore).toBe(50);
      expect(result.notes.some((note) => note.includes("age unknown"))).toBe(
        true
      );
    });
  });

  describe("Note Generation for Each Tier", () => {
    it("should generate appropriate note for very new wallets", () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(oneDayAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) => note.includes("very new") && note.includes("HIGH RISK")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for limited history wallets", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(twoWeeksAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("1-4 weeks") && note.includes("very limited history")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for moderate history wallets", () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(twoMonthsAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("1-3 months") && note.includes("limited history")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for established wallets", () => {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(sixMonthsAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("3-12 months") && note.includes("moderate history")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for fully established wallets", () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(twoYearsAgo.toISOString());

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("older than 1 year") && note.includes("established")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for unknown age", () => {
      const walletInfo = createWalletInfo(null);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.notes.some((note) => note.includes("age unknown"))).toBe(
        true
      );
    });
  });

  describe("Integration with Overall Scoring", () => {
    it("should properly weight wallet age in final score when no tokens", () => {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(oneYearAgo.toISOString(), 1000);

      const result = computeScore(walletInfo, emptyTokens);

      // With no tokens: age 60%, activity 40%
      // Age score: 100, Activity score: 100
      // Expected final: 100 * 0.6 + 100 * 0.4 = 100
      expect(result.score).toBe(100);
      expect(result.breakdown.walletAgeScore).toBe(100);
    });

    it("should handle very new wallet with low activity", () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const walletInfo = createWalletInfo(oneDayAgo.toISOString(), 5);

      const result = computeScore(walletInfo, emptyTokens);

      // Age score: 10, Activity score: 20
      // Expected final: 10 * 0.6 + 20 * 0.4 = 6 + 8 = 14
      expect(result.score).toBe(14);
      expect(result.breakdown.walletAgeScore).toBe(10);
    });
  });
});
