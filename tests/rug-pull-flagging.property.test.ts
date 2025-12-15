// Property-based tests for rug pull flagging in notes

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "../lib/scoring";
import type { WalletInfo, TokenSummary } from "../types";

describe("Rug Pull Flagging Properties", () => {
  // Helper to create a basic wallet info
  const createWalletInfo = (): WalletInfo => ({
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    firstTxHash:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txCount: 100,
    age: "100 days",
  });

  // Generator for rug tokens
  const rugTokenGen = fc.record({
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
    initialLiquidity: fc.oneof(
      fc.constant(0), // Zero liquidity = rug
      fc.integer({ min: 1, max: 1000 }) // Some liquidity but high dev sell
    ),
    holdersAfter7Days: fc.integer({ min: 0, max: 100 }),
    liquidityLocked: fc.constant(false),
    devSellRatio: fc.oneof(
      fc.double({ min: 0.5, max: 1.0 }), // High sell ratio = rug
      fc.double({ min: 0.8, max: 1.0 }) // Very high sell ratio = definite rug
    ),
    outcome: fc.constantFrom("rug"),
  });

  // Generator for success tokens
  const successTokenGen = fc.record({
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
    initialLiquidity: fc.integer({ min: 1000, max: 100000 }),
    holdersAfter7Days: fc.integer({ min: 200, max: 10000 }),
    liquidityLocked: fc.constant(true),
    devSellRatio: fc.double({ min: 0, max: 0.2 }),
    outcome: fc.constantFrom("success"),
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should flag rug pull tokens in notes when rugs are present", () => {
    fc.assert(
      fc.property(
        fc.record({
          rugTokens: fc.array(rugTokenGen, { minLength: 1, maxLength: 5 }),
          successTokens: fc.array(successTokenGen, {
            minLength: 0,
            maxLength: 3,
          }),
        }),
        ({ rugTokens, successTokens }) => {
          const allTokens = [...rugTokens, ...successTokens].map((token) => ({
            ...token,
            outcome: token.outcome as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, allTokens);

          // Should have notes array
          expect(Array.isArray(result.notes)).toBe(true);

          // Should contain at least one note about rug pulls
          const rugNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged") ||
              note.toLowerCase().includes("🚨")
          );

          expect(rugNotes.length).toBeGreaterThanOrEqual(1);

          // Should mention the number of rug tokens
          const rugCount = rugTokens.length;
          const rugCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${rugCount}`) &&
              (note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged"))
          );

          expect(rugCountNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should not flag rug pulls when no rugs are present", () => {
    fc.assert(
      fc.property(
        fc.array(successTokenGen, { minLength: 1, maxLength: 10 }),
        (successTokens) => {
          const tokensWithOutcome = successTokens.map((token) => ({
            ...token,
            outcome: "success" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should not contain notes about rug pulls
          const rugNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged") ||
              note.toLowerCase().includes("🚨")
          );

          expect(rugNotes.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should correctly count and flag multiple rug tokens", () => {
    fc.assert(
      fc.property(
        fc.array(rugTokenGen, { minLength: 2, maxLength: 10 }),
        (rugTokens) => {
          const tokensWithOutcome = rugTokens.map((token) => ({
            ...token,
            outcome: "rug" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          const rugCount = rugTokens.length;

          // Should mention the exact number of rug tokens
          const rugCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${rugCount}`) &&
              (note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged"))
          );

          expect(rugCountNotes.length).toBeGreaterThanOrEqual(1);

          // Should use plural form for multiple rugs
          if (rugCount > 1) {
            const pluralNotes = result.notes.filter(
              (note: string) =>
                note.includes("token(s)") || note.includes("tokens")
            );
            expect(pluralNotes.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should flag rugs based on high dev sell ratio", () => {
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
            initialLiquidity: fc.integer({ min: 1000, max: 100000 }), // Good liquidity
            holdersAfter7Days: fc.integer({ min: 50, max: 500 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.double({ min: 0.5, max: 1.0, noNaN: true }), // High sell ratio should trigger rug classification
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (tokens) => {
          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokens);

          // Should flag these as rugs due to high dev sell ratio
          const rugNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged") ||
              note.toLowerCase().includes("🚨")
          );

          expect(rugNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should flag rugs when tokens have explicit rug outcome", () => {
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
            initialLiquidity: fc.constant(0), // Zero liquidity
            holdersAfter7Days: fc.integer({ min: 10, max: 500 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.double({ min: 0, max: 0.3, noNaN: true }),
            outcome: fc.constant("rug"), // Explicitly mark as rug
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (tokens) => {
          const tokensWithOutcome = tokens.map((token) => ({
            ...token,
            outcome: "rug" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should flag these as rugs due to explicit outcome
          const rugNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged") ||
              note.toLowerCase().includes("🚨")
          );

          expect(rugNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should include warning emoji for rug pull notes", () => {
    fc.assert(
      fc.property(
        fc.array(rugTokenGen, { minLength: 1, maxLength: 3 }),
        (rugTokens) => {
          const tokensWithOutcome = rugTokens.map((token) => ({
            ...token,
            outcome: "rug" as any,
          }));

          const walletInfo = createWalletInfo();
          const result = computeScore(walletInfo, tokensWithOutcome);

          // Should include warning emoji in rug pull notes
          const warningNotes = result.notes.filter(
            (note: string) =>
              note.includes("🚨") &&
              (note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged"))
          );

          expect(warningNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should maintain rug flagging consistency across different wallet ages", () => {
    fc.assert(
      fc.property(
        fc.record({
          rugTokens: fc.array(rugTokenGen, { minLength: 1, maxLength: 3 }),
          walletAgeDays: fc.integer({ min: 1, max: 1000 }),
        }),
        ({ rugTokens, walletAgeDays }) => {
          const walletInfo: WalletInfo = {
            createdAt: new Date(
              Date.now() - walletAgeDays * 24 * 60 * 60 * 1000
            ).toISOString(),
            firstTxHash:
              "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            txCount: 100,
            age: `${walletAgeDays} days`,
          };

          const tokensWithOutcome = rugTokens.map((token) => ({
            ...token,
            outcome: "rug" as any,
          }));

          const result = computeScore(walletInfo, tokensWithOutcome);

          // Rug flagging should be consistent regardless of wallet age
          const rugNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("rug") ||
              note.toLowerCase().includes("flagged") ||
              note.toLowerCase().includes("🚨")
          );

          expect(rugNotes.length).toBeGreaterThanOrEqual(1);

          const rugCount = rugTokens.length;
          const rugCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${rugCount}`) &&
              (note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged"))
          );

          expect(rugCountNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 5: Rug pull flagging in notes
  it("should handle mixed token portfolios with accurate rug counting", () => {
    fc.assert(
      fc.property(
        fc.record({
          rugCount: fc.integer({ min: 1, max: 5 }),
          successCount: fc.integer({ min: 1, max: 5 }),
          unknownCount: fc.integer({ min: 0, max: 3 }),
        }),
        ({ rugCount, successCount, unknownCount }) => {
          const tokens: any[] = [];

          // Add rug tokens
          for (let i = 0; i < rugCount; i++) {
            tokens.push({
              token: `0x${"1".repeat(40)}`,
              name: "Rug Token",
              symbol: "RUG",
              creator: `0x${"a".repeat(40)}`,
              launchAt: "2023-01-01T00:00:00.000Z",
              initialLiquidity: 0,
              holdersAfter7Days: 10,
              liquidityLocked: false,
              devSellRatio: 0.8,
              outcome: "rug",
            });
          }

          // Add success tokens
          for (let i = 0; i < successCount; i++) {
            tokens.push({
              token: `0x${"2".repeat(40)}`,
              name: "Success Token",
              symbol: "SUCC",
              creator: `0x${"b".repeat(40)}`,
              launchAt: "2023-01-01T00:00:00.000Z",
              initialLiquidity: 10000,
              holdersAfter7Days: 500,
              liquidityLocked: true,
              devSellRatio: 0.05,
              outcome: "success",
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

          // Should flag exactly the right number of rug tokens
          const rugCountNotes = result.notes.filter(
            (note: string) =>
              note.includes(`${rugCount}`) &&
              (note.toLowerCase().includes("rug") ||
                note.toLowerCase().includes("flagged"))
          );

          expect(rugCountNotes.length).toBeGreaterThanOrEqual(1);

          // Should also mention success tokens if present
          if (successCount > 0) {
            const successNotes = result.notes.filter(
              (note: string) =>
                note.includes(`${successCount}`) &&
                note.toLowerCase().includes("positive")
            );
            expect(successNotes.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
