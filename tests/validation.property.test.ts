// Feature: wallet-trust-scoring, Property 1: Address validation correctness
// Property-based tests for Ethereum address validation

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import { isValidEthereumAddress, normalizeAddress } from "@/lib/validation";

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

describe("Address Validation Properties", () => {
  describe("Property 1: Address validation correctness", () => {
    it("should accept all valid Ethereum addresses", () => {
      // Generator for valid Ethereum addresses
      const validAddressGen = hexString(40).map((hex) => `0x${hex}`);

      fc.assert(
        fc.property(validAddressGen, (address) => {
          expect(isValidEthereumAddress(address)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject addresses without 0x prefix", () => {
      const noPrefix = hexString(40);

      fc.assert(
        fc.property(noPrefix, (address) => {
          expect(isValidEthereumAddress(address)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject addresses with wrong length", () => {
      const wrongLength = fc.oneof(
        hexString(39).map((hex) => `0x${hex}`),
        hexString(41).map((hex) => `0x${hex}`)
      );

      fc.assert(
        fc.property(wrongLength, (address) => {
          expect(isValidEthereumAddress(address)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject addresses with invalid characters", () => {
      const invalidChars = fc
        .string({ minLength: 40, maxLength: 40 })
        .filter((s) => !/^[0-9a-fA-F]{40}$/.test(s))
        .map((s) => `0x${s}`);

      fc.assert(
        fc.property(invalidChars, (address) => {
          expect(isValidEthereumAddress(address)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject null, undefined, and empty strings", () => {
      expect(isValidEthereumAddress(null as any)).toBe(false);
      expect(isValidEthereumAddress(undefined as any)).toBe(false);
      expect(isValidEthereumAddress("")).toBe(false);
    });

    it("should handle mixed case addresses correctly", () => {
      const mixedCaseGen = hexString(40).map((hex) => `0x${hex}`);

      fc.assert(
        fc.property(mixedCaseGen, (address) => {
          expect(isValidEthereumAddress(address)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Address normalization idempotence", () => {
    it("should be idempotent - normalizing twice equals normalizing once", () => {
      const validAddressGen = hexString(40).map((hex) => `0x${hex}`);

      fc.assert(
        fc.property(validAddressGen, (address) => {
          const normalized1 = normalizeAddress(address);
          const normalized2 = normalizeAddress(normalized1);
          expect(normalized1).toBe(normalized2);
        }),
        { numRuns: 100 }
      );
    });

    it("should always produce lowercase addresses", () => {
      const mixedCaseGen = hexString(40).map((hex) => `0x${hex}`);

      fc.assert(
        fc.property(mixedCaseGen, (address) => {
          const normalized = normalizeAddress(address);
          expect(normalized).toBe(normalized.toLowerCase());
          expect(normalized).toMatch(/^0x[0-9a-f]{40}$/);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve the 0x prefix", () => {
      const validAddressGen = hexString(40).map((hex) => `0x${hex}`);

      fc.assert(
        fc.property(validAddressGen, (address) => {
          const normalized = normalizeAddress(address);
          expect(normalized.startsWith("0x")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should trim whitespace", () => {
      const whitespace = fc.constantFrom(" ", "\t", "\n");
      const addressWithWhitespace = hexString(40).chain((hex) =>
        fc
          .tuple(
            fc.array(whitespace, { maxLength: 5 }).map((arr) => arr.join("")),
            fc.array(whitespace, { maxLength: 5 }).map((arr) => arr.join(""))
          )
          .map(([before, after]) => `${before}0x${hex}${after}`)
      );

      fc.assert(
        fc.property(addressWithWhitespace, (address) => {
          const normalized = normalizeAddress(address);
          expect(normalized).toBe(normalized.trim());
          expect(normalized.startsWith(" ")).toBe(false);
          expect(normalized.endsWith(" ")).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });
});
