// Test the improved outcome detection
const address = "GKzLcdPQLZwxiaFDfBUj9Gz77wU13eQzDfkjHYXLSbCs";
const fs = require("fs");

async function test() {
  try {
    const response = await fetch("http://localhost:3001/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, forceRefresh: true }),
    });

    const data = await response.json();

    const output = [];
    output.push("\n=== WALLET ANALYSIS ===");
    output.push("Address: " + address);
    output.push("Score: " + data.score);
    output.push("Blockchain: " + data.blockchain);

    output.push("\n=== TOKEN SUMMARY ===");
    output.push("Total: " + data.tokenLaunchSummary?.totalLaunched);
    output.push("Success: " + data.tokenLaunchSummary?.succeeded);
    output.push("Rugged: " + data.tokenLaunchSummary?.rugged);
    output.push("Unknown: " + data.tokenLaunchSummary?.unknown);

    output.push("\n=== TOKEN DETAILS ===");
    for (const token of data.tokenLaunchSummary?.tokens || []) {
      output.push("\n" + (token.name || token.symbol) + ":");
      output.push("  Outcome: " + token.outcome);
      output.push("  Reason: " + token.reason);
      output.push("  DevSellRatio: " + token.devSellRatio);
      output.push("  Holders: " + token.holdersAfter7Days);
      output.push("  Initial Liq: " + token.initialLiquidity);
      output.push("  Current Liq: " + token.currentLiquidity);
      output.push("  Locked: " + token.liquidityLocked);
    }

    const result = output.join("\n");
    fs.writeFileSync("test-result.txt", result);
    console.log(result);
    console.log("\nDONE");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
