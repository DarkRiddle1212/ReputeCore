// Property-based tests for wallet age notes presence

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "@/lib/scoring";
import { WalletInfo, TokenSummary } from "@/types";

describe("Wallet Age Notes Presence Properties", () => {
  const emptyTokens: TokenSummary[] = [];

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should always include a note describing wallet age category or unknown status", () => {
    fc.assert(
      fc.property(
        fc.record({
          createdAt: fc.option(
            fc
              .date({
                min: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), // 5 years ago
                max: new Date(), // now
              })
              .map((d) => d.toISOString())
          ),
          txCount: fc.integer({ min: 0, max: 100000 }),
          firstTxHash: fc.option(fc.constant("0x" + "0".repeat(64))),
          age: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        }),
        (walletData) => {
          const walletInfo: WalletInfo = {
            createdAt: walletData.createdAt || null,
            txCount: walletData.txCount,
            firstTxHash: walletData.firstTxHash || null,
            age: walletData.age || null,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Should always have notes
          expect(Array.isArray(result.notes)).toBe(true);
          expect(result.notes.length).toBeGreaterThan(0);

          // Should have exactly one note about wallet age
          const ageNotes = result.notes.filter(
            (note) =>
              note.toLowerCase().includes("wallet") &&
              (note.toLowerCase().includes("age") ||
                note.toLowerCase().includes("new") ||
                note.toLowerCase().includes("old") ||
                note.toLowerCase().includes("year") ||
                note.toLowerCase().includes("month") ||
                note.toLowerCase().includes("week") ||
                note.toLowerCase().includes("day") ||
                note.toLowerCase().includes("unknown") ||
                note.toLowerCase().includes("established") ||
                note.toLowerCase().includes("history"))
          );

          expect(ageNotes.length).toBeGreaterThanOrEqual(1);

          // Verify the note content matches the expected age category
          if (walletData.createdAt) {
            const createdDate = new Date(walletData.createdAt);
            const daysSince = Math.floor(
              (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSince >= 365) {
              expect(
                ageNotes.some(
                  (note) =>
                    note.includes("older than 1 year") ||
                    note.includes("established")
                )
              ).toBe(true);
            } else if (daysSince >= 90) {
              expect(
                ageNotes.some(
                  (note) =>
                    note.includes("3-12 months") ||
                    note.includes("moderate history")
                )
              ).toBe(true);
            } else if (daysSince >= 30) {
              expect(
                ageNotes.some(
                  (note) =>
                    note.includes("1-3 months") ||
                    note.includes("limited history")
                )
              ).toBe(true);
            } else if (daysSince >= 7) {
              expect(
                ageNotes.some(
                  (note) =>
                    note.includes("1-4 weeks") ||
                    note.includes("very limited history")
                )
              ).toBe(true);
            } else {
              expect(
                ageNotes.some(
                  (note) =>
                    note.includes("very new") || note.includes("HIGH RISK")
                )
              ).toBe(true);
            }
          } else {
            // Should have unknown age note
            expect(
              ageNotes.some(
                (note) =>
                  note.toLowerCase().includes("unknown") ||
                  note.toLowerCase().includes("age")
              )
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should include appropriate risk indicators in age notes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }), // Very new wallets (0-6 days)
        (daysOld) => {
          const createdAt = new Date(
            Date.now() - daysOld * 24 * 60 * 60 * 1000
          ).toISOString();
          const walletInfo: WalletInfo = {
            createdAt,
            txCount: 50,
            firstTxHash: "0x" + "0".repeat(64),
            age: `${daysOld} days`,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Very new wallets should have HIGH RISK indicator
          const riskNotes = result.notes.filter(
            (note) => note.includes("HIGH RISK") || note.includes("very new")
          );

          expect(riskNotes.length).toBeGreaterThanOrEqual(1);
          expect(result.breakdown.walletAgeScore).toBe(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should include positive indicators for established wallets", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 365, max: 2000 }), // Established wallets (1+ years)
        (daysOld) => {
          const createdAt = new Date(
            Date.now() - daysOld * 24 * 60 * 60 * 1000
          ).toISOString();
          const walletInfo: WalletInfo = {
            createdAt,
            txCount: 500,
            firstTxHash: "0x" + "0".repeat(64),
            age: `${Math.floor(daysOld / 365)} years`,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Established wallets should have positive indicators
          const positiveNotes = result.notes.filter(
            (note) =>
              note.includes("✓") ||
              note.includes("established") ||
              note.includes("older than 1 year")
          );

          expect(positiveNotes.length).toBeGreaterThanOrEqual(1);
          expect(result.breakdown.walletAgeScore).toBe(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should handle edge cases in date parsing gracefully", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(""),
          fc.constant("invalid-date"),
          fc.constant("2023-13-45"), // Invalid date
          fc.constant("not-a-date"),
          fc
            .date({ min: new Date("1970-01-01"), max: new Date() })
            .map((d) => d.toISOString())
        ),
        (createdAtValue) => {
          const walletInfo: WalletInfo = {
            createdAt: createdAtValue,
            txCount: 100,
            firstTxHash: "0x" + "0".repeat(64),
            age: null,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Should always have notes
          expect(result.notes.length).toBeGreaterThan(0);

          // Should handle invalid dates by showing unknown
          if (
            !createdAtValue ||
            createdAtValue === "" ||
            createdAtValue === "invalid-date" ||
            createdAtValue === "2023-13-45" ||
            createdAtValue === "not-a-date"
          ) {
            const unknownNotes = result.notes.filter(
              (note) =>
                note.toLowerCase().includes("unknown") &&
                note.toLowerCase().includes("age")
            );
            expect(unknownNotes.length).toBeGreaterThanOrEqual(1);
            expect(result.breakdown.walletAgeScore).toBe(50);
          } else {
            // Valid date should have appropriate age note
            const ageNotes = result.notes.filter(
              (note) =>
                note.toLowerCase().includes("wallet") &&
                (note.toLowerCase().includes("age") ||
                  note.toLowerCase().includes("new") ||
                  note.toLowerCase().includes("old") ||
                  note.toLowerCase().includes("established") ||
                  note.toLowerCase().includes("history"))
            );
            expect(ageNotes.length).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should maintain note consistency across different transaction counts", () => {
    fc.assert(
      fc.property(
        fc.record({
          daysOld: fc.integer({ min: 0, max: 1000 }),
          txCount: fc.integer({ min: 0, max: 10000 }),
        }),
        ({ daysOld, txCount }) => {
          const createdAt = new Date(
            Date.now() - daysOld * 24 * 60 * 60 * 1000
          ).toISOString();
          const walletInfo: WalletInfo = {
            createdAt,
            txCount,
            firstTxHash: "0x" + "0".repeat(64),
            age: `${daysOld} days`,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Age notes should be consistent regardless of transaction count
          const ageNotes = result.notes.filter(
            (note) =>
              note.toLowerCase().includes("wallet") &&
              (note.toLowerCase().includes("age") ||
                note.toLowerCase().includes("new") ||
                note.toLowerCase().includes("old") ||
                note.toLowerCase().includes("established") ||
                note.toLowerCase().includes("history") ||
                note.toLowerCase().includes("year") ||
                note.toLowerCase().includes("month") ||
                note.toLowerCase().includes("week"))
          );

          expect(ageNotes.length).toBeGreaterThanOrEqual(1);

          // Verify age score matches expected tier
          let expectedScore: number;
          if (daysOld >= 365) expectedScore = 100;
          else if (daysOld >= 90) expectedScore = 80;
          else if (daysOld >= 30) expectedScore = 60;
          else if (daysOld >= 7) expectedScore = 40;
          else expectedScore = 10;

          expect(result.breakdown.walletAgeScore).toBe(expectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 14: Wallet age notes presence
  it("should include exactly one primary age-related note per scoring result", () => {
    fc.assert(
      fc.property(
        fc.option(
          fc
            .date({
              min: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000), // 3 years ago
              max: new Date(),
            })
            .map((d) => d.toISOString())
        ),
        (createdAt) => {
          const walletInfo: WalletInfo = {
            createdAt: createdAt || null,
            txCount: 100,
            firstTxHash: "0x" + "0".repeat(64),
            age: createdAt ? "1 year" : null,
          };

          const result = computeScore(walletInfo, emptyTokens);

          // Count primary age-related notes (those that describe the main age category)
          const primaryAgeNotes = result.notes.filter(
            (note) =>
              (note.includes("older than 1 year") &&
                note.includes("established")) ||
              (note.includes("3-12 months") &&
                note.includes("moderate history")) ||
              (note.includes("1-3 months") &&
                note.includes("limited history")) ||
              (note.includes("1-4 weeks") &&
                note.includes("very limited history")) ||
              (note.includes("very new") && note.includes("HIGH RISK")) ||
              note.includes("age unknown")
          );

          // Should have exactly one primary age note
          expect(primaryAgeNotes.length).toBe(1);

          // The note should be descriptive and informative
          expect(primaryAgeNotes[0].length).toBeGreaterThan(10);
        }
      ),
      { numRuns: 100 }
    );
  });
});
