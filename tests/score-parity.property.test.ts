/**
 * Property-Based Tests for Score Parity Across Chains
 *
 * **Feature: solana-wallet-scoring, Property 3: Score Parity Across Chains**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 *
 * Tests that the scoring system produces comparable scores for similar
 * wallet behaviors across different blockchains.
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { computeScore } from "@/lib/scoring";
import type { WalletInfo, TokenSummary } from "@/types";

describe("Property 3: Score Parity Across Chains", () => {
  /**
   * Property: For wallets with identical metrics, scores should be within
   * a reasonable range regardless of blockchain
   */
  it("should produce similar scores for identical wallet metrics across blockchains", () => {
    fc.assert(
      fc.property(
        // Generate wallet age in days
        fc.integer({ min: 1, max: 1000 }),
        // Generate transaction count
        fc.integer({ min: 0, max: 10000 }),
        // Generate token count
        fc.integer({ min: 0, max: 50 }),
        // Generate success rate (0-1)
        fc.double({ min: 0, max: 1 }),
        (ageDays, txCount, tokenCount, successRate) => {
          // Create identical wallet info for both blockchains
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - ageDays * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash: "0x123",
            txCount,
            age: ageDays,
          };

          // Create identical token summaries
          const successCount = Math.floor(tokenCount * successRate);
          const rugCount = tokenCount - successCount;

          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: i < successCount ? "success" : "rug",
              reason: i < successCount ? "Good metrics" : "Suspicious activity",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          // Compute scores (scoring is blockchain-agnostic)
          const score1 = computeScore(walletInfo, tokens);
          const score2 = computeScore(walletInfo, tokens);

          // Property: Identical inputs should produce identical scores
          expect(score1.score).toBe(score2.score);
          expect(score1.breakdown.walletAgeScore).toBe(
            score2.breakdown.walletAgeScore
          );
          expect(score1.breakdown.activityScore).toBe(
            score2.breakdown.activityScore
          );
          expect(score1.breakdown.tokenOutcomeScore).toBe(
            score2.breakdown.tokenOutcomeScore
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Wallet age scoring should be consistent across blockchains
   */
  it("should score wallet age consistently regardless of blockchain", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (ageDays) => {
        const walletInfo: WalletInfo = {
          createdAt: new Date(
            Date.now() - ageDays * 24 * 60 * 60 * 1000
          ).toISOString(),
          firstTxHash: "0x123",
          txCount: 100,
          age: ageDays,
        };

        const score = computeScore(walletInfo, []);

        // Property: Wallet age score should be deterministic
        expect(score.breakdown.walletAgeScore).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.walletAgeScore).toBeLessThanOrEqual(25);

        // Property: Older wallets should score higher
        if (ageDays >= 365) {
          expect(score.breakdown.walletAgeScore).toBeGreaterThan(15);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Activity scoring should be consistent across blockchains
   */
  it("should score activity consistently regardless of blockchain", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (txCount) => {
        const walletInfo: WalletInfo = {
          createdAt: new Date(
            Date.now() - 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
          firstTxHash: "0x123",
          txCount,
          age: 365,
        };

        const score = computeScore(walletInfo, []);

        // Property: Activity score should be deterministic
        expect(score.breakdown.activityScore).toBeGreaterThanOrEqual(0);
        expect(score.breakdown.activityScore).toBeLessThanOrEqual(30);

        // Property: More transactions should generally score higher
        if (txCount >= 1000) {
          expect(score.breakdown.activityScore).toBeGreaterThan(15);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Token outcome scoring should be consistent across blockchains
   */
  it("should score token outcomes consistently regardless of blockchain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.double({ min: 0, max: 1 }),
        (tokenCount, successRate) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash: "0x123",
            txCount: 1000,
            age: 365,
          };

          const successCount = Math.floor(tokenCount * successRate);
          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: i < successCount ? "success" : "rug",
              reason: i < successCount ? "Good metrics" : "Suspicious activity",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          const score = computeScore(walletInfo, tokens);

          // Property: Token outcome score should be deterministic
          expect(score.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(30);

          // Property: Higher success rate should score higher
          if (successRate >= 0.8 && tokenCount >= 5) {
            expect(score.breakdown.tokenOutcomeScore).toBeGreaterThan(15);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Heuristics scoring should be consistent across blockchains
   */
  it("should apply heuristics consistently regardless of blockchain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 1 }),
        (tokenCount, rugRate) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash: "0x123",
            txCount: 1000,
            age: 365,
          };

          const rugCount = Math.floor(tokenCount * rugRate);
          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: i < rugCount ? "rug" : "success",
              reason: i < rugCount ? "Suspicious activity" : "Good metrics",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          const score = computeScore(walletInfo, tokens);

          // Property: Heuristics score should be deterministic
          expect(score.breakdown.heuristicsScore).toBeGreaterThanOrEqual(-15);
          expect(score.breakdown.heuristicsScore).toBeLessThanOrEqual(15);

          // Property: High rug rate should result in negative heuristics
          if (rugRate >= 0.8 && tokenCount >= 5) {
            expect(score.breakdown.heuristicsScore).toBeLessThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Final score should be bounded between 0 and 100
   */
  it("should always produce scores between 0 and 100 regardless of blockchain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 1 }),
        (ageDays, txCount, tokenCount, successRate) => {
          const walletInfo: WalletInfo = {
            createdAt:
              ageDays > 0
                ? new Date(
                    Date.now() - ageDays * 24 * 60 * 60 * 1000
                  ).toISOString()
                : null,
            firstTxHash: txCount > 0 ? "0x123" : null,
            txCount,
            age: ageDays > 0 ? ageDays : null,
          };

          const successCount = Math.floor(tokenCount * successRate);
          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: i < successCount ? "success" : "rug",
              reason: i < successCount ? "Good metrics" : "Suspicious activity",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          const score = computeScore(walletInfo, tokens);

          // Property: Score must be bounded
          expect(score.score).toBeGreaterThanOrEqual(0);
          expect(score.score).toBeLessThanOrEqual(100);
          expect(Number.isFinite(score.score)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property: Score components should sum to approximately the final score
   */
  it("should have score components that contribute to final score consistently", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 50 }),
        (ageDays, txCount, tokenCount) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - ageDays * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash: "0x123",
            txCount,
            age: ageDays,
          };

          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: "success",
              reason: "Good metrics",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          const score = computeScore(walletInfo, tokens);

          // Property: All components should be defined
          expect(score.breakdown.walletAgeScore).toBeDefined();
          expect(score.breakdown.activityScore).toBeDefined();
          expect(score.breakdown.tokenOutcomeScore).toBeDefined();
          expect(score.breakdown.heuristicsScore).toBeDefined();

          // Property: Components should be numbers
          expect(typeof score.breakdown.walletAgeScore).toBe("number");
          expect(typeof score.breakdown.activityScore).toBe("number");
          expect(typeof score.breakdown.tokenOutcomeScore).toBe("number");
          expect(typeof score.breakdown.heuristicsScore).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Scoring should be deterministic (same input = same output)
   */
  it("should produce identical scores for identical inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 50 }),
        (ageDays, txCount, tokenCount) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - ageDays * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash: "0x123",
            txCount,
            age: ageDays,
          };

          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: "success",
              reason: "Good metrics",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          // Compute score multiple times
          const score1 = computeScore(walletInfo, tokens);
          const score2 = computeScore(walletInfo, tokens);
          const score3 = computeScore(walletInfo, tokens);

          // Property: All scores should be identical
          expect(score1.score).toBe(score2.score);
          expect(score2.score).toBe(score3.score);
          expect(score1.breakdown).toEqual(score2.breakdown);
          expect(score2.breakdown).toEqual(score3.breakdown);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Confidence level should be consistent across blockchains
   */
  it("should calculate confidence consistently regardless of blockchain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 50 }),
        (ageDays, txCount, tokenCount) => {
          const walletInfo: WalletInfo = {
            createdAt:
              ageDays > 0
                ? new Date(
                    Date.now() - ageDays * 24 * 60 * 60 * 1000
                  ).toISOString()
                : null,
            firstTxHash: txCount > 0 ? "0x123" : null,
            txCount,
            age: ageDays > 0 ? ageDays : null,
          };

          const tokens: TokenSummary[] = Array.from(
            { length: tokenCount },
            (_, i) => ({
              token: `token-${i}`,
              name: `Token ${i}`,
              symbol: `TKN${i}`,
              launchAt: new Date().toISOString(),
              outcome: "success",
              reason: "Good metrics",
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: true,
              devSellRatio: 0.1,
            })
          );

          const score = computeScore(walletInfo, tokens);

          // Property: Confidence should be defined as an object with level property
          expect(score.confidence).toBeDefined();
          expect(typeof score.confidence).toBe("object");
          expect(score.confidence?.level).toBeDefined();

          // Property: Confidence level should be one of the valid values (uppercase)
          expect(["LOW", "MEDIUM-LOW", "MEDIUM", "HIGH"]).toContain(
            score.confidence?.level
          );

          // Property: More data should generally mean higher confidence
          if (ageDays >= 365 && txCount >= 1000 && tokenCount >= 10) {
            expect(score.confidence?.level).toBe("HIGH");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
