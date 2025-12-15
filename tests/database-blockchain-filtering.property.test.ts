/**
 * Property-Based Tests for Database Blockchain Filtering
 *
 * **Feature: solana-wallet-scoring, Property 6: Database Blockchain Filtering**
 * **Validates: Requirements 9.3**
 *
 * Tests that database queries correctly filter by blockchain type
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import bs58 from "bs58";
import {
  saveTokenLaunch,
  getTokenLaunchesByCreator,
  saveWalletAnalysis,
  getWalletAnalysis,
  TokenLaunchData,
  WalletAnalysisData,
} from "../lib/db/repositories";
import { prisma } from "../lib/db/prisma";

// Helper generators
const ethereumAddressArbitrary = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => "0x" + Buffer.from(bytes).toString("hex"));

const solanaAddressArbitrary = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((bytes) => bs58.encode(bytes));

describe("Database Blockchain Filtering Properties", () => {
  // Clean up test data after each test
  afterEach(async () => {
    await prisma.tokenLaunch.deleteMany({
      where: {
        creator: {
          startsWith: "test-",
        },
      },
    });
    await prisma.walletAnalysis.deleteMany({
      where: {
        address: {
          startsWith: "test-",
        },
      },
    });
  });

  it("should only return tokens from the specified blockchain when filtering", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          creator: ethereumAddressArbitrary.map((addr) => `test-${addr}`),
          ethereumTokens: fc.array(
            fc.record({
              token: ethereumAddressArbitrary,
              name: fc.string({ minLength: 1, maxLength: 20 }),
              symbol: fc.string({ minLength: 1, maxLength: 5 }),
              outcome: fc.constantFrom("success", "rug", "unknown"),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          solanaTokens: fc.array(
            fc.record({
              token: solanaAddressArbitrary,
              name: fc.string({ minLength: 1, maxLength: 20 }),
              symbol: fc.string({ minLength: 1, maxLength: 5 }),
              outcome: fc.constantFrom("success", "rug", "unknown"),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ creator, ethereumTokens, solanaTokens }) => {
          // Save Ethereum tokens
          for (const token of ethereumTokens) {
            const data: TokenLaunchData = {
              token: token.token,
              name: token.name,
              symbol: token.symbol,
              creator,
              blockchain: "ethereum",
              launchAt: new Date(),
              outcome: token.outcome as any,
            };
            await saveTokenLaunch(data);
          }

          // Save Solana tokens
          for (const token of solanaTokens) {
            const data: TokenLaunchData = {
              token: token.token,
              name: token.name,
              symbol: token.symbol,
              creator,
              blockchain: "solana",
              launchAt: new Date(),
              outcome: token.outcome as any,
            };
            await saveTokenLaunch(data);
          }

          // Query for Ethereum tokens only
          const ethereumResults = await getTokenLaunchesByCreator(
            creator,
            "ethereum"
          );

          // Query for Solana tokens only
          const solanaResults = await getTokenLaunchesByCreator(
            creator,
            "solana"
          );

          // All Ethereum results should have blockchain = 'ethereum'
          expect(
            ethereumResults.every((t) => t.blockchain === "ethereum")
          ).toBe(true);

          // All Solana results should have blockchain = 'solana'
          expect(solanaResults.every((t) => t.blockchain === "solana")).toBe(
            true
          );

          // Count should match what we saved
          expect(ethereumResults.length).toBe(ethereumTokens.length);
          expect(solanaResults.length).toBe(solanaTokens.length);
        }
      ),
      { numRuns: 20 } // Reduced runs for database tests
    );
  }, 60000); // Increased timeout for database operations

  it("should return all tokens when no blockchain filter is specified", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          creator: ethereumAddressArbitrary.map((addr) => `test-${addr}`),
          ethereumCount: fc.integer({ min: 1, max: 3 }),
          solanaCount: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ creator, ethereumCount, solanaCount }) => {
          // Save Ethereum tokens
          for (let i = 0; i < ethereumCount; i++) {
            const data: TokenLaunchData = {
              token: `0x${i.toString().padStart(40, "0")}`,
              creator,
              blockchain: "ethereum",
              launchAt: new Date(),
              outcome: "unknown",
            };
            await saveTokenLaunch(data);
          }

          // Save Solana tokens
          for (let i = 0; i < solanaCount; i++) {
            const data: TokenLaunchData = {
              token: `solana-token-${i}`,
              creator,
              blockchain: "solana",
              launchAt: new Date(),
              outcome: "unknown",
            };
            await saveTokenLaunch(data);
          }

          // Query without blockchain filter
          const allResults = await getTokenLaunchesByCreator(creator);

          // Should return tokens from both blockchains
          const ethereumTokens = allResults.filter(
            (t) => t.blockchain === "ethereum"
          );
          const solanaTokens = allResults.filter(
            (t) => t.blockchain === "solana"
          );

          expect(ethereumTokens.length).toBe(ethereumCount);
          expect(solanaTokens.length).toBe(solanaCount);
          expect(allResults.length).toBe(ethereumCount + solanaCount);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  it("should store and retrieve wallet analysis by blockchain", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          address: ethereumAddressArbitrary.map((addr) => `test-${addr}`),
          ethereumScore: fc.integer({ min: 0, max: 100 }),
          solanaScore: fc.integer({ min: 0, max: 100 }),
        }),
        async ({ address, ethereumScore, solanaScore }) => {
          // Save Ethereum analysis
          const ethereumData: WalletAnalysisData = {
            address,
            blockchain: "ethereum",
            score: ethereumScore,
            breakdown: { test: "ethereum" },
            notes: ["Ethereum analysis"],
          };
          await saveWalletAnalysis(ethereumData);

          // Save Solana analysis
          const solanaData: WalletAnalysisData = {
            address,
            blockchain: "solana",
            score: solanaScore,
            breakdown: { test: "solana" },
            notes: ["Solana analysis"],
          };
          await saveWalletAnalysis(solanaData);

          // Retrieve Ethereum analysis
          const ethereumResult = await getWalletAnalysis(address, "ethereum");

          // Retrieve Solana analysis
          const solanaResult = await getWalletAnalysis(address, "solana");

          // Verify correct data is returned
          expect(ethereumResult).not.toBeNull();
          expect(solanaResult).not.toBeNull();
          expect(ethereumResult?.blockchain).toBe("ethereum");
          expect(solanaResult?.blockchain).toBe("solana");
          expect(ethereumResult?.score).toBe(ethereumScore);
          expect(solanaResult?.score).toBe(solanaScore);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  it("should not return cross-chain data when filtering by blockchain", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          creator: ethereumAddressArbitrary.map((addr) => `test-${addr}`),
          tokenAddress: ethereumAddressArbitrary,
        }),
        async ({ creator, tokenAddress }) => {
          // Save same token address on both chains (edge case)
          const ethereumData: TokenLaunchData = {
            token: tokenAddress,
            creator,
            blockchain: "ethereum",
            launchAt: new Date(),
            outcome: "success",
          };
          await saveTokenLaunch(ethereumData);

          const solanaData: TokenLaunchData = {
            token: tokenAddress,
            creator,
            blockchain: "solana",
            launchAt: new Date(),
            outcome: "rug",
          };
          await saveTokenLaunch(solanaData);

          // Query for Ethereum only
          const ethereumResults = await getTokenLaunchesByCreator(
            creator,
            "ethereum"
          );

          // Query for Solana only
          const solanaResults = await getTokenLaunchesByCreator(
            creator,
            "solana"
          );

          // Should get exactly one result for each chain
          expect(ethereumResults.length).toBe(1);
          expect(solanaResults.length).toBe(1);

          // Results should have different outcomes
          expect(ethereumResults[0].outcome).toBe("success");
          expect(solanaResults[0].outcome).toBe("rug");

          // Both should have the same token address but different blockchains
          expect(ethereumResults[0].token).toBe(tokenAddress);
          expect(solanaResults[0].token).toBe(tokenAddress);
          expect(ethereumResults[0].blockchain).toBe("ethereum");
          expect(solanaResults[0].blockchain).toBe("solana");
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});
