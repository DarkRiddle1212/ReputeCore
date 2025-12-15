import type { Metadata } from "next";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "ReputeCore - Web3 Trust Scoring",
  description:
    "Professional Web3 wallet reputation analysis and trust scoring platform",
  keywords: [
    "Web3",
    "DeFi",
    "Trust Score",
    "Wallet Analysis",
    "Blockchain",
    "Ethereum",
    "Solana",
  ],
  authors: [{ name: "ReputeCore Team" }],
  openGraph: {
    title: "ReputeCore - Web3 Trust Scoring",
    description:
      "Analyze any wallet or project. Instant AI-powered trust scores.",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ErrorBoundary>
          {children}
          <Toaster />
        </ErrorBoundary>
      </body>
    </html>
  );
}
