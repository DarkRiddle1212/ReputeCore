"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListPlus,
  Info,
} from "lucide-react";
import type { AnalyzeResponse, AnalysisHistoryItem } from "@/types";
import { detectBlockchain } from "@/lib/validation";
import { parseTokenInput } from "@/lib/validation/tokenValidation";

interface AnalyzeFormProps {
  onResult?: (result: AnalyzeResponse, address?: string) => void;
}

const loadingSteps = [
  { label: "Connecting to blockchain", duration: 2000 },
  { label: "Fetching wallet data", duration: 4000 },
  { label: "Analyzing token history", duration: 6000 },
  { label: "Computing trust score", duration: 3000 },
];

export default function AnalyzeForm({ onResult }: AnalyzeFormProps) {
  const [address, setAddress] = useState("");
  const [tokens, setTokens] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [detectedBlockchain, setDetectedBlockchain] = useState<
    "ethereum" | "solana" | null
  >(null);
  const [tokenCount, setTokenCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("reputecore_analysis_history");
    if (stored) {
      try {
        setHistory(JSON.parse(stored).slice(0, 5));
      } catch (e) {
        console.error("Failed to parse history:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (address.trim().length > 10) {
      const detection = detectBlockchain(address.trim());
      if (detection.valid) {
        setDetectedBlockchain(detection.blockchain);
      } else {
        setDetectedBlockchain(null);
      }
    } else {
      setDetectedBlockchain(null);
    }
  }, [address]);

  useEffect(() => {
    if (tokens.trim()) {
      const parsed = parseTokenInput(tokens);
      setTokenCount(parsed.length);
    } else {
      setTokenCount(0);
    }
  }, [tokens]);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      setProgress(0);
      return;
    }

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < loadingSteps.length - 1 ? prev + 1 : prev
      );
    }, 3500);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + Math.random() * 8, 95));
    }, 500);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [loading]);

  const saveToHistory = (address: string, result: AnalyzeResponse) => {
    const newItem: AnalysisHistoryItem = {
      address,
      timestamp: Date.now(),
      result,
    };
    const updated = [
      newItem,
      ...history.filter((h) => h.address !== address),
    ].slice(0, 5);
    setHistory(updated);
    localStorage.setItem(
      "reputecore_analysis_history",
      JSON.stringify(updated)
    );
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!address || address.length < 3) {
      setError("Please enter a valid address");
      return;
    }

    setLoading(true);
    setProgress(0);

    try {
      const normalizedAddress = address.trim();
      const parsedTokens = tokens.trim() ? parseTokenInput(tokens) : undefined;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: normalizedAddress,
          forceRefresh: false,
          tokens: parsedTokens,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Analysis failed");
        return;
      }

      setProgress(100);
      saveToHistory(normalizedAddress, json);

      setTimeout(() => {
        if (onResult) onResult(json, normalizedAddress);
      }, 300);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-4">
      {/* Main Input Card */}
      <div className="glass-card rounded-md p-4 sm:p-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="address-input"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Wallet Address
            </label>
            <Input
              id="address-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && submit(e)}
              className="w-full h-10 px-3 bg-slate-900/40 border-slate-700/50 text-white text-sm placeholder:text-slate-500 focus:border-blue-500/50 rounded-md"
              placeholder="0x... (ETH) or base58 (SOL)"
              disabled={loading}
            />
          </div>

          {/* Token Input Field - Only show for Ethereum */}
          <AnimatePresence>
            {detectedBlockchain === "ethereum" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="tokens-input"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400"
                  >
                    <ListPlus className="w-3.5 h-3.5 text-blue-400" />
                    Token Addresses (Optional)
                  </label>
                  {tokenCount > 0 && (
                    <span className="text-[10px] text-slate-500">
                      {tokenCount} token{tokenCount !== 1 ? "s" : ""} • Max 10
                    </span>
                  )}
                </div>
                <Textarea
                  id="tokens-input"
                  value={tokens}
                  onChange={(e) => setTokens(e.target.value)}
                  className="w-full min-h-[80px] p-2.5 bg-slate-900/40 border-slate-700/50 text-white text-sm placeholder:text-slate-500 focus:border-blue-500/50 rounded-md resize-none font-mono"
                  placeholder="0x1234...&#10;0xabcd..."
                  disabled={loading}
                />
                <p className="text-[10px] text-slate-500 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Manually specify token addresses to analyze instead of auto-discovery.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={loading || !address.trim()}
            className="w-full h-10 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Analyze Wallet
              </span>
            )}
          </Button>

          {/* Loading Progress */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 pt-1"
              >
                <div className="space-y-1.5">
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{loadingSteps[loadingStep]?.label}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {loadingSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-1.5 text-[10px] ${
                        idx <= loadingStep ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {idx < loadingStep ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      ) : idx === loadingStep ? (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-slate-700 flex-shrink-0" />
                      )}
                      <span className="truncate">{step.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-500/20"
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="text-xs text-red-400">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* Recent History */}
      {history.length > 0 && (
        <div className="glass-card rounded-md p-4 sm:p-5">
          <h3 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Recent Analyses
          </h3>
          <div className="space-y-1.5">
            {history.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setAddress(item.address);
                  if (onResult) onResult(item.result, item.address);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-md bg-slate-800/30 hover:bg-slate-800/50 border border-slate-800/40 hover:border-slate-700/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-400 truncate">
                    {item.address.slice(0, 8)}...{item.address.slice(-6)}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-medium ${getScoreColor(item.result.score)}`}>
                  {item.result.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sample Addresses */}
      <div className="glass-card rounded-md p-4 sm:p-5">
        <h3 className="text-xs font-medium text-slate-400 mb-3">
          Sample Addresses
        </h3>
        <div className="space-y-1.5">
          {[
            {
              label: "Vitalik.eth (ETH)",
              address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            },
            {
              label: "Sample Solana Wallet",
              address: "Azw1V43ekNWwiTRMeLfBq6Mz9HHuD21PnSFNQnBLWk2s",
            },
          ].map((sample, idx) => (
            <button
              key={idx}
              onClick={() => setAddress(sample.address)}
              className="w-full flex items-center justify-between p-2.5 rounded-md bg-slate-800/30 hover:bg-slate-800/50 border border-slate-800/40 hover:border-slate-700/50 transition-colors text-left"
            >
              <span className="text-xs text-slate-300">{sample.label}</span>
              <span className="text-[10px] font-mono text-slate-500">
                {sample.address.slice(0, 6)}...{sample.address.slice(-4)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
