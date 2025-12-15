// lib/scoring.ts
import type { TokenSummary, WalletInfo, ScoringResult } from "@/types";

/**
 * Heuristics result with detailed breakdown
 * Implements: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export interface HeuristicsResult {
  score: number;
  notes: string[];
  penaltiesApplied: number;
  bonusesApplied: number;
  dataAvailable: boolean;
}

/**
 * Calculate heuristics score based on token characteristics
 * Applies penalties for suspicious patterns and bonuses for positive indicators
 * Only applies penalties when data is available
 *
 * Implements: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export function calculateHeuristicsScore(
  tokenSummaries: TokenSummary[]
): HeuristicsResult {
  // Separate notes by severity for better organization
  const criticalRisks: string[] = [];
  const warnings: string[] = [];
  const positiveSignals: string[] = [];
  const infoNotes: string[] = [];

  let totalPenalty = 0;
  let penaltiesApplied = 0;
  let bonusesApplied = 0;
  let dataPointsAvailable = 0;
  let totalDataPoints = 0;

  if (tokenSummaries.length === 0) {
    return {
      score: 50, // Neutral score when no tokens (Requirement 5.6)
      notes: ["No tokens launched - score based on wallet metrics only"],
      penaltiesApplied: 0,
      bonusesApplied: 0,
      dataAvailable: false,
    };
  }

  for (const token of tokenSummaries) {
    const tokenName =
      token.name || token.symbol || token.token.slice(0, 8) + "...";

    // Track data availability for each metric
    totalDataPoints += 4; // devSellRatio, initialLiquidity, liquidityLocked, holdersAfter7Days

    // === Dev Sell Ratio Penalties (STRICTER - Requirement 11.4) ===
    if (
      token.devSellRatio !== null &&
      token.devSellRatio !== undefined &&
      !isNaN(token.devSellRatio)
    ) {
      dataPointsAvailable++;

      const devSellPercent = (token.devSellRatio * 100).toFixed(1);

      // Apply CRITICAL penalty for very high dev sell ratio (>70%) - likely rug
      if (token.devSellRatio > 0.7) {
        totalPenalty += 80; // Increased from 60
        penaltiesApplied++;
        criticalRisks.push(
          `${tokenName}: Developer dumped ${devSellPercent}% of tokens - LIKELY RUG`
        );
      }
      // Apply severe penalty for high dev sell ratio (50-70%)
      else if (token.devSellRatio >= 0.5) {
        totalPenalty += 55; // Increased from 35
        penaltiesApplied++;
        criticalRisks.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens - HIGH RISK`
        );
      }
      // Apply penalty for moderate dev sell ratio (30-50%)
      else if (token.devSellRatio >= 0.3) {
        totalPenalty += 30; // Increased from 15
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens - CONCERNING`
        );
      }
      // Apply small penalty for elevated dev sell ratio (15-30%)
      else if (token.devSellRatio >= 0.15) {
        totalPenalty += 10;
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens (monitor closely)`
        );
      }
      // Low dev sell ratio is positive
      else if (token.devSellRatio < 0.1) {
        totalPenalty -= 8; // Increased bonus
        bonusesApplied++;
        positiveSignals.push(
          `${tokenName}: Developer held ${(100 - parseFloat(devSellPercent)).toFixed(1)}% of tokens`
        );
      }
    }

    // === Initial Liquidity Penalties (Requirement 5.3, 5.4) ===
    if (
      token.initialLiquidity !== null &&
      token.initialLiquidity !== undefined
    ) {
      dataPointsAvailable++;

      const liquidityUSD = token.initialLiquidity.toFixed(0);

      // Apply penalty for zero initial liquidity - Requirement 5.3
      if (token.initialLiquidity === 0) {
        totalPenalty += 40;
        penaltiesApplied++;
        criticalRisks.push(`${tokenName}: No initial liquidity provided`);
      }
      // Apply penalty for very low liquidity (<$1000) - Requirement 5.4
      else if (token.initialLiquidity < 1000) {
        totalPenalty += 25;
        penaltiesApplied++;
        criticalRisks.push(
          `${tokenName}: Very low initial liquidity ($${liquidityUSD})`
        );
      }
      // Apply penalty for low liquidity (<$10000)
      else if (token.initialLiquidity < 10000) {
        totalPenalty += 10;
        penaltiesApplied++;
        warnings.push(`${tokenName}: Low initial liquidity ($${liquidityUSD})`);
      }
      // Bonus for good liquidity (>$50000)
      else if (token.initialLiquidity >= 50000) {
        totalPenalty -= 10;
        bonusesApplied++;
        positiveSignals.push(
          `${tokenName}: Strong initial liquidity ($${liquidityUSD})`
        );
      }
    } else {
      infoNotes.push(`${tokenName}: Initial liquidity data unavailable`);
    }

    // === Liquidity Lock Bonus (Requirement 5.5) ===
    if (token.liquidityLocked !== null && token.liquidityLocked !== undefined) {
      dataPointsAvailable++;

      if (token.liquidityLocked === true) {
        totalPenalty -= 20; // Negative penalty = bonus
        bonusesApplied++;
        positiveSignals.push(`${tokenName}: Liquidity is locked`);
      } else {
        // Unlocked liquidity is a risk factor
        totalPenalty += 15;
        penaltiesApplied++;
        warnings.push(`${tokenName}: Liquidity not locked`);
      }
    } else {
      infoNotes.push(`${tokenName}: Liquidity lock status unavailable`);
    }

    // === Holder Count Analysis ===
    if (
      token.holdersAfter7Days !== null &&
      token.holdersAfter7Days !== undefined
    ) {
      dataPointsAvailable++;

      const holderCount = token.holdersAfter7Days;

      // Very few holders is suspicious
      if (holderCount < 10) {
        totalPenalty += 20;
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Very few holders after 7 days (${holderCount})`
        );
      }
      // Low holder count
      else if (holderCount < 50) {
        totalPenalty += 10;
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Low holder count after 7 days (${holderCount})`
        );
      }
      // Good holder growth
      else if (holderCount >= 100) {
        totalPenalty -= 10;
        bonusesApplied++;
        positiveSignals.push(
          `${tokenName}: Good holder growth (${holderCount} holders after 7 days)`
        );
      }
    } else {
      infoNotes.push(`${tokenName}: Holder count data unavailable`);
    }
  }

  // Determine if we have meaningful data
  const dataAvailable = dataPointsAvailable > 0;
  const dataCompleteness =
    totalDataPoints > 0 ? dataPointsAvailable / totalDataPoints : 0;

  // Calculate final score
  // If no data available, return neutral score (Requirement 5.6)
  if (!dataAvailable) {
    return {
      score: 50,
      notes: ["No token metrics available - returning neutral score"],
      penaltiesApplied: 0,
      bonusesApplied: 0,
      dataAvailable: false,
    };
  }

  // Calculate final score with bounds of 10-100
  const score = Math.max(10, Math.min(100, 100 - totalPenalty));

  // Build organized notes by severity
  const groupedNotes: string[] = [];

  // Add critical risks section
  if (criticalRisks.length > 0) {
    groupedNotes.push("CRITICAL RISKS:");
    criticalRisks.forEach((note) => groupedNotes.push(`  • ${note}`));
    groupedNotes.push("");
  }

  // Add warnings section
  if (warnings.length > 0) {
    groupedNotes.push("WARNINGS:");
    warnings.forEach((note) => groupedNotes.push(`  • ${note}`));
    groupedNotes.push("");
  }

  // Add positive signals section
  if (positiveSignals.length > 0) {
    groupedNotes.push("POSITIVE SIGNALS:");
    positiveSignals.forEach((note) => groupedNotes.push(`  • ${note}`));
    groupedNotes.push("");
  }

  // Add info notes if any
  if (infoNotes.length > 0) {
    groupedNotes.push("ADDITIONAL INFO:");
    infoNotes.forEach((note) => groupedNotes.push(`  • ${note}`));
    groupedNotes.push("");
  }

  // Add summary
  const riskLevel =
    criticalRisks.length > 0
      ? "HIGH"
      : warnings.length > 2
        ? "MODERATE"
        : "LOW";
  groupedNotes.push("SUMMARY:");
  groupedNotes.push(`  • Overall Risk Level: ${riskLevel}`);
  groupedNotes.push(
    `  • Data Completeness: ${Math.round(dataCompleteness * 100)}%`
  );
  if (penaltiesApplied > 0 || bonusesApplied > 0) {
    groupedNotes.push(
      `  • Analysis: ${penaltiesApplied} risk factors, ${bonusesApplied} positive indicators`
    );
  }

  return {
    score,
    notes: groupedNotes,
    penaltiesApplied,
    bonusesApplied,
    dataAvailable,
  };
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Scoring weights interface
 */
