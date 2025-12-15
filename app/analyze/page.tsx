"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import AnalyzeForm from "@/components/AnalyzeForm";
import ScoreCard from "@/components/ScoreCard";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  Database,
  Shield,
  Activity,
  TrendingUp,
  Users,
  Wallet,
  Calendar,
  Hash,
  Layers,
} from "lucide-react";
import type { AnalyzeResponse } from "@/types";

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "Unknown";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
};

const formatRelativeTime = (dateString: string | null | undefined) => {
  if (!dateString) return "";
  try {
    const diffDays = Math.floor(
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return "";
  }
};

const ScoreBreakdownBar = ({
  label,
  score,
  icon: Icon,
  color,
}: {
  label: string;
  score: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs sm:text-sm text-slate-400">{label}</span>
      </div>
      <span className={`text-xs sm:text-sm font-medium ${color}`}>
        {Math.round(score)}
      </span>
    </div>
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full bg-gradient-to-r ${
          color.includes("blue")
            ? "from-blue-500 to-blue-400"
            : color.includes("purple")
              ? "from-purple-500 to-purple-400"
              : color.includes("emerald")
                ? "from-emerald-500 to-emerald-400"
                : "from-amber-500 to-amber-400"
        }`}
      />
    </div>
  </div>
);

export default function AnalyzePage() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);

  const handleResult = (data: AnalyzeResponse, address?: string) => {
    if (address) setCurrentAddress(address);
    setResult(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-slate-800/40 sticky top-0 z-50 bg-[#0a0f1a]/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-5">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-blue-600 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </div>
                <span className="text-sm sm:text-base font-semibold text-white hidden sm:inline tracking-tight">
                  ReputeCore
                </span>
              </Link>
              <Link
                href="/"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Mainnet</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {/* Page Title */}
        <div className="mb-5 sm:mb-6">
          <h1 className="text-lg sm:text-xl font-semibold text-white mb-0.5 tracking-tight">
            Wallet Analysis
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Enter any wallet address for comprehensive insights
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-12 gap-5 lg:gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-4 order-1">
            <div className="lg:sticky lg:top-24">
              <AnalyzeForm onResult={handleResult} />
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="lg:col-span-8 space-y-4 order-2">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key={currentAddress || "result"}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {/* Score Card */}
                  <ScoreCard result={result} />

                  {/* Info Grid */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Wallet Info */}
                    <div className="glass-card rounded-md p-4">
                      <h3 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-blue-400" />
                        Wallet Info
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Calendar className="w-3 h-3" />
                            <span className="text-xs">Created</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-medium text-white">
                              {formatDate(result.walletInfo?.createdAt)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {formatRelativeTime(result.walletInfo?.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs">Age</span>
                          </div>
                          <span className="text-xs font-medium text-white">
                            {result.walletInfo?.age || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Activity className="w-3 h-3" />
                            <span className="text-xs">Transactions</span>
                          </div>
                          <span className="text-xs font-medium text-white">
                            {result.walletInfo?.txCount?.toLocaleString() ?? 0}
                          </span>
                        </div>
                        {result.walletInfo?.firstTxHash && (
                          <div className="pt-2">
                            <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
                              <Hash className="w-3 h-3" />
                              <span className="text-xs">First Transaction</span>
                            </div>
                            <a
                              href={
                                result.blockchain === "solana"
                                  ? `https://solscan.io/tx/${result.walletInfo.firstTxHash}`
                                  : `https://etherscan.io/tx/${result.walletInfo.firstTxHash}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 break-all"
                            >
                              {result.walletInfo.firstTxHash.slice(0, 18)}...
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score Breakdown */}
                    {result.breakdown && (
                      <div className="glass-card rounded-md p-4">
                        <h3 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-400" />
                          Score Breakdown
                        </h3>
                        <div className="space-y-3">
                          <ScoreBreakdownBar
                            label="Wallet Age"
                            score={result.breakdown.walletAgeScore || 0}
                            icon={Clock}
                            color="text-blue-400"
                          />
                          <ScoreBreakdownBar
                            label="Activity"
                            score={result.breakdown.activityScore || 0}
                            icon={Activity}
                            color="text-purple-400"
                          />
                          <ScoreBreakdownBar
                            label="Token Outcomes"
                            score={result.breakdown.tokenOutcomeScore || 0}
                            icon={TrendingUp}
                            color="text-emerald-400"
                          />
                          <ScoreBreakdownBar
                            label="Heuristics"
                            score={result.breakdown.heuristicsScore || 0}
                            icon={Users}
                            color="text-amber-400"
                          />
                          <div className="pt-2.5 border-t border-slate-800/40">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-400">
                                Final Score
                              </span>
                              <span className="text-lg font-semibold text-white">
                                {result.breakdown.final || result.score}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  {result.metadata && (
                    <div className="glass-card rounded-md p-4">
                      <h3 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-cyan-400" />
                        Analysis Metadata
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-800/40 text-xs">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-500">Processing:</span>
                          <span className="font-medium text-white">
                            {result.metadata.processingTime}ms
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-800/40 text-xs">
                          <Database className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-500">Source:</span>
                          <span
                            className={`font-medium ${
                              result.metadata.cached
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {result.metadata.cached ? "Cached" : "Fresh"}
                          </span>
                        </div>
                        {result.metadata.providersUsed?.map((p, i) => (
                          <span
                            key={i}
                            className="px-2 py-1.5 rounded bg-blue-500/10 text-blue-400 text-xs font-medium"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {result.notes && result.notes.length > 0 && (
                    <div className="glass-card rounded-md p-4">
                      <h3 className="text-xs font-medium text-slate-400 mb-2.5">
                        Analysis Notes
                      </h3>
                      <ul className="space-y-1.5">
                        {result.notes.map((note, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs text-slate-500"
                          >
                            <span className="text-slate-600">•</span>
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="glass-card rounded-md p-8 sm:p-10 text-center"
                >
                  {/* Empty State */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 rounded-md bg-slate-800/50 flex items-center justify-center">
                    <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-slate-600" />
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-white mb-1.5">
                    Ready to Analyze
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                    Enter a wallet address to get reputation insights, trust scores, and risk analysis.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
