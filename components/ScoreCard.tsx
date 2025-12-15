"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  ChevronDown,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  Lock,
  Unlock,
  ExternalLink,
  BarChart3,
  Activity,
  Info,
  ShieldCheck,
  ShieldAlert,
  ListPlus,
} from "lucide-react";
import type { AnalyzeResponse } from "@/types";

interface ScoreCardProps {
  result: AnalyzeResponse;
}

export default function ScoreCard({ result }: ScoreCardProps) {
  const {
    score,
    reason,
    tokenLaunchSummary = {
      totalLaunched: 0,
      succeeded: 0,
      rugged: 0,
      unknown: 0,
      tokens: [],
    },
  } = result;
  const [expanded, setExpanded] = useState(false);

  const blockchain =
    (result as any).blockchain ||
    (result.metadata as any)?.blockchain ||
    "ethereum";

  const getTokenExplorerUrl = (tokenAddress: string) => {
    if (blockchain === "solana") {
      return `https://solscan.io/token/${tokenAddress}`;
    }
    return `https://etherscan.io/token/${tokenAddress}`;
  };

  const getRiskConfig = () => {
    if (score >= 80)
      return {
        level: "Low Risk",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        ringColor: "#10b981",
        icon: CheckCircle,
      };
    if (score >= 60)
      return {
        level: "Medium Risk",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        ringColor: "#f59e0b",
        icon: AlertTriangle,
      };
    if (score >= 40)
      return {
        level: "High Risk",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        ringColor: "#f97316",
        icon: AlertTriangle,
      };
    return {
      level: "Critical Risk",
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      ringColor: "#ef4444",
      icon: XCircle,
    };
  };

  const riskConfig = getRiskConfig();
  const RiskIcon = riskConfig.icon;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case "success":
        return {
          bg: "bg-emerald-500/10",
          text: "text-emerald-400",
          border: "border-emerald-500/20",
          icon: CheckCircle,
          label: "Success",
        };
      case "rug":
        return {
          bg: "bg-red-500/10",
          text: "text-red-400",
          border: "border-red-500/20",
          icon: XCircle,
          label: "Rugged",
        };
      default:
        return {
          bg: "bg-slate-500/10",
          text: "text-slate-400",
          border: "border-slate-500/20",
          icon: Activity,
          label: "Unknown",
        };
    }
  };

  const getVerificationBadge = (verified?: boolean) => {
    if (verified === true) {
      return {
        bg: "bg-blue-500/10",
        text: "text-blue-400",
        border: "border-blue-500/20",
        icon: ShieldCheck,
      };
    } else if (verified === false) {
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        icon: ShieldAlert,
      };
    }
    return null;
  };

  return (
    <div className="glass-card rounded-md overflow-hidden">
      {/* Top Border Accent */}
      <div
        className="h-0.5"
        style={{ backgroundColor: riskConfig.ringColor }}
      />

      <div className="p-4 sm:p-6">
        {/* Score Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
          {/* Score Ring */}
          <div className="relative flex-shrink-0">
            <div className="w-28 h-28 sm:w-32 sm:h-32">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 140 140"
              >
                <circle
                  cx="70"
                  cy="70"
                  r="54"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="none"
                  className="text-slate-800/50"
                />
                <motion.circle
                  cx="70"
                  cy="70"
                  r="54"
                  stroke={riskConfig.ringColor}
                  strokeWidth="6"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeLinecap="round"
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: offset }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl sm:text-4xl font-semibold ${riskConfig.color}`}>
                  {score}
                </span>
                <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">
                  Trust Score
                </span>
              </div>
            </div>
          </div>

          {/* Score Details */}
          <div className="flex-1 text-center sm:text-left">
            {/* Risk Badge */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${riskConfig.bg} ${riskConfig.border} border ${riskConfig.color}`}
              >
                <RiskIcon className="w-3.5 h-3.5" />
                {riskConfig.level}
              </div>

              {result.confidence && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-slate-800/50 border border-slate-700/50 text-slate-400">
                  <BarChart3 className="w-3 h-3" />
                  {result.confidence.level}
                </div>
              )}

              {(result as any).discoveryMode && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${
                    (result as any).discoveryMode === "manual"
                      ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                  } border`}
                >
                  {(result as any).discoveryMode === "manual" ? (
                    <ListPlus className="w-3 h-3" />
                  ) : (
                    <Activity className="w-3 h-3" />
                  )}
                  {(result as any).discoveryMode === "manual"
                    ? "Manual"
                    : "Auto"}
                </div>
              )}
            </div>

            {/* Reason */}
            <p className="text-sm text-slate-400 leading-relaxed">
              {(result as any).aiSummary || reason}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="stat-card text-center py-3">
            <p className="text-lg sm:text-xl font-semibold text-white">
              {tokenLaunchSummary.totalLaunched}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide mt-0.5">
              Launched
            </p>
          </div>
          <div className="stat-card text-center py-3 bg-emerald-500/5 border-emerald-500/10">
            <p className="text-lg sm:text-xl font-semibold text-emerald-400">
              {tokenLaunchSummary.succeeded}
            </p>
            <p className="text-[10px] sm:text-xs text-emerald-500/70 uppercase tracking-wide mt-0.5">
              Success
            </p>
          </div>
          <div className="stat-card text-center py-3 bg-red-500/5 border-red-500/10">
            <p className="text-lg sm:text-xl font-semibold text-red-400">
              {tokenLaunchSummary.rugged}
            </p>
            <p className="text-[10px] sm:text-xs text-red-500/70 uppercase tracking-wide mt-0.5">
              Rugged
            </p>
          </div>
        </div>

        {/* Token List */}
        {tokenLaunchSummary.tokens.length > 0 && (
          <div className="border-t border-slate-800/50 pt-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between text-sm text-slate-400 hover:text-slate-300 transition-colors py-1"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Token Analysis
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-500">
                  {tokenLaunchSummary.tokens.length}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 space-y-2 max-h-[400px] overflow-auto"
                >
                  {tokenLaunchSummary.tokens.map((token, idx) => {
                    const badge = getOutcomeBadge(token.outcome || "unknown");
                    const BadgeIcon = badge.icon;
                    return (
                      <div
                        key={idx}
                        className="p-3 sm:p-4 rounded-md bg-slate-900/30 border border-slate-800/40"
                      >
                        {/* Token Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${
                                token.outcome === "success"
                                  ? "bg-emerald-600"
                                  : token.outcome === "rug"
                                    ? "bg-red-600"
                                    : "bg-slate-600"
                              }`}
                            >
                              {token.symbol?.slice(0, 2).toUpperCase() || "??"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-medium text-white truncate">
                                  {token.name || token.symbol || "Unknown"}
                                </h4>
                                {(() => {
                                  const verificationBadge = getVerificationBadge(
                                    (token as any).verified
                                  );
                                  if (verificationBadge) {
                                    const VerificationIcon = verificationBadge.icon;
                                    return (
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${verificationBadge.bg} ${verificationBadge.text} ${verificationBadge.border} border`}
                                      >
                                        <VerificationIcon className="w-2.5 h-2.5" />
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <a
                                href={getTokenExplorerUrl(token.token)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] sm:text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1"
                              >
                                {token.token.slice(0, 8)}...{token.token.slice(-6)}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] sm:text-xs font-medium ${badge.bg} ${badge.text} ${badge.border} border flex-shrink-0`}
                          >
                            <BadgeIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        </div>

                        {/* Verification Warning */}
                        {(token as any).verificationWarning && (
                          <div className="flex items-start gap-2 mb-3 p-2 rounded bg-amber-500/5 border border-amber-500/10">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-xs text-amber-400">
                              {(token as any).verificationWarning}
                            </p>
                          </div>
                        )}

                        {/* Token Reason */}
                        {token.reason && (
                          <div className="flex items-start gap-2 mb-3 p-2 rounded bg-slate-800/30">
                            <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] sm:text-xs text-slate-500 italic">
                              {token.reason}
                            </p>
                          </div>
                        )}

                        {/* Token Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {token.holdersAfter7Days != null && (
                            <div className="flex items-center gap-2 p-2 rounded bg-slate-800/20">
                              <Users className="w-3.5 h-3.5 text-blue-400" />
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Holders</p>
                                <p className="text-xs font-medium text-white">
                                  {token.holdersAfter7Days.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          )}
                          {(token.initialLiquidity != null ||
                            (token as any).currentLiquidity != null) && (
                            <div className="flex items-center gap-2 p-2 rounded bg-slate-800/20">
                              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">
                                  {(token as any).currentLiquidity != null ? "Liq." : "Init Liq."}
                                </p>
                                <p className="text-xs font-medium text-white">
                                  {blockchain === "solana" ? "" : "$"}
                                  {(
                                    (token as any).currentLiquidity ?? token.initialLiquidity
                                  )?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                              </div>
                            </div>
                          )}
                          {token.devSellRatio != null && (
                            <div className="flex items-center gap-2 p-2 rounded bg-slate-800/20">
                              <BarChart3
                                className={`w-3.5 h-3.5 ${
                                  token.devSellRatio >= 0.5
                                    ? "text-red-400"
                                    : token.devSellRatio >= 0.25
                                      ? "text-amber-400"
                                      : "text-emerald-400"
                                }`}
                              />
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Dev Sell</p>
                                <p
                                  className={`text-xs font-medium ${
                                    token.devSellRatio >= 0.5
                                      ? "text-red-400"
                                      : token.devSellRatio >= 0.25
                                        ? "text-amber-400"
                                        : "text-emerald-400"
                                  }`}
                                >
                                  {(token.devSellRatio * 100).toFixed(0)}%
                                </p>
                              </div>
                            </div>
                          )}
                          {token.liquidityLocked != null && (
                            <div className="flex items-center gap-2 p-2 rounded bg-slate-800/20">
                              {token.liquidityLocked ? (
                                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-red-400" />
                              )}
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase">Liquidity</p>
                                <p
                                  className={`text-xs font-medium ${
                                    token.liquidityLocked ? "text-emerald-400" : "text-red-400"
                                  }`}
                                >
                                  {token.liquidityLocked ? "Locked" : "Unlocked"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