export interface ScoringWeights {
  walletAge: number;
  activity: number;
  tokenOutcome: number;
  heuristics: number;
}

/**
 * Confidence level type
 */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "MEDIUM-LOW" | "LOW";

/**
 * Confidence result interface
 */
export interface ConfidenceResult {
  level: ConfidenceLevel;
  reason: string;
  dataCompleteness: number;
}

/**
 * Calculate data completeness for token summaries
 * Implements: Requirement 6.3
 *
 * @param tokenSummaries - Array of token summaries
 * @returns Data completeness percentage (0-1)
 */
export function calculateDataCompleteness(
  tokenSummaries: TokenSummary[]
): number {
  if (tokenSummaries.length === 0) {
    return 0;
  }

  let totalDataPoints = 0;
  let availableDataPoints = 0;

  for (const token of tokenSummaries) {
    // Check each metric
    totalDataPoints += 4; // devSellRatio, initialLiquidity, liquidityLocked, holdersAfter7Days

    if (
      token.devSellRatio !== null &&
      token.devSellRatio !== undefined &&
      !isNaN(token.devSellRatio)
    ) {
      availableDataPoints++;
    }
    if (
      token.initialLiquidity !== null &&
      token.initialLiquidity !== undefined
    ) {
      availableDataPoints++;
    }
    if (token.liquidityLocked !== null && token.liquidityLocked !== undefined) {
      availableDataPoints++;
    }
    if (
      token.holdersAfter7Days !== null &&
      token.holdersAfter7Days !== undefined
    ) {
      availableDataPoints++;
    }
  }

  return totalDataPoints > 0 ? availableDataPoints / totalDataPoints : 0;
}

