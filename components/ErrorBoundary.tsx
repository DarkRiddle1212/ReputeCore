"use client";

import React from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <Card className="bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Something went wrong
          </h2>
        </div>

        <p className="text-red-700 dark:text-red-300 mb-4">
          We encountered an unexpected error. Please try again or contact
          support if the problem persists.
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm text-red-600 dark:text-red-400 mb-2">
              Error Details (Development)
            </summary>
            <pre className="text-xs bg-red-100 dark:bg-red-900 p-3 rounded overflow-auto">
              {error.message}
              {error.stack}
            </pre>
          </details>
        )}

        <Button
          onClick={resetErrorBoundary}
          variant="outline"
          className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export function ErrorBoundary({
  children,
  fallback: Fallback = ErrorFallback,
  onError,
}: ErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      FallbackComponent={Fallback}
      onError={(error, errorInfo) => {
        console.error("Error caught by boundary:", error, errorInfo);
        onError?.(error, errorInfo);

        // TODO: Send to error tracking service
        // Sentry.captureException(error, { extra: errorInfo });
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
