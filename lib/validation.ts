// Input validation utilities for wallet trust scoring

// Base58 alphabet for Solana address validation
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode a base58 string to bytes
 * This is a pure implementation that doesn't rely on external modules
 */
function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [0];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = BASE58_ALPHABET.indexOf(char);

    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }

    for (let j = 0; j < bytes.length; j++) {
      bytes[j] *= 58;
    }

    bytes[0] += value;

    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = Math.floor(bytes[j] / 256);
      bytes[j] %= 256;
    }

    while (carry > 0) {
      bytes.push(carry % 256);
      carry = Math.floor(carry / 256);
    }
  }

  // Handle leading zeros
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

export type BlockchainType = "ethereum" | "solana";

export interface ChainDetectionResult {
  blockchain: BlockchainType;
  valid: boolean;
  error?: string;
}

/**
 * Validates if a string is a properly formatted Ethereum address
 * Must be 42 characters, hexadecimal, starting with "0x"
 */
export function isValidEthereumAddress(address: string): boolean {
  if (typeof address !== "string") {
    return false;
  }

  // Check format: 0x followed by 40 hexadecimal characters
  const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethereumAddressRegex.test(address);
}

/**
 * Validates if a string is a properly formatted Solana address
 * Must be base58-encoded, typically 32-44 characters
 */
export function isValidSolanaAddress(address: string): boolean {
  if (typeof address !== "string") {
    return false;
  }

  // Solana addresses are typically 32-44 characters
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  // Check if all characters are valid base58
  for (const char of address) {
    if (!BASE58_ALPHABET.includes(char)) {
      return false;
    }
  }

  try {
    // Attempt to decode as base58
    const decoded = base58Decode(address);
    // Solana public keys are 32 bytes when decoded
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Normalizes a Solana address (trim whitespace)
 * Solana addresses are case-sensitive, so we don't lowercase
 */
export function normalizeSolanaAddress(address: string): string {
  if (!isValidSolanaAddress(address)) {
    throw new Error(`Invalid Solana address format: ${address}`);
  }
  return address.trim();
}

/**
 * Validates and sanitizes a Solana address input
 */
export function validateSolanaAddressInput(input: string): {
  valid: boolean;
  address?: string;
  error?: string;
} {
  const sanitized = sanitizeInput(input);

  if (!isValidSolanaAddress(sanitized)) {
    return {
      valid: false,
      error:
        "Invalid Solana address format. Must be a base58-encoded string of 32-44 characters.",
    };
  }

  return {
    valid: true,
    address: sanitized,
  };
}

/**
 * Automatically detects whether an address is Ethereum or Solana
 * Returns the blockchain type and validation result
 */
export function detectBlockchain(address: string): ChainDetectionResult {
  const sanitized = sanitizeInput(address);

  // Check Ethereum format first (starts with 0x)
  if (sanitized.startsWith("0x")) {
    if (isValidEthereumAddress(sanitized)) {
      return {
        blockchain: "ethereum",
        valid: true,
      };
    }
    return {
      blockchain: "ethereum",
      valid: false,
      error:
        "Invalid Ethereum address format. Must be 42 characters starting with 0x followed by 40 hexadecimal characters.",
    };
  }

  // Check Solana format
  if (isValidSolanaAddress(sanitized)) {
    return {
      blockchain: "solana",
      valid: true,
    };
  }

  // If it doesn't match either format
  return {
    blockchain: "ethereum", // Default assumption
    valid: false,
    error:
      "Invalid address format. Must be either an Ethereum address (0x...) or a Solana address (base58-encoded).",
  };
}

/**
 * Normalizes an Ethereum address to lowercase for consistent processing
 * Returns the normalized address or throws if invalid
 */
export function normalizeAddress(address: string): string {
  if (!isValidEthereumAddress(address)) {
    throw new Error(`Invalid Ethereum address format: ${address}`);
  }
  return address.toLowerCase();
}

/**
 * Validates and normalizes an Ethereum address
 * Returns normalized address or null if invalid
 */
export function validateAndNormalizeAddress(address: string): string | null {
  if (!isValidEthereumAddress(address)) {
    return null;
  }
  return address.toLowerCase();
}

/**
 * Sanitizes user input by trimming whitespace
 */
export function sanitizeInput(input: string): string {
  return input.trim();
}

/**
 * Validates and sanitizes an address input (supports both Ethereum and Solana)
 * Combines sanitization, chain detection, and validation in one step
 */
export function processAddressInput(input: string): {
  valid: boolean;
  address?: string;
  blockchain?: BlockchainType;
  error?: string;
} {
  // Sanitize input
  const sanitized = sanitizeInput(input);

  // Detect blockchain type
  const detection = detectBlockchain(sanitized);

  if (!detection.valid) {
    return {
      valid: false,
      error: detection.error,
    };
  }

  // Normalize based on blockchain type
  const normalized =
    detection.blockchain === "ethereum" ? sanitized.toLowerCase() : sanitized; // Solana addresses are case-sensitive

  return {
    valid: true,
    address: normalized,
    blockchain: detection.blockchain,
  };
}

/**
 * Validates multiple addresses at once
 */
export function validateAddresses(addresses: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const address of addresses) {
    if (isValidEthereumAddress(address)) {
      valid.push(address.toLowerCase());
    } else {
      invalid.push(address);
    }
  }

  return { valid, invalid };
}
