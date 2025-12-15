// Token address validation utilities for manual token analysis

import { isValidEthereumAddress } from "../validation";

/**
 * Result of validating a single token address
 */
export interface TokenValidationResult {
  valid: boolean;
  normalizedAddress?: string;
  error?: string;
}

/**
 * Result of validating a list of token addresses
 */
export interface TokenListValidationResult {
  valid: boolean;
  tokens: string[]; // Deduplicated, normalized addresses
  errors: string[]; // Validation errors
}

/**
 * Validates a single token address
 * Checks if the address is a valid Ethereum address format (0x + 40 hex chars)
 * Returns validation result with normalized address or error
 *
 * Implements: Requirement 1.2 - Token address format validation
 */
export function validateTokenAddress(address: string): TokenValidationResult {
  // Handle null, undefined, or non-string inputs
  if (!address || typeof address !== "string") {
    return {
      valid: false,
      error: "Token address must be a non-empty string",
    };
  }

  // Trim whitespace
  const trimmed = address.trim();

  // Check if empty after trimming
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Token address cannot be empty",
    };
  }

  // Validate Ethereum address format
  if (!isValidEthereumAddress(trimmed)) {
    return {
      valid: false,
      error: `Invalid token address format: ${trimmed}. Must be a valid Ethereum address (0x followed by 40 hexadecimal characters)`,
    };
  }

  // Normalize to lowercase for consistent processing
  const normalized = trimmed.toLowerCase();

  return {
    valid: true,
    normalizedAddress: normalized,
  };
}

/**
 * Validates a list of token addresses
 * - Validates each address format
 * - Deduplicates addresses (case-insensitive)
 * - Enforces maximum of 10 tokens
 * - Returns validation result with normalized addresses and errors
 *
 * Implements: Requirements 1.2, 1.3, 6.1, 6.2, 6.3
 */
export function validateTokenList(
  addresses: string[]
): TokenListValidationResult {
  const errors: string[] = [];
  const normalizedTokens: string[] = [];
  const seenTokens = new Set<string>();

  // Check if input is an array
  if (!Array.isArray(addresses)) {
    return {
      valid: false,
      tokens: [],
      errors: ["Token addresses must be provided as an array"],
    };
  }

  // Handle empty array - treat as no manual tokens provided
  if (addresses.length === 0) {
    return {
      valid: true,
      tokens: [],
      errors: [],
    };
  }

  // Enforce maximum of 10 tokens
  if (addresses.length > 10) {
    return {
      valid: false,
      tokens: [],
      errors: [`Maximum 10 tokens allowed, you provided ${addresses.length}`],
    };
  }

  // Validate each address
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const result = validateTokenAddress(address);

    if (!result.valid) {
      errors.push(`Token ${i + 1}: ${result.error}`);
      continue;
    }

    // Deduplicate (case-insensitive)
    const normalized = result.normalizedAddress!;
    if (seenTokens.has(normalized)) {
      // Skip duplicates silently (as per design: "Automatically deduplicate, no error")
      continue;
    }

    seenTokens.add(normalized);
    normalizedTokens.push(normalized);
  }

  // If there were validation errors, return invalid result
  if (errors.length > 0) {
    return {
      valid: false,
      tokens: [],
      errors,
    };
  }

  // All tokens validated successfully
  return {
    valid: true,
    tokens: normalizedTokens,
    errors: [],
  };
}

/**
 * Parses token input string into an array of token addresses
 * Accepts comma-separated or newline-separated addresses
 * Trims whitespace and filters out empty strings
 *
 * Implements: Requirement 2.2 - Parse multiple token addresses
 *
 * @param input - String containing token addresses separated by commas or newlines
 * @returns Array of token address strings
 */
export function parseTokenInput(input: string): string[] {
  // Handle null, undefined, or non-string inputs
  if (!input || typeof input !== "string") {
    return [];
  }

  // Split by both commas and newlines
  // This regex splits on: comma, newline, or carriage return
  const addresses = input
    .split(/[,\n\r]+/)
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);

  return addresses;
}
