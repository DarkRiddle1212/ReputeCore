async function test() {
  try {
    const response = await fetch("http://localhost:3001/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "GKzLcdPQLZwxiaFDfBUj9Gz77wU13eQzDfkjHYXLSbCs",
        forceRefresh: true,
      }),
    });
    const result = await response.json();
    console.log("=== WALLET ANALYSIS ===");
    console.log("Score:", result.score);
    console.log("Wallet Age:", result.walletInfo?.age);
    console.log("TX Count:", result.walletInfo?.txCount);
    console.log(
      "Total Launched:",
      result.tokenLaunchSummary?.totalLaunched || 0
    );
    console.log("\n=== TOKENS ===");
    for (const token of result.tokenLaunchSummary?.tokens || []) {
      console.log(`\n${token.name} (${token.symbol}):`);
      console.log(`  - Outcome: ${token.outcome}`);
      console.log(`  - Reason: ${token.reason}`);
      console.log(
        `  - Dev Sell Ratio: ${(token.devSellRatio * 100).toFixed(1)}%`
      );
      console.log(`  - Holders: ${token.holdersAfter7Days}`);
      console.log(`  - Initial Liquidity: ${token.initialLiquidity}`);
      console.log(`  - Current Liquidity: ${token.currentLiquidity}`);
    }
    console.log("\n=== NOTES ===");
    result.notes?.forEach((n) => console.log(n));
  } catch (error) {
    console.error("Error:", error.message);
  }
}
test();
