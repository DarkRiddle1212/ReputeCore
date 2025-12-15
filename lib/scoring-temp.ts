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

    // === Dev Sell Ratio Penalties (Requirement 11.4) ===
    if (
      token.devSellRatio !== null &&
      token.devSellRatio !== undefined &&
      !isNaN(token.devSellRatio)
    ) {
      dataPointsAvailable++;

      const devSellPercent = (token.devSellRatio * 100).toFixed(1);

      // Apply severe penalty for very high dev sell ratio (>80%) - Requirement 11.4
      if (token.devSellRatio > 0.8) {
        totalPenalty += 60;
        penaltiesApplied++;
        criticalRisks.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens`
        );
      }
      // Apply penalty for high dev sell ratio (50-80%)
      else if (token.devSellRatio >= 0.5) {
        totalPenalty += 35;
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens`
        );
      }
      // Apply penalty for moderate dev sell ratio (25-50%)
      else if (token.devSellRatio >= 0.25) {
        totalPenalty += 15;
        penaltiesApplied++;
        warnings.push(
          `${tokenName}: Developer sold ${devSellPercent}% of tokens (moderate concern)`
        );
      }
      // Low dev sell ratio is positive
      else if (token.devSellRatio < 0.1) {
        totalPenalty -= 5; // Small bonus for low sell ratio
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
