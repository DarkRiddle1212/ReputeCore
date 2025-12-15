import type { TokenSummary } from "@/types/token";
import { logger } from "@/lib/logger";

export type Outcome = "success" | "rug" | "unknown";

// Minimum liquidity threshold to consider a token as having meaningful liquidity (in SOL)
const MIN_LIQUIDITY_THRESHOLD = 0.5; // 0.5 SOL (STRICTER - was 0.1)
// Minimum liquidity for "success" status (in SOL) - tokens need meaningful liquidity
const MIN_SUCCESS_LIQUIDITY = 2.0; // 2 SOL minimum for success (STRICTER - was 1.0)
// Minimum holders for "success" status
const MIN_SUCCESS_HOLDERS = 75; // (STRICTER - was 50)
// Liquidity drop percentage that indicates a potential rug
const RUG_LIQUIDITY_DROP_THRESHOLD = 0.8; // 80% drop (STRICTER - was 90%)

export function determineOutcome(token: TokenSummary): {
  outcome: Outcome;
  reason: string;
} {
  // === HONEYPOT DETECTION (highest priority) ===

  // If token is detected as honeypot, it's a rug
  if (token.isHoneypot === true) {
    const result = {
      outcome: "rug" as Outcome,
      reason:
        token.honeypotReason || "Detected as honeypot - cannot sell tokens",
    };
    logger.heuristicsMatch("honeypot_detected", 1.0, {
      token: token.token,
      honeypotReason: token.honeypotReason,
      riskLevel: token.honeypotRiskLevel,
    });
    return result;
  }

  // High honeypot risk level is also a strong rug indicator
  if (
    token.honeypotRiskLevel === "critical" ||
    token.honeypotRiskLevel === "high"
  ) {
    const result = {
      outcome: "rug" as Outcome,
      reason: `High honeypot risk: ${token.honeypotReason || "Multiple red flags detected"}`,
    };
    logger.heuristicsMatch("high_honeypot_risk", 0.9, {
      token: token.token,
      riskLevel: token.honeypotRiskLevel,
    });
    return result;
  }

  // === HOLDER CONCENTRATION (high priority) ===

  // Critical holder concentration is a rug indicator
  if (token.holderConcentrationRisk === "critical") {
    const result = {
      outcome: "rug" as Outcome,
      reason: `Critical holder concentration: top 10 hold ${token.top10HolderPercentage?.toFixed(1) || ">80"}% of supply`,
    };
    logger.heuristicsMatch("critical_concentration", 0.85, {
      token: token.token,
      top10Percentage: token.top10HolderPercentage,
    });
    return result;
  }

  // === RUG INDICATORS (check first) ===

  // High dev sell ratio (>60%) indicates potential rug pull or profit-taking (STRICTER)
  // Note: devSellRatio is a decimal (0-1), not percentage
  if (
    token.devSellRatio !== null &&
    token.devSellRatio !== undefined &&
    token.devSellRatio > 0.6
  ) {
    const result = {
      outcome: "rug" as Outcome,
      reason: `High developer sell-off: ${(token.devSellRatio * 100).toFixed(1)}% of tokens sold - LIKELY RUG`,
    };
    // Log heuristic match (Requirement 12.5)
    logger.heuristicsMatch("high_dev_sell_ratio", 0.95, {
      token: token.token,
      devSellRatio: token.devSellRatio,
    });
    return result;
  }

  // Check for liquidity removal (rug pull)
  if (
    hasCurrentLiquidity(token) &&
    token.initialLiquidity &&
    token.initialLiquidity > 0
  ) {
    const currentLiq = token.currentLiquidity!;
    const liquidityDropPercent = 1 - currentLiq / token.initialLiquidity;

    // If liquidity dropped by 90%+ from initial, it's likely a rug
    if (liquidityDropPercent >= RUG_LIQUIDITY_DROP_THRESHOLD) {
      return {
        outcome: "rug",
        reason: `Liquidity dropped ${(liquidityDropPercent * 100).toFixed(0)}% (${token.initialLiquidity.toFixed(2)} → ${currentLiq.toFixed(2)} SOL)`,
      };
    }
  }

  // Zero or near-zero current liquidity with positive initial = rug
  if (hasCurrentLiquidity(token)) {
    const currentLiq = token.currentLiquidity!;
    if (
      currentLiq < MIN_LIQUIDITY_THRESHOLD &&
      token.initialLiquidity &&
      token.initialLiquidity >= MIN_LIQUIDITY_THRESHOLD
    ) {
      return {
        outcome: "rug",
        reason: `Liquidity removed (was ${token.initialLiquidity.toFixed(2)} SOL, now ${currentLiq.toFixed(4)} SOL)`,
      };
    }
  }

  // Zero initial liquidity = likely a rug or scam
  if (
    token.initialLiquidity !== null &&
    token.initialLiquidity !== undefined &&
    token.initialLiquidity === 0 &&
    !hasCurrentLiquidity(token)
  ) {
    return { outcome: "rug", reason: "Zero initial liquidity" };
  }

  // === SUCCESS INDICATORS (strict criteria) ===

  // Success requires: locked liquidity + many holders + meaningful liquidity
  const hasGoodHolders = (token.holdersAfter7Days ?? 0) >= MIN_SUCCESS_HOLDERS;
  const hasGoodLiquidity =
    hasCurrentLiquidity(token) &&
    token.currentLiquidity! >= MIN_SUCCESS_LIQUIDITY;
  const hasLockedLiquidity = token.liquidityLocked === true;
  const hasLowConcentration =
    token.holderConcentrationRisk === "low" ||
    token.holderConcentrationRisk === null;
  // At this point, we've already returned if isHoneypot === true or honeypotRiskLevel is "high"/"critical"
  // So isNotHoneypot is always true here, but we keep the variable for readability
  const isNotHoneypot = true;

  // High holder concentration is a warning even if other metrics look good
  if (token.holderConcentrationRisk === "high") {
    return {
      outcome: "unknown",
      reason: `High holder concentration: top 10 hold ${token.top10HolderPercentage?.toFixed(1) || ">60"}% of supply`,
    };
  }

  // Medium honeypot risk is a warning
  if (token.honeypotRiskLevel === "medium") {
    return {
      outcome: "unknown",
      reason: `Medium honeypot risk detected - proceed with caution`,
    };
  }

  // Strong success: locked liquidity + many holders (300+) + no red flags (STRICTER)
  if (
    hasLockedLiquidity &&
    (token.holdersAfter7Days ?? 0) >= 300 &&
    isNotHoneypot &&
    hasLowConcentration
  ) {
    return {
      outcome: "success",
      reason: "Liquidity locked & many holders (300+) & no red flags",
    };
  }

  // Strong success: locked liquidity + many holders (250+) - legacy check (STRICTER)
  if (hasLockedLiquidity && (token.holdersAfter7Days ?? 0) >= 250) {
    return {
      outcome: "success",
      reason: "Liquidity locked & many holders (250+)",
    };
  }

  // If we have meaningful current liquidity, evaluate further
  if (hasCurrentLiquidity(token)) {
    const currentLiq = token.currentLiquidity!;

    // Check for moderate dev sell ratio (40-60%) - warning sign (STRICTER)
    const hasModerateDevSell =
      token.devSellRatio !== null &&
      token.devSellRatio !== undefined &&
      token.devSellRatio >= 0.4 &&
      token.devSellRatio <= 0.6;

    if (hasModerateDevSell) {
      return {
        outcome: "unknown",
        reason: `Dev sold ${(token.devSellRatio! * 100).toFixed(1)}% of tokens - HIGH CONCERN`,
      };
    }

    // Very low liquidity = unknown, not success
    if (currentLiq < MIN_SUCCESS_LIQUIDITY) {
      return {
        outcome: "unknown",
        reason: `Low liquidity: ${currentLiq.toFixed(2)} SOL (needs ${MIN_SUCCESS_LIQUIDITY}+ SOL for success)`,
      };
    }

    // Check liquidity retention if we have initial data
    if (token.initialLiquidity && token.initialLiquidity > 0) {
      const retainedPercent = (currentLiq / token.initialLiquidity) * 100;

      if (retainedPercent < 50) {
        return {
          outcome: "unknown",
          reason: `Liquidity declining: ${currentLiq.toFixed(2)} SOL (${retainedPercent.toFixed(0)}% of initial)`,
        };
      }

      // Good liquidity retention - check holders for success
      if (hasGoodHolders) {
        return {
          outcome: "success",
          reason: `Active: ${currentLiq.toFixed(2)} SOL liquidity, ${token.holdersAfter7Days} holders`,
        };
      }

      // Good liquidity but few holders = unknown
      return {
        outcome: "unknown",
        reason: `Active liquidity (${currentLiq.toFixed(2)} SOL) but only ${token.holdersAfter7Days ?? 0} holders`,
      };
    }

    // No initial liquidity data - need holders for success
    if (hasGoodHolders) {
      return {
        outcome: "success",
        reason: `Active: ${currentLiq.toFixed(2)} SOL liquidity, ${token.holdersAfter7Days} holders`,
      };
    }

    // Has liquidity but insufficient holder data
    return {
      outcome: "unknown",
      reason: `Active liquidity (${currentLiq.toFixed(2)} SOL) but insufficient holder data`,
    };
  }

  // === INSUFFICIENT DATA CASES ===

  // Locked liquidity but no current liquidity data
  if (token.liquidityLocked === true) {
    if (token.initialLiquidity && token.initialLiquidity > 0) {
      return {
        outcome: "unknown",
        reason: "Liquidity locked but unable to verify current status",
      };
    }
    return {
      outcome: "unknown",
      reason: "Liquidity locked but no liquidity data available",
    };
  }

  // Has initial liquidity but no current data
  if (
    token.initialLiquidity &&
    token.initialLiquidity > 0 &&
    !hasCurrentLiquidity(token)
  ) {
    return {
      outcome: "unknown",
      reason: "Unable to verify current liquidity status",
    };
  }

  // Very few holders = unknown regardless of other factors
  if (
    token.holdersAfter7Days !== null &&
    token.holdersAfter7Days !== undefined &&
    token.holdersAfter7Days < 10
  ) {
    return {
      outcome: "unknown",
      reason: `Very few holders (${token.holdersAfter7Days}) - insufficient adoption`,
    };
  }

  return {
    outcome: "unknown",
    reason: "Insufficient data to determine outcome",
  };
}

/**
 * Check if token has positive initial or current liquidity
 */
function hasPositiveLiquidity(token: TokenSummary): boolean {
  const initialLiq = token.initialLiquidity;
  const currentLiq = token.currentLiquidity;

  return (
    (initialLiq !== null && initialLiq !== undefined && initialLiq > 0) ||
    (currentLiq !== null && currentLiq !== undefined && currentLiq > 0)
  );
}

/**
 * Check if token has current liquidity data
 */
function hasCurrentLiquidity(token: TokenSummary): boolean {
  const currentLiq = token.currentLiquidity;
  return currentLiq !== null && currentLiq !== undefined;
}