/**
 * Determine scoring weights based on data completeness
 * Implements: Requirement 6.3
 *
 * @param tokenSummaries - Array of token summaries
 * @returns Adjusted scoring weights that sum to 1.0
 */
export function determineWeights(
  tokenSummaries: TokenSummary[]
): ScoringWeights {
  const dataCompleteness = calculateDataCompleteness(tokenSummaries);
  const hasTokens = tokenSummaries.length > 0;

  // Check if we have any meaningful token data
  const hasTokenData = tokenSummaries.some(
    (t) =>
      t.devSellRatio !== null ||
      t.initialLiquidity !== null ||
      t.liquidityLocked !== null ||
      t.holdersAfter7Days !== null
  );

  if (!hasTokens) {
    // No tokens - rely only on wallet metrics
    return {
      walletAge: 0.6,
      activity: 0.4,
      tokenOutcome: 0,
      heuristics: 0,
    };
  }

  if (!hasTokenData) {
    // Tokens found but no detailed data
    return {
      walletAge: 0.5,
      activity: 0.3,
      tokenOutcome: 0.1,
      heuristics: 0.1,
    };
  }

  // Adjust weights based on data completeness
  if (dataCompleteness >= 0.75) {
    // High data completeness - full weight on token metrics
    return {
      walletAge: 0.2,
      activity: 0.1,
      tokenOutcome: 0.35,
      heuristics: 0.35,
    };
  } else if (dataCompleteness >= 0.5) {
    // Medium data completeness - balanced weights
    return {
      walletAge: 0.3,
      activity: 0.2,
      tokenOutcome: 0.25,
      heuristics: 0.25,
    };
  } else if (dataCompleteness >= 0.25) {
    // Low data completeness - more weight on wallet metrics
    return {
      walletAge: 0.4,
      activity: 0.25,
      tokenOutcome: 0.175,
      heuristics: 0.175,
    };
  } else {
    // Very low data completeness - minimal weight on token metrics
    return {
      walletAge: 0.5,
      activity: 0.3,
      tokenOutcome: 0.1,
      heuristics: 0.1,
    };
  }
}

/**
 * Calculate confidence level based on data completeness
 * Implements: Requirement 6.4
 *
 * @param tokenSummaries - Array of token summaries
 * @returns Confidence result with level and reasoning
 */
export function calculateConfidence(
  tokenSummaries: TokenSummary[]
): ConfidenceResult {
  const dataCompleteness = calculateDataCompleteness(tokenSummaries);
  const hasTokens = tokenSummaries.length > 0;

  if (!hasTokens) {
    return {
      level: "MEDIUM",
      reason: "No token launches detected - score based on wallet metrics only",
      dataCompleteness: 0,
    };
  }

  if (dataCompleteness >= 0.75) {
    return {
      level: "HIGH",
      reason: "Comprehensive token data available for analysis",
      dataCompleteness,
    };
  } else if (dataCompleteness >= 0.5) {
    return {
      level: "MEDIUM",
      reason: "Partial token data available - some metrics missing",
      dataCompleteness,
    };
  } else if (dataCompleteness >= 0.25) {
    return {
      level: "MEDIUM-LOW",
      reason: "Limited token data available - analysis may be incomplete",
      dataCompleteness,
    };
  } else {
    return {
      level: "LOW",
      reason:
        "Minimal token data available - score primarily based on wallet metrics",
      dataCompleteness,
    };
  }
}

