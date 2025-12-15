// Property-based tests for token analysis notes presence

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "../lib/scoring";
import type { WalletInfo, TokenSummary } from "../types";

describe("Token Analysis Notes Properties", () => {
  // Helper to create a basic wallet info
  const createWalletInfo = (): WalletInfo => ({
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    firstTxHash:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txCount: 100,
    age: "100 days",
  });

  // Generator for tokens with various outcomes
  const tokenGen = fc.record({
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
    devSellRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    outcome: fc.constantFrom("success", "rug", "unknown"),
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should include token analysis notes when tokens are found", () => {
    fc.assert(
      fc.property(
        fc.array(tokenGen, { minLength: 1, maxLength: 10 }),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should have notes array
          expect(Array.isArray(result.notes)).toBe(true);
          expect(result.notes.length).toBeGreaterThan(0);

          // Should contain at least one note about token analysis
          const tokenNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("token") ||
              note.toLowerCase().includes("analyzed") ||
              note.toLowerCase().includes("launched") ||
              note.toLowerCase().includes("found")
          );

          expect(tokenNotes.length).toBeGreaterThanOrEqual(1);

          // Should mention the number of tokens
          const tokenCount = tokens.length;
          const tokenCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${tokenCount}`) &&
              note.toLowerCase().includes("token")
          );

          expect(tokenCountNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should not include token analysis notes when no tokens are found", () => {
    fc.assert(
      fc.property(
        fc.constant([]), // Empty token array
        (tokens) => {
          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // Should have notes about no tokens
          const noTokenNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("no token") ||
              note.toLowerCase().includes("no launches") ||
              note.toLowerCase().includes("not detected")
          );

          expect(noTokenNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should describe token outcomes in analysis notes", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            successCount: fc.integer({ min: 0, max: 5 }),
            rugCount: fc.integer({ min: 0, max: 5 }),
            unknownCount: fc.integer({ min: 0, max: 5 }),
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
              initialLiquidity: 10000,
              holdersAfter7Days: 500,
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
              initialLiquidity: 1000,
              holdersAfter7Days: 100,
              liquidityLocked: false,
              devSellRatio: 0.2,
              outcome: "unknown",
            });
          }

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          const totalTokens = tokens.length;

          // Should mention total number of tokens analyzed
          const totalTokenNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${totalTokens}`) &&
              (note.toLowerCase().includes("token") ||
                note.toLowerCase().includes("analyzed"))
          );

          expect(totalTokenNotes.length).toBeGreaterThanOrEqual(1);

          // Should mention success tokens if present
          if (successCount > 0) {
            const successNotes = result.notes.filter(
              (note: string) =>
                note.includes(`${successCount}`) &&
                (note.toLowerCase().includes("success") ||
                  note.toLowerCase().includes("positive"))
            );
            expect(successNotes.length).toBeGreaterThanOrEqual(1);
          }

          // Should mention rug tokens if present
          if (rugCount > 0) {
            const rugNotes = result.notes.filter(
              (note: string) =>
                note.includes(`${rugCount}`) &&
                (note.toLowerCase().includes("rug") ||
                  note.toLowerCase().includes("flagged"))
            );
            expect(rugNotes.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should include comprehensive analysis notes for detailed token data", () => {
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
            initialLiquidity: fc.integer({ min: 100, max: 100000 }), // Has detailed data
            holdersAfter7Days: fc.integer({ min: 50, max: 1000 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.double({ min: 0, max: 1, noNaN: true }),
            outcome: fc.constantFrom("success", "rug", "unknown"),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should mention detailed metrics analysis
          const detailedAnalysisNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("analyzed with detailed metrics") ||
              note.toLowerCase().includes("detailed") ||
              note.toLowerCase().includes("comprehensive")
          );

          expect(detailedAnalysisNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should include insufficient data notes when token data is limited", () => {
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
            initialLiquidity: fc.constant(null), // No detailed data
            holdersAfter7Days: fc.constant(null),
            liquidityLocked: fc.constant(null),
            devSellRatio: fc.constant(null),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (tokens) => {
          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // Should mention insufficient data
          const insufficientDataNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("insufficient data") ||
              note.toLowerCase().includes("limited data") ||
              note.toLowerCase().includes("assess quality")
          );

          expect(insufficientDataNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should maintain token analysis note consistency across different wallet characteristics", () => {
    fc.assert(
      fc.property(
        fc.record({
          tokens: fc.array(tokenGen, { minLength: 1, maxLength: 3 }),
          walletAge: fc.integer({ min: 1, max: 1000 }),
          txCount: fc.integer({ min: 10, max: 5000 }),
        }),
        ({ tokens, walletAge, txCount }) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - walletAge * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash:
              "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            txCount,
            age: `${walletAge} days`,
          };

          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const result = computeScore(walletInfo, tokensWithOutcome);

          // Token analysis notes should be present regardless of wallet characteristics
          const tokenNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("token") &&
              (note.toLowerCase().includes("analyzed") ||
                note.toLowerCase().includes("found") ||
                note.toLowerCase().includes("launched"))
          );

          expect(tokenNotes.length).toBeGreaterThanOrEqual(1);

          // Should mention the correct number of tokens
          const tokenCount = tokens.length;
          const tokenCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${tokenCount}`) &&
              note.toLowerCase().includes("token")
          );

          expect(tokenCountNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should include appropriate plural/singular forms in token notes", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.array(tokenGen, { minLength: 1, maxLength: 1 }), // Single token
          fc.array(tokenGen, { minLength: 2, maxLength: 10 }) // Multiple tokens
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          const tokenCount = tokens.length;

          // Should use appropriate singular/plural forms
          const tokenNotes = result.notes.filter((note: string) =>
            note.toLowerCase().includes("token")
          );

          expect(tokenNotes.length).toBeGreaterThanOrEqual(1);

          if (tokenCount === 1) {
            // Should use singular form or token(s) notation
            const singularNotes = result.notes.filter(
              (note: string) =>
                (note.includes("1 token") || note.includes("token(s)")) &&
                !note.includes("tokens ")
            );
            expect(singularNotes.length).toBeGreaterThanOrEqual(1);
          } else {
            // Should use plural form or token(s) notation
            const pluralNotes = result.notes.filter(
              (note: string) =>
                note.includes(`${tokenCount}`) &&
                (note.includes("tokens") || note.includes("token(s)"))
            );
            expect(pluralNotes.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 16: Token analysis notes presence
  it("should include confidence indicators in token analysis notes", () => {
    fc.assert(
      fc.property(
        fc.array(tokenGen, { minLength: 1, maxLength: 5 }),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should include confidence indicators
          const confidenceNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("confidence") ||
              note.toLowerCase().includes("high") ||
              note.toLowerCase().includes("medium") ||
              note.toLowerCase().includes("low")
          );

          expect(confidenceNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
