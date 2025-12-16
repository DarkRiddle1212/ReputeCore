/**
 * Solana Token Detection Types
 *
 * Core type definitions for the enhanced Solana wallet token detection system.
 * These types support improved accuracy through multiple detection strategies,
 * confidence scoring, and verification.
 *
 * Requirements: 3.3, 4.1, 7.4
 */

import { TokenSummary } from "../../types";

// ============================================================================
// Detection Method Types
// ============================================================================

/**
 * Detection methods ordered by reliability (highest to lowest):
 * - mint_authority_verified: Direct on-chain verification of mint authority
 * - das_api_authority: Helius DAS API authority lookup
 * - pump_fun_create: Pump.fun token creation detection
 * - known_program: Detection via known token creation programs
 * - heuristic: Pattern-based detection with lower confidence
 */
export type DetectionMethod =
  | "mint_authority_verified"
  | "das_api_authority"
  | "pump_fun_create"
  | "known_program"
  | "heuristic";

/**
 * Verification status for detected tokens
 */
export type VerificationStatus = "verified" | "unverified" | "failed";

// ============================================================================
// Detection Options and Configuration
// ============================================================================

/**
 * Options for token detection operations
 */
export interface DetectionOptions {
  /** Maximum number of transactions to scan (default: 4000) */
  maxTransactions: number;
  /** Maximum time for scan operation in milliseconds (default: 90000) */
  timeoutMs: number;
  /** Signature to start scanning before (for pagination) */
  beforeSignature?: string;
}

/**
 * Default scan limits configuration
 */
export const SCAN_LIMITS = {
  maxTransactions: 4000,
  timeoutMs: 90000, // 90 seconds
  batchSize: 100,
  delayBetweenBatches: 100, // ms
} as const;

// ============================================================================
// Detected Token Types
// ============================================================================

/**
 * Raw detected token before enrichment
 */
export interface DetectedToken {
  /** Token mint address */
  token: string;
  /** Token name from metadata */
  name?: string;
  /** Token symbol from metadata */
  symbol?: string;
  /** Token creation timestamp (ISO string) */
  launchAt?: string;
  /** Method used to detect this token */
  detectionMethod: DetectionMethod;
  /** Whether mint authority was verified on-chain */
  mintAuthorityVerified: boolean;
  /** Raw confidence score before normalization */
  rawConfidence: number;
}

// ============================================================================
// Scan Metadata Types
// ============================================================================

/**
 * Metadata about the scan operation
 */
export interface ScanMetadata {
  /** Number of transactions actually scanned */
  transactionsScanned: number;
  /** Total transactions available for the wallet */
  totalTransactionsAvailable: number;
  /** Whether the scan completed fully or was limited */
  scanComplete: boolean;
  /** Duration of the scan in milliseconds */
  scanDurationMs: number;
  /** Detection methods that were used during the scan */
  methodsUsed: DetectionMethod[];
}

/**
 * Internal scan state tracking
 */
export interface ScanState {
  walletAddress: string;
  startTime: number;
  transactionsScanned: number;
  lastSignature?: string;
  tokensFound: Map<string, DetectedToken>;
  errors: ScanError[];
}

/**
 * Error encountered during scanning
 */
export interface ScanError {
  method: DetectionMethod;
  error: string;
  timestamp: number;
}

// ============================================================================
// Detection Result Types
// ============================================================================

/**
 * Complete result from token detection
 */
export interface DetectionResult {
  /** Enriched tokens with confidence scores */
  tokens: EnrichedTokenSummary[];
  /** Metadata about the scan operation */
  scanMetadata: ScanMetadata;
}

/**
 * Extended TokenSummary with detection metadata
 * Includes confidence scoring and verification status
 */
export interface EnrichedTokenSummary extends TokenSummary {
  /** Confidence score from 0-100 */
  confidenceScore: number;
  /** Method used to detect this token */
  detectionMethod: DetectionMethod;
  /** Verification status of the detection */
  verificationStatus: VerificationStatus;
  /** Reason for exclusion if verification failed */
  exclusionReason?: string;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Result from mint authority verification
 */
export interface VerificationResult {
  /** Whether the wallet is the token creator */
  isCreator: boolean;
  /** Current or original mint authority address */
  mintAuthority: string | null;
  /** Method used for verification */
  verificationMethod: "on_chain" | "transaction_history";
  /** Confidence in the verification result */
  confidence: number;
  /** Reason for the verification result */
  reason?: string;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cached detection result with expiration
 */
export interface CachedResult {
  result: DetectionResult;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs: number;
  /** Maximum number of cache entries (default: 100) */
  maxEntries: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 100,
} as const;

/**
 * Cache statistics for monitoring
 */
export interface DetectionCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

// ============================================================================
// Confidence Scoring Types
// ============================================================================

/**
 * Confidence score mappings by detection method
 */
export const CONFIDENCE_SCORES: Record<string, number> = {
  mint_authority_verified: 100,
  das_api_authority: 95,
  pump_fun_create: 90,
  known_program: 85,
  heuristic_high: 80,
  heuristic_medium: 70,
  heuristic_low: 60,
} as const;

/**
 * Detection method priority for deduplication (higher = preferred)
 */
export const METHOD_PRIORITY: Record<DetectionMethod, number> = {
  mint_authority_verified: 5,
  das_api_authority: 4,
  pump_fun_create: 3,
  known_program: 2,
  heuristic: 1,
} as const;

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * Interface for pluggable detection strategies
 */
export interface DetectionStrategy {
  /** Unique name for this strategy */
  name: string;
  /** Execution priority (higher = runs first) */
  priority: number;
  /** Base confidence score for tokens detected by this strategy */
  confidenceBase: number;

  /**
   * Detect tokens created by the given wallet
   * @param walletAddress - Solana wallet address to analyze
   * @param options - Detection options
   * @returns Array of detected tokens
   */
  detect(
    walletAddress: string,
    options: DetectionOptions
  ): Promise<DetectedToken[]>;
}
