/**
 * MintAuthorityVerifier - Verifies token creation via on-chain mint authority data
 *
 * Provides verification of whether a wallet actually created a token by checking
 * on-chain mint authority data and transaction history.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5
 */

import { VerificationResult } from "./types";
import { logger } from "@/lib/logger";

/**
 * Configuration for the verifier
 */
interface VerifierConfig {
  /** Helius API key for RPC calls */
  apiKey: string;
  /** RPC URL (defaults to Helius) */
  rpcUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * SPL Token Program ID
 */
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Verifies token creation by checking on-chain mint authority data
 */
export class MintAuthorityVerifier {
  private rpcUrl: string;
  private timeoutMs: number;

  constructor(config: VerifierConfig) {
    this.rpcUrl = config.rpcUrl || `https://rpc.helius.xyz/?api-key=${config.apiKey}`;
    this.timeoutMs = config.timeoutMs || 10000;
  }

  /**
   * Verify if a wallet is the creator of a token (Requirement 6.1, 6.3)
   *
   * @param tokenMint - The token mint address to verify
   * @param walletAddress - The wallet address to check as creator
   * @returns Verification result with creator status and confidence
   */
  async verify(
    tokenMint: string,
    walletAddress: string
  ): Promise<VerificationResult> {
    try {
      // First, try to verify via current on-chain mint authority
      const onChainResult = await this.verifyViaOnChain(tokenMint, walletAddress);
      
      if (onChainResult.isCreator) {
        return onChainResult;
      }

      // If on-chain check is inconclusive (mint authority may have been revoked),
      // fall back to transaction history verification
      const txHistoryResult = await this.verifyViaTransactionHistory(
        tokenMint,
        walletAddress
      );

      return txHistoryResult;
    } catch (error) {
      // Log exclusion reason for debugging (Requirement 6.5)
      const reason = `Verification failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logExclusion(tokenMint, walletAddress, reason);

      return {
        isCreator: false,
        mintAuthority: null,
        verificationMethod: "on_chain",
        confidence: 0,
        reason,
      };
    }
  }

  /**
   * Verify via current on-chain mint authority data
   */
  private async verifyViaOnChain(
    tokenMint: string,
    walletAddress: string
  ): Promise<VerificationResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [
            tokenMint,
            { encoding: "jsonParsed" },
          ],
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

      const accountInfo = data.result?.value;
      if (!accountInfo) {
        return {
          isCreator: false,
          mintAuthority: null,
          verificationMethod: "on_chain",
          confidence: 0,
          reason: "Token mint account not found",
        };
      }

      // Parse mint authority from account data
      const parsedData = accountInfo.data?.parsed;
      if (parsedData?.type !== "mint") {
        return {
          isCreator: false,
          mintAuthority: null,
          verificationMethod: "on_chain",
          confidence: 0,
          reason: "Account is not a token mint",
        };
      }

      const mintAuthority = parsedData.info?.mintAuthority;

      // Check if wallet is current mint authority
      if (mintAuthority === walletAddress) {
        return {
          isCreator: true,
          mintAuthority,
          verificationMethod: "on_chain",
          confidence: 100,
          reason: "Wallet is current mint authority",
        };
      }

      // Mint authority doesn't match - could be revoked or transferred
      return {
        isCreator: false,
        mintAuthority,
        verificationMethod: "on_chain",
        confidence: 0,
        reason: mintAuthority
          ? "Wallet is not the current mint authority"
          : "Mint authority has been revoked",
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("On-chain verification timed out");
      }
      throw error;
    }
  }

  /**
   * Verify via transaction history - check for InitializeMint instruction
   * This catches cases where mint authority was later revoked or transferred
   */
  private async verifyViaTransactionHistory(
    tokenMint: string,
    walletAddress: string
  ): Promise<VerificationResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      // Get signatures for the token mint account
      const sigResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params: [tokenMint, { limit: 100 }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!sigResponse.ok) {
        throw new Error(`Failed to get signatures: ${sigResponse.status}`);
      }

      const sigData = await sigResponse.json();
      const signatures = sigData.result || [];

      if (signatures.length === 0) {
        return {
          isCreator: false,
          mintAuthority: null,
          verificationMethod: "transaction_history",
          confidence: 0,
          reason: "No transaction history found for token",
        };
      }

      // Check the oldest transactions first (likely contains InitializeMint)
      // Sort by blockTime ascending (oldest first)
      const sortedSigs = [...signatures].sort(
        (a: any, b: any) => (a.blockTime || 0) - (b.blockTime || 0)
      );

      // Check up to 10 oldest transactions for InitializeMint
      const sigsToCheck = sortedSigs.slice(0, 10);

      for (const sig of sigsToCheck) {
        const result = await this.checkTransactionForMintInit(
          sig.signature,
          walletAddress
        );
        if (result.isCreator) {
          return result;
        }
      }

      // No InitializeMint found with this wallet as authority
      return {
        isCreator: false,
        mintAuthority: null,
        verificationMethod: "transaction_history",
        confidence: 0,
        reason: "No InitializeMint instruction found with wallet as authority",
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Transaction history verification timed out");
      }
      throw error;
    }
  }

  /**
   * Check a specific transaction for InitializeMint instruction
   */
  private async checkTransactionForMintInit(
    signature: string,
    walletAddress: string
  ): Promise<VerificationResult> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
          ],
        }),
      });

      if (!response.ok) {
        return {
          isCreator: false,
          mintAuthority: null,
          verificationMethod: "transaction_history",
          confidence: 0,
          reason: "Failed to fetch transaction",
        };
      }

      const data = await response.json();
      const tx = data.result;

      if (!tx) {
        return {
          isCreator: false,
          mintAuthority: null,
          verificationMethod: "transaction_history",
          confidence: 0,
          reason: "Transaction not found",
        };
      }

      // Check main instructions
      const instructions = tx.transaction?.message?.instructions || [];
      for (const ix of instructions) {
        const result = this.checkInstructionForMintInit(ix, walletAddress);
        if (result) return result;
      }

      // Check inner instructions
      const innerInstructions = tx.meta?.innerInstructions || [];
      for (const inner of innerInstructions) {
        for (const ix of inner.instructions || []) {
          const result = this.checkInstructionForMintInit(ix, walletAddress);
          if (result) return result;
        }
      }

      return {
        isCreator: false,
        mintAuthority: null,
        verificationMethod: "transaction_history",
        confidence: 0,
        reason: "No matching InitializeMint instruction in transaction",
      };
    } catch (error) {
      return {
        isCreator: false,
        mintAuthority: null,
        verificationMethod: "transaction_history",
        confidence: 0,
        reason: `Error checking transaction: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if an instruction is InitializeMint with the wallet as authority
   */
  private checkInstructionForMintInit(
    ix: any,
    walletAddress: string
  ): VerificationResult | null {
    const parsedType = ix.parsed?.type;

    if (parsedType === "initializeMint" || parsedType === "initializeMint2") {
      const mintAuthority = ix.parsed?.info?.mintAuthority;

      if (mintAuthority === walletAddress) {
        return {
          isCreator: true,
          mintAuthority,
          verificationMethod: "transaction_history",
          confidence: 100,
          reason: "Found InitializeMint instruction with wallet as mint authority",
        };
      }
    }

    return null;
  }

  /**
   * Log exclusion for debugging purposes (Requirement 6.5)
   */
  private logExclusion(
    tokenMint: string,
    walletAddress: string,
    reason: string
  ): void {
    logger.debug(
      `[MintAuthorityVerifier] Token excluded - mint: ${tokenMint}, wallet: ${walletAddress}, reason: ${reason}`
    );
  }
}
