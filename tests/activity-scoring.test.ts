// Unit tests for activity scoring edge cases

import { describe, it, expect } from "@jest/globals";
import { computeScore } from "@/lib/scoring";
import { WalletInfo, TokenSummary } from "@/types";

describe("Activity Scoring Edge Cases", () => {
  const createWalletInfo = (
    txCount: number,
    createdAt: string | null = null
  ): WalletInfo => ({
    createdAt:
      createdAt ||
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
    firstTxHash: "0x" + "0".repeat(64),
    txCount,
    age: "1 year",
  });

  const emptyTokens: TokenSummary[] = [];

  describe("Boundary Values", () => {
    it("should score exactly 0 transactions as very low activity (score 20)", () => {
      const walletInfo = createWalletInfo(0);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(20);
      expect(
        result.notes.some((note) => note.includes("Very low activity"))
      ).toBe(true);
    });

    it("should score exactly 10 transactions as boundary between very low and low activity", () => {
      const walletInfo = createWalletInfo(10);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(40);
      expect(result.notes.some((note) => note.includes("Low activity"))).toBe(
        true
      );
    });

    it("should score exactly 50 transactions as boundary between low and moderate activity", () => {
      const walletInfo = createWalletInfo(50);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(60);
      expect(
        result.notes.some((note) => note.includes("Moderate activity"))
      ).toBe(true);
    });

    it("should score exactly 200 transactions as boundary between moderate and active", () => {
      const walletInfo = createWalletInfo(200);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(80);
      expect(result.notes.some((note) => note.includes("Active wallet"))).toBe(
        true
      );
    });

    it("should score exactly 1000 transactions as very active", () => {
      const walletInfo = createWalletInfo(1000);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("Very active wallet"))
      ).toBe(true);
    });

    it("should score more than 1000 transactions as very active", () => {
      const walletInfo = createWalletInfo(5000);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("Very active wallet"))
      ).toBe(true);
    });
  });

  describe("Edge Cases Around Boundaries", () => {
    it("should score 9 transactions as very low activity", () => {
      const walletInfo = createWalletInfo(9);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(20);
      expect(
        result.notes.some((note) => note.includes("Very low activity"))
      ).toBe(true);
    });

    it("should score 11 transactions as low activity", () => {
      const walletInfo = createWalletInfo(11);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(40);
      expect(result.notes.some((note) => note.includes("Low activity"))).toBe(
        true
      );
    });

    it("should score 49 transactions as low activity", () => {
      const walletInfo = createWalletInfo(49);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(40);
      expect(result.notes.some((note) => note.includes("Low activity"))).toBe(
        true
      );
    });

    it("should score 51 transactions as moderate activity", () => {
      const walletInfo = createWalletInfo(51);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(60);
      expect(
        result.notes.some((note) => note.includes("Moderate activity"))
      ).toBe(true);
    });

    it("should score 199 transactions as moderate activity", () => {
      const walletInfo = createWalletInfo(199);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(60);
      expect(
        result.notes.some((note) => note.includes("Moderate activity"))
      ).toBe(true);
    });

    it("should score 201 transactions as active", () => {
      const walletInfo = createWalletInfo(201);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(80);
      expect(result.notes.some((note) => note.includes("Active wallet"))).toBe(
        true
      );
    });

    it("should score 999 transactions as active", () => {
      const walletInfo = createWalletInfo(999);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(80);
      expect(result.notes.some((note) => note.includes("Active wallet"))).toBe(
        true
      );
    });

    it("should score 1001 transactions as very active", () => {
      const walletInfo = createWalletInfo(1001);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("Very active wallet"))
      ).toBe(true);
    });
  });

  describe("Null and Undefined Transaction Count Handling", () => {
    it("should handle null txCount with default score", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        firstTxHash: "0x" + "0".repeat(64),
        txCount: null as any,
        age: "1 year",
      };

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(20);
      expect(
        result.notes.some((note) => note.includes("Very low activity"))
      ).toBe(true);
    });

    it("should handle undefined txCount with default score", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        firstTxHash: "0x" + "0".repeat(64),
        txCount: undefined as any,
        age: "1 year",
      };

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(20);
      expect(
        result.notes.some((note) => note.includes("Very low activity"))
      ).toBe(true);
    });

    it("should handle negative txCount as zero", () => {
      const walletInfo = createWalletInfo(-5);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(20);
      expect(
        result.notes.some((note) => note.includes("Very low activity"))
      ).toBe(true);
    });
  });

  describe("Note Generation for Each Tier", () => {
    it("should generate appropriate note for very low activity", () => {
      const walletInfo = createWalletInfo(5);

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("Very low activity") &&
            note.includes("<10 transactions")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for low activity", () => {
      const walletInfo = createWalletInfo(25);

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("Low activity") && note.includes("10-50 transactions")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for moderate activity", () => {
      const walletInfo = createWalletInfo(100);

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("Moderate activity") &&
            note.includes("50+ transactions")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for active wallets", () => {
      const walletInfo = createWalletInfo(500);

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("Active wallet") && note.includes("200+ transactions")
        )
      ).toBe(true);
    });

    it("should generate appropriate note for very active wallets", () => {
      const walletInfo = createWalletInfo(2000);

      const result = computeScore(walletInfo, emptyTokens);

      expect(
        result.notes.some(
          (note) =>
            note.includes("Very active wallet") &&
            note.includes("1000+ transactions")
        )
      ).toBe(true);
    });
  });

  describe("Integration with Overall Scoring", () => {
    it("should properly weight activity in final score when no tokens", () => {
      const walletInfo = createWalletInfo(1000); // Very active

      const result = computeScore(walletInfo, emptyTokens);

      // With no tokens: age 60%, activity 40%
      // Age score: 100 (1 year old), Activity score: 100
      // Expected final: 100 * 0.6 + 100 * 0.4 = 100
      expect(result.score).toBe(100);
      expect(result.breakdown.activityScore).toBe(100);
    });

    it("should handle very low activity with old wallet", () => {
      const walletInfo = createWalletInfo(5); // Very low activity but old wallet

      const result = computeScore(walletInfo, emptyTokens);

      // Age score: 100, Activity score: 20
      // Expected final: 100 * 0.6 + 20 * 0.4 = 60 + 8 = 68
      expect(result.score).toBe(68);
      expect(result.breakdown.activityScore).toBe(20);
    });

    it("should handle high activity with new wallet", () => {
      const newWalletDate = new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000
      ).toISOString(); // 1 day old
      const walletInfo = createWalletInfo(1000, newWalletDate); // Very active but new

      const result = computeScore(walletInfo, emptyTokens);

      // Age score: 10, Activity score: 100
      // Expected final: 10 * 0.6 + 100 * 0.4 = 6 + 40 = 46
      expect(result.score).toBe(46);
      expect(result.breakdown.activityScore).toBe(100);
    });
  });

  describe("Large Transaction Counts", () => {
    it("should handle very large transaction counts", () => {
      const walletInfo = createWalletInfo(1000000); // 1 million transactions

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("Very active wallet"))
      ).toBe(true);
    });

    it("should handle maximum safe integer transaction count", () => {
      const walletInfo = createWalletInfo(Number.MAX_SAFE_INTEGER);

      const result = computeScore(walletInfo, emptyTokens);

      expect(result.breakdown.activityScore).toBe(100);
      expect(
        result.notes.some((note) => note.includes("Very active wallet"))
      ).toBe(true);
    });
  });

  describe("Activity Score Consistency", () => {
    it("should maintain consistent scoring across different wallet ages", () => {
      const txCount = 500; // Active level

      // Test with different wallet ages
      const ages = [1, 30, 90, 365, 730]; // days

      ages.forEach((days) => {
        const createdAt = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        ).toISOString();
        const walletInfo = createWalletInfo(txCount, createdAt);

        const result = computeScore(walletInfo, emptyTokens);

        // Activity score should be consistent regardless of age
        expect(result.breakdown.activityScore).toBe(80);
        expect(
          result.notes.some((note) => note.includes("Active wallet"))
        ).toBe(true);
      });
    });

    it("should maintain score boundaries precisely", () => {
      const boundaryValues = [
        { txCount: 9, expectedScore: 20 },
        { txCount: 10, expectedScore: 40 },
        { txCount: 49, expectedScore: 40 },
        { txCount: 50, expectedScore: 60 },
        { txCount: 199, expectedScore: 60 },
        { txCount: 200, expectedScore: 80 },
        { txCount: 999, expectedScore: 80 },
        { txCount: 1000, expectedScore: 100 },
      ];

      boundaryValues.forEach(({ txCount, expectedScore }) => {
        const walletInfo = createWalletInfo(txCount);
        const result = computeScore(walletInfo, emptyTokens);

        expect(result.breakdown.activityScore).toBe(expectedScore);
      });
    });
  });
});
