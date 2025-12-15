// Property-based tests for address normalization
// **Feature: wallet-trust-scoring, Property 2: Address normalization idempotence**
// **Validates: Requirements 1.3**

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { normalizeAddress, isValidEthereumAddress } from "../lib/validation";

describe("Address Normalization Properties", () => {
  // Generator for valid Ethereum addresses
  const validEthereumAddress = () =>
    fc.string({ minLength: 40, maxLength: 40 }).map((str) => {
      // Convert to hex characters
      const hex = str
        .split("")
        .map((c) => {
          const code = c.charCodeAt(0) % 16;
          return code.toString(16);
        })
        .join("");
      return "0x" + hex;
    });

  it("Property 2: Address normalization idempotence - normalizing twice produces same result", () => {
    fc.assert(
      fc.property(validEthereumAddress(), (address) => {
        // Normalize once
        const normalized1 = normalizeAddress(address);

        // Normalize again
        const normalized2 = normalizeAddress(normalized1);

        // Should be identical (idempotent)
        expect(normalized2).toBe(normalized1);

        // Should also be lowercase
        expect(normalized2).toBe(normalized2.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  it("Property: Normalized addresses are always lowercase", () => {
    fc.assert(
      fc.property(validEthereumAddress(), (address) => {
        const normalized = normalizeAddress(address);

        // Should equal its lowercase version
        expect(normalized).toBe(normalized.toLowerCase());

        // Should start with 0x
        expect(normalized.startsWith("0x")).toBe(true);

        // Should be 42 characters
        expect(normalized.length).toBe(42);
      }),
      { numRuns: 100 }
    );
  });

  it("Property: Normalization preserves address validity", () => {
    fc.assert(
      fc.property(validEthereumAddress(), (address) => {
        const normalized = normalizeAddress(address);

        // Normalized address should still be valid
        expect(isValidEthereumAddress(normalized)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("Property: Normalization preserves address structure", () => {
    fc.assert(
      fc.property(validEthereumAddress(), (address) => {
        const normalized = normalizeAddress(address);

        // Should have same prefix
        expect(normalized.substring(0, 2)).toBe("0x");

        // Should have same length
        expect(normalized.length).toBe(address.length);

        // Should have same characters (case-insensitive)
        expect(normalized.toLowerCase()).toBe(address.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  it("Property: Multiple normalizations are equivalent to single normalization", () => {
    fc.assert(
      fc.property(validEthereumAddress(), (address) => {
        const once = normalizeAddress(address);
        const twice = normalizeAddress(normalizeAddress(address));
        const thrice = normalizeAddress(
          normalizeAddress(normalizeAddress(address))
        );

        // All should be equal
        expect(twice).toBe(once);
        expect(thrice).toBe(once);
      }),
      { numRuns: 100 }
    );
  });
});
