export type TokenSummary = {
  token: string;
  name?: string | null;
  symbol?: string | null;
  creator?: string | null;
  launchAt?: string | null;
  initialLiquidity?: number | null;
  currentLiquidity?: number | null;
  holdersAfter7Days?: number | null;
  liquidityLocked?: boolean | null;
  devSellRatio?: number | null;
  verified?: boolean;
  verificationWarning?: string;
  // Honeypot detection fields
  isHoneypot?: true | false | null;
  honeypotReason?: string | null;
  honeypotRiskLevel?: "none" | "low" | "medium" | "high" | "critical" | null;
  // Holder concentration fields
  holderConcentrationRisk?: "low" | "medium" | "high" | "critical" | null;
  top10HolderPercentage?: number | null;
};
