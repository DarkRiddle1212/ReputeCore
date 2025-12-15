// Simple test script to verify Solana wallet analysis
const testAddress = "ZiiFREt76X1vn5ySW5nza1Z31WhbPi4DWaH8NmVpAVA";

async function testAnalyze() {
  console.log(`Testing Solana wallet analysis for: ${testAddress}`);
  console.log("This may take a minute...\n");

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: testAddress, forceRefresh: true }),
    });

    const data = await response.json();

    // Get tokens from the correct path
    const tokens = data.tokenLaunchSummary?.tokens || data.tokens || [];

    console.log("=== API Response ===");
    console.log(`Status: ${response.status}`);
    console.log(`Cached: ${data.cached || false}`);
    console.log(`Blockchain: ${data.blockchain}`);
    console.log(`Score: ${data.score}`);
    console.log(`Wallet Age: ${data.walletInfo?.age}`);
    console.log(`Transaction Count: ${data.walletInfo?.txCount}`);
    console.log(`Tokens Found: ${tokens.length}`);

    if (data.tokenLaunchSummary) {
      console.log(`  - Succeeded: ${data.tokenLaunchSummary.succeeded}`);
      console.log(`  - Rugged: ${data.tokenLaunchSummary.rugged}`);
      console.log(`  - Unknown: ${data.tokenLaunchSummary.unknown}`);
    }

    if (tokens.length > 0) {
      console.log("\n=== Token Details (first 5) ===");
      tokens.slice(0, 5).forEach((token, i) => {
        console.log(
          `\n${i + 1}. ${token.name || "Unknown"} (${token.symbol || "N/A"})`
        );
        console.log(`   Address: ${token.token}`);
        console.log(`   Initial Liquidity: ${token.initialLiquidity || 0} SOL`);
        console.log(`   Current Liquidity: ${token.currentLiquidity || "N/A"}`);
        console.log(`   Holders: ${token.holdersAfter7Days || "N/A"}`);
        console.log(
          `   Dev Sell Ratio: ${token.devSellRatio !== undefined ? (token.devSellRatio * 100).toFixed(1) + "%" : "N/A"}`
        );
        console.log(`   Outcome: ${token.outcome || "unknown"}`);
        console.log(`   Reason: ${token.reason || "N/A"}`);
      });
    }

    console.log("\n=== Score Breakdown ===");
    if (data.breakdown) {
      Object.entries(data.breakdown).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    }

    console.log("\n=== Confidence ===");
    if (data.confidence) {
      console.log(`  Level: ${data.confidence.level}`);
      console.log(`  Reason: ${data.confidence.reason}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testAnalyze();
