/**
 * DetectionStrategy - Base interface and abstract class for detection strategies
 *
 * Provides a pluggable architecture for different token detection methods.
 *
 * Requirements: 7.1, 7.2
 */

import { DetectedToken, DetectionOptions, DetectionMethod, SCAN_LIMITS } from "../types";

/**
 * Interface for pluggable detection strategies
 * Each strategy implements a specific method of detecting tokens created by a wallet
 */
export interface IDetectionStrategy {
  /** Unique name for this strategy */
  readonly name: string;
  /** Execution priority (higher = runs first) */
  readonly priority: number;
  /** Base confidence score for tokens detected by this strategy */
  readonly confidenceBase: number;
  /** Detection method type */
  readonly detectionMethod: DetectionMethod;

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

/**
 * Configuration for strategy initialization
 */
export interface StrategyConfig {
  /** Helius API key */
  apiKey: string;
  /** Optional RPC URL override */
  rpcUrl?: string;
  /** Optional base URL for REST APIs */
  baseUrl?: string;
}

/**
 * Abstract base class for detection strategies
 * Provides common functionality and enforces the strategy interface
 */
export abstract class BaseDetectionStrategy implements IDetectionStrategy {
  abstract readonly name: string;
  abstract readonly priority: number;
  abstract readonly confidenceBase: number;
  abstract readonly detectionMethod: DetectionMethod;

  protected apiKey: string;
  protected rpcUrl: string;
  protected baseUrl: string;

  constructor(config: StrategyConfig) {
    this.apiKey = config.apiKey;
    this.rpcUrl = config.rpcUrl || `https://rpc.helius.xyz/?api-key=${config.apiKey}`;
    this.baseUrl = config.baseUrl || "https://api.helius.xyz/v0";
  }

  /**
   * Abstract method to be implemented by each strategy
   */
  abstract detect(
    walletAddress: string,
    options: DetectionOptions
  ): Promise<DetectedToken[]>;

  /**
   * Get default detection options
   */
  protected getDefaultOptions(): DetectionOptions {
    return {
      maxTransactions: SCAN_LIMITS.maxTransactions,
      timeoutMs: SCAN_LIMITS.timeoutMs,
    };
  }

  /**
   * Merge provided options with defaults
   */
  protected mergeOptions(options?: Partial<DetectionOptions>): DetectionOptions {
    return {
      ...this.getDefaultOptions(),
      ...options,
    };
  }

  private lastRpcCallTime = 0;
  private readonly RPC_DELAY_MS = 200; // 200ms between calls = 5 calls/sec

  /**
   * Make an RPC call with timeout support and rate limiting
   */
  protected async rpcCall<T>(
    method: string,
    params: any[],
    timeoutMs: number = 10000
  ): Promise<T> {
    // Rate limiting - wait if needed
    const now = Date.now();
    const timeSinceLastCall = now - this.lastRpcCallTime;
    if (timeSinceLastCall < this.RPC_DELAY_MS) {
      await new Promise((resolve) => 
        setTimeout(resolve, this.RPC_DELAY_MS - timeSinceLastCall)
      );
    }
    this.lastRpcCallTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      return data.result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`RPC call timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Get transaction signatures for an address with pagination
   */
  protected async getSignatures(
    address: string,
    limit: number = 100,
    beforeSignature?: string
  ): Promise<any[]> {
    const params: any[] = beforeSignature
      ? [address, { limit, before: beforeSignature }]
      : [address, { limit }];

    return this.rpcCall<any[]>("getSignaturesForAddress", params);
  }

  /**
   * Get parsed transaction by signature
   */
  protected async getTransaction(signature: string): Promise<any> {
    return this.rpcCall<any>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
  }

  /**
   * Create a DetectedToken object
   */
  protected createDetectedToken(
    token: string,
    options: {
      name?: string;
      symbol?: string;
      launchAt?: string;
      mintAuthorityVerified?: boolean;
      rawConfidence?: number;
    } = {}
  ): DetectedToken {
    return {
      token,
      name: options.name,
      symbol: options.symbol,
      launchAt: options.launchAt,
      detectionMethod: this.detectionMethod,
      mintAuthorityVerified: options.mintAuthorityVerified ?? false,
      rawConfidence: options.rawConfidence ?? this.confidenceBase,
    };
  }
}
