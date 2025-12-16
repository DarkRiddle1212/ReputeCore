/**
 * TokenDetectionOrchestrator - Coordinates all detection strategies
 *
 * Manages strategy registration, execution, result merging, and deduplication.
 * Implements pagination up to 4000 transactions and 90 second timeout.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.4, 7.3
 */

import {
  DetectedToken,
  DetectionMethod,
  DetectionOptions,
  DetectionResult,
  EnrichedTokenSummary,
  ScanMetadata,
  METHOD_PRIORITY,
  SCAN_LIMITS,
} from "./types";
import { IDetectionStrategy } from "./strategies/DetectionStrategy";
import { ConfidenceScorer } from "./ConfidenceScorer";
import { DetectionCache } from "./DetectionCache";

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Optional custom cache instance */
  cache?: DetectionCache;
  /** Optional custom confidence scorer */
  scorer?: ConfidenceScorer;
  /** Default detection options */
  defaultOptions?: Partial<DetectionOptions>;
}

/**
 * Orchestrates multiple detection strategies and merges results
 */
export class TokenDetectionOrchestrator {
  private strategies: IDetectionStrategy[] = [];
  private cache: DetectionCache;
  private scorer: ConfidenceScorer;
  private defaultOptions: DetectionOptions;

  constructor(config: OrchestratorConfig = {}) {
    this.cache = config.cache || new DetectionCache();
    this.scorer = config.scorer || new ConfidenceScorer();
    this.defaultOptions = {
      maxTransactions: SCAN_LIMITS.maxTransactions,
      timeoutMs: SCAN_LIMITS.timeoutMs,
      ...config.defaultOptions,
    };
  }

  /**
   * Register a detection strategy (Requirement 7.2)
   * Strategies are sorted by priority (highest first)
   */
  registerStrategy(strategy: IDetectionStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority descending
    this.strategies.sort((a, b) => b.priority - a.priority);
    console.log(
      `[Orchestrator] Registered strategy: ${strategy.name} (priority: ${strategy.priority})`
    );
  }

  /**
   * Detect tokens created by a wallet (Requirement 7.3)
   *
   * Executes all registered strategies and merges results.
   * Implements pagination up to 4000 transactions (Requirement 2.1)
   * and 90 second timeout (Requirement 2.2).
   */
  async detectTokens(
    walletAddress: string,
    options?: Partial<DetectionOptions>,
    forceRefresh: boolean = false
  ): Promise<DetectionResult> {
    const mergedOptions: DetectionOptions = {
      ...this.defaultOptions,
      ...options,
    };

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(walletAddress);
      if (cached) {
        console.log(`[Orchestrator] Returning cached result for ${walletAddress}`);
        return cached.result;
      }
    }

    const startTime = Date.now();
    const allDetectedTokens: DetectedToken[] = [];
    const methodsUsed: DetectionMethod[] = [];
    let totalTransactionsScanned = 0;
    let scanComplete = true;

    // Execute all strategies (Requirement 7.3)
    console.log(
      `[Orchestrator] Starting detection for ${walletAddress} with ${this.strategies.length} strategies`
    );

    const strategyResults = await Promise.allSettled(
      this.strategies.map(async (strategy) => {
        const strategyStartTime = Date.now();

        // Calculate remaining time for this strategy
        const elapsedTime = Date.now() - startTime;
        const remainingTime = mergedOptions.timeoutMs - elapsedTime;

        if (remainingTime <= 0) {
          console.log(`[Orchestrator] Timeout before ${strategy.name} could run`);
          scanComplete = false;
          return { tokens: [], method: strategy.detectionMethod };
        }

        try {
          const strategyOptions: DetectionOptions = {
            ...mergedOptions,
            timeoutMs: Math.min(remainingTime, mergedOptions.timeoutMs),
          };

          const tokens = await strategy.detect(walletAddress, strategyOptions);

          console.log(
            `[Orchestrator] ${strategy.name} found ${tokens.length} tokens in ${Date.now() - strategyStartTime}ms`
          );

          return { tokens, method: strategy.detectionMethod };
        } catch (error) {
          console.error(`[Orchestrator] ${strategy.name} failed:`, error);
          return { tokens: [], method: strategy.detectionMethod };
        }
      })
    );

