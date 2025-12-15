const fs = require("fs");

async function test() {
  try {
    console.log("Testing rug wallet...");
    const response = await fetch("http://localhost:3001/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "911jgDyLwiSszYoH2cmntXTX5QeMo37tWB6dSpTmKhTc",
        forceRefresh: true,
      }),
    });
    const result = await response.json();

    const output = [];
    output.push("=== RUG WALLET TEST ===");
    output.push("Address: 911jgDyLwiSszYoH2cmntXTX5QeMo37tWB6dSpTmKhTc");
    output.push("Score: " + result.score);
    output.push(
      "Total Launched: " + (result.tokenLaunchSummary?.totalLaunched || 0)
    );
    output.push("Rugged: " + (result.tokenLaunchSummary?.rugged || 0));
    output.push("Success: " + (result.tokenLaunchSummary?.succeeded || 0));
    output.push("Unknown: " + (result.tokenLaunchSummary?.unknown || 0));

    if (result.tokenLaunchSummary?.tokens?.length > 0) {
      output.push("\n=== TOKENS ===");
      for (const token of result.tokenLaunchSummary.tokens) {
        output.push("\n" + (token.name || token.symbol || "Unknown") + ":");
        output.push("  Outcome: " + token.outcome);
        output.push("  Reason: " + token.reason);
        output.push("  DevSellRatio: " + token.devSellRatio);
      }
    }

    const text = output.join("\n");
    fs.writeFileSync("rug-test-result.txt", text);
    console.log(text);
    console.log("\nDONE");
  } catch (error) {
    console.error("Error:", error.message);
  }
}
test();
