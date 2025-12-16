/**
 * DASAPIDetector - Detects tokens using Helius DAS (Digital Asset Standard) API
 *
 * Uses the DAS API to find tokens where the wallet is listed as an authority.
 * Provides high confidence (95) detection through Helius's indexed data.
 *
 * Requirements: 3.1, 4.3
 */

import { DetectedToken, DetectionOptions } from "../types";
import { BaseDetectionStrategy, StrategyConfig } from "./DetectionStrategy";

/**
 * Detects tokens using Helius DAS API authority lookups
 */
export class DASAPIDetector extends BaseDetectionStrategy {
  readonly name = "DASAPIDetector";
  readonly priority = 95; // High priority - fast and reliable
  readonly confidenceBase = 95;
  readonly detectionMethod = "das_api_authority" as const;

  constructor(config: StrategyConfig) {
    super(config);
  }

  /**
   * Detect tokens where wallet is an authority via DAS API (Requirement 3.1, 4.3)
   */
  async detect(
    walletAddress: string,
    options: DetectionOptions
  ): Promise<DetectedToken[]> {
    const mergedOptions = this.mergeOptions(options);
    const tokens: DetectedToken[] = [];
    const seenMints = new Set<string>();

    try {
      // Method 1: Search assets by owner and check authorities
      const ownerTokens = await this.searchByOwner(walletAddress, mergedOptions.timeoutMs);
      for (const token of ownerTokens) {
        if (!seenMints.has(token.token)) {
          seenMints.add(token.token);
          tokens.push(token);
        }
      }

      // Method 2: Get assets by authority directly
      const authorityTokens = await this.getByAuthority(walletAddress, mergedOptions.timeoutMs);
      for (const token of authorityTokens) {
        if (!seenMints.has(token.token)) {
          seenMints.add(token.token);
          tokens.push(token);
        }
      }
    } catch (error) {
      console.error(`[DASAPIDetector] Error during detection:`, error);
    }

    console.log(`[DASAPIDetector] Found ${tokens.length} tokens via DAS API`);
    return tokens;
  }

  /**
   * Search assets by owner and filter for those where wallet is authority
   */
  private async searchByOwner(
    walletAddress: string,
    timeoutMs: number
  ): Promise<DetectedToken[]> {
    const tokens: DetectedToken[] = [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${this.baseUrl}/token-metadata?api-key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Use searchAssets endpoint
          jsonrpc: "2.0",
          id: "search-tokens",
          method: "searchAssets",
          params: {
            interface: "FungibleToken",
            ownerAddress: walletAddress,
            limit: 1000,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[DASAPIDetector] searchAssets request failed: ${response.status}`);
        return tokens;
      }

      const data = await response.json();
      const assets = data.result?.items || data || [];

      for (const asset of assets) {
        // Check if this address is the mint authority
        const isAuthority = asset.authorities?.some(
          (auth: any) =>
            auth.address === walletAddress && auth.scopes?.includes("full")
        );

        if (isAuthority && asset.id) {
          tokens.push(
            this.createDetectedToken(asset.id, {
              name: asset.content?.metadata?.name || "Unknown Token",
              symbol: asset.content?.metadata?.symbol || "TOKEN",
              launchAt: asset.created_at || new Date().toISOString(),
              mintAuthorityVerified: false, // DAS doesn't verify mint authority directly
              rawConfidence: this.confidenceBase,
            })
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`[DASAPIDetector] searchByOwner timed out`);
      } else {
        console.warn(`[DASAPIDetector] searchByOwner error:`, error);
      }
    }

    return tokens;
  }

  /**
   * Get assets directly by authority address
   */
  private async getByAuthority(
    walletAddress: string,
    timeoutMs: number
  ): Promise<DetectedToken[]> {
    const tokens: DetectedToken[] = [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Try the getAssetsByAuthority endpoint
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "authority-search",
          method: "getAssetsByAuthority",
          params: {
            authorityAddress: walletAddress,
            page: 1,
            limit: 1000,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[DASAPIDetector] getAssetsByAuthority request failed: ${response.status}`);
        return tokens;
      }

      const data = await response.json();

      if (data.error) {
        // This endpoint may not be available on all RPC providers
        console.warn(`[DASAPIDetector] getAssetsByAuthority not available:`, data.error.message);
        return tokens;
      }

      const assets = data.result?.items || [];

      for (const asset of assets) {
        // Only include fungible tokens
        if (asset.interface === "FungibleToken" && asset.id) {
          tokens.push(
            this.createDetectedToken(asset.id, {
              name: asset.content?.metadata?.name || "Unknown Token",
              symbol: asset.content?.metadata?.symbol || "TOKEN",
              launchAt: asset.created_at || new Date().toISOString(),
              mintAuthorityVerified: false,
              rawConfidence: this.confidenceBase,
            })
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`[DASAPIDetector] getByAuthority timed out`);
      } else {
        console.warn(`[DASAPIDetector] getByAuthority error:`, error);
      }
    }

    return tokens;
  }
}