    // Collect results from all strategies
    for (const result of strategyResults) {
      if (result.status === "fulfilled") {
        allDetectedTokens.push(...result.value.tokens);
        if (result.value.tokens.length > 0) {
          methodsUsed.push(result.value.method);
        }
      }
    }

    // Check if we hit timeout (Requirement 2.2, 2.3)
    const scanDurationMs = Date.now() - startTime;
    if (scanDurationMs >= mergedOptions.timeoutMs) {
      scanComplete = false;
    }

    // Deduplicate and merge results (Requirement 3.4)
    const deduplicatedTokens = this.deduplicateTokens(allDetectedTokens);

    // Enrich tokens with confidence scores
    const enrichedTokens = this.enrichTokens(deduplicatedTokens);

    // Sort by confidence (Requirement 4.5)
    const sortedTokens = this.scorer.sortByConfidence(enrichedTokens);

    // Build scan metadata (Requirement 2.4)
    const scanMetadata: ScanMetadata = {
      transactionsScanned: totalTransactionsScanned,
      totalTransactionsAvailable: totalTransactionsScanned, // Would need additional API call to get exact count
      scanComplete,
      scanDurationMs,
      methodsUsed: [...new Set(methodsUsed)],
    };

    const result: DetectionResult = {
      tokens: sortedTokens,
      scanMetadata,
    };

    // Cache the result
    this.cache.set(walletAddress, result);

    console.log(
      `[Orchestrator] Detection complete: ${sortedTokens.length} tokens found in ${scanDurationMs}ms`
    );

    return result;
  }

  /**
   * Deduplicate tokens detected by multiple methods (Requirement 3.4)
   *
   * Prefers the most reliable detection method:
   * mint_authority_verified > das_api_authority > pump_fun_create > known_program > heuristic
   */
  private deduplicateTokens(tokens: DetectedToken[]): DetectedToken[] {
    const tokenMap = new Map<string, DetectedToken>();

    for (const token of tokens) {
      const existing = tokenMap.get(token.token);

      if (!existing) {
        tokenMap.set(token.token, token);
      } else {
        // Keep the token with higher priority detection method
        const existingPriority = METHOD_PRIORITY[existing.detectionMethod] || 0;
        const newPriority = METHOD_PRIORITY[token.detectionMethod] || 0;

        if (newPriority > existingPriority) {
          tokenMap.set(token.token, token);
        } else if (newPriority === existingPriority) {
          // Same priority - prefer verified mint authority
          if (token.mintAuthorityVerified && !existing.mintAuthorityVerified) {
            tokenMap.set(token.token, token);
          }
        }
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Enrich detected tokens with confidence scores and verification status
   */
  private enrichTokens(tokens: DetectedToken[]): EnrichedTokenSummary[] {
    return tokens.map((token) => ({
      token: token.token,
      name: token.name || null,
      symbol: token.symbol || null,
      launchAt: token.launchAt || null,
      confidenceScore: this.scorer.calculateScore(token),
      detectionMethod: token.detectionMethod,
      verificationStatus: token.mintAuthorityVerified ? "verified" : "unverified",
    }));
  }

  /**
   * Get registered strategies
   */
  getStrategies(): IDetectionStrategy[] {
    return [...this.strategies];
  }

  /**
   * Clear all registered strategies
   */
  clearStrategies(): void {
    this.strategies = [];
  }

  /**
   * Get cache instance
   */
  getCache(): DetectionCache {
    return this.cache;
  }

  /**
   * Invalidate cache for a wallet
   */
  invalidateCache(walletAddress: string): boolean {
    return this.cache.invalidate(walletAddress);
  }
}
