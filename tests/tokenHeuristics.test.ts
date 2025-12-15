import { describe, it, expect } from "@jest/globals";
import { determineOutcome } from "@/lib/tokenHeuristics";
import type { TokenSummary } from "@/types/token";

describe("determineOutcome", () => {
  it("should return success for locked liquidity with many holders", () => {
    const token: TokenSummary = {
      token: "0x123",
      liquidityLocked: true,
      holdersAfter7Days: 250,
    };

    const result = determineOutcome(token);
    expect(result.outcome).toBe("success");
    expect(result.reason).toBe("Liquidity locked & many holders");
  });

  it("should return rug for high dev sell ratio", () => {
    const token: TokenSummary = {
      token: "0x123",
      devSellRatio: 0.7,
    };

    const result = determineOutcome(token);
    expect(result.outcome).toBe("rug");
    expect(result.reason).toBe("High developer sell-off ratio");
  });

  it("should return rug for zero initial liquidity", () => {
    const token: TokenSummary = {
      token: "0x123",
      initialLiquidity: 0,
    };

    const result = determineOutcome(token);
    expect(result.outcome).toBe("rug");
    expect(result.reason).toBe("Zero initial liquidity");
  });

  it("should return unknown for insufficient data", () => {
    const token: TokenSummary = {
      token: "0x123",
    };

    const result = determineOutcome(token);
    expect(result.outcome).toBe("unknown");
    expect(result.reason).toBe("Insufficient data to determine outcome");
  });

  it("should handle edge cases gracefully", () => {
    const token: TokenSummary = {
      token: "0x123",
      liquidityLocked: true,
      holdersAfter7Days: 150, // Below threshold
    };

    const result = determineOutcome(token);
    expect(result.outcome).toBe("unknown");
  });
});
