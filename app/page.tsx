"use client";

import Link from "next/link";
import { Shield, ArrowRight, CheckCircle, BarChart2, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-semibold text-white tracking-tight">
                ReputeCore
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Mainnet</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto pt-16 sm:pt-20 md:pt-28 pb-16">
          <div className="max-w-xl mx-auto text-center">
            {/* Headline */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white mb-3 leading-tight tracking-tight">
              Wallet Reputation Analysis
            </h1>

            <p className="text-sm sm:text-base text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
              Trust scores and risk analysis for Ethereum & Solana wallets.
              Make informed decisions with on-chain data.
            </p>

            {/* CTA Button */}
            <Link href="/analyze">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                Start Analysis
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-3 gap-4 mt-16 sm:mt-20 max-w-3xl mx-auto">
            {[
              {
                icon: Shield,
                title: "Trust Scoring",
                desc: "0-100 reputation scores based on wallet history and behavior",
              },
              {
                icon: BarChart2,
                title: "Token Analysis",
                desc: "Track token launches, outcomes, and developer patterns",
              },
              {
                icon: Lock,
                title: "Risk Detection",
                desc: "Identify rug pulls, honeypots, and suspicious activity",
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="p-4 rounded-md bg-slate-900/40 border border-slate-800/50"
              >
                <feature.icon className="w-5 h-5 text-blue-500 mb-2.5" />
                <h3 className="text-white text-sm font-medium mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <p className="text-xs text-slate-600 text-center">
            © 2024 ReputeCore
          </p>
        </div>
      </footer>
    </div>
  );
}
