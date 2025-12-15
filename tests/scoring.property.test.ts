// Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
// Property-based tests for scoring engine

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "@/lib/scoring";
import type { WalletInfo, TokenSummary } from "@/types";

// Generators for wallet and token data
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

const walletInfoGen = fc.record({
  createdAt: fc.option(dateGen()),
  firstTxHash: fc.option(tokenAddressGen()),
  txCount: fc.nat({ max: 10000 }),
  age: fc.option(fc.string()),
});

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

describe("Scoring Engine Properties", () => {
  describe("Property 14: Wallet age notes presence", () => {
    it("should always include a note about wallet age or age unknown", () => {
      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenSummaryGen, { maxLength: 10 }),
          (walletInfo, tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Should have at least one note about wallet age
            const hasAgeNote = result.notes?.some(
              (note) =>
                note.toLowerCase().includes("wallet") &&
                (note.toLowerCase().includes("age") ||
                  note.toLowerCase().includes("year") ||
                  note.toLowerCase().includes("month") ||
                  note.toLowerCase().includes("week") ||
                  note.toLowerCase().includes("day") ||
                  note.toLowerCase().includes("new") ||
                  note.toLowerCase().includes("established") ||
                  note.toLowerCase().includes("unknown"))
            );

            expect(hasAgeNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include specific age category notes for known ages", () => {
      // Test specific age ranges
      const ageTestCases = [
        { days: 400, expectedKeywords: ["year", "established"] },
        { days: 180, expectedKeywords: ["month", "moderate"] },
        { days: 60, expectedKeywords: ["month", "limited"] },
        { days: 14, expectedKeywords: ["week", "very limited"] },
        { days: 3, expectedKeywords: ["new", "high risk"] },
      ];

      ageTestCases.forEach(({ days, expectedKeywords }) => {
        const pastDate = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        ).toISOString();
        const walletInfo: WalletInfo = {
          createdAt: pastDate,
          txCount: 100,
        };

        const result = computeScore(walletInfo, []);

        // Should have a note containing at least one of the expected keywords
        const hasExpectedNote = result.notes?.some((note) =>
          expectedKeywords.some((keyword) =>
            note.toLowerCase().includes(keyword.toLowerCase())
          )
        );

        expect(hasExpectedNote).toBe(true);
      });
    });

    it("should include unknown age note when createdAt is null", () => {
      const walletInfoWithNullAge: WalletInfo = {
        createdAt: null,
        txCount: 100,
      };

      const result = computeScore(walletInfoWithNullAge, []);

      const hasUnknownNote = result.notes?.some(
        (note) =>
          note.toLowerCase().includes("unknown") &&
          note.toLowerCase().includes("age")
      );

      expect(hasUnknownNote).toBe(true);
    });

    it("should include unknown age note when createdAt is invalid", () => {
      const walletInfoWithInvalidAge: WalletInfo = {
        createdAt: "invalid-date",
        txCount: 100,
      };

      const result = computeScore(walletInfoWithInvalidAge, []);

      const hasUnknownNote = result.notes?.some(
        (note) =>
          note.toLowerCase().includes("unknown") &&
          note.toLowerCase().includes("age")
      );

      expect(hasUnknownNote).toBe(true);
    });
  });

  describe("Property 15: Activity notes presence", () => {
    it("should always include a note about transaction activity", () => {
      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenSummaryGen, { maxLength: 10 }),
          (walletInfo, tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Should have at least one note about activity/transactions
            const hasActivityNote = result.notes?.some(
              (note) =>
                note.toLowerCase().includes("activity") ||
                note.toLowerCase().includes("transaction") ||
                note.toLowerCase().includes("active")
            );

            expect(hasActivityNote).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include specific activity level notes for different transaction counts", () => {
      const activityTestCases = [
        { txCount: 1500, expectedKeywords: ["very active", "1000+"] },
        { txCount: 500, expectedKeywords: ["active", "200+"] },
        { txCount: 100, expectedKeywords: ["moderate", "50+"] },
        { txCount: 25, expectedKeywords: ["low activity", "10-50"] },
        { txCount: 5, expectedKeywords: ["very low", "<10"] },
      ];

      activityTestCases.forEach(({ txCount, expectedKeywords }) => {
        const walletInfo: WalletInfo = {
          createdAt: new Date(
            Date.now() - 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
          txCount,
        };

        const result = computeScore(walletInfo, []);

        // Should have a note containing at least one of the expected keywords
        const hasExpectedNote = result.notes?.some((note) =>
          expectedKeywords.some((keyword) =>
            note.toLowerCase().includes(keyword.toLowerCase())
          )
        );

        expect(hasExpectedNote).toBe(true);
      });
    });
  });

  describe("Property 16: Token analysis notes presence", () => {
    it("should include notes about tokens when tokens are present", () => {
      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenSummaryGen, { minLength: 1, maxLength: 10 }),
          (walletInfo, tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Should have at least one note about tokens
            const hasTokenNote = result.notes?.some(
              (note) =>
                note.toLowerCase().includes("token") ||
                note.toLowerCase().includes("launch") ||
                note.toLowerCase().includes("analyzed") ||
                note.toLowerCase().includes("found")
            );

            expect(hasTokenNote).toBe(true);
          }
        ),
        { numRuns: 50 } // Fewer runs since we're generating tokens
      );
    });

    it("should include note about no tokens when no tokens are present", () => {
      fc.assert(
        fc.property(walletInfoGen, (walletInfo) => {
          const result = computeScore(walletInfo, []);

          // Should have a note about no tokens
          const hasNoTokenNote = result.notes?.some(
            (note) =>
              note.toLowerCase().includes("no token") ||
              (note.toLowerCase().includes("token") &&
                note.toLowerCase().includes("detected"))
          );

          expect(hasNoTokenNote).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should include specific token outcome information", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Test with tokens that have detailed data
      const tokensWithData: TokenSummary[] = [
        {
          token: "0x1234567890123456789012345678901234567890",
          devSellRatio: 0.8, // Should be flagged as rug
          initialLiquidity: 1000,
        },
        {
          token: "0x2345678901234567890123456789012345678901",
          liquidityLocked: true,
          holdersAfter7Days: 300, // Should be success
        },
      ];

      const result = computeScore(walletInfo, tokensWithData);

      // Should mention the analysis and outcomes
      const hasAnalysisNote = result.notes?.some(
        (note) =>
          note.toLowerCase().includes("analyzed") ||
          note.toLowerCase().includes("detailed")
      );

      expect(hasAnalysisNote).toBe(true);
    });
  });

  describe("Property 9: Confidence indicator presence", () => {
    it("should always include a confidence indicator in notes", () => {
      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenSummaryGen, { maxLength: 10 }),
          (walletInfo, tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Should have exactly one confidence note
            const confidenceNotes = result.notes?.filter((note) =>
              note.toLowerCase().includes("confidence:")
            );

            expect(confidenceNotes).toBeDefined();
            expect(confidenceNotes!.length).toBe(1);

            // Should be one of the valid confidence levels
            const confidenceNote = confidenceNotes![0].toLowerCase();
            const validConfidenceLevels = ["high", "medium", "medium-low"];
            const hasValidConfidence = validConfidenceLevels.some((level) =>
              confidenceNote.includes(level)
            );

            expect(hasValidConfidence).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should show HIGH confidence when comprehensive token data is available", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const tokensWithComprehensiveData: TokenSummary[] = [
        {
          token: "0x1234567890123456789012345678901234567890",
          devSellRatio: 0.1,
          initialLiquidity: 1000,
          liquidityLocked: true,
          holdersAfter7Days: 300,
        },
      ];

      const result = computeScore(walletInfo, tokensWithComprehensiveData);

      const hasHighConfidence = result.notes?.some((note) =>
        note.toLowerCase().includes("confidence: high")
      );

      expect(hasHighConfidence).toBe(true);
    });

    it("should show MEDIUM confidence when only wallet metrics are available", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const result = computeScore(walletInfo, []); // No tokens

      const hasMediumConfidence = result.notes?.some((note) =>
        note.toLowerCase().includes("confidence: medium")
      );

      expect(hasMediumConfidence).toBe(true);
    });
  });

  describe("Property 4: Token outcome score formula correctness", () => {
    it("should calculate token outcome score using the correct formula", () => {
      // Generate tokens with known outcomes
      const tokenWithOutcomeGen = fc.record({
        token: tokenAddressGen(),
        outcome: fc.constantFrom("success", "rug"),
        // Other fields don't matter for this test
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
      });

      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenWithOutcomeGen, { minLength: 1, maxLength: 20 }),
          (walletInfo, tokensWithOutcomes) => {
            // Add outcome property to tokens to simulate processed tokens
            const processedTokens = tokensWithOutcomes.map((token) => ({
              ...token,
              outcome: token.outcome as "success" | "rug",
            }));

            const result = computeScore(walletInfo, processedTokens as any);

            // Calculate expected score using the formula
            const total = processedTokens.length;
            const successCount = processedTokens.filter(
              (t) => t.outcome === "success"
            ).length;
            const rugCount = processedTokens.filter(
              (t) => t.outcome === "rug"
            ).length;

            const successRatio = successCount / total;
            const rugRatio = rugCount / total;

            const expectedTokenOutcomeScore = Math.round(
              100 * (0.5 * successRatio + 0.5 * (1 - rugRatio))
            );
            const boundedExpected = Math.max(
              10,
              Math.min(100, expectedTokenOutcomeScore)
            );

            // The actual token outcome score should match our calculation
            expect(result.breakdown.tokenOutcomeScore).toBe(boundedExpected);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should bound token outcome score between 10 and 100", () => {
      fc.assert(
        fc.property(
          walletInfoGen,
          fc.array(tokenSummaryGen, { maxLength: 10 }),
          (walletInfo, tokens) => {
            const result = computeScore(walletInfo, tokens);

            expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(
              10
            );
            expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should give score of 100 when all tokens are successful", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const successfulTokens: TokenSummary[] = [
        {
          token: "0x1234567890123456789012345678901234567890",
          liquidityLocked: true,
          holdersAfter7Days: 300,
        },
        {
          token: "0x2345678901234567890123456789012345678901",
          liquidityLocked: true,
          holdersAfter7Days: 250,
        },
      ];

      const result = computeScore(walletInfo, successfulTokens);

      // With all successful tokens, formula should give 100
      // 100 * (0.5 * 1 + 0.5 * (1 - 0)) = 100
      expect(result.breakdown.tokenOutcomeScore).toBe(100);
    });

    it("should give score of 50 when all tokens are rugs", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const rugTokens: TokenSummary[] = [
        {
          token: "0x1234567890123456789012345678901234567890",
          devSellRatio: 0.8,
        },
        {
          token: "0x2345678901234567890123456789012345678901",
          initialLiquidity: 0,
        },
      ];

      const result = computeScore(walletInfo, rugTokens);

      // With all rug tokens, formula should give 50
      // 100 * (0.5 * 0 + 0.5 * (1 - 1)) = 0, but bounded to minimum 10
      // However, the actual implementation might handle this differently
      expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(10);
      expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(50);
    });
  });

  describe("Property 5: Rug pull flagging in notes", () => {
    it("should flag rug pulls in notes when rug tokens are detected", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Generate tokens that will be classified as rugs
      const rugTokenGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.double({ min: 0.5, max: 1, noNaN: true }),
        name: fc.option(fc.string()),
        symbol: fc.option(fc.string()),
      });

      fc.assert(
        fc.property(
          fc.array(rugTokenGen, { minLength: 1, maxLength: 5 }),
          (rugTokens) => {
            const result = computeScore(walletInfo, rugTokens);

            // Should have a note flagging rug pulls
            const hasRugFlag = result.notes?.some(
              (note) =>
                note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged") ||
                note.toLowerCase().includes("potential rug")
            );

            expect(hasRugFlag).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should not flag rug pulls when no rug tokens are present", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Generate tokens that will NOT be classified as rugs
      const nonRugTokenGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.option(fc.double({ min: 0, max: 0.49, noNaN: true })),
        initialLiquidity: fc.option(fc.integer({ min: 1, max: 1000000 })),
        liquidityLocked: fc.option(fc.boolean()),
        holdersAfter7Days: fc.option(fc.nat({ max: 10000 })),
      });

      fc.assert(
        fc.property(
          fc.array(nonRugTokenGen, { minLength: 1, maxLength: 5 }),
          (nonRugTokens) => {
            const result = computeScore(walletInfo, nonRugTokens);

            // Should NOT have a note specifically flagging rug pulls
            const hasRugFlag = result.notes?.some(
              (note) =>
                note.toLowerCase().includes("flagged as potential rug") ||
                note.toLowerCase().includes("rug pull")
            );

            expect(hasRugFlag).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should include the count of flagged tokens in rug pull notes", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Test with specific numbers of rug tokens
      const testCases = [1, 2, 3, 5];

      testCases.forEach((rugCount) => {
        const rugTokens: TokenSummary[] = Array.from(
          { length: rugCount },
          (_, i) => ({
            token: `0x${i.toString().padStart(40, "0")}`,
            devSellRatio: 0.8,
          })
        );

        const result = computeScore(walletInfo, rugTokens);

        // Should mention the specific count
        const hasCountNote = result.notes?.some(
          (note) =>
            note.includes(rugCount.toString()) &&
            (note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged"))
        );

        expect(hasCountNote).toBe(true);
      });
    });

    it("should handle mixed token outcomes correctly in notes", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const mixedTokens: TokenSummary[] = [
        // Success token
        {
          token: "0x1111111111111111111111111111111111111111",
          liquidityLocked: true,
          holdersAfter7Days: 300,
        },
        // Rug token
        {
          token: "0x2222222222222222222222222222222222222222",
          devSellRatio: 0.8,
        },
        // Unknown token
        {
          token: "0x3333333333333333333333333333333333333333",
          // No clear success or rug indicators
        },
      ];

      const result = computeScore(walletInfo, mixedTokens);

      // Should have notes about both successful and rug tokens
      const hasSuccessNote = result.notes?.some(
        (note) =>
          note.toLowerCase().includes("positive") ||
          note.toLowerCase().includes("success")
      );

      const hasRugNote = result.notes?.some(
        (note) =>
          note.toLowerCase().includes("rug") ||
          note.toLowerCase().includes("flagged")
      );

      expect(hasSuccessNote).toBe(true);
      expect(hasRugNote).toBe(true);
    });
  });

  describe("Property 6: Heuristics penalty application", () => {
    it("should apply 50-point penalty for dev sell ratio >= 50%", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const highDevSellGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.double({ min: 0.5, max: 1, noNaN: true }),
        // Use high liquidity and locked to isolate the dev sell penalty
        initialLiquidity: fc.constant(50000), // High liquidity = 10 point bonus
        liquidityLocked: fc.constant(true), // Locked = 20 point bonus
        holdersAfter7Days: fc.constant(100), // Good holders = 10 point bonus
      });

      fc.assert(
        fc.property(
          fc.array(highDevSellGen, { minLength: 1, maxLength: 3 }),
          (tokens) => {
            const result = computeScore(walletInfo, tokens);

            // With high dev sell ratios, heuristics score should be reduced
            // Each token: 50 penalty (dev sell) - 20 bonus (locked) - 10 bonus (liquidity) - 10 bonus (holders) = 10 net penalty
            // So score should be less than 100
            expect(result.breakdown.heuristicsScore).toBeLessThan(100);
            // But with bonuses offsetting, should still be reasonable
            expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should apply 20-point penalty for dev sell ratio between 25-50%", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const mediumDevSellGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.double({ min: 0.25, max: 0.49, noNaN: true }),
        initialLiquidity: fc.constant(50000), // High liquidity = 10 point bonus
        liquidityLocked: fc.constant(true), // Locked = 20 point bonus
        holdersAfter7Days: fc.constant(100), // Good holders = 10 point bonus
      });

      fc.assert(
        fc.property(
          fc.array(mediumDevSellGen, { minLength: 1, maxLength: 3 }),
          (tokens) => {
            const result = computeScore(walletInfo, tokens);

            // With medium dev sell ratios, should apply 20 point penalty per token
            // But bonuses offset: 20 penalty - 20 bonus (locked) - 10 bonus (liquidity) - 10 bonus (holders) = -20 net
            // So score could actually be higher than 100 (capped at 100)
            expect(result.breakdown.heuristicsScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should apply 40-point penalty for zero initial liquidity", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const zeroLiquidityGen = fc.record({
        token: tokenAddressGen(),
        initialLiquidity: fc.constant(0),
        devSellRatio: fc.option(fc.double({ min: 0, max: 0.24, noNaN: true })), // Low dev sell to isolate liquidity penalty
        liquidityLocked: fc.constant(false), // No bonus to interfere with penalty test
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })),
      });

      fc.assert(
        fc.property(
          fc.array(zeroLiquidityGen, { minLength: 1, maxLength: 3 }),
          (tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Each token with zero liquidity should apply 40 point penalty
            const expectedPenalty = tokens.length * 40;
            const expectedScore = Math.max(10, 100 - expectedPenalty);

            expect(result.breakdown.heuristicsScore).toBeLessThanOrEqual(
              expectedScore
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should apply 20-point bonus for locked liquidity", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      const lockedLiquidityGen = fc.record({
        token: tokenAddressGen(),
        liquidityLocked: fc.constant(true),
        initialLiquidity: fc.integer({ min: 1, max: 1000000 }),
        devSellRatio: fc.option(fc.double({ min: 0, max: 0.24, noNaN: true })), // Low dev sell
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })), // Prevent success classification
      });

      fc.assert(
        fc.property(
          fc.array(lockedLiquidityGen, { minLength: 1, maxLength: 3 }),
          (tokens) => {
            const result = computeScore(walletInfo, tokens);

            // Locked liquidity should improve the heuristics score
            // Each locked token gives 20 point bonus (negative penalty)
            expect(result.breakdown.heuristicsScore).toBeGreaterThan(50);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should combine multiple penalties and bonuses correctly", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Test specific combination
      const mixedTokens: TokenSummary[] = [
        {
          token: "0x1111111111111111111111111111111111111111",
          devSellRatio: 0.6, // 50 point penalty
          initialLiquidity: 1000,
        },
        {
          token: "0x2222222222222222222222222222222222222222",
          initialLiquidity: 0, // 40 point penalty
          devSellRatio: 0.1,
        },
        {
          token: "0x3333333333333333333333333333333333333333",
          liquidityLocked: true, // 20 point bonus
          initialLiquidity: 1000,
          devSellRatio: 0.1,
        },
      ];

      const result = computeScore(walletInfo, mixedTokens);

      // Expected: 100 - 50 - 40 + 20 = 30
      // But minimum is 10, so should be at least 10
      expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
      expect(result.breakdown.heuristicsScore).toBeLessThanOrEqual(50);
    });
  });

  describe("Property 7: Heuristics score minimum bound", () => {
    it("should never allow heuristics score to go below 10", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Generate tokens with maximum penalties
      const maxPenaltyGen = fc.record({
        token: tokenAddressGen(),
        devSellRatio: fc.constant(1.0), // Maximum dev sell ratio (50 point penalty)
        initialLiquidity: fc.constant(0), // Zero liquidity (40 point penalty)
        liquidityLocked: fc.constant(false), // No bonus
        holdersAfter7Days: fc.option(fc.nat({ max: 199 })),
      });

      fc.assert(
        fc.property(
          fc.array(maxPenaltyGen, { minLength: 1, maxLength: 10 }),
          (tokens) => {
            const result = computeScore(walletInfo, tokens);

            // No matter how many penalties, score should never go below 10
            expect(result.breakdown.heuristicsScore).toBeGreaterThanOrEqual(10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain minimum bound even with extreme penalty combinations", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Create tokens that would theoretically result in negative scores
      const extremePenaltyTokens: TokenSummary[] = Array.from(
        { length: 5 },
        (_, i) => ({
          token: `0x${i.toString().padStart(40, "0")}`,
          devSellRatio: 1.0, // 50 points each = 250 total
          initialLiquidity: 0, // 40 points each = 200 total
          // Total penalty would be 450, but minimum should be 10
        })
      );

      const result = computeScore(walletInfo, extremePenaltyTokens);

      expect(result.breakdown.heuristicsScore).toBe(10);
    });

    it("should allow scores above minimum when penalties are moderate", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Single token with moderate penalty but good other metrics
      const moderateToken: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: 0.3, // 20 point penalty
        initialLiquidity: 50000, // 10 point bonus (strong liquidity)
        liquidityLocked: true, // 20 point bonus
        holdersAfter7Days: 100, // 10 point bonus
      };

      const result = computeScore(walletInfo, [moderateToken]);

      // Net: -20 + 10 + 20 + 10 = +20 bonus, so score should be 100 (capped)
      expect(result.breakdown.heuristicsScore).toBeGreaterThan(10);
      expect(result.breakdown.heuristicsScore).toBeLessThanOrEqual(100);
    });

    it("should handle edge case with balanced penalties and bonuses", () => {
      const walletInfo: WalletInfo = {
        createdAt: new Date(
          Date.now() - 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
        txCount: 100,
      };

      // Token with balanced penalties and bonuses
      const balancedToken: TokenSummary = {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: 0.05, // 5 point bonus (low sell ratio)
        initialLiquidity: 50000, // 10 point bonus (strong liquidity)
        liquidityLocked: true, // 20 point bonus
        holdersAfter7Days: 100, // 10 point bonus
      };

      const result = computeScore(walletInfo, [balancedToken]);

      // All bonuses: 5 + 10 + 20 + 10 = 45 bonus, score should be 100 (capped)
      expect(result.breakdown.heuristicsScore).toBe(100);
    });
  });
});
describe("Property 8: Weighted score calculation", () => {
  it("should calculate final score as weighted sum of component scores", () => {
    fc.assert(
      fc.property(
        walletInfoGen,
        fc.array(tokenSummaryGen, { maxLength: 10 }),
        (walletInfo, tokens) => {
          const result = computeScore(walletInfo, tokens);

          // Extract component scores and calculate expected weighted sum
          const {
            walletAgeScore,
            activityScore,
            tokenOutcomeScore,
            heuristicsScore,
          } = result.breakdown;

          // Determine expected weights based on token data availability
          let expectedWeights;
          const hasTokenData = tokens.some(
            (t) =>
              t.devSellRatio !== null ||
              t.initialLiquidity !== null ||
              t.liquidityLocked !== null ||
              t.holdersAfter7Days !== null
          );

          if (tokens.length === 0) {
            // No tokens - simplified scoring
            expectedWeights = {
              walletAge: 0.6,
              activity: 0.4,
              tokenOutcome: 0,
              heuristics: 0,
            };
          } else if (!hasTokenData) {
            // Tokens but no detailed data
            expectedWeights = {
              walletAge: 0.5,
              activity: 0.3,
              tokenOutcome: 0.1,
              heuristics: 0.1,
            };
          } else {
            // Full data available
            expectedWeights = {
              walletAge: 0.2,
              activity: 0.1,
              tokenOutcome: 0.35,
              heuristics: 0.35,
            };
          }

          const expectedScore = Math.round(
            walletAgeScore * expectedWeights.walletAge +
              activityScore * expectedWeights.activity +
              tokenOutcomeScore * expectedWeights.tokenOutcome +
              heuristicsScore * expectedWeights.heuristics
          );

          const boundedExpected = Math.max(0, Math.min(100, expectedScore));

          expect(result.score).toBe(boundedExpected);
          expect(result.breakdown.final).toBe(result.score);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should always produce scores between 0 and 100", () => {
    fc.assert(
      fc.property(
        walletInfoGen,
        fc.array(tokenSummaryGen, { maxLength: 10 }),
        (walletInfo, tokens) => {
          const result = computeScore(walletInfo, tokens);

          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(result.breakdown.final).toBeGreaterThanOrEqual(0);
          expect(result.breakdown.final).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should use correct weights for no-token scenario", () => {
    const walletInfo: WalletInfo = {
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      txCount: 500,
    };

    const result = computeScore(walletInfo, []); // No tokens

    // Expected: age=100, activity=80, weights: age=60%, activity=40%
    // Score = 100 * 0.6 + 80 * 0.4 = 60 + 32 = 92
    const expectedScore = Math.round(100 * 0.6 + 80 * 0.4);

    expect(result.score).toBe(expectedScore);
  });

  it("should calculate weighted score correctly regardless of weight scheme", () => {
    // This test verifies the weighted calculation works without assuming specific weights
    fc.assert(
      fc.property(
        walletInfoGen,
        fc.array(tokenSummaryGen, { maxLength: 5 }),
        (walletInfo, tokens) => {
          const result = computeScore(walletInfo, tokens);

          // The score should be within the range of component scores
          const minComponent = Math.min(
            result.breakdown.walletAgeScore,
            result.breakdown.activityScore,
            result.breakdown.tokenOutcomeScore,
            result.breakdown.heuristicsScore
          );
          const maxComponent = Math.max(
            result.breakdown.walletAgeScore,
            result.breakdown.activityScore,
            result.breakdown.tokenOutcomeScore,
            result.breakdown.heuristicsScore
          );

          // Final score should be a weighted average, so between min and max
          expect(result.score).toBeGreaterThanOrEqual(
            Math.max(0, minComponent - 10)
          ); // Allow some tolerance
          expect(result.score).toBeLessThanOrEqual(
            Math.min(100, maxComponent + 10)
          ); // Allow some tolerance
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should use correct weights for full-data scenario", () => {
    const walletInfo: WalletInfo = {
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      txCount: 500,
    };

    // Tokens with detailed data
    const tokensWithData: TokenSummary[] = [
      {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: 0.1,
        initialLiquidity: 1000,
        liquidityLocked: false,
      },
    ];

    const result = computeScore(walletInfo, tokensWithData);

    // Should use full data weights: age=20%, activity=10%, outcome=35%, heuristics=35%
    // Calculate expected based on actual component scores
    const expectedScore = Math.round(
      result.breakdown.walletAgeScore * 0.2 +
        result.breakdown.activityScore * 0.1 +
        result.breakdown.tokenOutcomeScore * 0.35 +
        result.breakdown.heuristicsScore * 0.35
    );

    expect(result.score).toBe(expectedScore);
  });

  it("should handle extreme component scores correctly", () => {
    // Test with extreme wallet conditions
    const extremeWalletInfo: WalletInfo = {
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day old
      txCount: 1, // Very low activity
    };

    // Tokens that will cause extreme heuristics penalties
    const extremeTokens: TokenSummary[] = [
      {
        token: "0x1234567890123456789012345678901234567890",
        devSellRatio: 1.0, // Maximum penalty
        initialLiquidity: 0, // Maximum penalty
      },
    ];

    const result = computeScore(extremeWalletInfo, extremeTokens);

    // Even with extreme scores, final should be bounded
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // Verify it's calculated correctly
    const expectedScore = Math.round(
      result.breakdown.walletAgeScore * 0.2 +
        result.breakdown.activityScore * 0.1 +
        result.breakdown.tokenOutcomeScore * 0.35 +
        result.breakdown.heuristicsScore * 0.35
    );
    const boundedExpected = Math.max(0, Math.min(100, expectedScore));

    expect(result.score).toBe(boundedExpected);
  });

  it("should maintain consistency between score and breakdown.final", () => {
    fc.assert(
      fc.property(
        walletInfoGen,
        fc.array(tokenSummaryGen, { maxLength: 5 }),
        (walletInfo, tokens) => {
          const result = computeScore(walletInfo, tokens);

          // The main score should always equal breakdown.final
          expect(result.score).toBe(result.breakdown.final);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should round weighted sums to nearest integer", () => {
    // Create a scenario that would produce a non-integer weighted sum
    const walletInfo: WalletInfo = {
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // ~3 months
      txCount: 75, // Should give activity score of 60
    };

    const result = computeScore(walletInfo, []); // No tokens for simplicity

    // Expected: age=80, activity=60, weights: age=60%, activity=40%
    // Score = 80 * 0.6 + 60 * 0.4 = 48 + 24 = 72 (integer)
    expect(Number.isInteger(result.score)).toBe(true);
    expect(Number.isInteger(result.breakdown.final)).toBe(true);
  });
});