import { logger } from "@/lib/logger";

export function computeScore(
  walletInfo: WalletInfo,
  tokenSummaries: TokenSummary[]
): ScoringResult {
  const notes: string[] = [];

  // Calculate wallet age score (STRICTER thresholds)
  const ageDays = daysSince(walletInfo.createdAt ?? null);
  let walletAgeScore = 40; // Default to lower score for unknown
  if (ageDays === null) {
    walletAgeScore = 40;
    notes.push("🚨 Wallet age unknown - HIGH RISK");
  } else if (ageDays >= 365) {
    walletAgeScore = 100;
    notes.push("✅ Established wallet (over 1 year old)");
  } else if (ageDays >= 180) {
    walletAgeScore = 85;
    notes.push("✅ Mature wallet (6-12 months old)");
  } else if (ageDays >= 90) {
    walletAgeScore = 70;
    notes.push("✅ Moderate history (3-6 months old)");
  } else if (ageDays >= 30) {
    walletAgeScore = 50;
    notes.push("⚠️ Limited history (1-3 months old)");
  } else if (ageDays >= 14) {
    walletAgeScore = 30;
    notes.push("⚠️ Very new wallet (2-4 weeks old)");
  } else if (ageDays >= 7) {
    walletAgeScore = 20;
    notes.push("🚨 New wallet (1-2 weeks old) - ELEVATED RISK");
  } else {
    walletAgeScore = 5;
    notes.push("🚨 Brand new wallet (less than 7 days old) - CRITICAL RISK");
  }

  // Calculate activity score (STRICTER thresholds)
  const txCount = walletInfo.txCount ?? 0;
  let activityScore = 30; // Default to lower score
  if (txCount >= 1000) {
    activityScore = 100;
    notes.push("✅ Very active wallet (1,000+ transactions)");
  } else if (txCount >= 500) {
    activityScore = 85;
    notes.push("✅ Active wallet (500+ transactions)");
  } else if (txCount >= 200) {
    activityScore = 70;
    notes.push("✅ Moderately active wallet (200+ transactions)");
  } else if (txCount >= 100) {
    activityScore = 55;
    notes.push("✅ Some activity (100+ transactions)");
  } else if (txCount >= 50) {
    activityScore = 40;
    notes.push("⚠️ Limited activity (50-100 transactions)");
  } else if (txCount >= 20) {
    activityScore = 25;
    notes.push("⚠️ Low activity (20-50 transactions)");
  } else if (txCount >= 10) {
    activityScore = 15;
    notes.push("🚨 Very low activity (10-20 transactions)");
  } else {
    activityScore = 5;
    notes.push("🚨 Minimal activity (less than 10 transactions) - SUSPICIOUS");
  }

  // Check if we have meaningful token data
  const hasTokenData = tokenSummaries.some(
    (t) =>
      t.devSellRatio !== null ||
      t.initialLiquidity !== null ||
      t.liquidityLocked !== null ||
      t.holdersAfter7Days !== null
  );

  let tokenOutcomeScore = 75;
  let heuristicsScore = 75;
  let weights;

  if (tokenSummaries.length === 0) {
    // No tokens launched - neutral score
    tokenOutcomeScore = 75;

    // Calculate heuristics score (will return 100 for no tokens)
    const heuristicsResult = calculateHeuristicsScore(tokenSummaries);
    heuristicsScore = heuristicsResult.score;
    notes.push(...heuristicsResult.notes);

    notes.push("ℹ️ No token launches detected");

    // Use simplified scoring (only age and activity)
    weights = {
      walletAge: 0.6,
      activity: 0.4,
      tokenOutcome: 0,
      heuristics: 0,
    };
  } else if (!hasTokenData) {
    // Tokens found but no detailed data available
    const total = tokenSummaries.length;

    // Count outcomes if available
    let rugs = 0,
      succ = 0,
      unknown = 0;
    for (const t of tokenSummaries) {
      if ((t as any).outcome === "rug") rugs++;
      else if ((t as any).outcome === "success") succ++;
      else unknown++;
    }

    if (unknown === total) {
      // All tokens are unknown - we can't make a judgment
      tokenOutcomeScore = 50; // Neutral/uncertain

      // Still calculate heuristics if we have any data
      const heuristicsResult = calculateHeuristicsScore(tokenSummaries);
      heuristicsScore = heuristicsResult.score;
      notes.push(...heuristicsResult.notes);

      notes.push(
        `⚠️ ${total} token(s) found but insufficient data to assess quality`
      );
      notes.push("ℹ️ Score based primarily on wallet age and activity");

      // Reduce weight of unknown factors
      weights = {
        walletAge: 0.5,
        activity: 0.3,
        tokenOutcome: 0.1,
        heuristics: 0.1,
      };
    } else {
      // Some outcomes are known
      const rugRatio = rugs / total;
      const succRatio = succ / total;

      tokenOutcomeScore = Math.round(
        100 * (0.5 * succRatio + 0.5 * (1 - rugRatio))
      );
      tokenOutcomeScore = Math.max(10, Math.min(100, tokenOutcomeScore));

      // Calculate heuristics score using dedicated function
      const heuristicsResult = calculateHeuristicsScore(tokenSummaries);
      heuristicsScore = heuristicsResult.score;
      notes.push(...heuristicsResult.notes);

      notes.push(
        `${total} token(s) found — ${succ} succeeded, ${rugs} flagged as rug, ${unknown} unknown`
      );

      // Standard weights
      weights = {
        walletAge: 0.2,
        activity: 0.1,
        tokenOutcome: 0.35,
        heuristics: 0.35,
      };
    }
  } else {
    // We have detailed token data - use full analysis
    let rugs = 0,
      succ = 0;

    for (const t of tokenSummaries) {
      // Check outcomes
      if ((t as any).outcome === "rug") rugs++;
      else if ((t as any).outcome === "success") succ++;
      else if (
        t.devSellRatio !== null &&
        t.devSellRatio !== undefined &&
        t.devSellRatio > 80
      )
        rugs++;
      else if (t.liquidityLocked === true) succ++;
    }

    const total = tokenSummaries.length;
    const rugRatio = rugs / Math.max(1, total);
    const succRatio = succ / Math.max(1, total);

    tokenOutcomeScore = Math.round(
      100 * (0.5 * succRatio + 0.5 * (1 - rugRatio))
    );
    tokenOutcomeScore = Math.max(10, Math.min(100, tokenOutcomeScore));

    // Calculate heuristics score using dedicated function
    const heuristicsResult = calculateHeuristicsScore(tokenSummaries);
    heuristicsScore = heuristicsResult.score;
    notes.push(...heuristicsResult.notes);

    if (rugs > 0) {
      notes.push(`🚨 ${rugs} token(s) flagged as potential rug pulls`);
    }
    if (succ > 0) {
      notes.push(`✓ ${succ} token(s) show positive indicators`);
    }
    notes.push(`${total} token(s) analyzed with detailed metrics`);

    // Standard weights
    weights = {
      walletAge: 0.2,
      activity: 0.1,
      tokenOutcome: 0.35,
      heuristics: 0.35,
    };
  }

  // Calculate final score
  const final = Math.round(
    walletAgeScore * weights.walletAge +
      activityScore * weights.activity +
      tokenOutcomeScore * weights.tokenOutcome +
      heuristicsScore * weights.heuristics
  );

  const score = Math.max(0, Math.min(100, final));

  // Log score calculation details (Requirement 12.3)
  logger.scoreCalculation("walletAge", walletAgeScore, {
    weight: weights.walletAge,
  });
  logger.scoreCalculation("activity", activityScore, {
    weight: weights.activity,
  });
  logger.scoreCalculation("tokenOutcome", tokenOutcomeScore, {
    weight: weights.tokenOutcome,
  });
  logger.scoreCalculation("heuristics", heuristicsScore, {
    weight: weights.heuristics,
  });
  logger.scoreCalculation("final", score);

  // Calculate confidence using the dedicated function
  const confidence = calculateConfidence(tokenSummaries);
  notes.push(`📊 Confidence: ${confidence.level} (${confidence.reason})`);

  // Add data completeness info
  if (tokenSummaries.length > 0) {
    notes.push(
      `📈 Data completeness: ${Math.round(confidence.dataCompleteness * 100)}%`
    );
  }

  return {
    score,
    breakdown: {
      walletAgeScore,
      activityScore,
      tokenOutcomeScore,
      heuristicsScore,
      final: score,
    },
    notes,
    confidence, // Include confidence in result
  };
}
