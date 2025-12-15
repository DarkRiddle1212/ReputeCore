// Unit tests for token validation module

import {
  validateTokenAddress,
  validateTokenList,
  parseTokenInput,
} from "@/lib/validation/tokenValidation";

describe("Token Validation", () => {
  describe("validateTokenAddress", () => {
    it("should validate a correct Ethereum address", () => {
      const result = validateTokenAddress(
        "0x1234567890123456789012345678901234567890"
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedAddress).toBe(
        "0x1234567890123456789012345678901234567890"
      );
      expect(result.error).toBeUndefined();
    });

    it("should normalize addresses to lowercase", () => {
      const result = validateTokenAddress(
        "0xABCDEF1234567890123456789012345678901234"
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedAddress).toBe(
        "0xabcdef1234567890123456789012345678901234"
      );
    });

    it("should reject addresses without 0x prefix", () => {
      const result = validateTokenAddress(
        "1234567890123456789012345678901234567890"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid token address format");
    });

    it("should reject addresses with wrong length", () => {
      const result = validateTokenAddress("0x12345");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid token address format");
    });

    it("should reject addresses with non-hex characters", () => {
      const result = validateTokenAddress(
        "0xGHIJKL7890123456789012345678901234567890"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid token address format");
    });

    it("should reject empty strings", () => {
      const result = validateTokenAddress("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty string");
    });

    it("should reject null or undefined", () => {
      const result1 = validateTokenAddress(null as any);
      expect(result1.valid).toBe(false);

      const result2 = validateTokenAddress(undefined as any);
      expect(result2.valid).toBe(false);
    });

    it("should trim whitespace", () => {
      const result = validateTokenAddress(
        "  0x1234567890123456789012345678901234567890  "
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedAddress).toBe(
        "0x1234567890123456789012345678901234567890"
      );
    });
  });

  describe("validateTokenList", () => {
    it("should validate a list of correct addresses", () => {
      const addresses = [
        "0x1234567890123456789012345678901234567890",
        "0xABCDEF1234567890123456789012345678901234",
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toBe(
        "0x1234567890123456789012345678901234567890"
      );
      expect(result.tokens[1]).toBe(
        "0xabcdef1234567890123456789012345678901234"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should deduplicate addresses (case-insensitive)", () => {
      const addresses = [
        "0x1234567890123456789012345678901234567890",
        "0x1234567890123456789012345678901234567890",
        "0x1234567890123456789012345678901234567890",
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toBe(
        "0x1234567890123456789012345678901234567890"
      );
    });

    it("should deduplicate mixed case addresses", () => {
      const addresses = [
        "0xabcdef1234567890123456789012345678901234",
        "0xABCDEF1234567890123456789012345678901234",
        "0xAbCdEf1234567890123456789012345678901234",
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toBe(
        "0xabcdef1234567890123456789012345678901234"
      );
    });

    it("should reject lists with more than 10 tokens", () => {
      const addresses = Array(11).fill(
        "0x1234567890123456789012345678901234567890"
      );
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Maximum 10 tokens allowed");
      expect(result.errors[0]).toContain("11");
    });

    it("should accept exactly 10 tokens", () => {
      const addresses = Array(10)
        .fill(0)
        .map((_, i) => `0x${i.toString().padStart(40, "0")}`);
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(10);
    });

    it("should handle empty array", () => {
      const result = validateTokenList([]);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid addresses and provide specific errors", () => {
      const addresses = [
        "0x1234567890123456789012345678901234567890", // valid
        "invalid", // invalid
        "0xABCDEF1234567890123456789012345678901234", // valid
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Token 2");
      expect(result.errors[0]).toContain("invalid");
    });

    it("should reject non-array input", () => {
      const result = validateTokenList("not an array" as any);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be provided as an array");
    });

    it("should handle all duplicate tokens", () => {
      const addresses = [
        "0x1234567890123456789012345678901234567890",
        "0x1234567890123456789012345678901234567890",
        "0x1234567890123456789012345678901234567890",
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(1);
    });

    it("should handle mixed valid and duplicate tokens", () => {
      const addresses = [
        "0x1234567890123456789012345678901234567890",
        "0xABCDEF1234567890123456789012345678901234",
        "0x1234567890123456789012345678901234567890", // duplicate
        "0xFEDCBA0987654321098765432109876543210987",
      ];
      const result = validateTokenList(addresses);
      expect(result.valid).toBe(true);
      expect(result.tokens).toHaveLength(3);
    });
  });
});

describe("parseTokenInput", () => {
  it("should parse comma-separated addresses", () => {
    const input =
      "0x1234567890123456789012345678901234567890,0xABCDEF1234567890123456789012345678901234";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("0x1234567890123456789012345678901234567890");
    expect(result[1]).toBe("0xABCDEF1234567890123456789012345678901234");
  });

  it("should parse newline-separated addresses", () => {
    const input =
      "0x1234567890123456789012345678901234567890\n0xABCDEF1234567890123456789012345678901234";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("0x1234567890123456789012345678901234567890");
    expect(result[1]).toBe("0xABCDEF1234567890123456789012345678901234");
  });

  it("should parse mixed comma and newline separated addresses", () => {
    const input =
      "0x1234567890123456789012345678901234567890,0xABCDEF1234567890123456789012345678901234\n0xFEDCBA0987654321098765432109876543210987";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(3);
  });

  it("should trim whitespace from each address", () => {
    const input =
      "  0x1234567890123456789012345678901234567890  ,  0xABCDEF1234567890123456789012345678901234  ";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("0x1234567890123456789012345678901234567890");
    expect(result[1]).toBe("0xABCDEF1234567890123456789012345678901234");
  });

  it("should filter out empty strings", () => {
    const input =
      "0x1234567890123456789012345678901234567890,,,0xABCDEF1234567890123456789012345678901234";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(2);
  });

  it("should handle empty input", () => {
    const result = parseTokenInput("");
    expect(result).toHaveLength(0);
  });

  it("should handle null or undefined", () => {
    const result1 = parseTokenInput(null as any);
    expect(result1).toHaveLength(0);

    const result2 = parseTokenInput(undefined as any);
    expect(result2).toHaveLength(0);
  });

  it("should handle input with only whitespace", () => {
    const result = parseTokenInput("   \n  \n  ");
    expect(result).toHaveLength(0);
  });

  it("should handle Windows-style line endings (CRLF)", () => {
    const input =
      "0x1234567890123456789012345678901234567890\r\n0xABCDEF1234567890123456789012345678901234";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(2);
  });

  it("should handle single address", () => {
    const input = "0x1234567890123456789012345678901234567890";
    const result = parseTokenInput(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0x1234567890123456789012345678901234567890");
  });
});
