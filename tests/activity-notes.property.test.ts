// Property-based tests for activity notes presence

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { computeScore } from "../lib/scoring";
import type { WalletInfo } from "../types";

describe("Activity Notes Presence Properties", () => {
  // Generator for wallet info with various transaction counts
  const walletInfoGen = fc.record({
    createdAt: fc
      .option(fc.date({ min: new Date("2020-01-01"), max: new Date() }))
      .map((d) => (d ? d.toISOString() : null)),
    firstTxHash: fc.option(
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
          { minLength: 64, maxLength: 64 }
        )
        .map((chars) => `0x${chars.join("")}`)
    ),
    txCount: fc.integer({ min: 0, max: 10000 }),
    age: fc.option(fc.string()),
  });

  // Generator for empty token summaries (to focus on activity scoring)
  const emptyTokenSummariesGen = fc.constant([]);

  // Feature: wallet-trust-scoring, Property 15: Activity notes presence
  it("should always include activity-related notes in scoring results", () => {
    fc.assert(
      fc.property(
        walletInfoGen,
        emptyTokenSummariesGen,
        (walletInfo, tokenSummaries) => {
          const result = computeScore(walletInfo, tokenSummaries as any);

          // Should have notes array
          expect(Array.isArray(result.notes)).toBe(true);
          expect(result.notes.length).toBeGreaterThan(0);

          // Should contain at least one note about transaction activity
          const activityNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("transaction") ||
              note.toLowerCase().includes("activity") ||
              note.toLowerCase().includes("active") ||
              note.toLowerCase().includes("1000+") ||
              note.toLowerCase().includes("200+") ||
              note.toLowerCase().includes("50+") ||
              note.toLowerCase().includes("10-50") ||
              note.toLowerCase().includes("<10") ||
              note.toLowerCase().includes("very active") ||
              note.toLowerCase().includes("moderate activity") ||
              note.toLowerCase().includes("low activity") ||
              note.toLowerCase().includes("very low activity")
          );

          expect(activityNotes.length).toBeGreaterThanOrEqual(1);

          // Verify the activity note matches the transaction count
          const txCount = walletInfo.txCount ?? 0;
          let expectedActivityPattern: RegExp;

          if (txCount >= 1000) {
            expectedActivityPattern =
              /very active.*1000\+|1000\+.*transaction/i;
          } else if (txCount >= 200) {
            expectedActivityPattern = /active.*200\+|200\+.*transaction/i;
          } else if (txCount >= 50) {
            expectedActivityPattern =
              /moderate.*activity.*50\+|50\+.*transaction/i;
          } else if (txCount >= 10) {
            expectedActivityPattern =
              /low.*activity.*10-50|10-50.*transaction/i;
          } else {
            expectedActivityPattern =
              /very low.*activity.*<10|<10.*transaction/i;
          }

          const matchingNotes = result.notes.filter((note: string) =>
            expectedActivityPattern.test(note)
          );
          expect(matchingNotes.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 15: Activity notes presence
  it("should provide consistent activity notes for boundary transaction counts", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 9, 10, 49, 50, 199, 200, 999, 1000, 5000),
        fc
          .option(fc.date({ min: new Date("2020-01-01"), max: new Date() }))
          .map((d) => {
            if (!d) return null;
            const iso = d.toISOString();
            return iso && iso.length > 0 ? iso : null;
          }),
        (txCount, createdAt) => {
          const walletInfo: WalletInfo = {
            createdAt,
            firstTxHash: null,
            txCount,
            age: null,
          };

          const result = computeScore(walletInfo, []);

          // Should have activity notes
          const activityNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("transaction") ||
              note.toLowerCase().includes("activity") ||
              note.toLowerCase().includes("active")
          );

          expect(activityNotes.length).toBeGreaterThanOrEqual(1);

          // Verify correct categorization
          if (txCount >= 1000) {
            expect(
              activityNotes.some((note: string) =>
                /very active.*1000\+/i.test(note)
              )
            ).toBe(true);
          } else if (txCount >= 200) {
            expect(
              activityNotes.some((note: string) => /active.*200\+/i.test(note))
            ).toBe(true);
          } else if (txCount >= 50) {
            expect(
              activityNotes.some((note: string) =>
                /moderate.*activity.*50\+/i.test(note)
              )
            ).toBe(true);
          } else if (txCount >= 10) {
            expect(
              activityNotes.some((note: string) =>
                /low.*activity.*10-50/i.test(note)
              )
            ).toBe(true);
          } else {
            expect(
              activityNotes.some((note: string) =>
                /very low.*activity.*<10/i.test(note)
              )
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 15: Activity notes presence
  it("should handle null/undefined transaction counts gracefully", () => {
    fc.assert(
      fc.property(
        fc.record({
          createdAt: fc.option(fc.constant("2023-01-01T00:00:00.000Z")),
          firstTxHash: fc.option(
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
                { minLength: 64, maxLength: 64 }
              )
              .map((chars) => `0x${chars.join("")}`)
          ),
          txCount: fc.constantFrom(null, undefined),
          age: fc.option(fc.string()),
        }),
        (walletInfo) => {
          const result = computeScore(
            {
              ...walletInfo,
              txCount: walletInfo.txCount ?? 0,
            } as WalletInfo,
            []
          );

          // Should still have activity notes even with null/undefined txCount
          const activityNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("transaction") ||
              note.toLowerCase().includes("activity") ||
              note.toLowerCase().includes("active")
          );

          expect(activityNotes.length).toBeGreaterThanOrEqual(1);

          // Should treat null/undefined as 0 transactions
          expect(
            activityNotes.some((note: string) =>
              /very low.*activity.*<10/i.test(note)
            )
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 15: Activity notes presence
  it("should maintain activity note consistency across different wallet ages", () => {
    fc.assert(
      fc.property(
        fc.record({
          txCount: fc.integer({ min: 0, max: 2000 }),
          ageDays: fc.option(fc.integer({ min: 0, max: 1000 })),
        }),
        ({ txCount, ageDays }) => {
          const createdAt =
            ageDays !== null && ageDays !== undefined
              ? new Date(
                  Date.now() - ageDays * 24 * 60 * 60 * 1000
                ).toISOString()
              : null;

          const walletInfo: WalletInfo = {
            createdAt,
            firstTxHash: null,
            txCount,
            age: null,
          };

          const result = computeScore(walletInfo, []);

          // Activity notes should be present regardless of wallet age
          const activityNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("transaction") ||
              note.toLowerCase().includes("activity") ||
              note.toLowerCase().includes("active")
          );

          expect(activityNotes.length).toBeGreaterThanOrEqual(1);

          // Activity categorization should be consistent regardless of age
          const activityNote = activityNotes[0];
          if (txCount >= 1000) {
            expect(/very active.*1000\+/i.test(activityNote)).toBe(true);
          } else if (txCount >= 200) {
            expect(/active.*200\+/i.test(activityNote)).toBe(true);
          } else if (txCount >= 50) {
            expect(/moderate.*activity.*50\+/i.test(activityNote)).toBe(true);
          } else if (txCount >= 10) {
            expect(/low.*activity.*10-50/i.test(activityNote)).toBe(true);
          } else {
            expect(/very low.*activity.*<10/i.test(activityNote)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 15: Activity notes presence
  it("should include activity notes even when tokens are present", () => {
    fc.assert(
      fc.property(
        walletInfoGen,
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
            initialLiquidity: fc.option(fc.integer({ min: 0, max: 1000000 })),
            holdersAfter7Days: fc.option(fc.integer({ min: 0, max: 10000 })),
            liquidityLocked: fc.option(fc.boolean()),
            devSellRatio: fc.option(fc.double({ min: 0, max: 1 })),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (walletInfo, tokenSummaries) => {
          const result = computeScore(walletInfo, tokenSummaries as any);

          // Should still have activity notes even with tokens present
          const activityNotes = result.notes.filter(
            (note: string) =>
              note.toLowerCase().includes("transaction") ||
              note.toLowerCase().includes("activity") ||
              note.toLowerCase().includes("active")
          );

          expect(activityNotes.length).toBeGreaterThanOrEqual(1);

          // Activity note should still reflect the transaction count correctly
          const txCount = walletInfo.txCount ?? 0;
          if (txCount >= 1000) {
            expect(
              activityNotes.some((note: string) =>
                /very active.*1000\+/i.test(note)
              )
            ).toBe(true);
          } else if (txCount >= 200) {
            expect(
              activityNotes.some((note: string) => /active.*200\+/i.test(note))
            ).toBe(true);
          } else if (txCount >= 50) {
            expect(
              activityNotes.some((note: string) =>
                /moderate.*activity.*50\+/i.test(note)
              )
            ).toBe(true);
          } else if (txCount >= 10) {
            expect(
              activityNotes.some((note: string) =>
                /low.*activity.*10-50/i.test(note)
              )
            ).toBe(true);
          } else {
            expect(
              activityNotes.some((note: string) =>
                /very low.*activity.*<10/i.test(note)
              )
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
