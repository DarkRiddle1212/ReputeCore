/**
 * MintAuthorityDetector - Detects tokens via InitializeMint instructions
 *
 * Scans transaction history for InitializeMint/InitializeMint2 instructions
 * where the wallet is set as mint authority. This is the most reliable
 * detection method as it directly verifies token creation.
 *
 * Requirements: 3.1, 3.2, 3.3
 */

import { DetectedToken, DetectionOptions, SCAN_LIMITS } from "../types";
import { BaseDetectionStrategy, StrategyConfig } from "./DetectionStrategy";

/**
 * SPL Token Program ID
 */
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Detects tokens by scanning for InitializeMint instructions
 */
export class MintAuthorityDetector extends BaseDetectionStrategy {
  readonly name = "MintAuthorityDetector";
  readonly priority = 100; // Highest priority - most reliable
  readonly confidenceBase = 100;
  readonly detectionMethod = "mint_authority_verified" as const;

  constructor(config: StrategyConfig) {
    super(config);
  }

  /**
   * Detect tokens via InitializeMint instructions (Requirement 3.1, 3.2)
   *
   * Scans transactions for InitializeMint/InitializeMint2 instructions
   * regardless of the invoking program.
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
      while (totalFetched < mergedOptions.maxTransactions) {
        // Check timeout
        if (Date.now() - startTime > mergedOptions.timeoutMs) {
          console.log(
            `[MintAuthorityDetector] Timeout reached after ${totalFetched} transactions`
          );
          break;
        }

        // Fetch batch of signatures
        const batchSize = Math.min(
          SCAN_LIMITS.batchSize,
          mergedOptions.maxTransactions - totalFetched
        );

        const signatures = await this.getSignatures(
          walletAddress,
          batchSize,
          beforeSignature
        );

        if (signatures.length === 0) {
          break;
        }

        // Process transactions in parallel batches for performance
        const PARALLEL_BATCH_SIZE = 10;
        for (let i = 0; i < signatures.length; i += PARALLEL_BATCH_SIZE) {
          // Check timeout within batch
          if (Date.now() - startTime > mergedOptions.timeoutMs) {
            break;
          }

          const batch = signatures.slice(i, i + PARALLEL_BATCH_SIZE);
          const results = await Promise.all(
            batch.map((sig) =>
              this.processTransaction(sig.signature, walletAddress, sig.blockTime).catch(
                (error) => {
                  console.warn(
                    `[MintAuthorityDetector] Error processing tx ${sig.signature}:`,
                    error
                  );
                  return [];
                }
              )
            )
          );

          for (const detectedTokens of results) {
            for (const token of detectedTokens) {
              if (!seenMints.has(token.token)) {
                seenMints.add(token.token);
                tokens.push(token);
              }
            }
          }
        }

        totalFetched += signatures.length;
        beforeSignature = signatures[signatures.length - 1]?.signature;

        // Break if we got less than requested (end of history)
        if (signatures.length < batchSize) {
          break;
        }

        // Small delay between batches
        await new Promise((resolve) =>
          setTimeout(resolve, SCAN_LIMITS.delayBetweenBatches)
        );
      }
    } catch (error) {
      console.error(`[MintAuthorityDetector] Error during detection:`, error);
    }

    console.log(
      `[MintAuthorityDetector] Found ${tokens.length} tokens after scanning ${totalFetched} transactions`
    );

    return tokens;
  }

  /**
   * Process a single transaction to find InitializeMint instructions
   */
  private async processTransaction(
    signature: string,
    walletAddress: string,
    blockTime?: number
  ): Promise<DetectedToken[]> {
    const tokens: DetectedToken[] = [];

    const tx = await this.getTransaction(signature);
    if (!tx) return tokens;

    // Check main instructions
    const instructions = tx.transaction?.message?.instructions || [];
    for (const ix of instructions) {
      const token = this.checkInstruction(ix, walletAddress, blockTime);
      if (token) {
        tokens.push(token);
      }
    }

    // Check inner instructions (where most InitializeMint calls are)
    const innerInstructions = tx.meta?.innerInstructions || [];
    for (const inner of innerInstructions) {
      for (const ix of inner.instructions || []) {
        const token = this.checkInstruction(ix, walletAddress, blockTime);
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Check if an instruction is InitializeMint with wallet as authority
   * Records detection method as "mint_authority_verified" (Requirement 3.3)
   */
  private checkInstruction(
    ix: any,
    walletAddress: string,
    blockTime?: number
  ): DetectedToken | null {
    const parsedType = ix.parsed?.type;

    // Detect InitializeMint and InitializeMint2 regardless of program (Requirement 3.1)
    if (parsedType === "initializeMint" || parsedType === "initializeMint2") {
      const mintAuthority = ix.parsed?.info?.mintAuthority;
      const mintAddress = ix.parsed?.info?.mint;
      const decimals = ix.parsed?.info?.decimals;

      // Only include if wallet is the mint authority (Requirement 3.2)
      if (mintAuthority === walletAddress && mintAddress) {
        console.log(
          `[MintAuthorityDetector] Found InitializeMint: ${mintAddress.slice(0, 8)}... (decimals: ${decimals})`
        );

        return this.createDetectedToken(mintAddress, {
          launchAt: blockTime
            ? new Date(blockTime * 1000).toISOString()
            : new Date().toISOString(),
          mintAuthorityVerified: true,
          rawConfidence: this.confidenceBase,
        });
      }
    }

    return null;
  }
}
