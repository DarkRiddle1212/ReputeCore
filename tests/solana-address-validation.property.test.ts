/**
 * Property-Based Tests for Solana Address Validation
 * Feature: solana-wallet-scoring, Property 2: Solana address validation correctness
 * Validates: Requirements 1.1, 1.2
 */

import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import bs58 from "bs58";
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  validateSolanaAddressInput,
} from "../lib/validation";

describe("Solana Address Validation Properties", () => {
  /**
   * Property 2: Solana address validation correctness
   * For any string, the Solana address validation should accept only properly formatted base58-encoded Solana addresses
   */
  it("should accept only valid base58-encoded 32-byte addresses", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        // Generate a valid Solana address from 32 bytes
        const validAddress = bs58.encode(bytes);

        // Should be valid
        expect(isValidSolanaAddress(validAddress)).toBe(true);

        // Should normalize without error
        expect(() => normalizeSolanaAddress(validAddress)).not.toThrow();

        // Should validate successfully
        const result = validateSolanaAddressInput(validAddress);
        expect(result.valid).toBe(true);
        expect(result.address).toBe(validAddress);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("should reject addresses with incorrect byte length", () => {
    fc.assert(
      fc.property(
        fc
          .uint8Array({ minLength: 1, maxLength: 64 })
          .filter((arr) => arr.length !== 32),
        (bytes) => {
          const invalidAddress = bs58.encode(bytes);

          // Should be invalid
          expect(isValidSolanaAddress(invalidAddress)).toBe(false);

          // Should throw on normalize
          expect(() => normalizeSolanaAddress(invalidAddress)).toThrow();

          // Should fail validation
          const result = validateSolanaAddressInput(invalidAddress);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should reject non-base58 strings", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 44 }).filter((str) => {
          // Filter to strings that contain invalid base58 characters
          return /[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/.test(
            str
          );
        }),
        (invalidString) => {
          // Should be invalid
          expect(isValidSolanaAddress(invalidString)).toBe(false);

          // Should throw on normalize
          expect(() => normalizeSolanaAddress(invalidString)).toThrow();

          // Should fail validation
          const result = validateSolanaAddressInput(invalidString);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should reject strings that are too short or too long", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 31 }),
          fc.string({ minLength: 45, maxLength: 100 })
        ),
        (invalidLength) => {
          // Should be invalid
          expect(isValidSolanaAddress(invalidLength)).toBe(false);

          // Should fail validation
          const result = validateSolanaAddressInput(invalidLength);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should handle whitespace correctly", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.constantFrom(" ", "\t", "\n", "  "),
        (bytes, whitespace) => {
          const validAddress = bs58.encode(bytes);
          const withWhitespace = whitespace + validAddress + whitespace;

          // Should validate and trim whitespace
          const result = validateSolanaAddressInput(withWhitespace);
          expect(result.valid).toBe(true);
          expect(result.address).toBe(validAddress);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("should preserve case sensitivity", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const address = bs58.encode(bytes);

        // Solana addresses are case-sensitive
        const normalized = normalizeSolanaAddress(address);
        expect(normalized).toBe(address);

        // Should not lowercase
        const result = validateSolanaAddressInput(address);
        expect(result.address).toBe(address);
      }),
      { numRuns: 100 }
    );
  });

  it("should validate real-world Solana addresses", () => {
    // Test with actual Solana wallet addresses
    const realAddresses = [
      "Azw1V43ekNWwiTRMeLfBq6Mz9HHuD21PnSFNQnBLWk2s",
      "BV8D1hE44dPkNDbJcqnBW7EVQ7cvwe9b1qDFZ28P1B5h",
      "11111111111111111111111111111112", // System program
      "So11111111111111111111111111111111111111112", // Wrapped SOL
    ];

    realAddresses.forEach((address) => {
      expect(isValidSolanaAddress(address)).toBe(true);

      const result = validateSolanaAddressInput(address);
      expect(result.valid).toBe(true);
      expect(result.address).toBe(address);
      expect(result.error).toBeUndefined();
    });
  });
});
