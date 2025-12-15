/**
 * AI Summary Service
 * Generates natural language summaries of wallet analysis using Groq AI
 */

import Groq from "groq-sdk";

interface AnalysisData {
  score: number;
  walletAge?: string;
  activity?: string;
  criticalRisks: string[];
  warnings: string[];
  positiveSignals: string[];
  tokenCount: number;
  confidence: string;
}

export class AISummaryService {
  private groq: Groq | null = null;
  private enabled: boolean = false;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;

    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.groq = new Groq({ apiKey });
        this.enabled = true;
        console.log("[AISummaryService] Groq AI enabled");
      } catch (error) {
        console.warn("[AISummaryService] Failed to initialize Groq:", error);
        this.enabled = false;
      }
    } else {
      console.log(
        "[AISummaryService] Groq API key not found - AI summaries disabled"
      );
      this.enabled = false;
    }
  }

  /**
   * Check if AI summaries are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate AI summary of wallet analysis
   */
  async generateSummary(data: AnalysisData): Promise<string | null> {
    if (!this.enabled || !this.groq) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(data);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a crypto wallet analyst. Provide clear, concise summaries for users evaluating wallet trustworthiness. Be direct and factual. Focus on the most important findings.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 250,
        top_p: 1,
      });

      const summary = completion.choices[0]?.message?.content?.trim();

      if (summary) {
        console.log("[AISummaryService] Generated summary successfully");
        return summary;
      }

      return null;
    } catch (error) {
      console.error("[AISummaryService] Failed to generate summary:", error);
      return null;
    }
  }

  /**
   * Build prompt for AI based on analysis data
   */
  private buildPrompt(data: AnalysisData): string {
    const parts: string[] = [];

    // Overall score and confidence
    parts.push(
      `Trust Score: ${data.score}/100 (${this.getScoreLabel(data.score)})`
    );
    parts.push(`Confidence: ${data.confidence}`);

    // Wallet basics
    if (data.walletAge) {
      parts.push(`Wallet Age: ${data.walletAge}`);
    }
    if (data.activity) {
      parts.push(`Activity: ${data.activity}`);
    }

    // Token information
    if (data.tokenCount > 0) {
      parts.push(`\nTokens Launched: ${data.tokenCount}`);
    }

    // Critical risks
    if (data.criticalRisks.length > 0) {
      parts.push(`\nCRITICAL RISKS:`);
      data.criticalRisks.forEach((risk) => parts.push(`- ${risk}`));
    }

    // Warnings
    if (data.warnings.length > 0) {
      parts.push(`\nWARNINGS:`);
      data.warnings
        .slice(0, 3)
        .forEach((warning) => parts.push(`- ${warning}`)); // Limit to top 3
    }

    // Positive signals
    if (data.positiveSignals.length > 0) {
      parts.push(`\nPOSITIVE SIGNALS:`);
      data.positiveSignals
        .slice(0, 3)
        .forEach((signal) => parts.push(`- ${signal}`)); // Limit to top 3
    }

    const dataText = parts.join("\n");

    return `Analyze this crypto wallet and provide a brief 2-3 sentence summary for a user trying to assess trustworthiness. Focus on the most important findings and be direct about risks or positive indicators.

${dataText}

Provide a clear, actionable summary:`;
  }

  /**
   * Get human-readable score label
   */
  private getScoreLabel(score: number): string {
    if (score >= 80) return "Highly Trustworthy";
    if (score >= 60) return "Moderately Trustworthy";
    if (score >= 40) return "Questionable";
    if (score >= 20) return "High Risk";
    return "Very High Risk";
  }
}

// Export singleton instance
export const aiSummaryService = new AISummaryService();
