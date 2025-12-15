/**
 * Property-Based Tests for Chain Detection
 * Feature: solana-wallet-scoring, Property 1: Chain Detection Accuracy
 * Validates: Requirements 2.1, 2.4
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import bs58 from "bs58";
import { detectBlockchain } from "../lib/validation";

describe("Chain Detection Properties", () => {
  /**
   * Property 1: Chain Detection Accuracy
   * For any valid Ethereum or Solana address, the chain detection function should correctly identify the blockchain type
   */
  it("should correctly detect valid Ethereum addresses", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
          minLength: 40,
          maxLength: 40,
        }),
        (hexChars) => {
          const hexString = hexChars.join("");
          const ethereumAddress = "0x" + hexString;

          const result = detectBlockchain(ethereumAddress);

          expect(result.blockchain).toBe("ethereum");
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should correctly detect valid Solana addresses", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const solanaAddress = bs58.encode(bytes);

        const result = detectBlockchain(solanaAddress);

        expect(result.blockchain).toBe("solana");
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("should detect invalid Ethereum addresses starting with 0x", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Too short
          fc
            .array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
              minLength: 1,
              maxLength: 39,
            })
            .map((arr) => arr.join("")),
          // Too long
          fc
            .array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
              minLength: 41,
              maxLength: 60,
            })
            .map((arr) => arr.join("")),
          // Contains invalid characters
          fc
            .string({ minLength: 40, maxLength: 40 })
            .filter((s) => /[^0-9a-fA-F]/.test(s))
        ),
        (invalidHex) => {
          const invalidAddress = "0x" + invalidHex;

          const result = detectBlockchain(invalidAddress);

          expect(result.blockchain).toBe("ethereum");
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should detect invalid addresses that match neither format", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((str) => {
          // Filter out valid Ethereum addresses
          if (
            str.startsWith("0x") &&
            str.length === 42 &&
            /^0x[0-9a-fA-F]{40}$/.test(str)
          ) {
            return false;
          }
          // Filter out valid Solana addresses
          if (str.length >= 32 && str.length <= 44) {
            try {
              const decoded = bs58.decode(str);
              if (decoded.length === 32) return false;
            } catch {
              // Not valid base58, keep it
            }
          }
          return true;
        }),
        (invalidAddress) => {
          const result = detectBlockchain(invalidAddress);

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should handle whitespace correctly for both chains", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc
            .array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
              minLength: 40,
              maxLength: 40,
            })
            .map((arr) => "0x" + arr.join("")),
          fc
            .uint8Array({ minLength: 32, maxLength: 32 })
            .map((bytes) => bs58.encode(bytes))
        ),
        fc.constantFrom(" ", "\t", "\n", "  "),
        (validAddress, whitespace) => {
          const withWhitespace = whitespace + validAddress + whitespace;

          const result = detectBlockchain(withWhitespace);

          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should be deterministic for the same input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc
            .array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
              minLength: 40,
              maxLength: 40,
            })
            .map((arr) => "0x" + arr.join("")),
          fc
            .uint8Array({ minLength: 32, maxLength: 32 })
            .map((bytes) => bs58.encode(bytes)),
          fc.string({ minLength: 1, maxLength: 100 })
        ),
        (address) => {
          const result1 = detectBlockchain(address);
          const result2 = detectBlockchain(address);

          expect(result1.blockchain).toBe(result2.blockchain);
          expect(result1.valid).toBe(result2.valid);
          expect(result1.error).toBe(result2.error);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should correctly identify blockchain type for mixed case Ethereum addresses", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
          minLength: 40,
          maxLength: 40,
        }),
        fc.boolean(),
        (hexChars, shouldUpperCase) => {
          const hexString = hexChars.join("");
          const cased = shouldUpperCase
            ? hexString.toUpperCase()
            : hexString.toLowerCase();
          const ethereumAddress = "0x" + cased;

          const result = detectBlockchain(ethereumAddress);

          expect(result.blockchain).toBe("ethereum");
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
