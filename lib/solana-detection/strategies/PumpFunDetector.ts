/**
 * PumpFunDetector - Detects tokens created via Pump.fun platform
 *
 * Uses Helius enhanced transactions API for efficient detection.
 * Distinguishes token creation from purchases using transaction type.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { DetectedToken, DetectionOptions, SCAN_LIMITS } from "../types";
import { BaseDetectionStrategy, StrategyConfig } from "./DetectionStrategy";

/**
 * Pump.fun program ID
 */
const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/**
 * Detects tokens created through the Pump.fun platform
 * Uses Helius enhanced transactions API for efficient batch processing
 */
export class PumpFunDetector extends BaseDetectionStrategy {
  readonly name = "PumpFunDetector";
  readonly priority = 90;
  readonly confidenceBase = 90;
  readonly detectionMethod = "pump_fun_create" as const;

  constructor(config: StrategyConfig) {
    super(config);
  }

  /**
   * Detect Pump.fun tokens created by the wallet (Requirement 1.1, 1.2, 1.3)
   *
   * Uses Helius enhanced transactions API with type=CREATE filter to efficiently
   * fetch only token creation transactions, avoiding pagination issues.
   */
  async detect(
    walletAddress: string,
    options: DetectionOptions
  ): Promise<DetectedToken[]> {
    const mergedOptions = this.mergeOptions(options);
    const tokens: DetectedToken[] = [];
    const seenMints = new Set<string>();

    let beforeSignature: string | undefined = mergedOptions.beforeSignature;
    let totalFetched = 0;
    const startTime = Date.now();

    try {
      // Use type=CREATE filter to get all CREATE transactions directly
      // This is more efficient and avoids missing tokens due to pagination
      while (totalFetched < mergedOptions.maxTransactions) {
        // Check timeout
        if (Date.now() - startTime > mergedOptions.timeoutMs) {
          console.log(`[PumpFunDetector] Timeout reached after ${totalFetched} transactions`);
          break;
        }

        // Use type=CREATE filter to fetch only CREATE transactions
        const url = beforeSignature
          ? `${this.baseUrl}/addresses/${walletAddress}/transactions?api-key=${this.apiKey}&type=CREATE&limit=100&before=${beforeSignature}`
          : `${this.baseUrl}/addresses/${walletAddress}/transactions?api-key=${this.apiKey}&type=CREATE&limit=100`;

        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[PumpFunDetector] API request failed: ${response.status}`);
          break;
        }

        const transactions = await response.json();
        if (!transactions || transactions.length === 0) {
          break;
        }

        console.log(`[PumpFunDetector] Fetched ${transactions.length} CREATE transactions (total: ${totalFetched + transactions.length})`);

        // Process CREATE transactions - filter for Pump.fun source
        for (const tx of transactions) {
          // Only process Pump.fun transactions where wallet is fee payer (Requirement 1.1, 1.2)
          if ((tx.source === "PUMP_FUN" || tx.source === "PUMP.FUN" || tx.source === "PUMP_AMM") && 
              tx.feePayer === walletAddress) {
            // Extract token mint from the transaction
            const mintAddress = this.extractMintFromTransaction(tx);
            
            if (mintAddress && !seenMints.has(mintAddress)) {
              seenMints.add(mintAddress);
              
              // Get token metadata (Requirement 1.4)
              const metadata = await this.fetchTokenMetadata(mintAddress);
              
              tokens.push(
                this.createDetectedToken(mintAddress, {
                  name: metadata?.name || "Pump.fun Token",
                  symbol: metadata?.symbol || "PUMP",
                  launchAt: tx.timestamp
                    ? new Date(tx.timestamp * 1000).toISOString()
                    : new Date().toISOString(),
                  mintAuthorityVerified: true, // CREATE type confirms creation
                  rawConfidence: this.confidenceBase,
                })
              );

              console.log(
                `[PumpFunDetector] Found Pump.fun CREATE: ${mintAddress.slice(0, 8)}... (${metadata?.symbol || 'PUMP'})`
              );
            }
          }
        }

        totalFetched += transactions.length;
        beforeSignature = transactions[transactions.length - 1]?.signature;

        // Break if we got less than requested (end of history)
        if (transactions.length < 100) {
          break;
        }

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, SCAN_LIMITS.delayBetweenBatches));
      }
    } catch (error) {
      console.error(`[PumpFunDetector] Error during detection:`, error);
    }

    console.log(
      `[PumpFunDetector] Found ${tokens.length} tokens after scanning ${totalFetched} CREATE transactions`
    );

    return tokens;
  }

  /**
   * Extract token mint address from a Pump.fun CREATE transaction
   */
  private extractMintFromTransaction(tx: any): string | null {
    // Check tokenTransfers for the mint
    if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint && transfer.mint !== "So11111111111111111111111111111111111111112") {
          return transfer.mint;
        }
      }
    }

    // Check accountData for token accounts
    if (tx.accountData) {
      for (const account of tx.accountData) {
        if (account.tokenBalanceChanges) {
          for (const change of account.tokenBalanceChanges) {
            if (change.mint && change.mint !== "So11111111111111111111111111111111111111112") {
              return change.mint;
            }
          }
        }
      }
    }

    // Check instructions for mint info
    if (tx.instructions) {
      for (const ix of tx.instructions) {
        if (ix.accounts && ix.accounts.length > 0) {
          // In Pump.fun CREATE, the mint is typically one of the first accounts
          for (const account of ix.accounts.slice(0, 5)) {
            if (account && account.length >= 32 && account.length <= 44 &&
                account !== tx.feePayer &&
                account !== "So11111111111111111111111111111111111111112") {
              // This might be the mint - we'll verify via metadata
              return account;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Fetch token metadata from Helius DAS API (Requirement 1.4)
   */
  private async fetchTokenMetadata(
    mintAddress: string
  ): Promise<{ name?: string; symbol?: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/token-metadata?api-key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAccounts: [mintAddress],
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const tokenData = data?.[0];

      if (tokenData) {
        return {
          name: tokenData.onChainMetadata?.metadata?.name ||
                tokenData.legacyMetadata?.name,
          symbol: tokenData.onChainMetadata?.metadata?.symbol ||
                  tokenData.legacyMetadata?.symbol,
        };
      }

      return null;
    } catch (error) {
      console.warn(`[PumpFunDetector] Failed to fetch metadata for ${mintAddress}:`, error);
      return null;
    }
  }
}
