/**
 * ConfidenceScorer - Calculates and manages confidence scores for detected tokens
 *
 * Assigns confidence scores based on detection method reliability and
 * provides sorting functionality for result presentation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {
  DetectedToken,
  DetectionMethod,
  EnrichedTokenSummary,
  CONFIDENCE_SCORES,
} from "./types";

/**
 * Utility class for calculating confidence scores and sorting tokens
 */
export class ConfidenceScorer {
  /**
   * Calculate confidence score for a detected token based on its detection method
   *
   * Scores by method:
   * - mint_authority_verified: 100 (Requirement 4.2)
   * - das_api_authority: 95 (Requirement 4.3)
   * - pump_fun_create: 90
   * - known_program: 85
   * - heuristic: 60-80 based on rawConfidence (Requirement 4.4)
   *
   * @param token - The detected token to score
   * @returns Confidence score between 0 and 100 (Requirement 4.1)
   */
  calculateScore(token: DetectedToken): number {
    const { detectionMethod, rawConfidence } = token;

    // Get base score from detection method
    let score: number;

    switch (detectionMethod) {
      case "mint_authority_verified":
        score = CONFIDENCE_SCORES.mint_authority_verified; // 100
        break;
      case "das_api_authority":
        score = CONFIDENCE_SCORES.das_api_authority; // 95
        break;
      case "pump_fun_create":
        score = CONFIDENCE_SCORES.pump_fun_create; // 90
        break;
      case "known_program":
        score = CONFIDENCE_SCORES.known_program; // 85
        break;
      case "heuristic":
        // For heuristic detection, use rawConfidence to determine tier
        // Map rawConfidence to 60-80 range
        score = this.calculateHeuristicScore(rawConfidence);
        break;
      default:
        // Fallback for unknown methods
        score = CONFIDENCE_SCORES.heuristic_low; // 60
    }

    // Ensure score is within valid range [0, 100]
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate heuristic confidence score based on raw confidence value
   * Maps to three tiers: high (80), medium (70), low (60)
   *
   * @param rawConfidence - Raw confidence value from detection
   * @returns Score between 60 and 80
   */
  private calculateHeuristicScore(rawConfidence: number): number {
    if (rawConfidence >= 80) {
      return CONFIDENCE_SCORES.heuristic_high; // 80
    } else if (rawConfidence >= 50) {
      return CONFIDENCE_SCORES.heuristic_medium; // 70
    } else {
      return CONFIDENCE_SCORES.heuristic_low; // 60
    }
  }

  /**
   * Sort tokens by confidence score in descending order (Requirement 4.5)
   *
   * @param tokens - Array of enriched token summaries to sort
   * @returns New array sorted by confidence score (highest first)
   */
  sortByConfidence(tokens: EnrichedTokenSummary[]): EnrichedTokenSummary[] {
    // Create a new array to avoid mutating the input
    return [...tokens].sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Get the confidence score for a specific detection method
   * Useful for external components that need method-based scoring
   *
   * @param method - The detection method
   * @returns Base confidence score for the method
   */
  getMethodScore(method: DetectionMethod): number {
    switch (method) {
      case "mint_authority_verified":
        return CONFIDENCE_SCORES.mint_authority_verified;
      case "das_api_authority":
        return CONFIDENCE_SCORES.das_api_authority;
      case "pump_fun_create":
        return CONFIDENCE_SCORES.pump_fun_create;
      case "known_program":
        return CONFIDENCE_SCORES.known_program;
      case "heuristic":
        return CONFIDENCE_SCORES.heuristic_medium; // Default to medium for heuristic
      default:
        return CONFIDENCE_SCORES.heuristic_low;
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const confidenceScorer = new ConfidenceScorer();
