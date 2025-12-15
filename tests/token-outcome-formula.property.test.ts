// Property-based tests for token outcome score formula

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "../lib/scoring";
import type { WalletInfo, TokenSummary } from "../types";

describe("Token Outcome Score Formula Properties", () => {
  // Helper to create a basic wallet info
  const createWalletInfo = (): WalletInfo => ({
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    firstTxHash:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txCount: 100,
    age: "100 days",
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should ensure token outcome score is always bounded between 10 and 100", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            token: fc
              .array(
                fc.constantFrom(
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
                ),
                { minLength: 40, maxLength: 40 }
              )
              .map((chars) => `0x${chars.join("")}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(
              fc
                .array(
                  fc.constantFrom(
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
                  ),
                  { minLength: 40, maxLength: 40 }
                )
                .map((chars) => `0x${chars.join("")}`)
            ),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.integer({ min: 0, max: 1000000 }),
            holdersAfter7Days: fc.integer({ min: 0, max: 10000 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.double({ min: 0, max: 1 }),
            outcome: fc.constantFrom("success", "rug", "unknown"),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Score should always be within bounds
          expect(result.breakdown.tokenOutcomeScore).toBeGreaterThanOrEqual(10);
          expect(result.breakdown.tokenOutcomeScore).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should give maximum score (100) when all tokens are successful", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            token: fc
              .array(
                fc.constantFrom(
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
                ),
                { minLength: 40, maxLength: 40 }
              )
              .map((chars) => `0x${chars.join("")}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(
              fc
                .array(
                  fc.constantFrom(
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
                  ),
                  { minLength: 40, maxLength: 40 }
                )
                .map((chars) => `0x${chars.join("")}`)
            ),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.integer({ min: 1000, max: 1000000 }),
            holdersAfter7Days: fc.integer({ min: 200, max: 10000 }),
            liquidityLocked: fc.constant(true), // Always locked for success
            devSellRatio: fc.double({ min: 0, max: 0.1 }), // Low sell ratio
            outcome: fc.constant("success"),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: "success" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // All success should give maximum score
          // Formula: 100 × (0.5 × 1 + 0.5 × (1 - 0)) = 100 × (0.5 + 0.5) = 100
          expect(result.breakdown.tokenOutcomeScore).toBe(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should give minimum score (10) when all tokens are rugs", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            token: fc
              .array(
                fc.constantFrom(
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
                ),
                { minLength: 40, maxLength: 40 }
              )
              .map((chars) => `0x${chars.join("")}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(
              fc
                .array(
                  fc.constantFrom(
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
                  ),
                  { minLength: 40, maxLength: 40 }
                )
                .map((chars) => `0x${chars.join("")}`)
            ),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.constant(0), // Zero liquidity = rug
            holdersAfter7Days: fc.integer({ min: 0, max: 50 }),
            liquidityLocked: fc.constant(false),
            devSellRatio: fc.double({ min: 0.8, max: 1.0 }), // High sell ratio = rug
            outcome: fc.constant("rug"),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: "rug" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // All rugs should give minimum score
          // Formula: 100 × (0.5 × 0 + 0.5 × (1 - 1)) = 100 × (0 + 0) = 0, bounded to 10
          expect(result.breakdown.tokenOutcomeScore).toBe(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should give neutral score (50) when all tokens are unknown", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            token: fc
              .array(
                fc.constantFrom(
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
                ),
                { minLength: 40, maxLength: 40 }
              )
              .map((chars) => `0x${chars.join("")}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(
              fc
                .array(
                  fc.constantFrom(
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
                  ),
                  { minLength: 40, maxLength: 40 }
                )
                .map((chars) => `0x${chars.join("")}`)
            ),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.constant(null),
            holdersAfter7Days: fc.constant(null),
            liquidityLocked: fc.constant(null),
            devSellRatio: fc.constant(null),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (tokens) => {
          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // All unknown should give neutral score
          expect(result.breakdown.tokenOutcomeScore).toBe(50);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should handle mixed outcomes proportionally", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            successCount: fc.integer({ min: 0, max: 10 }),
            rugCount: fc.integer({ min: 0, max: 10 }),
            unknownCount: fc.integer({ min: 0, max: 10 }),
          })
          .filter(
            ({ successCount, rugCount, unknownCount }) =>
              successCount + rugCount + unknownCount > 0
          ),
        ({ successCount, rugCount, unknownCount }) => {
          const tokens: any[] = [];

          // Add success tokens
          for (let i = 0; i < successCount; i++) {
            tokens.push({
              token: `0x${"1".repeat(40)}`,
              name: "Success Token",
              symbol: "SUCC",
              creator: `0x${"a".repeat(40)}`,
              launchAt: "2023-01-01T00:00:00.000Z",
              initialLiquidity: 1000,
              holdersAfter7Days: 250,
              liquidityLocked: true,
              devSellRatio: 0.05,
              outcome: "success",
            });
          }

          // Add rug tokens
          for (let i = 0; i < rugCount; i++) {
            tokens.push({
              token: `0x${"2".repeat(40)}`,
              name: "Rug Token",
              symbol: "RUG",
              creator: `0x${"b".repeat(40)}`,
              launchAt: "2023-01-01T00:00:00.000Z",
              initialLiquidity: 0,
              holdersAfter7Days: 10,
              liquidityLocked: false,
              devSellRatio: 0.8,
              outcome: "rug",
            });
          }

          // Add unknown tokens
          for (let i = 0; i < unknownCount; i++) {
            tokens.push({
              token: `0x${"3".repeat(40)}`,
              name: "Unknown Token",
              symbol: "UNK",
              creator: `0x${"c".repeat(40)}`,
              launchAt: "2023-01-01T00:00:00.000Z",
              initialLiquidity: 500,
              holdersAfter7Days: 100,
              liquidityLocked: false,
              devSellRatio: 0.3,
              outcome: "unknown",
            });
          }

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // Calculate expected score
          const total = tokens.length;
          const successRatio = successCount / total;
          const rugRatio = rugCount / total;
          const expectedScore = Math.round(
            100 * (0.5 * successRatio + 0.5 * (1 - rugRatio))
          );
          const boundedExpectedScore = Math.max(
            10,
            Math.min(100, expectedScore)
          );

          expect(result.breakdown.tokenOutcomeScore).toBe(boundedExpectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should maintain score consistency regardless of token order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            token: fc
              .array(
                fc.constantFrom(
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
                ),
                { minLength: 40, maxLength: 40 }
              )
              .map((chars) => `0x${chars.join("")}`),
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            symbol: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
            creator: fc.option(
              fc
                .array(
                  fc.constantFrom(
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
                  ),
                  { minLength: 40, maxLength: 40 }
                )
                .map((chars) => `0x${chars.join("")}`)
            ),
            launchAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
            initialLiquidity: fc.integer({ min: 0, max: 1000000 }),
            holdersAfter7Days: fc.integer({ min: 0, max: 10000 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.double({ min: 0, max: 1 }),
            outcome: fc.constantFrom("success", "rug", "unknown"),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (originalTokens) => {
          const tokensWithOutcome = originalTokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          // Create shuffled version
          const shuffledTokens = [...tokensWithOutcome].reverse();

          const walletInfo = createWalletInfo();
          const result1 = computeScore(walletInfo, tokensWithOutcome);
          const result2 = computeScore(walletInfo, shuffledTokens);

          // Score should be the same regardless of order
          expect(result1.breakdown.tokenOutcomeScore).toBe(
            result2.breakdown.tokenOutcomeScore
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 4: Token outcome score formula correctness
  it("should handle edge case ratios correctly", () => {
    fc.assert(
      fc.property(
        fc.record({
          total: fc.integer({ min: 1, max: 100 }),
          successRatio: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        ({ total, successRatio }) => {
          const successCount = Math.floor(total * successRatio);
          const rugCount = total - successCount;

          const tokens: any[] = [];

          // Add success tokens
          for (let i = 0; i < successCount; i++) {
            tokens.push({
              token: `0x${i.toString(16).padStart(40, "0")}`,
              outcome: "success",
              initialLiquidity: 1000,
              holdersAfter7Days: 250,
              liquidityLocked: true,
              devSellRatio: 0.05,
            });
          }

          // Add rug tokens
          for (let i = 0; i < rugCount; i++) {
            tokens.push({
              token: `0x${(i + successCount).toString(16).padStart(40, "0")}`,
              outcome: "rug",
              initialLiquidity: 0,
              holdersAfter7Days: 10,
              liquidityLocked: false,
              devSellRatio: 0.8,
            });
          }

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // Verify the formula
          const actualSuccessRatio = successCount / total;
          const actualRugRatio = rugCount / total;
          const expectedScore = Math.round(
            100 * (0.5 * actualSuccessRatio + 0.5 * (1 - actualRugRatio))
          );
          const boundedExpectedScore = Math.max(
            10,
            Math.min(100, expectedScore)
          );

          expect(result.breakdown.tokenOutcomeScore).toBe(boundedExpectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
