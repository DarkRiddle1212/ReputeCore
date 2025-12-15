// Tests for input validation utilities

import { describe, it, expect } from "@jest/globals";
import {
  isValidEthereumAddress,
  normalizeAddress,
  validateAndNormalizeAddress,
  sanitizeInput,
  processAddressInput,
  validateAddresses,
} from "../lib/validation";

describe("Input Validation", () => {
  describe("isValidEthereumAddress", () => {
    it("should accept valid Ethereum addresses", () => {
      expect(
        isValidEthereumAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb")
      ).toBe(false); // 41 chars
      expect(
        isValidEthereumAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")
      ).toBe(true);
      expect(
        isValidEthereumAddress("0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe")
      ).toBe(true);
      expect(
        isValidEthereumAddress("0x0000000000000000000000000000000000000000")
      ).toBe(true);
      expect(
        isValidEthereumAddress("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
      ).toBe(true);
    });

    it("should reject addresses without 0x prefix", () => {
      expect(
        isValidEthereumAddress("742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")
      ).toBe(false);
    });

    it("should reject addresses with wrong length", () => {
      expect(isValidEthereumAddress("0x742d35Cc")).toBe(false);
      expect(
        isValidEthereumAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb00")
      ).toBe(false);
    });

    it("should reject addresses with non-hex characters", () => {
      expect(
        isValidEthereumAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbG")
      ).toBe(false);
      expect(
        isValidEthereumAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bE!0")
      ).toBe(false);
    });

    it("should reject non-string inputs", () => {
      expect(isValidEthereumAddress(null as any)).toBe(false);
      expect(isValidEthereumAddress(undefined as any)).toBe(false);
      expect(isValidEthereumAddress(123 as any)).toBe(false);
      expect(isValidEthereumAddress({} as any)).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isValidEthereumAddress("")).toBe(false);
    });
  });

  describe("normalizeAddress", () => {
    it("should convert valid addresses to lowercase", () => {
      expect(
        normalizeAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")
      ).toBe("0x742d35cc6634c0532925a3b844bc9e7595f0beb0");
      expect(
        normalizeAddress("0xDE0B295669A9FD93D5F28D9EC85E40F4CB697BAE")
      ).toBe("0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae");
    });

    it("should be idempotent for already lowercase addresses", () => {
      const address = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";
      expect(normalizeAddress(address)).toBe(address);
      expect(normalizeAddress(normalizeAddress(address))).toBe(address);
    });

    it("should throw error for invalid addresses", () => {
      expect(() => normalizeAddress("invalid")).toThrow();
      expect(() => normalizeAddress("0x123")).toThrow();
    });
  });

  describe("validateAndNormalizeAddress", () => {
    it("should return normalized address for valid input", () => {
      expect(
        validateAndNormalizeAddress(
          "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
        )
      ).toBe("0x742d35cc6634c0532925a3b844bc9e7595f0beb0");
    });

    it("should return null for invalid input", () => {
      expect(validateAndNormalizeAddress("invalid")).toBeNull();
      expect(validateAndNormalizeAddress("0x123")).toBeNull();
    });
  });

  describe("sanitizeInput", () => {
    it("should trim whitespace", () => {
      expect(sanitizeInput("  hello  ")).toBe("hello");
      expect(sanitizeInput("\n\ttest\n\t")).toBe("test");
    });

    it("should handle strings without whitespace", () => {
      expect(sanitizeInput("hello")).toBe("hello");
    });

    it("should handle empty strings", () => {
      expect(sanitizeInput("")).toBe("");
      expect(sanitizeInput("   ")).toBe("");
    });
  });

  describe("processAddressInput", () => {
    it("should process valid address with whitespace", () => {
      const result = processAddressInput(
        "  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0  "
      );
      expect(result.valid).toBe(true);
      expect(result.address).toBe("0x742d35cc6634c0532925a3b844bc9e7595f0beb0");
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid address with error message", () => {
      const result = processAddressInput("invalid");
      expect(result.valid).toBe(false);
      expect(result.address).toBeUndefined();
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Invalid Ethereum address");
    });

    it("should handle mixed case addresses", () => {
      const result = processAddressInput(
        "0xDE0B295669A9FD93D5F28D9EC85E40F4CB697BAE"
      );
      expect(result.valid).toBe(true);
      expect(result.address).toBe("0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae");
    });
  });

  describe("validateAddresses", () => {
    it("should separate valid and invalid addresses", () => {
      const addresses = [
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "invalid",
        "0xDE0B295669A9FD93D5F28D9EC85E40F4CB697BAE",
        "0x123",
      ];

      const result = validateAddresses(addresses);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(2);
      expect(result.valid).toContain(
        "0x742d35cc6634c0532925a3b844bc9e7595f0beb0"
      );
      expect(result.valid).toContain(
        "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae"
      );
    });

    it("should handle all valid addresses", () => {
      const addresses = [
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "0xDE0B295669A9FD93D5F28D9EC85E40F4CB697BAE",
      ];

      const result = validateAddresses(addresses);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });

    it("should handle all invalid addresses", () => {
      const addresses = ["invalid", "0x123", "not-an-address"];

      const result = validateAddresses(addresses);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(3);
    });

    it("should handle empty array", () => {
      const result = validateAddresses([]);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle addresses with all zeros", () => {
      expect(
        isValidEthereumAddress("0x0000000000000000000000000000000000000000")
      ).toBe(true);
    });

    it("should handle addresses with all Fs", () => {
      expect(
        isValidEthereumAddress("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
      ).toBe(true);
      expect(
        isValidEthereumAddress("0xffffffffffffffffffffffffffffffffffffffff")
      ).toBe(true);
    });

    it("should handle checksum addresses", () => {
      // EIP-55 checksum address
      expect(
        isValidEthereumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")
      ).toBe(true);
    });
  });
});
