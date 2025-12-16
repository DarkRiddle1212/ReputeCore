/**
 * Solana Token Detection Module
 *
 * Enhanced token detection system for Solana wallets with improved accuracy.
 * Provides multiple detection strategies, confidence scoring, and caching.
 *
 * Requirements: 7.1
 */

// Import classes needed for factory function
import { TokenDetectionOrchestrator } from "./TokenDetectionOrchestrator";
import { MintAuthorityDetector } from "./strategies/MintAuthorityDetector";
import { DASAPIDetector } from "./strategies/DASAPIDetector";
import { PumpFunDetector } from "./strategies/PumpFunDetector";

// Core types
export * from "./types";

// Utilities
export { ConfidenceScorer, confidenceScorer } from "./ConfidenceScorer";
export { DetectionCache, detectionCache } from "./DetectionCache";
export { MintAuthorityVerifier } from "./MintAuthorityVerifier";

// Orchestrator
export { TokenDetectionOrchestrator } from "./TokenDetectionOrchestrator";
export type { OrchestratorConfig } from "./TokenDetectionOrchestrator";

// Strategy base
export type {
  IDetectionStrategy,
  StrategyConfig,
} from "./strategies/DetectionStrategy";
export { BaseDetectionStrategy } from "./strategies/DetectionStrategy";

// Detection strategies
export { PumpFunDetector } from "./strategies/PumpFunDetector";
export { DASAPIDetector } from "./strategies/DASAPIDetector";
export { MintAuthorityDetector } from "./strategies/MintAuthorityDetector";

/**
 * Create a fully configured TokenDetectionOrchestrator with all strategies
 *
 * @param apiKey - Helius API key
 * @returns Configured orchestrator ready for use
 */
export function createDetectionOrchestrator(apiKey: string): TokenDetectionOrchestrator {
  const orchestrator = new TokenDetectionOrchestrator();

  // Register all strategies (order doesn't matter - they're sorted by priority)
  orchestrator.registerStrategy(new MintAuthorityDetector({ apiKey }));
  orchestrator.registerStrategy(new DASAPIDetector({ apiKey }));
  orchestrator.registerStrategy(new PumpFunDetector({ apiKey }));

  return orchestrator;
}
