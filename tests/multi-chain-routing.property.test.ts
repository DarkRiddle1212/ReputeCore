/**
 * Property-Based Tests for Multi-Chain Routing
 * Feature: solana-wallet-scoring, Property 8: Multi-Chain Routing Correctness
 * Validates: Requirements 2.2, 2.3
 */

import fc from "fast-check";
import {
  detectBlockchain,
  processAddressInput,
  isValidEthereumAddress,
  isValidSolanaAddress,
} from "@/lib/validation";

// Helper to generate hex strings
const hexChar = () =>
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
    "f",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F"
  );
const hexString = (length: number) =>
  fc
    .array(hexChar(), { minLength: length, maxLength: length })
    .map((arr) => arr.join(""));

// Helper to generate base58 strings
const base58Char = () =>
  fc.constantFrom(
    ..."123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".split("")
  );
const base58String = (minLen: number, maxLen: number) =>
  fc
    .array(base58Char(), { minLength: minLen, maxLength: maxLen })
    .map((arr) => arr.join(""));

describe("Property 8: Multi-Chain Routing Correctness", () => {
  /**
   * Property: For any valid Ethereum address (0x + 40 hex chars),
   * the system should detect it as Ethereum blockchain
   */
  it("should correctly detect Ethereum addresses", () => {
    fc.assert(
      fc.property(
        // Generate valid Ethereum addresses: 0x followed by 40 hex characters
        hexString(40),
        (hexStr) => {
          const ethereumAddress = `0x${hexStr}`;

          const result = detectBlockchain(ethereumAddress);

          // Property: Should detect as Ethereum
          expect(result.blockchain).toBe("ethereum");
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid Solana address (base58, 32-44 chars),
   * the system should detect it as Solana blockchain
   */
  it("should correctly detect Solana addresses", () => {
    fc.assert(
      fc.property(
        // Use known valid Solana addresses (real program addresses that decode to 32 bytes)
        fc.constantFrom(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token program
          "So11111111111111111111111111111111111111112", // Wrapped SOL
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
          "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", // Metaplex
          "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" // Pump.fun
        ),
        (solanaAddress) => {
          const result = detectBlockchain(solanaAddress);

          // Property: Should detect as Solana
          expect(result.blockchain).toBe("solana");
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: For any address starting with "0x", the system should
   * attempt to validate it as an Ethereum address
   */
  it("should route 0x-prefixed addresses to Ethereum validation", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (suffix) => {
        const address = `0x${suffix}`;

        const result = detectBlockchain(address);

        // Property: Should always detect as Ethereum blockchain
        expect(result.blockchain).toBe("ethereum");

        // Validity depends on whether it's a proper hex string of length 40
        const isValidHex = /^0x[a-fA-F0-9]{40}$/.test(address);
        expect(result.valid).toBe(isValidHex);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any address not starting with "0x", the system should
   * attempt to validate it as a Solana address
   */
  it("should route non-0x addresses to Solana validation", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 32, maxLength: 44 })
          .filter((s) => !s.startsWith("0x")),
        (address) => {
          const result = detectBlockchain(address);

          // Property: Should detect as Solana (or default to ethereum if invalid)
          if (isValidSolanaAddress(address)) {
            expect(result.blockchain).toBe("solana");
            expect(result.valid).toBe(true);
          } else {
            // Invalid addresses default to ethereum blockchain
            expect(result.blockchain).toBe("ethereum");
            expect(result.valid).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: processAddressInput should return consistent blockchain type
   * with detectBlockchain for the same address
   */
  it("should have consistent blockchain detection across functions", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Ethereum addresses
          hexString(40).map((h) => `0x${h}`),
          // Known valid Solana addresses
          fc.constantFrom(
            "11111111111111111111111111111111",
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "So11111111111111111111111111111111111111112"
          )
        ),
        (address) => {
          const detectResult = detectBlockchain(address);
          const processResult = processAddressInput(address);

          // Property: Both functions should agree on blockchain type
          if (detectResult.valid && processResult.valid) {
            expect(processResult.blockchain).toBe(detectResult.blockchain);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid address, processAddressInput should return
   * a normalized version that is still valid for the same blockchain
   */
  it("should normalize addresses while preserving validity", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Ethereum addresses with mixed case
          hexString(40).map((h) => `0x${h}`),
          // Valid Solana addresses
          fc.constantFrom(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "So11111111111111111111111111111111111111112",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
          )
        ),
        (address) => {
          const result = processAddressInput(address);

          if (result.valid && result.address && result.blockchain) {
            // Property: Normalized address should still be valid
            if (result.blockchain === "ethereum") {
              expect(isValidEthereumAddress(result.address)).toBe(true);
              // Ethereum addresses should be lowercased
              expect(result.address).toBe(result.address.toLowerCase());
            } else {
              expect(isValidSolanaAddress(result.address)).toBe(true);
              // Solana addresses should preserve case
              expect(result.address).toBe(address.trim());
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Whitespace should not affect blockchain detection
   */
  it("should detect blockchain correctly regardless of whitespace", () => {
    fc.assert(
      fc.property(
        hexString(40),
        fc.string({ maxLength: 5 }).filter((s) => /^\s*$/.test(s)), // Whitespace only
        fc.string({ maxLength: 5 }).filter((s) => /^\s*$/.test(s)),
        (hexStr, leadingSpace, trailingSpace) => {
          const cleanAddress = `0x${hexStr}`;
          const paddedAddress = `${leadingSpace}${cleanAddress}${trailingSpace}`;

          const cleanResult = detectBlockchain(cleanAddress);
          const paddedResult = detectBlockchain(paddedAddress);

          // Property: Should detect same blockchain regardless of whitespace
          expect(paddedResult.blockchain).toBe(cleanResult.blockchain);
          expect(paddedResult.valid).toBe(cleanResult.valid);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid addresses should be rejected with appropriate error messages
   */
  it("should reject invalid addresses with error messages", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Too short
          fc.string({ maxLength: 10 }),
          // Too long
          fc.string({ minLength: 100, maxLength: 200 }),
          // Invalid characters for both formats
          fc
            .string()
            .filter(
              (s) => s.includes("!") || s.includes("@") || s.includes("#")
            )
        ),
        (invalidAddress) => {
          const result = detectBlockchain(invalidAddress);

          // Property: Invalid addresses should be marked as invalid
          expect(result.valid).toBe(false);
          // Property: Should provide an error message
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe("string");
          expect(result.error!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Blockchain detection should be deterministic
   * (same input always produces same output)
   */
  it("should produce deterministic results for the same address", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10, maxLength: 50 }), (address) => {
        const result1 = detectBlockchain(address);
        const result2 = detectBlockchain(address);
        const result3 = detectBlockchain(address);

        // Property: All results should be identical
        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Case sensitivity should only matter for Solana addresses
   */
  it("should handle case sensitivity correctly per blockchain", () => {
    fc.assert(
      fc.property(hexString(40), (hexStr) => {
        const lowerAddress = `0x${hexStr.toLowerCase()}`;
        const upperAddress = `0x${hexStr.toUpperCase()}`;
        const mixedAddress = `0x${hexStr}`;

        const lowerResult = detectBlockchain(lowerAddress);
        const upperResult = detectBlockchain(upperAddress);
        const mixedResult = detectBlockchain(mixedAddress);

        // Property: All should be detected as Ethereum and valid
        expect(lowerResult.blockchain).toBe("ethereum");
        expect(upperResult.blockchain).toBe("ethereum");
        expect(mixedResult.blockchain).toBe("ethereum");
        expect(lowerResult.valid).toBe(true);
        expect(upperResult.valid).toBe(true);
        expect(mixedResult.valid).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Empty or whitespace-only input should be rejected
   */
  it("should reject empty or whitespace-only addresses", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }).filter((s) => s.trim().length === 0),
        (emptyAddress) => {
          const result = detectBlockchain(emptyAddress);

          // Property: Should be invalid
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});
