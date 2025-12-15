"use client";

import { motion } from "framer-motion";
import { Loader2, Shield, TrendingUp, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AnalysisLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Score Card Skeleton */}
      <Card className="bg-[#0b0f1a] border-gray-800">
        <CardContent className="p-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 w-full h-full rounded-full border-8 border-gray-800"></div>
              <div className="w-16 h-16 bg-gray-800 rounded-full animate-pulse"></div>
            </div>
            <div className="w-48 h-4 bg-gray-800 rounded animate-pulse"></div>
          </div>
        </CardContent>
      </Card>

      {/* Details Skeleton */}
      <Card className="bg-[#071025] border-gray-800">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="w-20 h-3 bg-gray-800 rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="w-32 h-4 bg-gray-800 rounded animate-pulse"></div>
                <div className="w-24 h-4 bg-gray-800 rounded animate-pulse"></div>
                <div className="w-16 h-4 bg-gray-800 rounded animate-pulse"></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="w-28 h-3 bg-gray-800 rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="w-20 h-4 bg-gray-800 rounded animate-pulse"></div>
                <div className="w-16 h-4 bg-gray-800 rounded animate-pulse"></div>
                <div className="w-12 h-4 bg-gray-800 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface AnalysisLoadingProps {
  stage: "validating" | "fetching" | "analyzing" | "finalizing";
  progress?: number;
}

export function AnalysisLoading({ stage, progress = 0 }: AnalysisLoadingProps) {
  const stages = {
    validating: {
      icon: Shield,
      title: "Validating Address",
      description: "Checking address format and network...",
    },
    fetching: {
      icon: Database,
      title: "Fetching Data",
      description: "Retrieving transaction history and token data...",
    },
    analyzing: {
      icon: TrendingUp,
      title: "Analyzing Patterns",
      description: "Computing trust score and risk factors...",
    },
    finalizing: {
      icon: Loader2,
      title: "Finalizing Results",
      description: "Preparing comprehensive analysis...",
    },
  };

  const currentStage = stages[stage];
  const Icon = currentStage.icon;

  return (
    <Card className="bg-[#0b0f1a] border-gray-800">
      <CardContent className="p-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          <div className="relative">
            <Icon
              className={`w-16 h-16 mx-auto text-[#3b82f6] ${
                stage === "finalizing" ? "animate-spin" : ""
              }`}
            />
            {stage !== "finalizing" && (
              <motion.div
                className="absolute inset-0 w-16 h-16 mx-auto border-4 border-[#3b82f6] border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              {currentStage.title}
            </h3>
            <p className="text-gray-400">{currentStage.description}</p>
          </div>

          {progress > 0 && (
            <div className="w-full bg-gray-800 rounded-full h-2">
              <motion.div
                className="bg-[#3b82f6] h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}

          <div className="flex justify-center space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-[#3b82f6] rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

export function ButtonLoading({
  children,
  ...props
}: {
  children?: React.ReactNode;
  [key: string]: any;
}) {
  return (
    <button disabled className="opacity-50 cursor-not-allowed" {...props}>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      {children}
    </button>
  );
}
